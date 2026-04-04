"""Primary service orchestrating verification workflow and persistence."""

import asyncio
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import VerificationHistory
from app.schemas.requests import VerificationRequest
from app.services.cache_manager import CacheManager
from app.services.debate_manager import DebateManager
from app.tools.ninja_tool import NinjaTool
from app.tools.sightengine_tool import SightengineTool
from app.tools.virustotal_tool import VirusTotalTool
from app.tools.zenserp_tool import ZenserpTool


class WorkflowManager:
    """Service layer entrypoint for content verification."""

    def __init__(self, db: AsyncSession, cache: CacheManager | None = None) -> None:
        self.db = db
        self.cache = cache or CacheManager()
        self.debate_manager = DebateManager()
        self.sightengine = SightengineTool()
        self.zenserp = ZenserpTool()
        self.virustotal = VirusTotalTool()
        self.ninja = NinjaTool()

    @staticmethod
    def _is_url(content: str) -> bool:
        """Return True when content appears to be a URL."""
        parsed = urlparse(content.strip())
        return bool(parsed.scheme in {"http", "https"} and parsed.netloc)

    @staticmethod
    def _build_cache_key(content_type: str, content: str) -> str:
        """Build deterministic cache key for verification requests."""
        return f"verification:{content_type}:{content}"

    @staticmethod
    def _build_cached_payload(history: VerificationHistory) -> dict[str, Any]:
        """Serialize history fields used by cache hit fast-path."""
        return {
            "verdict": history.verdict,
            "confidence": history.confidence,
            "details": history.details,
        }

    async def run_verification(self, user_id: UUID, payload: VerificationRequest) -> VerificationHistory:
        """Execute cached or fresh verification flow and persist final result."""
        cache_key = self._build_cache_key(payload.content_type.value, payload.content)
        cached_result = await self.cache.get_json(cache_key)
        if cached_result:
            return VerificationHistory(
                user_id=user_id,
                content_type=payload.content_type,
                input_reference=payload.content,
                verdict=str(cached_result.get("verdict", "undetermined")),
                confidence=float(cached_result.get("confidence", 0.5)),
                details=cached_result.get("details", {}),
            )

        sightengine_result, zenserp_result, virustotal_result = await asyncio.gather(
            self.sightengine.analyze(payload.content_type.value, payload.content),
            self.zenserp.analyze(payload.content_type.value, payload.content),
            self.virustotal.analyze(payload.content_type.value, payload.content),
        )
        tool_findings: dict[str, Any] = {
            "sightengine": sightengine_result,
            "zenserp": zenserp_result,
            "virustotal": virustotal_result,
        }

        source_data: dict[str, Any] | None = None
        if payload.content_type.value == "url" and self._is_url(payload.content):
            source_data = await self.ninja.analyze_source(payload.content)
            tool_findings["ninja"] = source_data

        debate_result = await self.debate_manager.evaluate(
            payload.content,
            source_data=source_data,
            tool_findings=tool_findings,
        )
        verdict_payload = dict(debate_result["verdict"])
        details: dict[str, Any] = {"tools": tool_findings, "debate": debate_result}

        history = VerificationHistory(
            user_id=user_id,
            content_type=payload.content_type,
            input_reference=payload.content,
            verdict=str(verdict_payload.get("label", "undetermined")),
            confidence=float(verdict_payload.get("confidence", 0.5)),
            details=details,
        )
        self.db.add(history)
        await self.db.commit()
        await self.db.refresh(history)

        await self.cache.set_json(
            cache_key,
            self._build_cached_payload(history),
            ttl_seconds=300,
        )
        return history
