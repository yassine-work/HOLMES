"""Generic request schemas for verification workflows."""

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
