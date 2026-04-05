"""Generic request schemas for verification workflows."""

from pydantic import EmailStr
from pydantic import BaseModel, Field

from app.db.models import ContentType


class LoginRequest(BaseModel):
    """Payload for user login."""

    email: str
    password: str


class VerificationRequest(BaseModel):
    """Request body for content verification."""

    content_type: ContentType
    content: str = Field(min_length=1)
    content_b64: str | None = None


class AdminUserCreateRequest(BaseModel):
    """Payload for admin-created user accounts."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    is_admin: bool = False
    is_premium: bool = False
    is_active: bool = True


class AdminUserUpdateRequest(BaseModel):
    """Payload for partial admin updates on users."""

    is_admin: bool | None = None
    is_premium: bool | None = None
    is_active: bool | None = None
