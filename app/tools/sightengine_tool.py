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

        resolved_url, resolution_message = await self._resolve_final_url(content)
        if not resolved_url:
            return {
                "provider": "sightengine",
                "content_type": content_type,
                "status": "skipped",
                "summary": resolution_message,
                "data": {},
            }

        model_map = {
            "image": "genai,deepfake",
            "video": "deepfake",
            "url": "genai,deepfake",
        }
        models = model_map.get(content_type, "genai,deepfake")

        params = {
            "url": resolved_url,
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
                "resolved_url": resolved_url,
                "data": data,
            }
        except httpx.HTTPStatusError as error:
            error_text = str(error)
            if error.response.status_code == 400 and "3xx status code" in error_text:
                retry_url, retry_message = await self._resolve_final_url(content, force_get=True)
                if retry_url and retry_url != resolved_url:
                    retry_params = {
                        "url": retry_url,
                        "models": models,
                        "api_user": self.api_user,
                        "api_secret": self.api_secret,
                    }
                    try:
                        async with httpx.AsyncClient(base_url=self.base_url, timeout=20.0) as client:
                            retry_response = await client.get("/1.0/check.json", params=retry_params)
                            retry_response.raise_for_status()
                            data = retry_response.json()
                        return {
                            "provider": "sightengine",
                            "content_type": content_type,
                            "status": "ok",
                            "summary": "Sightengine analysis completed after redirect resolution.",
                            "resolved_url": retry_url,
                            "data": data,
                        }
                    except httpx.HTTPError as retry_error:
                        return {
                            "provider": "sightengine",
                            "content_type": content_type,
                            "status": "skipped",
                            "summary": (
                                "Media URL is not directly reachable without redirects/authentication. "
                                f"{retry_message} | Provider response: {retry_error}"
                            ),
                            "data": {},
                        }

                return {
                    "provider": "sightengine",
                    "content_type": content_type,
                    "status": "skipped",
                    "summary": (
                        "Media URL requires redirects or authentication and cannot be verified directly by Sightengine. "
                        "Provide a final public direct media URL."
                    ),
                    "data": {},
                }
        except httpx.HTTPError as error:
            return {
                "provider": "sightengine",
                "content_type": content_type,
                "status": "error",
                "summary": str(error),
                "data": {},
            }

    async def _resolve_final_url(self, url: str, force_get: bool = False) -> tuple[str | None, str]:
        """Resolve URL redirects and return final public URL when reachable."""
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=12.0) as client:
                if not force_get:
                    try:
                        response = await client.head(url)
                        if response.status_code < 400:
                            return str(response.url), "Resolved with HEAD request."
                    except httpx.HTTPError:
                        pass

                response = await client.get(url)
                if response.status_code >= 400:
                    return None, f"Source URL returned HTTP {response.status_code}."

                final_url = str(response.url)
                if not self._is_url(final_url):
                    return None, "Resolved URL is not a valid public HTTP(S) link."

                return final_url, "Resolved with GET request."
        except httpx.HTTPError as error:
            return None, f"Unable to resolve final URL: {error}"

    @staticmethod
    def _is_url(value: str) -> bool:
        """Return True when input is an HTTP(S) URL."""
        parsed = urlparse(value.strip())
        return bool(parsed.scheme in {"http", "https"} and parsed.netloc)
