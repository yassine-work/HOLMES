"""Live integration tests for external verification providers.

These tests call real third-party APIs using credentials from .env.
They run only when RUN_LIVE_TESTS=1.
"""

from __future__ import annotations

import os

import pytest

from app.core.config import get_settings
from app.tools.ninja_tool import NinjaTool
from app.tools.sightengine_tool import SightengineTool
from app.tools.virustotal_tool import VirusTotalTool
from app.tools.zenserp_tool import ZenserpTool


pytestmark = [pytest.mark.live, pytest.mark.integration]


def _live_tests_enabled() -> bool:
    """Check whether live integration tests are explicitly enabled."""
    return os.getenv("RUN_LIVE_TESTS", "0").lower() in {"1", "true", "yes", "on"}


@pytest.fixture(scope="session")
def settings_for_live_tests():
    """Provide settings for live test run and skip unless explicitly enabled."""
    if not _live_tests_enabled():
        pytest.skip("Live tests disabled. Set RUN_LIVE_TESTS=1 to enable.")
    return get_settings()


@pytest.mark.asyncio
async def test_live_ninja_domain_lookup(settings_for_live_tests) -> None:
    """Validate API-Ninjas WHOIS source intelligence with real API key."""
    if not settings_for_live_tests.ninja_api_key:
        pytest.skip("NINJA_API_KEY is not configured.")

    tool = NinjaTool()
    result = await tool.analyze_source("https://example.com")

    assert result["provider"] == "api_ninjas"
    assert result["status"] == "ok"
    assert result["source_type"] in {"domain", "ip"}


@pytest.mark.asyncio
async def test_live_zenserp_search(settings_for_live_tests) -> None:
    """Validate Zenserp search integration with real API key."""
    if not settings_for_live_tests.zenserp_api_key:
        pytest.skip("ZENSERP_API_KEY is not configured.")

    tool = ZenserpTool()
    result = await tool.analyze("url", "https://example.com")

    assert result["provider"] == "zenserp"
    assert result["status"] == "ok"
    assert isinstance(result.get("organic_results"), int)


@pytest.mark.asyncio
async def test_live_virustotal_domain_reputation(settings_for_live_tests) -> None:
    """Validate VirusTotal domain reputation integration with real API key."""
    if not settings_for_live_tests.virustotal_api_key:
        pytest.skip("VIRUSTOTAL_API_KEY is not configured.")

    tool = VirusTotalTool()
    result = await tool.analyze("url", "https://example.com")

    assert result["provider"] == "virustotal"
    assert result["status"] == "ok"
    assert isinstance(result.get("analysis_stats"), dict)


@pytest.mark.asyncio
async def test_live_sightengine_image_check(settings_for_live_tests) -> None:
    """Validate Sightengine image analysis integration with real API credentials."""
    if not settings_for_live_tests.sightengine_api_user or not settings_for_live_tests.sightengine_api_secret:
        pytest.skip("SIGHTENGINE_API_USER/SECRET are not configured.")

    tool = SightengineTool()
    sample_public_image = "https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg"
    result = await tool.analyze("image", sample_public_image)

    assert result["provider"] == "sightengine"
    assert result["status"] == "ok"
    assert isinstance(result.get("data"), dict)
