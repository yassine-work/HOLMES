"""Zenserp integration client."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings


settings = get_settings()


class ZenserpTool:
    """Client abstraction for Zenserp search intelligence."""

    def __init__(self) -> None:
        self.api_key = settings.zenserp_api_key
        self.base_url = "https://app.zenserp.com/api/v2"

    async def analyze(self, content_type: str, content: str) -> dict[str, Any]:
        """Run source/context checks via Zenserp."""
        if not self.api_key:
            return {
                "provider": "zenserp",
                "content_type": content_type,
                "status": "degraded",
                "summary": "ZENSERP_API_KEY not configured.",
            }

        query_text = self._build_query(content_type=content_type, content=content)
        params = {
            "apikey": self.api_key,
            "q": query_text,
            "hl": "en",
            "gl": "us",
            "num": 5,
        }

        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=20.0) as client:
                response = await client.get("/search", params=params)
                response.raise_for_status()
                data = response.json()

            organic = data.get("organic", []) if isinstance(data, dict) else []
            return {
                "provider": "zenserp",
                "content_type": content_type,
                "status": "ok",
                "summary": "Zenserp search completed.",
                "query": query_text,
                "organic_results": len(organic),
                "data": data,
            }
        except httpx.HTTPError as error:
            return {
                "provider": "zenserp",
                "content_type": content_type,
                "status": "error",
                "summary": str(error),
                "query": query_text,
                "data": {},
            }

    @staticmethod
    def _build_query(content_type: str, content: str) -> str:
        """Derive meaningful search query for source verification."""
        parsed = urlparse(content.strip())
        if parsed.hostname:
            return parsed.hostname
        if content_type == "text":
            return content[:120]
        return content
