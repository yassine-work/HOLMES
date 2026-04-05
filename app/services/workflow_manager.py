"""Primary service orchestrating verification workflow and persistence."""

import asyncio
import hashlib
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ContentType, VerificationHistory
from app.schemas.requests import VerificationRequest
from app.services.cache_manager import CacheManager
from app.services.debate_manager import DebateManager
from app.tools.bitmind_image_tool import BitmindImageTool
from app.tools.bitmind_video_tool import BitmindVideoTool
from app.tools.hf_text_tool import HFTextTool
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
        self.hf_text = HFTextTool()
        self.bitmind_image = BitmindImageTool()
        self.bitmind_video = BitmindVideoTool()
        self.ninja = NinjaTool()

    @staticmethod
    def _is_url(content: str) -> bool:
        """Return True when content appears to be a URL."""
        parsed = urlparse(content.strip())
        return bool(parsed.scheme in {"http", "https"} and parsed.netloc)

    @staticmethod
    def _build_cache_key(content_type: str, content: str, content_b64: str | None = None) -> str:
        """Build deterministic cache key for verification requests."""
        if content_b64:
            b64_fingerprint = hashlib.sha256(content_b64.encode("utf-8")).hexdigest()
            return f"verification:{content_type}:{content}:b64:{b64_fingerprint}"
        return f"verification:{content_type}:{content}"

    @staticmethod
    def _build_cached_payload(history: VerificationHistory) -> dict[str, Any]:
        """Serialize history fields used by cache hit fast-path."""
        return {
            "verdict": history.verdict,
            "confidence": history.confidence,
            "details": history.details,
        }

    @staticmethod
    def _is_short_text(payload: VerificationRequest) -> bool:
        """Return True when text payload is too short for reliable classification."""
        if payload.content_type != ContentType.TEXT:
            return False

        cleaned = payload.content.strip()
        words = [word for word in cleaned.split() if word]
        return len(cleaned) <= 40 or len(words) <= 4

    async def _store_history(
        self,
        user_id: UUID,
        payload: VerificationRequest,
        verdict: str,
        confidence: float,
        details: dict[str, Any],
    ) -> VerificationHistory:
        """Persist a verification history entry and return it."""
        history = VerificationHistory(
            user_id=user_id,
            content_type=payload.content_type,
            input_reference=payload.content,
            verdict=verdict,
            confidence=confidence,
            details=details,
        )
        self.db.add(history)
        await self.db.commit()
        await self.db.refresh(history)
        return history

    async def run_verification(self, user_id: UUID, payload: VerificationRequest) -> VerificationHistory:
        """Execute cached or fresh verification flow and persist final result."""
        if self._is_short_text(payload):
            details: dict[str, Any] = {
                "quick_path": "short_text",
                "debate": {
                    "verdict": {
                        "label": "undetermined",
                        "confidence": 0.4,
                        "rationale": (
                            "The submitted text is too short for a reliable authenticity verdict. "
                            "Please provide a longer statement or more context for accurate analysis."
                        ),
                    }
                },
            }
            return await self._store_history(
                user_id=user_id,
                payload=payload,
                verdict="undetermined",
                confidence=0.4,
                details=details,
            )

        content_b64 = getattr(payload, "content_b64", None)
        cache_key = self._build_cache_key(payload.content_type.value, payload.content, content_b64=content_b64)
        cached_result = await self.cache.get_json(cache_key)
        if cached_result:
            return await self._store_history(
                user_id=user_id,
                payload=payload,
                verdict=str(cached_result.get("verdict", "undetermined")),
                confidence=float(cached_result.get("confidence", 0.5)),
                details=cached_result.get("details", {}),
            )

        results = await asyncio.gather(
            self.sightengine.analyze(payload.content_type.value, payload.content),
            self.zenserp.analyze(payload.content_type.value, payload.content),
            self.virustotal.analyze(payload.content_type.value, payload.content),
            self.hf_text.analyze(payload.content_type.value, payload.content),
            self.bitmind_image.analyze(
                payload.content_type.value,
                payload.content,
                content_b64=content_b64,
            ),
            self.bitmind_video.analyze(
                payload.content_type.value,
                payload.content,
                content_b64=content_b64,
            ),
        )
        sightengine_result, zenserp_result, virustotal_result, hf_text_result, bitmind_image_result, bitmind_video_result = results
        tool_findings: dict[str, Any] = {
            "sightengine": sightengine_result,
            "zenserp": zenserp_result,
            "virustotal": virustotal_result,
            "hf_text": hf_text_result,
            "bitmind_image": bitmind_image_result,
            "bitmind_video": bitmind_video_result,
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

        history = await self._store_history(
            user_id=user_id,
            payload=payload,
            verdict=str(verdict_payload.get("label", "undetermined")),
            confidence=float(verdict_payload.get("confidence", 0.5)),
            details=details,
        )

        await self.cache.set_json(
            cache_key,
            self._build_cached_payload(history),
            ttl_seconds=300,
        )
        return history
