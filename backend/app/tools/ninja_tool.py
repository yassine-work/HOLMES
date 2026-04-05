"""API-Ninjas integration for source intelligence checks."""

from __future__ import annotations

from datetime import datetime, timezone
from ipaddress import ip_address
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings


settings = get_settings()


class NinjaTool:
    """Client abstraction for API-Ninjas WHOIS/IP lookup endpoints."""

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.ninja_api_key
        self.base_url = "https://api.api-ninjas.com/v1"

    async def domain_whois(self, domain: str) -> dict[str, Any]:
        """Fetch WHOIS data for a domain."""
        return await self._request("/whois", params={"domain": domain})

    async def ip_lookup(self, ip_or_host: str) -> dict[str, Any]:
        """Fetch IP intelligence data for an IP address."""
        return await self._request("/iplookup", params={"address": ip_or_host})

    async def analyze_source(self, url: str) -> dict[str, Any]:
        """Analyze URL source and estimate domain age/risk indicators."""
        parsed = urlparse(url.strip())
        host = parsed.hostname
        if not host:
            return {
                "provider": "api_ninjas",
                "status": "invalid_input",
                "message": "URL host is missing",
            }

        try:
            ip_address(host)
            ip_data = await self.ip_lookup(host)
            return {
                "provider": "api_ninjas",
                "status": "ok",
                "source_type": "ip",
                "ip_lookup": ip_data,
                "risk_flags": [],
            }
        except ValueError:
            pass

        whois_data = await self.domain_whois(host)
        created_at = self._extract_created_at(whois_data)
        domain_age_days = self._calculate_age_days(created_at) if created_at else None
        risk_flags: list[str] = []
        if domain_age_days is not None and domain_age_days <= 90:
            risk_flags.append("new_domain")
        if not whois_data:
            risk_flags.append("whois_unavailable")

        return {
            "provider": "api_ninjas",
            "status": "ok",
            "source_type": "domain",
            "domain": host,
            "domain_created_at": created_at,
            "domain_age_days": domain_age_days,
            "risk_flags": risk_flags,
            "whois": whois_data,
        }

    async def _request(self, endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
        """Send authenticated request to API-Ninjas and return JSON response."""
        if not self.api_key:
            return {
                "status": "degraded",
                "message": "NINJA_API_KEY is not configured",
                "data": {},
            }

        headers = {"X-Api-Key": self.api_key}
        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=15.0) as client:
                response = await client.get(endpoint, params=params, headers=headers)
                response.raise_for_status()
                data = response.json()
            return {"status": "ok", "data": data}
        except httpx.HTTPError as error:
            return {
                "status": "error",
                "message": str(error),
                "data": {},
            }

    @staticmethod
    def _extract_created_at(whois_payload: dict[str, Any]) -> str | None:
        """Extract ISO creation date string from WHOIS response payload."""
        data = whois_payload.get("data", {}) if isinstance(whois_payload, dict) else {}
        for key in ("creation_date", "created", "created_date", "registered"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _calculate_age_days(created_at: str) -> int | None:
        """Calculate domain age in days from potentially variable timestamp format."""
        candidates = [
            "%Y-%m-%d",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%d %H:%M:%S",
            "%d-%b-%Y",
        ]
        created_dt: datetime | None = None
        for fmt in candidates:
            try:
                created_dt = datetime.strptime(created_at, fmt).replace(tzinfo=timezone.utc)
                break
            except ValueError:
                continue

        if created_dt is None:
            return None

        delta = datetime.now(timezone.utc) - created_dt
        return max(delta.days, 0)
