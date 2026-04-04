"""Authentication API endpoints (register/login)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, get_password_hash, verify_password
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
    return Token(access_token=access_token)
