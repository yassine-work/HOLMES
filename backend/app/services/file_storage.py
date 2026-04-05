"""Utilities for storing uploaded files used in verification workflows."""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile, status

from app.core.config import get_settings


settings = get_settings()


class FileStorageService:
    """Persist uploaded files to local storage with basic safety checks."""

    def __init__(self) -> None:
        self.upload_dir = Path(settings.upload_dir)
        self.max_upload_size_bytes = max(settings.max_upload_size_mb, 1) * 1024 * 1024

    async def save_upload(self, file: UploadFile, content_type: str) -> dict[str, Any]:
        """Save uploaded file to disk and return metadata used by verification pipeline."""
        suffix = Path(file.filename or "upload.bin").suffix or self._default_suffix(content_type)
        safe_name = f"{uuid.uuid4().hex}{suffix}"
        target_dir = self.upload_dir / content_type
        target_path = target_dir / safe_name

        raw = await file.read()
        size = len(raw)
        if size == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")
        if size > self.max_upload_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum allowed size is {settings.max_upload_size_mb} MB.",
            )

        await asyncio.to_thread(target_dir.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(target_path.write_bytes, raw)

        original_name = file.filename or safe_name
        return {
            "original_name": original_name,
            "stored_name": safe_name,
            "stored_path": str(target_path),
            "size_bytes": size,
            "mime_type": file.content_type or "application/octet-stream",
        }

    @staticmethod
    def _default_suffix(content_type: str) -> str:
        if content_type == "image":
            return ".jpg"
        if content_type == "video":
            return ".mp4"
        if content_type == "audio":
            return ".mp3"
        return ".bin"
