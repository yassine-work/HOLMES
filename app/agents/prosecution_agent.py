"""Prosecution agent that argues for manipulation likelihood."""

from typing import Any
import json

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
        source_summary = json.dumps(source_data or {}, ensure_ascii=False)
        evidence_summary = json.dumps(tool_findings or {}, ensure_ascii=False)
        prompt = (
            "Analyze the content and provide arguments supporting manipulation suspicion. "
            "Explicitly consider source intelligence signals such as domain age, WHOIS anomalies, "
            "IP reputation/source metadata, and brand-new site indicators. "
            "Use the tool evidence directly and explain why each signal increases deception risk.\n\n"
            f"Content:\n{content}\n\n"
            f"Source data:\n{source_summary}\n\n"
            f"Tool evidence:\n{evidence_summary}"
        )
        return await self.complete(prompt)
