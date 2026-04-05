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

    @staticmethod
    async def _safe_agent_call(coro, role: str) -> dict[str, Any]:
        """Run agent coroutine and return degraded payload if it fails."""
        try:
            result = await coro
            if isinstance(result, dict):
                return result
            return {
                "status": "degraded",
                "message": f"{role} agent returned non-dict response.",
                "content": f"{role.capitalize()} analysis unavailable due to invalid response format.",
            }
        except Exception as exc:
            return {
                "status": "degraded",
                "message": f"{role} agent failed: {exc!s}",
                "content": f"{role.capitalize()} analysis unavailable due to transient LLM failure.",
            }

    async def evaluate(
        self,
        content: str,
        source_data: dict[str, Any] | None = None,
        tool_findings: dict[str, Any] | None = None,
    ) -> dict[str, object]:
        """Run all debate agents with evidence context and combine into final verdict."""
        defense_position, prosecution_position = await asyncio.gather(
            self._safe_agent_call(
                self.defense.analyze(content, tool_findings=tool_findings),
                role="defense",
            ),
            self._safe_agent_call(
                self.prosecution.analyze(
                    content,
                    source_data=source_data,
                    tool_findings=tool_findings,
                ),
                role="prosecution",
            ),
        )

        try:
            verdict = await self.judge.decide(
                content,
                defense_position,
                prosecution_position,
                tool_findings=tool_findings,
            )
        except Exception as exc:
            verdict = {
                "label": "undetermined",
                "confidence": 0.0,
                "rationale": f"Judge analysis unavailable due to transient LLM failure: {exc!s}",
                "raw": {
                    "status": "degraded",
                    "message": str(exc),
                },
            }

        return {
            "defense": defense_position,
            "prosecution": prosecution_position,
            "verdict": verdict,
        }
