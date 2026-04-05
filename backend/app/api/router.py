"""API router composition."""

from fastapi import APIRouter

from app.api.admin_router import router as admin_router
from app.api.auth_router import router as auth_router
from app.api.history_router import router as history_router
from app.api.upload_router import router as upload_router


api_router = APIRouter()
api_router.include_router(auth_router, tags=["auth"])
api_router.include_router(admin_router, tags=["admin"])
api_router.include_router(upload_router, tags=["verification"])
api_router.include_router(history_router, tags=["history"])
