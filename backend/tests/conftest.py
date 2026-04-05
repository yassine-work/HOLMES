"""Pytest fixtures for backend integration and service tests."""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal, init_db
from app.db.models import User, VerificationHistory
from app.main import app


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_database() -> AsyncGenerator[None, None]:
    """Ensure database schema exists before running tests."""
    await init_db()
    yield


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Create HTTP client bound to FastAPI ASGI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield async SQLAlchemy session for direct DB operations in tests."""
    async with AsyncSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def test_user_credentials() -> dict[str, str]:
    """Generate unique user credentials for each test run."""
    return {
        "email": f"test_user_{uuid.uuid4().hex[:10]}@example.com",
        "password": "TestUserPass123!",
    }


@pytest_asyncio.fixture(autouse=True)
async def cleanup_test_users() -> AsyncGenerator[None, None]:
    """Clean up test-created users/history records after each test."""
    yield
    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(VerificationHistory).where(VerificationHistory.input_reference.like("seed://test/%"))
        )
        await session.execute(delete(User).where(User.email.like("test_%@example.com")))
        await session.execute(delete(User).where(User.email.like("admin_test_%@example.com")))
        await session.commit()
