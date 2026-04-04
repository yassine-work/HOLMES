"""Database seed behavior tests."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.db.models import User, VerificationHistory
from app.db.seeds.seed_data import seed_database


@pytest.mark.asyncio
async def test_seed_database_creates_baseline_data(db_session) -> None:
    """Seed should ensure at least one admin and initial verification history."""
    await seed_database()

    admins_count = await db_session.scalar(
        select(func.count()).select_from(User).where(User.is_admin.is_(True))
    )
    history_count = await db_session.scalar(select(func.count()).select_from(VerificationHistory))

    assert int(admins_count or 0) >= 1
    assert int(history_count or 0) >= 3
