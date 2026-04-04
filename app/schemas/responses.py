"""Generic response schemas for API endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.db.models import ContentType


class VerificationResponse(BaseModel):
    """Response schema for content verification result."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    content_type: ContentType
    verdict: str
    confidence: float
    created_at: datetime


class DashboardResponse(BaseModel):
    """Admin dashboard aggregate response."""

    total_users: int
    total_verifications: int
    total_tasks: int
