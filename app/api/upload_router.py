"""Upload and verification API endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.schemas.requests import VerificationRequest
from app.schemas.responses import VerificationResponse
from app.services.workflow_manager import WorkflowManager


router = APIRouter(prefix="/upload")


@router.post("/verify", response_model=VerificationResponse)
async def verify_content(
    payload: VerificationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VerificationResponse:
    """Run verification workflow for uploaded content."""
    manager = WorkflowManager(db=db)
    result = await manager.run_verification(user_id=current_user.id, payload=payload)
    return VerificationResponse.model_validate(result)
