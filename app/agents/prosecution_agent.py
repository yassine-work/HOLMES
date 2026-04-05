"""Prosecution agent that argues for manipulation likelihood."""

from typing import Any

from app.agents.base_llm import BaseLLMAgent


class ProsecutionAgent(BaseLLMAgent):
    """Agent that seeks evidence of manipulation/deception."""

    system_prompt = "You are the prosecution analyst. Argue why content might be manipulated or misleading."

    async def analyze(
        self,
        content: str,
        source_data: dict[str, Any] | None = None,
        tool_findings: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Produce prosecution-side analysis."""
        from app.agents.agent_utils import summarize_tool_findings, truncate_content

        tool_summary = summarize_tool_findings(tool_findings)
        content_excerpt = truncate_content(content)

        source_summary = ""
        if source_data and isinstance(source_data, dict):
            age = source_data.get("domain_age_days")
            flags = source_data.get("risk_flags", [])
            domain = source_data.get("domain", "")
            parts = []
            if domain:
                parts.append(f"domain: {domain}")
            if age is not None:
                parts.append(f"age {age} days old")
            if flags:
                parts.append(f"risk flags: {', '.join(flags)}")
            source_summary = ", ".join(parts) if parts else "no source data"
        else:
            source_summary = "no source data available"

        prompt = f"""You are an expert content verification analyst arguing
that this content may be misleading, manipulated, or inauthentic.

You have access to automated evidence collected from various checks.
Write your analysis as a confident human expert — do NOT mention
tool names, API names, or technical systems. Present findings as
if you discovered them through professional investigation.

Content under review:
{content_excerpt}

Evidence from automated checks:
{tool_summary}

Source intelligence:
{source_summary}

Your task:
- Lead with the strongest piece of evidence suggesting manipulation.
- Explain in plain language WHY each signal is concerning.
- If image/video analysis shows high AI-generation likelihood, explain
  what that means in practice (synthetic content, not captured in reality).
- If evidence is weak, acknowledge it but still make the strongest
  case possible from what exists.
- Never say "BitMind", "SightEngine", "HuggingFace", "Zenserp",
  "VirusTotal", "Ninja", "Groq", or any technical system name.
- Write 3-5 sentences as a continuous paragraph. No bullet points.
- Speak directly to a non-technical audience."""

        return await self.complete(prompt)
