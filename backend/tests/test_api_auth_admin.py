"""Integration tests for auth flow and admin authorization."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.auth import get_password_hash
from app.db.models import User


@pytest.mark.asyncio
async def test_register_and_login_flow(client, test_user_credentials: dict[str, str]) -> None:
    """Register then login user and assert token is returned."""
    register_response = await client.post("/api/v1/auth/register", json=test_user_credentials)
    assert register_response.status_code == 201

    payload = register_response.json()
    assert payload["email"] == test_user_credentials["email"]
    assert payload["is_admin"] is False

    login_response = await client.post("/api/v1/auth/login", json=test_user_credentials)
    assert login_response.status_code == 200

    token_payload = login_response.json()
    assert token_payload["token_type"] == "bearer"
    assert token_payload["access_token"]


@pytest.mark.asyncio
async def test_admin_dashboard_forbidden_for_non_admin(client, test_user_credentials: dict[str, str]) -> None:
    """Ensure non-admin users cannot access admin dashboard endpoint."""
    await client.post("/api/v1/auth/register", json=test_user_credentials)
    login_response = await client.post("/api/v1/auth/login", json=test_user_credentials)
    token = login_response.json()["access_token"]

    dashboard_response = await client.get(
        "/api/v1/admin/dashboard",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert dashboard_response.status_code == 403


@pytest.mark.asyncio
async def test_admin_dashboard_accessible_for_admin(client, db_session) -> None:
    """Ensure admin user can access dashboard metrics endpoint."""
    admin_email = f"admin_test_{uuid.uuid4().hex[:8]}@example.com"
    admin_password = "AdminPass123!"

    admin = User(
        email=admin_email,
        hashed_password=get_password_hash(admin_password),
        is_active=True,
        is_admin=True,
    )
    db_session.add(admin)
    await db_session.commit()

    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": admin_email, "password": admin_password},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    dashboard_response = await client.get(
        "/api/v1/admin/dashboard",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert dashboard_response.status_code == 200
    data = dashboard_response.json()
    assert "total_users" in data
    assert "total_verifications" in data
    assert "total_tasks" in data

    result = await db_session.execute(select(User).where(User.email == admin_email))
    created_admin = result.scalar_one_or_none()
    assert created_admin is not None
