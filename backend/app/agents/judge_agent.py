"""Judge agent that returns final verdict based on both sides."""

import json
import re
from typing import Any

from app.agents.agent_utils import summarize_tool_findings, truncate_content
from app.agents.base_llm import BaseLLMAgent


class JudgeAgent(BaseLLMAgent):
    """Agent that synthesizes arguments into a single verdict."""

    system_prompt = "You are a strict fact-checking judge. Return a concise verdict and confidence between 0 and 1."
    MAX_EVIDENCE_CHARS = 1200

    @staticmethod
    def _clamp_confidence(value: float) -> float:
        return max(0.0, min(1.0, value))

    @staticmethod
    def _normalize_label(value: str | None) -> str:
        if not value:
            return "undetermined"

        normalized = value.strip().lower().replace(" ", "_")
        aliases = {
            "manipulated": "likely_manipulated",
            "fake": "likely_manipulated",
            "malicious": "malicious",
            "authentic": "likely_authentic",
            "real": "likely_authentic",
            "uncertain": "undetermined",
            "unknown": "undetermined",
        }
        if normalized in {"likely_manipulated", "likely_authentic", "malicious", "undetermined"}:
            return normalized
        return aliases.get(normalized, "undetermined")

    @staticmethod
    def _extract_json(text: str) -> dict[str, Any] | None:
        if not text.strip():
            return None

        candidates: list[str] = [text.strip()]
        fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)
        if fenced:
            candidates.append(fenced.group(1))

        brace = re.search(r"\{.*\}", text, re.DOTALL)
        if brace:
            candidates.append(brace.group(0))

        for candidate in candidates:
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                continue
        return None

    @staticmethod
    def _extract_confidence(value: Any) -> float | None:
        if isinstance(value, (int, float)):
            numeric = float(value)
            if numeric > 1:
                numeric = numeric / 100.0
            return max(0.0, min(1.0, numeric))

        if isinstance(value, str):
            match = re.search(r"(\d+(?:\.\d+)?)", value)
            if match:
                numeric = float(match.group(1))
                if "%" in value or numeric > 1:
                    numeric = numeric / 100.0
                return max(0.0, min(1.0, numeric))

        return None

    @staticmethod
    def _safe_int(value: Any) -> int:
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, (int, float)):
            return int(value)
        return 0

    def _fallback_from_signals(
        self,
        defense_position: dict[str, Any],
        prosecution_position: dict[str, Any],
        tool_findings: dict[str, Any] | None,
    ) -> tuple[str, float, str]:
        tools = tool_findings or {}
        risk_score = 0.5
        reasons: list[str] = []

        virustotal = tools.get("virustotal", {}) if isinstance(tools, dict) else {}
        analysis_stats = virustotal.get("analysis_stats", {}) if isinstance(virustotal, dict) else {}
        malicious = self._safe_int(analysis_stats.get("malicious"))
        suspicious = self._safe_int(analysis_stats.get("suspicious"))
        harmless = self._safe_int(analysis_stats.get("harmless"))
        if malicious > 0 or suspicious > 0:
            delta = min(0.35, malicious * 0.08 + suspicious * 0.05)
            risk_score += delta
            reasons.append(f"VirusTotal flagged {malicious} malicious and {suspicious} suspicious detections")
        elif harmless > 10:
            risk_score -= 0.2
            reasons.append(f"Domain reputation is clean across {harmless} vendor checks")

        zenserp = tools.get("zenserp", {}) if isinstance(tools, dict) else {}
        organic_results = self._safe_int(zenserp.get("organic_results")) if isinstance(zenserp, dict) else 0
        if organic_results >= 5:
            risk_score -= 0.1
            reasons.append(f"Content appears across {organic_results} independent web sources")
        elif organic_results == 0:
            risk_score += 0.08
            reasons.append("No verifiable web presence was found for the submitted claim/source")

        ninja = tools.get("ninja", {}) if isinstance(tools, dict) else {}
        risk_flags = ninja.get("risk_flags", []) if isinstance(ninja, dict) else []
        if isinstance(risk_flags, list) and risk_flags:
            delta = min(0.2, 0.08 * len(risk_flags))
            risk_score += delta
            reasons.append(f"Source risk flags: {', '.join(str(flag) for flag in risk_flags)}")

        defense_text = str(defense_position.get("content", "")).lower()
        prosecution_text = str(prosecution_position.get("content", "")).lower()
        if any(token in prosecution_text for token in ("manip", "decept", "fake", "mislead", "risk")):
            risk_score += 0.08
            reasons.append("Prosecution analysis indicates manipulation risk")
        if any(token in defense_text for token in ("authentic", "benign", "credible", "legitimate")):
            risk_score -= 0.08
            reasons.append("Defense analysis indicates authenticity signals")

        risk_score = self._clamp_confidence(risk_score)

        if risk_score >= 0.6:
            label = "likely_manipulated"
        elif risk_score <= 0.4:
            label = "likely_authentic"
        else:
            label = "undetermined"

        if label == "undetermined":
            confidence = 0.5
        else:
            confidence = min(0.95, max(0.51, 0.5 + abs(risk_score - 0.5)))

        rationale = "; ".join(reasons) if reasons else "Insufficient structured signals for a stronger verdict."
        return label, confidence, rationale

    async def decide(
        self,
        content: str,
        defense_position: dict[str, Any],
        prosecution_position: dict[str, Any],
        tool_findings: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Produce final decision from debate positions."""
        evidence_summary = summarize_tool_findings(tool_findings)
        if len(evidence_summary) > self.MAX_EVIDENCE_CHARS:
            evidence_summary = evidence_summary[: self.MAX_EVIDENCE_CHARS] + "... [truncated]"

        # Extract max AI detection score to guide judge
        max_ai_score = 0.0
        if tool_findings:
            for tname in ("bitmind_image", "bitmind_video", "sightengine"):
                t = tool_findings.get(tname, {})
                if not isinstance(t, dict) or t.get("status") != "ok":
                    continue
                if tname in ("bitmind_image", "bitmind_video"):
                    det = t.get("detection", {})
                    s = (det.get("score") or det.get("confidence")) if isinstance(det, dict) else None
                else:
                    data = t.get("data", {})
                    s = (data.get("type", {}).get("ai_generated") or data.get("ai_generated")) if isinstance(data, dict) else None
                if s is not None:
                    max_ai_score = max(max_ai_score, float(s))

        ai_guidance = ""
        if max_ai_score >= 0.75:
            ai_guidance = (
                f"IMPORTANT: Automated detection found {max_ai_score:.0%} confidence "
                f"that this content is AI-generated. Weight this heavily. "
                f"Verdict should be likely_manipulated with high confidence "
                f"unless there is strong contradicting evidence.\n\n"
            )

        url_guidance = ""
        if tool_findings:
            vt = tool_findings.get("virustotal", {})
            if isinstance(vt, dict) and vt.get("status") == "ok":
                stats = vt.get("analysis_stats", {})
                malicious = int(stats.get("malicious", 0) or 0)
                suspicious = int(stats.get("suspicious", 0) or 0)
                harmless = int(stats.get("harmless", 0) or 0)
                total = malicious + suspicious + harmless

                if malicious > 0:
                    url_guidance = (
                        f"IMPORTANT: Domain reputation check shows {malicious} "
                        f"malicious detections. Verdict should be malicious "
                        f"with high confidence.\n\n"
                    )
                elif suspicious > 0:
                    url_guidance = (
                        f"IMPORTANT: Domain reputation check shows {suspicious} "
                        f"suspicious detections. Lean toward likely_manipulated.\n\n"
                    )
                elif harmless > 10 and malicious == 0:
                    url_guidance = (
                        f"IMPORTANT: Domain reputation check shows {harmless} "
                        f"vendors confirmed clean with zero malicious detections. "
                        f"This is a strong legitimacy signal — lean toward "
                        f"likely_authentic unless other signals contradict.\n\n"
                    )

            ninja = tool_findings.get("ninja", {})
            if isinstance(ninja, dict) and ninja.get("status") == "ok":
                age = ninja.get("domain_age_days")
                flags = ninja.get("risk_flags", [])
                if age is not None and age <= 30:
                    url_guidance += (
                        f"IMPORTANT: Domain is only {age} days old — "
                        f"extremely new domains are high risk.\n\n"
                    )
                if "whois_unavailable" in (flags or []):
                    url_guidance += (
                        "IMPORTANT: Domain registration is hidden — "
                        "anonymized domains warrant suspicion.\n\n"
                    )

            # typosquatting check
            from app.agents.agent_utils import detect_typosquatting
            ninja = tool_findings.get("ninja", {})
            if isinstance(ninja, dict) and ninja.get("status") == "ok":
                domain = ninja.get("domain", "")
                typo_warnings = detect_typosquatting(domain)
                if typo_warnings:
                    url_guidance += (
                        f"CRITICAL: Domain '{domain}' appears to be typosquatting "
                        f"a known brand. This is a strong deception signal. "
                        f"Verdict must be malicious or likely_manipulated "
                        f"with high confidence.\n\n"
                    )

        text_guidance = ""
        if tool_findings:
            hf = tool_findings.get("hf_text", {})
            if isinstance(hf, dict) and hf.get("status") == "ok":
                label_scores = hf.get("label_scores", {})
                fake = float(label_scores.get("fake", 0) or 0)
                real = float(label_scores.get("real", 0) or 0)
                if fake >= 0.75:
                    text_guidance = (
                        f"CRITICAL: Text analysis detected {fake:.0%} probability "
                        f"this text is AI-generated. Verdict MUST be "
                        f"likely_manipulated. Confidence must reflect {fake:.0%}.\n\n"
                    )
                elif fake >= 0.5:
                    text_guidance = (
                        f"IMPORTANT: Text analysis detected {fake:.0%} probability "
                        f"of AI-generated content. Lean toward likely_manipulated.\n\n"
                    )
                elif real >= 0.75:
                    text_guidance = (
                        f"IMPORTANT: Text analysis shows {real:.0%} likelihood "
                        f"this is human-written. Verdict should be likely_authentic "
                        f"with confidence reflecting {real:.0%}.\n\n"
                    )

            zenserp = tool_findings.get("zenserp", {})
            if isinstance(zenserp, dict) and zenserp.get("status") == "ok":
                organic = int(zenserp.get("organic_results", 0) or 0)
                if organic >= 5:
                    text_guidance += (
                        f"Supporting signal: text appears across {organic} "
                        f"independent web sources — consistent with real reporting.\n\n"
                    )
                elif organic == 0:
                    text_guidance += (
                        "Supporting signal: text has no verifiable online presence "
                        "— suspicious for a claimed news or factual source.\n\n"
                    )

        defense_text = str(defense_position.get("content", ""))[:300]
        prosecution_text = str(prosecution_position.get("content", ""))[:300]

        prompt = (
            ai_guidance +
            url_guidance +
            text_guidance +
            "You are a senior content verification expert delivering a final verdict.\n\n"
            "Based on the evidence and two analyst positions below, return a JSON object.\n\n"
            "Rules:\n"
            "- NEVER mention tool names (BitMind, SightEngine, HuggingFace, "
            "  VirusTotal, Zenserp, Ninja, Groq) in your rationale.\n"
            "- Write the rationale as a plain-language explanation for a "
            "  non-technical person — like a journalist or concerned citizen.\n"
            "- If image/video AI-generation confidence is above 70%, "
            "  verdict should be likely_manipulated with high confidence.\n"
            "- If evidence strongly points one way, commit to it confidently.\n"
            "- If evidence is genuinely mixed or absent, use undetermined.\n"
            "Rules for rationale:\n"
            "- Write exactly 2 sentences. No more.\n"
            "- First sentence: state the verdict directly and why "
            "  (e.g. 'This domain is impersonating Microsoft using character "
            "  substitution, a classic typosquatting technique used to deceive users.').\n"
            "- Second sentence: mention the most important supporting evidence "
            "  in plain language.\n"
            "- Be direct and confident. Never say 'further investigation needed', "
            "  'evidence is mixed', 'cannot determine', or 'it is difficult to'.\n"
            "- If confidence is above 70%, commit fully to the verdict.\n"
            "- Never mention tool names or technical systems.\n"
            "- Never be vague. Every rationale must tell the user something specific.\n"
            "- Do not mention errors, quota limits, or skipped checks.\n"
            "- Return ONLY valid JSON, nothing else.\n\n"
            "Required JSON format:\n"
            "{\n"
            '  "label": "likely_manipulated" | "likely_authentic" | '
            '"malicious" | "undetermined",\n'
            '  "confidence": 0.0 to 1.0,\n'
            '  "rationale": "2-3 sentence plain-language explanation"\n'
            "}\n\n"
            f"Evidence summary:\n{evidence_summary}\n\n"
            f"Analyst 1 (authenticity case):\n"
            f"{defense_text}\n\n"
            f"Analyst 2 (manipulation case):\n"
            f"{prosecution_text}\n\n"
            f"Content: {truncate_content(content)}"
        )
        completion = await self.complete(prompt)
        text_output = completion.get("content", "")

        parsed = self._extract_json(text_output)
        parsed_label = self._normalize_label((parsed or {}).get("label") or (parsed or {}).get("verdict"))
        parsed_confidence = self._extract_confidence(
            (parsed or {}).get("confidence") or (parsed or {}).get("score") or (parsed or {}).get("probability")
        )
        parsed_rationale = (
            (parsed or {}).get("rationale")
            or (parsed or {}).get("reasoning")
            or (parsed or {}).get("explanation")
            or text_output
            or ""
        )

        if parsed_label != "undetermined" and parsed_confidence is not None:
            return {
                "label": parsed_label,
                "confidence": parsed_confidence,
                "rationale": str(parsed_rationale),
                "raw": completion,
            }

        fallback_label, fallback_confidence, fallback_rationale = self._fallback_from_signals(
            defense_position=defense_position,
            prosecution_position=prosecution_position,
            tool_findings=tool_findings,
        )

        final_label = parsed_label if parsed_label != "undetermined" else fallback_label
        final_confidence = (
            parsed_confidence
            if parsed_confidence is not None
            else fallback_confidence
        )
        final_rationale = str(parsed_rationale).strip() or fallback_rationale

        return {
            "label": final_label,
            "confidence": final_confidence,
            "rationale": final_rationale,
            "raw": completion,
        }
