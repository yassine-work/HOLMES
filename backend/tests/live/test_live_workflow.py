"""Live end-to-end workflow validation with real provider calls.

This test validates URL verification orchestration and persistence using real APIs.
It runs only when RUN_LIVE_TESTS=1.
"""

from __future__ import annotations

import os
import uuid

import pytest
from sqlalchemy import delete, select

from app.core.auth import get_password_hash
from app.core.config import get_settings
from app.db.database import AsyncSessionLocal
from app.db.models import ContentType, User, VerificationHistory
from app.schemas.requests import VerificationRequest
from app.services.workflow_manager import WorkflowManager


pytestmark = [pytest.mark.live, pytest.mark.integration]


def _live_tests_enabled() -> bool:
    """Check whether live integration tests are explicitly enabled."""
    return os.getenv("RUN_LIVE_TESTS", "0").lower() in {"1", "true", "yes", "on"}


@pytest.mark.asyncio
async def test_live_url_workflow_persists_real_tool_results() -> None:
    """Run full URL workflow with live tools and assert persisted provider outputs."""
    if not _live_tests_enabled():
        pytest.skip("Live tests disabled. Set RUN_LIVE_TESTS=1 to enable.")

    settings = get_settings()
    if not settings.ninja_api_key:
        pytest.skip("NINJA_API_KEY is required for live URL workflow test.")

    email = f"test_live_{uuid.uuid4().hex[:10]}@example.com"

    async with AsyncSessionLocal() as session:
        user = User(
            email=email,
            hashed_password=get_password_hash("LiveFlowPass123!"),
            is_active=True,
            is_admin=False,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        manager = WorkflowManager(db=session)
        payload = VerificationRequest(content_type=ContentType.URL, content="https://example.com")
        history = await manager.run_verification(user_id=user.id, payload=payload)

        assert history.id is not None
        assert history.details.get("tools") is not None

        tools = history.details["tools"]
        assert "ninja" in tools
        assert tools["ninja"].get("status") == "ok"

        if settings.zenserp_api_key:
            assert tools["zenserp"].get("status") == "ok"
        if settings.virustotal_api_key:
            assert tools["virustotal"].get("status") == "ok"

        db_row = await session.execute(select(VerificationHistory).where(VerificationHistory.id == history.id))
        persisted = db_row.scalar_one_or_none()
        assert persisted is not None

        await session.execute(delete(VerificationHistory).where(VerificationHistory.user_id == user.id))
        await session.execute(delete(User).where(User.id == user.id))
        await session.commit()
