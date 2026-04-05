"""FastAPI application entrypoint."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.stripe_router import router as stripe_router
from app.core.config import get_settings


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)
app.include_router(stripe_router, prefix=settings.api_v1_prefix, tags=["stripe"])


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Simple health endpoint for liveness checks."""
    return {"status": "ok"}
