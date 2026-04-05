"""Generic response schemas for API endpoints."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import ContentType


class VerificationResponse(BaseModel):
    """Response schema for content verification result."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    content_type: ContentType
    input_reference: str
    verdict: str
    confidence: float
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class DashboardResponse(BaseModel):
    """Admin dashboard aggregate response."""

    total_users: int
    total_verifications: int
    total_tasks: int


class AdminUserResponse(BaseModel):
    """Sanitized user model for admin management views."""

    id: str
    email: str
    is_admin: bool
    is_premium: bool
    is_active: bool


class AdminUsersListResponse(BaseModel):
    """List container for admin users endpoint."""

    users: list[AdminUserResponse]
