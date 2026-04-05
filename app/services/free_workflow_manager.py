"""Simplified verification pipeline for free tier users."""

from __future__ import annotations

import json
import re
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import ContentType, VerificationHistory
from app.schemas.requests import VerificationRequest
from app.tools.zenserp_tool import ZenserpTool


settings = get_settings()

ALLOWED_FREE_CONTENT_TYPES = {ContentType.TEXT, ContentType.URL}


class FreeWorkflowManager:
    """Simplified pipeline: Zenserp + single Groq call. No image/video/audio."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.zenserp = ZenserpTool()

    @staticmethod
    def _is_short_text(payload: VerificationRequest) -> bool:
        """Return True when text payload is too short for reliable classification."""
        if payload.content_type != ContentType.TEXT:
            return False

        cleaned = payload.content.strip()
        words = [word for word in cleaned.split() if word]
        return len(cleaned) <= 40 or len(words) <= 4

    async def run_verification(
        self,
        user_id: UUID,
        payload: VerificationRequest,
    ) -> VerificationHistory:
        """Run free tier verification for text and URL only."""
        if payload.content_type not in ALLOWED_FREE_CONTENT_TYPES:
            raise ValueError(
                "Free tier only supports text and URL verification. "
                "Upgrade to premium for image, video, and audio analysis."
            )

        if self._is_short_text(payload):
            details: dict[str, Any] = {
                "tier": "free",
                "quick_path": "short_text",
                "verdict": {
                    "label": "undetermined",
                    "confidence": 0.4,
                    "rationale": (
                        "The submitted text is too short for a reliable authenticity verdict. "
                        "Please provide a longer statement or more context for accurate analysis."
                    ),
                },
            }
            history = VerificationHistory(
                user_id=user_id,
                content_type=payload.content_type,
                input_reference=payload.content,
                verdict="undetermined",
                confidence=0.4,
                details=details,
            )
            self.db.add(history)
            await self.db.commit()
            await self.db.refresh(history)
            return history

        zenserp_result = await self.zenserp.analyze(
            payload.content_type.value,
            payload.content,
        )

        verdict_payload = await self._groq_analyze(
            content=payload.content,
            content_type=payload.content_type.value,
            zenserp=zenserp_result,
        )

        details: dict[str, Any] = {
            "tools": {"zenserp": zenserp_result},
            "tier": "free",
            "verdict": verdict_payload,
        }

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
        return history

    async def _groq_analyze(
        self,
        content: str,
        content_type: str,
        zenserp: dict[str, Any],
    ) -> dict[str, Any]:
        """Single Groq call that analyzes content and returns verdict."""
        if not settings.groq_api_key:
            return {
                "label": "undetermined",
                "confidence": 0.5,
                "rationale": "Analysis service unavailable.",
            }

        organic = zenserp.get("organic_results", 0)
        web_signal = (
            f"Web search found {organic} results for this content."
            if zenserp.get("status") == "ok"
            else "No web search data available."
        )

        content_excerpt = content[:600] if len(content) > 600 else content

        prompt = f"""You are a content verification expert.
Analyze the following {content_type} content and determine if it is
likely authentic, manipulated, or cannot be determined.

Content: {content_excerpt}

Web presence signal: {web_signal}

Return ONLY a JSON object with exactly these keys:
  label: one of: likely_authentic, likely_manipulated, malicious, undetermined
  confidence: float between 0.0 and 1.0
  rationale: exactly 2 sentences explaining your verdict in plain language
              for a non-technical user. Never mention tool names or APIs.

Rules:
- If content has strong web presence (10+ results) lean toward likely_authentic
- If content has zero web presence lean toward suspicious
- If URL looks like typosquatting or suspicious domain mark as malicious
- Be decisive. Only use undetermined if genuinely impossible to assess.
- Return ONLY the JSON. No explanation outside the JSON."""

        try:
            async with httpx.AsyncClient(
                base_url=settings.groq_base_url,
                timeout=30.0,
            ) as client:
                response = await client.post(
                    "/chat/completions",
                    headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                    json={
                        "model": "llama-3.1-8b-instant",
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "You are a content verification expert. "
                                    "Always respond with valid JSON only."
                                ),
                            },
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.1,
                    },
                )
                response.raise_for_status()
                data = response.json()
                text = data["choices"][0]["message"]["content"]

                match = re.search(r"\{.*\}", text, re.DOTALL)
                if match:
                    parsed = json.loads(match.group(0))
                    return {
                        "label": parsed.get("label", "undetermined"),
                        "confidence": float(parsed.get("confidence", 0.5)),
                        "rationale": parsed.get("rationale", ""),
                    }
        except Exception:
            pass

        return {
            "label": "undetermined",
            "confidence": 0.5,
            "rationale": "Unable to complete analysis at this time.",
        }
