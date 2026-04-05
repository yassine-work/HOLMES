"""Shared utilities for agent prompt preparation."""

import re
from typing import Any


SKIPPED_STATUSES = {"skipped", "degraded", "error"}
MAX_EXPLANATION_CHARS = 200
MAX_CONTENT_CHARS = 500

KNOWN_BRANDS = [
    "google", "microsoft", "apple", "amazon", "facebook", "meta",
    "twitter", "instagram", "netflix", "paypal", "ebay", "linkedin",
    "youtube", "whatsapp", "telegram", "tiktok", "snapchat", "spotify",
    "adobe", "dropbox", "github", "gitlab", "stackoverflow", "reddit",
    "wikipedia", "cloudflare", "shopify", "wordpress", "openai",
]

LEET_MAP = str.maketrans({
    "0": "o", "1": "i", "3": "e", "4": "a",
    "5": "s", "6": "g", "7": "t", "@": "a",
})


def _to_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def truncate_content(content: str) -> str:
    """Truncate content to avoid exceeding LLM token limits."""
    if len(content) <= MAX_CONTENT_CHARS:
        return content
    return content[:MAX_CONTENT_CHARS] + "... [truncated]"


def detect_typosquatting(domain: str) -> list[str]:
    """
    Detect if domain appears to impersonate a known brand.
    Returns list of warning strings, empty if none detected.
    """
    if not domain:
        return []

    cleaned_domain = re.sub(r"^https?://", "", domain.lower()).split("/")[0]
    base = cleaned_domain.split(".")[0]
    normalized = base.translate(LEET_MAP)

    warnings: list[str] = []
    for brand in KNOWN_BRANDS:
        if normalized == brand and base != brand:
            warnings.append(
                f"Domain '{domain}' appears to impersonate '{brand}' "
                f"using character substitution (typosquatting)."
            )
            break
        if brand in normalized and normalized != brand:
            diff = len(normalized) - len(brand)
            if 0 < diff <= 3:
                warnings.append(
                    f"Domain '{domain}' closely resembles '{brand}' "
                    f"and may be attempting to impersonate it."
                )
                break

    return warnings


def summarize_tool_findings(tool_findings: dict[str, Any] | None) -> str:
    """
    Convert raw tool findings into plain-language evidence summary.
    Never mentions tool names. Only includes tools with real results.
    Agents should explain findings as if they discovered them naturally.
    """
    if not tool_findings:
        return "No evidence available."

    lines: list[str] = []

    for tool_name, result in tool_findings.items():
        if not isinstance(result, dict):
            continue
        status = result.get("status", "unknown")
        if status in {"skipped", "degraded", "error"}:
            continue

        if tool_name == "virustotal":
            stats = result.get("analysis_stats", {})
            malicious = int(stats.get("malicious", 0) or 0)
            suspicious = int(stats.get("suspicious", 0) or 0)
            harmless = int(stats.get("harmless", 0) or 0)
            undetected = int(stats.get("undetected", 0) or 0)
            total = malicious + suspicious + harmless + undetected

            if malicious > 0:
                lines.append(
                    f"Domain reputation: {malicious} out of {total} security "
                    f"vendors flagged this domain as malicious — strong danger signal."
                )
            elif suspicious > 0:
                lines.append(
                    f"Domain reputation: {suspicious} out of {total} security "
                    f"vendors flagged this domain as suspicious."
                )
            elif harmless > 0 and total > 10:
                lines.append(
                    f"Domain reputation: {harmless} out of {total} security "
                    f"vendors confirmed this domain is clean — strong legitimacy signal."
                )

        elif tool_name == "zenserp":
            organic = int(result.get("organic_results", 0) or 0)
            query = result.get("query", "")
            if organic == 0:
                lines.append(
                    f"Web presence: '{query}' has no verifiable online presence "
                    f"— absence of results is suspicious for a claimed source."
                )
            elif organic >= 5:
                lines.append(
                    f"Web presence: '{query}' appears across {organic} independent "
                    f"web sources — indicates established and verifiable presence."
                )
            else:
                lines.append(
                    f"Web presence: '{query}' found in {organic} web sources "
                    f"— limited but some online presence detected."
                )

        elif tool_name == "sightengine":
            data = result.get("data", {})
            if not isinstance(data, dict):
                continue
            genai_score = (
                data.get("type", {}).get("ai_generated")
                or data.get("ai_generated")
            )
            deepfake_score = None
            faces = data.get("faces", [])
            if faces and isinstance(faces, list):
                deepfake_score = faces[0].get("deepfake")
            genai_float = _to_float(genai_score)
            deepfake_float = _to_float(deepfake_score)
            if genai_float is not None and genai_float > 0.5:
                lines.append(
                    f"Visual analysis: image shows {genai_float:.0%} "
                    f"likelihood of being AI-generated."
                )
            elif deepfake_float is not None and deepfake_float > 0.5:
                lines.append(
                    f"Visual analysis: face manipulation detected with "
                    f"{deepfake_float:.0%} confidence."
                )
            elif genai_float is not None:
                lines.append(
                    f"Visual analysis: low AI-generation likelihood "
                    f"({genai_float:.0%})."
                )

        elif tool_name == "hf_text":
            label_scores = result.get("label_scores", {})
            explanation = result.get("explanation", "")
            if isinstance(label_scores, dict):
                fake_score = _to_float(label_scores.get("fake", 0)) or 0.0
                real_score = _to_float(label_scores.get("real", 0)) or 0.0
                if fake_score > 0.5:
                    lines.append(
                        f"Text analysis: content shows {fake_score:.0%} "
                        f"likelihood of being AI-generated."
                    )
                elif real_score > 0.5:
                    lines.append(
                        f"Text analysis: content shows {real_score:.0%} "
                        f"likelihood of being human-written."
                    )
            if (
                isinstance(explanation, str)
                and explanation
                and not explanation.startswith("Gemini explanation unavailable")
                and "quota" not in explanation.lower()
            ):
                lines.append(f"Text pattern analysis: {explanation[:MAX_EXPLANATION_CHARS]}")

        elif tool_name == "bitmind_image":
            detection = result.get("detection", {})
            explanation = result.get("explanation", "")
            if isinstance(detection, dict):
                score = detection.get("score") or detection.get("confidence")
                label = (
                    detection.get("label")
                    or detection.get("prediction")
                    or ""
                )
                score_float = _to_float(score)
                if score_float is not None:
                    is_ai = "ai" in str(label).lower() or "fake" in str(label).lower()
                    if is_ai and score_float > 0.5:
                        lines.append(
                            f"Image authenticity check: image is "
                            f"{score_float:.0%} likely to be AI-generated or synthetic."
                        )
                    elif score_float > 0.5:
                        lines.append(
                            f"Image authenticity check: image appears "
                            f"authentic with {score_float:.0%} confidence."
                        )
            if (
                isinstance(explanation, str)
                and explanation
                and not explanation.startswith("Gemini explanation unavailable")
                and "quota" not in explanation.lower()
                and "error" not in explanation.lower()[:50]
            ):
                lines.append(f"Visual pattern analysis: {explanation[:MAX_EXPLANATION_CHARS]}")

        elif tool_name == "bitmind_video":
            detection = result.get("detection", {})
            explanation = result.get("explanation", "")
            if isinstance(detection, dict):
                score = detection.get("score") or detection.get("confidence")
                label = (
                    detection.get("label")
                    or detection.get("prediction")
                    or ""
                )
                score_float = _to_float(score)
                if score_float is not None:
                    is_ai = "ai" in str(label).lower() or "fake" in str(label).lower()
                    if is_ai and score_float > 0.5:
                        lines.append(
                            f"Video authenticity check: video is "
                            f"{score_float:.0%} likely to be AI-generated or synthetic."
                        )
                    elif score_float > 0.5:
                        lines.append(
                            f"Video authenticity check: video appears "
                            f"authentic with {score_float:.0%} confidence."
                        )
            if (
                isinstance(explanation, str)
                and explanation
                and not explanation.startswith("Gemini explanation unavailable")
                and "quota" not in explanation.lower()
                and "error" not in explanation.lower()[:50]
            ):
                lines.append(f"Video pattern analysis: {explanation[:MAX_EXPLANATION_CHARS]}")

        elif tool_name == "ninja":
            age = result.get("domain_age_days")
            flags = result.get("risk_flags", [])
            domain = result.get("domain", "")

            typo_warnings = detect_typosquatting(domain)
            for warning in typo_warnings:
                lines.append(f"Typosquatting alert: {warning}")

            if age is not None and age <= 90:
                lines.append(
                    f"Source check: domain '{domain}' registered only {age} days ago "
                    f"— very new domains are frequently used for misinformation."
                )
            elif age is not None:
                lines.append(
                    f"Source check: domain '{domain}' has been active for "
                    f"{age} days — established presence."
                )
            if "whois_unavailable" in (flags or []):
                lines.append(
                    "Source check: domain registration information is hidden "
                    "— intentional anonymity raises suspicion."
                )

    if not lines:
        return "No conclusive evidence was gathered from automated checks."

    return "\n".join(f"- {line}" for line in lines)
