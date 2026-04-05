"""Admin-only API endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_password_hash
from app.core.deps import require_admin
from app.db.database import get_db
from app.db.models import Task, User, VerificationHistory
from app.schemas.requests import AdminUserCreateRequest, AdminUserUpdateRequest
from app.schemas.responses import AdminUserResponse, AdminUsersListResponse, DashboardResponse


router = APIRouter(prefix="/admin")


def _to_admin_user_response(user: User) -> AdminUserResponse:
    return AdminUserResponse(
        id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        is_premium=user.is_premium,
        is_active=user.is_active,
    )


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


@router.get("/users", response_model=AdminUsersListResponse)
async def list_users(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUsersListResponse:
    """Return users for admin management."""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return AdminUsersListResponse(users=[_to_admin_user_response(user) for user in users])


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: AdminUserCreateRequest,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserResponse:
    """Create a user account as admin."""
    normalized_email = payload.email.lower()
    existing = await db.execute(select(User).where(User.email == normalized_email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=normalized_email,
        hashed_password=get_password_hash(payload.password),
        is_admin=payload.is_admin,
        is_premium=payload.is_premium,
        is_active=payload.is_active,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _to_admin_user_response(user)


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: UUID,
    payload: AdminUserUpdateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserResponse:
    """Update selected user flags as admin."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.is_admin is not None:
        if user.id == current_admin.id and payload.is_admin is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot remove your own admin role",
            )
        user.is_admin = payload.is_admin

    if payload.is_active is not None:
        if user.id == current_admin.id and payload.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot deactivate your own account",
            )
        user.is_active = payload.is_active

    if payload.is_premium is not None:
        user.is_premium = payload.is_premium

    await db.commit()
    await db.refresh(user)
    return _to_admin_user_response(user)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Delete a user as admin."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account",
        )

    await db.delete(user)
    await db.commit()
    return {"status": "deleted", "id": str(user_id)}
