"""Admin-only API endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_admin
from app.db.database import get_db
from app.db.models import Task, User, VerificationHistory
from app.schemas.responses import DashboardResponse


router = APIRouter(prefix="/admin")


@router.get("/dashboard", response_model=DashboardResponse)
async def admin_dashboard(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> DashboardResponse:
    """Return aggregate platform stats for administrators."""
    users_count = await db.scalar(select(func.count()).select_from(User))
    verifications_count = await db.scalar(select(func.count()).select_from(VerificationHistory))
    tasks_count = await db.scalar(select(func.count()).select_from(Task))
    return DashboardResponse(
        total_users=users_count or 0,
        total_verifications=verifications_count or 0,
        total_tasks=tasks_count or 0,
    )
