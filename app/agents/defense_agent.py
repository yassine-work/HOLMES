"""Defense agent that argues for authenticity — honestly."""

from typing import Any

from app.agents.agent_utils import summarize_tool_findings, truncate_content
from app.agents.base_llm import BaseLLMAgent


# If any single detection score exceeds this, defense acknowledges manipulation
AI_DETECTION_SURRENDER_THRESHOLD = 0.75


def _extract_max_ai_score(tool_findings: dict[str, Any] | None) -> float:
    """Return the highest AI-generation confidence score across all tools."""
    if not tool_findings:
        return 0.0

    scores: list[float] = []

    bitmind = tool_findings.get("bitmind_image", {})
    if isinstance(bitmind, dict) and bitmind.get("status") == "ok":
        detection = bitmind.get("detection", {})
        if isinstance(detection, dict):
            score = detection.get("score") or detection.get("confidence")
            if score is not None:
                scores.append(float(score))

    bitmind_v = tool_findings.get("bitmind_video", {})
    if isinstance(bitmind_v, dict) and bitmind_v.get("status") == "ok":
        detection = bitmind_v.get("detection", {})
        if isinstance(detection, dict):
            score = detection.get("score") or detection.get("confidence")
            if score is not None:
                scores.append(float(score))

    sightengine = tool_findings.get("sightengine", {})
    if isinstance(sightengine, dict) and sightengine.get("status") == "ok":
        data = sightengine.get("data", {})
        if isinstance(data, dict):
            genai = (
                data.get("type", {}).get("ai_generated")
                or data.get("ai_generated")
            )
            if genai is not None:
                scores.append(float(genai))

    hf = tool_findings.get("hf_text", {})
    if isinstance(hf, dict) and hf.get("status") == "ok":
        label_scores = hf.get("label_scores", {})
        fake = label_scores.get("fake", 0)
        if fake:
            scores.append(float(fake))

    return max(scores) if scores else 0.0


class DefenseAgent(BaseLLMAgent):
    """Agent that argues for authenticity — but concedes when evidence is clear."""

    system_prompt = (
        "You are an honest content verification analyst. "
        "Your role is to argue for authenticity when evidence supports it, "
        "but you must concede clearly when evidence strongly points to manipulation. "
        "You never argue against overwhelming evidence."
    )

    async def analyze(
        self,
        content: str,
        tool_findings: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Produce defense-side analysis — concedes if AI score is very high."""
        tool_summary = summarize_tool_findings(tool_findings)
        content_excerpt = truncate_content(content)
        max_ai_score = _extract_max_ai_score(tool_findings)
        overwhelming = max_ai_score >= AI_DETECTION_SURRENDER_THRESHOLD

        if overwhelming:
            prompt = f"""You are an honest content verification analyst.
The automated evidence strongly indicates this content is AI-generated
or synthetic (detection confidence: {max_ai_score:.0%}).

Your role here is NOT to argue for authenticity — the evidence is too
strong for that. Instead:
1. Acknowledge clearly that the detection confidence is high.
2. Mention any minor uncertainties or caveats that exist
   (e.g. detection tools are not perfect, context matters).
3. State that while you cannot rule out edge cases, the evidence
   leans strongly toward synthetic or AI-generated content.
4. Do NOT invent arguments for authenticity that contradict the evidence.
5. Never mention tool names or technical systems.
6. Write 2-3 sentences as a continuous paragraph for a non-technical audience.

Content under review:
{content_excerpt}

Evidence:
{tool_summary}"""

        else:
            prompt = f"""You are an expert content verification analyst
arguing that this content may be authentic and should not be dismissed.

Write your analysis as a confident human expert. Do NOT mention tool
names, API names, or technical systems. Present findings as if you
discovered them through professional investigation.

Content under review:
{content_excerpt}

Evidence from automated checks:
{tool_summary}

Your task:
- Lead with the strongest evidence supporting authenticity.
- When checks found no suspicious signals, explain what that means.
- Challenge weak or inconclusive signals.
- If evidence is genuinely mixed, say so honestly.
- Never say BitMind, SightEngine, HuggingFace, Zenserp, VirusTotal,
  Ninja, Groq, or any technical system name.
- Write 3-5 sentences as a continuous paragraph. No bullet points.
- Speak directly to a non-technical audience."""

        return await self.complete(prompt)
