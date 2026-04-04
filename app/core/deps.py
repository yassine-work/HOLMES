"""Dependency injection for authentication and authorization."""

from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import decode_access_token
from app.db.database import get_db
from app.db.models import User


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = Depends(oauth2_scheme),
) -> User:
    """Resolve current user from bearer token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(token)
        user_id = UUID(payload["sub"])
    except (JWTError, ValueError, KeyError) as error:
        raise credentials_exception from error

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Ensure the current user has admin role."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


async def get_current_user_id(current_user: User = Depends(get_current_user)) -> str:
    """Optional helper dependency for services that only need user id."""
    return str(current_user.id)
