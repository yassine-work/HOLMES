"""Seed initial application data (admin user + sample history)."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select

from app.core.auth import get_password_hash
from app.core.config import get_settings
from app.db.database import AsyncSessionLocal
from app.db.models import ContentType, User, VerificationHistory


settings = get_settings()


async def seed_database() -> None:
    """Seed the database with an admin user and sample verification records."""
    async with AsyncSessionLocal() as session:
        admin = await _ensure_admin_user(session)
        await _ensure_sample_history(session, admin.id)
        await session.commit()


async def _ensure_admin_user(session) -> User:
    """Create default admin user when no admin exists."""
    admin_query = await session.execute(select(User).where(User.is_admin.is_(True)).limit(1))
    admin = admin_query.scalar_one_or_none()
    if admin:
        return admin

    email = settings.default_admin_email.strip().lower()
    password_hash = get_password_hash(settings.default_admin_password)
    admin = User(
        id=uuid4(),
        email=email,
        hashed_password=password_hash,
        is_active=True,
        is_admin=True,
    )
    session.add(admin)
    await session.flush()
    return admin


async def _ensure_sample_history(session, admin_user_id) -> None:
    """Create starter verification history records if none exist for admin."""
    existing_query = await session.execute(
        select(VerificationHistory.id)
        .where(VerificationHistory.user_id == admin_user_id)
        .limit(1)
    )
    if existing_query.scalar_one_or_none() is not None:
        return

    now = datetime.now(timezone.utc)
    samples = [
        VerificationHistory(
            id=uuid4(),
            user_id=admin_user_id,
            content_type=ContentType.URL,
            input_reference="https://example-news-site.test/breaking-claim",
            verdict="likely_manipulated",
            confidence=0.84,
            details={
                "seeded": True,
                "reason": "Domain registered recently and no credible corroboration.",
            },
            created_at=now,
        ),
        VerificationHistory(
            id=uuid4(),
            user_id=admin_user_id,
            content_type=ContentType.IMAGE,
            input_reference="seed://image/deepfake-sample-1",
            verdict="likely_manipulated",
            confidence=0.91,
            details={"seeded": True, "reason": "Face consistency artifacts detected."},
            created_at=now,
        ),
        VerificationHistory(
            id=uuid4(),
            user_id=admin_user_id,
            content_type=ContentType.TEXT,
            input_reference="Seed claim: Government announced impossible overnight policy.",
            verdict="likely_authentic",
            confidence=0.62,
            details={"seeded": True, "reason": "Claim aligned with official publication history."},
            created_at=now,
        ),
    ]
    session.add_all(samples)
