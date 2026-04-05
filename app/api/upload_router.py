"""Upload and verification API endpoints."""

import asyncio
import base64
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.database import get_db
from app.db.models import ContentType, User
from app.schemas.requests import VerificationRequest
from app.schemas.responses import VerificationResponse
from app.services.file_storage import FileStorageService
from app.services.free_workflow_manager import FreeWorkflowManager
from app.services.workflow_manager import WorkflowManager


router = APIRouter(prefix="/upload")


@router.post("/verify", response_model=VerificationResponse)
async def verify_content(
    payload: VerificationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VerificationResponse:
    """Run verification workflow for uploaded content."""
    if current_user.is_premium or current_user.is_admin:
        manager = WorkflowManager(db=db)
        result = await manager.run_verification(user_id=current_user.id, payload=payload)
    else:
        free_manager = FreeWorkflowManager(db=db)
        try:
            result = await free_manager.run_verification(user_id=current_user.id, payload=payload)
        except ValueError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc

    return VerificationResponse.model_validate(result)


@router.post("/verify-file", response_model=VerificationResponse)
async def verify_uploaded_file(
    content_type: ContentType = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VerificationResponse:
    """Accept image/video/audio uploads and run verification on stored file metadata."""
    if not (current_user.is_premium or current_user.is_admin):
        raise HTTPException(
            status_code=403,
            detail="File upload requires a premium subscription.",
        )

    if content_type not in {ContentType.IMAGE, ContentType.VIDEO, ContentType.AUDIO}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File uploads are supported only for image, video, and audio content types.",
        )

    storage = FileStorageService()
    file_metadata = await storage.save_upload(file=file, content_type=content_type.value)
    stored_bytes = await asyncio.to_thread(Path(file_metadata["stored_path"]).read_bytes)
    file_bytes_b64 = base64.b64encode(stored_bytes).decode("utf-8")
    file_reference = file_metadata["original_name"]

    manager = WorkflowManager(db=db)
    result = await manager.run_verification(
        user_id=current_user.id,
        payload=VerificationRequest(
            content_type=content_type,
            content=file_reference,
            content_b64=file_bytes_b64,
        ),
    )

    return VerificationResponse.model_validate(result)
