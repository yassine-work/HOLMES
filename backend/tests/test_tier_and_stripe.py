"""Tests for user tier exposure and Stripe/tier-gating endpoint behavior."""

from __future__ import annotations

import uuid

import pytest

from app.api import stripe_router


@pytest.mark.asyncio
async def test_register_login_and_me_include_tier_flags(client) -> None:
    """Auth responses should expose is_premium and is_admin flags."""
    email = f"test_tier_{uuid.uuid4().hex[:10]}@example.com"
    password = "TierPass123!"

    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password},
    )
    assert register_response.status_code == 201
    register_payload = register_response.json()
    assert register_payload["is_admin"] is False
    assert register_payload["is_premium"] is False

    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_response.status_code == 200
    login_payload = login_response.json()
    assert login_payload["is_admin"] is False
    assert login_payload["is_premium"] is False
    token = login_payload["access_token"]

    me_response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == 200
    me_payload = me_response.json()
    assert me_payload["email"] == email
    assert me_payload["is_admin"] is False
    assert me_payload["is_premium"] is False
    assert "created_at" in me_payload


@pytest.mark.asyncio
async def test_free_user_file_upload_is_forbidden(client) -> None:
    """Free tier users should get 403 on file upload endpoint."""
    email = f"test_free_upload_{uuid.uuid4().hex[:10]}@example.com"
    password = "FreeUploadPass123!"

    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password},
    )
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    token = login_response.json()["access_token"]

    response = await client.post(
        "/api/v1/upload/verify-file",
        data={"content_type": "image"},
        files={"file": ("sample.png", b"not-an-image", "image/png")},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "File upload requires a premium subscription."


@pytest.mark.asyncio
async def test_stripe_checkout_requires_auth(client) -> None:
    """Stripe checkout creation should be protected by auth dependency."""
    response = await client.post("/api/v1/stripe/create-checkout-session")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_stripe_endpoints_fail_gracefully_when_not_configured(client) -> None:
    """Stripe endpoints should return clear 503 when keys are unset."""
    email = f"test_stripe_{uuid.uuid4().hex[:10]}@example.com"
    password = "StripePass123!"

    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password},
    )
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    token = login_response.json()["access_token"]

    checkout_response = await client.post(
        "/api/v1/stripe/create-checkout-session",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert checkout_response.status_code == 503
    assert checkout_response.json()["detail"] == "Payment system not configured yet"

    webhook_response = await client.post(
        "/api/v1/stripe/webhook",
        content=b"{}",
        headers={"stripe-signature": "test-signature"},
    )
    assert webhook_response.status_code == 503
    assert webhook_response.json()["detail"] == "Payment system not configured yet"


@pytest.mark.asyncio
async def test_stripe_simulation_mode_upgrades_user_without_real_checkout(client) -> None:
    """Simulation mode should upgrade user and return success redirect URL."""
    email = f"test_sim_checkout_{uuid.uuid4().hex[:10]}@example.com"
    password = "SimCheckoutPass123!"

    original_simulation_mode = stripe_router.settings.stripe_simulation_mode
    stripe_router.settings.stripe_simulation_mode = True

    try:
        await client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password},
        )

        login_response = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        token = login_response.json()["access_token"]

        checkout_response = await client.post(
            "/api/v1/stripe/create-checkout-session",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert checkout_response.status_code == 200
        payload = checkout_response.json()
        assert "checkout_url" in payload

        me_response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me_response.status_code == 200
        assert me_response.json()["is_premium"] is True
    finally:
        stripe_router.settings.stripe_simulation_mode = original_simulation_mode
