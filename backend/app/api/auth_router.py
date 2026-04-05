"""Authentication API endpoints (register/login)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, get_password_hash, verify_password
from app.core.deps import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.schemas.requests import LoginRequest
from app.schemas.token import Token
from app.schemas.user import UserCreate, UserRead


router = APIRouter(prefix="/auth")


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register_user(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> UserRead:
    """Register a new user account."""
    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=payload.email.lower(),
        hashed_password=get_password_hash(payload.password),
        is_active=True,
        is_admin=False,
        is_premium=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserRead.model_validate(user)


@router.post("/login", response_model=Token)
async def login_user(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> Token:
    """Authenticate user and issue JWT access token."""
    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    access_token = create_access_token(subject=user.id)
    return Token(
        access_token=access_token,
        is_admin=user.is_admin,
        is_premium=user.is_premium,
    )


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)) -> dict:
    """Return authenticated user profile including tier flags."""
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "is_admin": current_user.is_admin,
        "is_premium": current_user.is_premium,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at.isoformat(),
    }
