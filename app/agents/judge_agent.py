"""Judge agent that returns final verdict based on both sides."""

import json
import re
from typing import Any

from app.agents.base_llm import BaseLLMAgent


class JudgeAgent(BaseLLMAgent):
    """Agent that synthesizes arguments into a single verdict."""

    system_prompt = "You are a strict fact-checking judge. Return a concise verdict and confidence between 0 and 1."

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
        if malicious > 0 or suspicious > 0:
            delta = min(0.35, malicious * 0.08 + suspicious * 0.05)
            risk_score += delta
            reasons.append(f"VirusTotal flagged {malicious} malicious and {suspicious} suspicious detections")

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
        evidence_summary = json.dumps(tool_findings or {}, ensure_ascii=False)
        prompt = (
            "Given the content, tool evidence, and two analyses, return strict JSON with keys: "
            "label, confidence, rationale. "
            "Allowed labels: malicious, likely_manipulated, likely_authentic, undetermined.\n\n"
            f"Content: {content}\n\n"
            f"Tool evidence: {evidence_summary}\n\n"
            f"Defense: {defense_position.get('content', '')}\n\n"
            f"Prosecution: {prosecution_position.get('content', '')}"
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
