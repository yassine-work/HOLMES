"""Verification history endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.database import get_db
from app.db.models import User, VerificationHistory
from app.schemas.responses import VerificationResponse


router = APIRouter(prefix="/history")


@router.get("", response_model=list[VerificationResponse])
async def get_verification_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[VerificationResponse]:
    """Return current user's verification history."""
    result = await db.execute(
        select(VerificationHistory)
        .where(VerificationHistory.user_id == current_user.id)
        .order_by(desc(VerificationHistory.created_at))
        .limit(100)
    )
    entries = result.scalars().all()
    return [VerificationResponse.model_validate(entry) for entry in entries]
