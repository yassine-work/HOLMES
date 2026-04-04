"""Authentication primitives: password hashing and JWT management."""

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()


def _normalize_password_for_bcrypt(password: str) -> str:
    """Normalize passwords to avoid bcrypt's 72-byte input truncation limit."""
    password_bytes = password.encode("utf-8")
    if len(password_bytes) <= 72:
        return password
    digest = hashlib.sha256(password_bytes).hexdigest()
    return f"sha256${digest}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    normalized_password = _normalize_password_for_bcrypt(plain_password)
    return pwd_context.verify(normalized_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Generate a bcrypt hash for a password."""
    normalized_password = _normalize_password_for_bcrypt(password)
    return pwd_context.hash(normalized_password)


def create_access_token(subject: UUID | str, expires_delta: timedelta | None = None) -> str:
    """Create signed JWT access token for a user subject."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode = {
        "sub": str(subject),
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as error:
        raise JWTError("Invalid authentication token") from error

    token_type = payload.get("type")
    if token_type != "access":
        raise JWTError("Invalid token type")

    subject = payload.get("sub")
    if not subject:
        raise JWTError("Token subject is missing")

    return payload
