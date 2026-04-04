"""Sightengine integration client."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings


settings = get_settings()


class SightengineTool:
    """Client abstraction for Sightengine analysis API."""

    def __init__(self) -> None:
        self.api_user = settings.sightengine_api_user
        self.api_secret = settings.sightengine_api_secret
        self.base_url = "https://api.sightengine.com"

    async def analyze(self, content_type: str, content: str) -> dict[str, Any]:
        """Analyze media/text content for manipulation signals."""
        if not self.api_user or not self.api_secret:
            return {
                "provider": "sightengine",
                "content_type": content_type,
                "status": "degraded",
                "summary": "SIGHTENGINE_API_USER/SECRET not configured.",
            }

        if not self._is_url(content):
            return {
                "provider": "sightengine",
                "content_type": content_type,
                "status": "skipped",
                "summary": "Sightengine integration currently expects public media URL input.",
            }

        model_map = {
            "image": "genai,deepfake",
            "video": "deepfake",
            "url": "genai,deepfake",
        }
        models = model_map.get(content_type, "genai,deepfake")

        params = {
            "url": content,
            "models": models,
            "api_user": self.api_user,
            "api_secret": self.api_secret,
        }

        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=20.0) as client:
                response = await client.get("/1.0/check.json", params=params)
                response.raise_for_status()
                data = response.json()
            return {
                "provider": "sightengine",
                "content_type": content_type,
                "status": "ok",
                "summary": "Sightengine analysis completed.",
                "data": data,
            }
        except httpx.HTTPError as error:
            return {
                "provider": "sightengine",
                "content_type": content_type,
                "status": "error",
                "summary": str(error),
                "data": {},
            }

    @staticmethod
    def _is_url(value: str) -> bool:
        """Return True when input is an HTTP(S) URL."""
        parsed = urlparse(value.strip())
        return bool(parsed.scheme in {"http", "https"} and parsed.netloc)
