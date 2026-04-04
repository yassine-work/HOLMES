"""Service for orchestrating LLM multi-agent debate workflow."""

import asyncio
from typing import Any

from app.agents.defense_agent import DefenseAgent
from app.agents.judge_agent import JudgeAgent
from app.agents.prosecution_agent import ProsecutionAgent


class DebateManager:
    """Coordinates defense/prosecution analysis and judge verdict."""

    def __init__(self) -> None:
        self.defense = DefenseAgent()
        self.prosecution = ProsecutionAgent()
        self.judge = JudgeAgent()

    async def evaluate(
        self,
        content: str,
        source_data: dict[str, Any] | None = None,
        tool_findings: dict[str, Any] | None = None,
    ) -> dict[str, object]:
        """Run all debate agents with evidence context and combine into final verdict."""
        defense_position, prosecution_position = await asyncio.gather(
            self.defense.analyze(content, tool_findings=tool_findings),
            self.prosecution.analyze(content, source_data=source_data, tool_findings=tool_findings),
        )
        verdict = await self.judge.decide(
            content,
            defense_position,
            prosecution_position,
            tool_findings=tool_findings,
        )
        return {
            "defense": defense_position,
            "prosecution": prosecution_position,
            "verdict": verdict,
        }
