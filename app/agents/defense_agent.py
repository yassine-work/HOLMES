"""Defense agent that argues for authenticity."""

import json
from typing import Any

from app.agents.base_llm import BaseLLMAgent


class DefenseAgent(BaseLLMAgent):
    """Agent that seeks evidence of content authenticity."""

    system_prompt = "You are the defense analyst. Argue why content might be authentic."

    async def analyze(self, content: str, tool_findings: dict[str, Any] | None = None) -> dict[str, Any]:
        """Produce defense-side analysis."""
        evidence_summary = json.dumps(tool_findings or {}, ensure_ascii=False)
        prompt = (
            "Analyze the content and provide arguments supporting authenticity. "
            "Use the provided tool evidence and explain why those signals may be benign, incomplete, or non-conclusive when appropriate.\n\n"
            f"Content:\n{content}\n\n"
            f"Tool evidence:\n{evidence_summary}"
        )
        return await self.complete(prompt)
