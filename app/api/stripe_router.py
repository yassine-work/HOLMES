"""Stripe webhook handler for subscription lifecycle events."""

from __future__ import annotations

import importlib
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.db.database import get_db
from app.db.models import User


router = APIRouter(prefix="/stripe")
settings = get_settings()


def _get_stripe() -> Any:
    """Load Stripe module lazily so startup remains resilient."""
    try:
        return importlib.import_module("stripe")
    except ModuleNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment system not configured yet",
        ) from error


@router.post("/create-checkout-session")
async def create_checkout_session(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a Stripe checkout session for premium upgrade."""
    if settings.stripe_simulation_mode:
        current_user.is_premium = True
        db.add(current_user)
        await db.commit()
        await db.refresh(current_user)
        return {"checkout_url": settings.stripe_success_url}

    if not settings.stripe_secret_key or not settings.stripe_price_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment system not configured yet",
        )

    stripe = _get_stripe()
    stripe.api_key = settings.stripe_secret_key

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            line_items=[
                {
                    "price": settings.stripe_price_id,
                    "quantity": 1,
                }
            ],
            success_url=settings.stripe_success_url,
            cancel_url=settings.stripe_cancel_url,
            metadata={"user_id": str(current_user.id)},
            customer_email=current_user.email,
        )
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error

    return {"checkout_url": session.url}


@router.post("/unsubscribe")
async def unsubscribe_premium(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Downgrade current user from premium tier."""
    if current_user.is_admin:
        return {
            "status": "ok",
            "is_premium": True,
            "message": "Admin users always retain premium access.",
        }

    current_user.is_premium = False
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return {
        "status": "ok",
        "is_premium": current_user.is_premium,
    }


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="stripe-signature"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Handle Stripe subscription events and update user tier."""
    if settings.stripe_simulation_mode:
        return {"status": "ok", "mode": "simulation"}

    if not settings.stripe_secret_key or not settings.stripe_webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment system not configured yet",
        )

    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing webhook signature.")

    stripe = _get_stripe()
    stripe.api_key = settings.stripe_secret_key
    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload,
            stripe_signature,
            settings.stripe_webhook_secret,
        )
    except Exception as error:
        if error.__class__.__name__ == "SignatureVerificationError":
            raise HTTPException(status_code=400, detail="Invalid webhook signature.") from error
        raise HTTPException(status_code=400, detail="Invalid webhook payload.") from error

    if event["type"] in {
        "checkout.session.completed",
        "customer.subscription.created",
        "invoice.payment_succeeded",
    }:
        session = event["data"]["object"]
        user_id = (session.get("metadata") or {}).get("user_id")
        if user_id:
            try:
                parsed_user_id = uuid.UUID(str(user_id))
            except ValueError:
                parsed_user_id = None

            if parsed_user_id:
                result = await db.execute(select(User).where(User.id == parsed_user_id))
                user = result.scalar_one_or_none()
                if user:
                    user.is_premium = True
                    await db.commit()

    if event["type"] in {
        "customer.subscription.deleted",
        "customer.subscription.paused",
        "invoice.payment_failed",
    }:
        session = event["data"]["object"]
        customer_email = session.get("customer_email")
        if customer_email:
            result = await db.execute(select(User).where(User.email == customer_email.lower()))
            user = result.scalar_one_or_none()
            if user:
                user.is_premium = False
                await db.commit()

    return {"status": "ok"}
