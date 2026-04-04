"""Judge agent that returns final verdict based on both sides."""

import json
from typing import Any

from app.agents.base_llm import BaseLLMAgent


class JudgeAgent(BaseLLMAgent):
    """Agent that synthesizes arguments into a single verdict."""

    system_prompt = "You are a strict fact-checking judge. Return a concise verdict and confidence between 0 and 1."

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
            "Given the content, tool evidence, and two analyses, return JSON keys label and confidence.\n\n"
            f"Content: {content}\n\n"
            f"Tool evidence: {evidence_summary}\n\n"
            f"Defense: {defense_position.get('content', '')}\n\n"
            f"Prosecution: {prosecution_position.get('content', '')}"
        )
        completion = await self.complete(prompt)
        text_output = completion.get("content", "")
        return {
            "label": "likely_manipulated" if "manip" in text_output.lower() else "likely_authentic",
            "confidence": 0.6,
            "rationale": text_output,
            "raw": completion,
        }
