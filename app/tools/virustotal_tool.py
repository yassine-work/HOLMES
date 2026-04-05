"""VirusTotal integration client."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings


settings = get_settings()


class VirusTotalTool:
    """Client abstraction for VirusTotal scanning."""

    def __init__(self) -> None:
        self.api_key = settings.virustotal_api_key
        self.base_url = "https://www.virustotal.com/api/v3"

    async def analyze(self, content_type: str, content: str) -> dict[str, Any]:
        """Run malware/reputation checks when applicable."""
        if content_type not in {"url"}:
            return {
                "provider": "virustotal",
                "content_type": content_type,
                "status": "skipped",
                "summary": "VirusTotal only applies to URL content.",
            }

        if not self.api_key:
            return {
                "provider": "virustotal",
                "content_type": content_type,
                "status": "degraded",
                "summary": "VIRUSTOTAL_API_KEY not configured.",
            }

        domain = self._extract_domain(content)
        if not domain:
            return {
                "provider": "virustotal",
                "content_type": content_type,
                "status": "skipped",
                "summary": "VirusTotal domain lookup requires URL/domain input.",
            }

        headers = {"x-apikey": self.api_key}
        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=20.0) as client:
                response = await client.get(f"/domains/{domain}", headers=headers)
                response.raise_for_status()
                data = response.json()

            attributes = data.get("data", {}).get("attributes", {}) if isinstance(data, dict) else {}
            stats = attributes.get("last_analysis_stats", {})
            return {
                "provider": "virustotal",
                "content_type": content_type,
                "status": "ok",
                "summary": "VirusTotal domain reputation fetched.",
                "domain": domain,
                "analysis_stats": stats,
                "data": data,
            }
        except httpx.HTTPError as error:
            return {
                "provider": "virustotal",
                "content_type": content_type,
                "status": "error",
                "summary": str(error),
                "domain": domain,
                "data": {},
            }

    @staticmethod
    def _extract_domain(content: str) -> str | None:
        """Extract domain from URL or raw host input."""
        parsed = urlparse(content.strip())
        if parsed.hostname:
            return parsed.hostname
        if "." in content and " " not in content:
            return content.strip().split("/")[0]
        return None
