"""Application configuration and environment settings."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Holmes Verification Backend"
    environment: str = "development"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    allowed_origins: list[str] = Field(default_factory=lambda: ["*"])
    upload_dir: str = "uploads"
    max_upload_size_mb: int = 25

    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/holmes"

    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str | None = None
    celery_result_backend: str | None = None

    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_default_model: str = "llama-3.3-70b-versatile"

    sightengine_api_user: str = ""
    sightengine_api_secret: str = ""
    zenserp_api_key: str = ""
    virustotal_api_key: str = ""
    ninja_api_key: str = ""
    hf_token: str = ""
    bitmind_api_key: str = ""
    gemini_api_key: str = ""

    stripe_secret_key: str = ""
    stripe_price_id: str = ""
    stripe_webhook_secret: str = ""
    stripe_success_url: str = ""
    stripe_cancel_url: str = ""
    stripe_simulation_mode: bool = False

    default_admin_email: str = "admin@holmes.local"
    default_admin_password: str = "ChangeMe_Admin123!"

    @property
    def resolved_celery_broker_url(self) -> str:
        """Return explicit Celery broker URL or fallback to Redis URL."""
        return self.celery_broker_url or self.redis_url

    @property
    def resolved_celery_result_backend(self) -> str:
        """Return explicit Celery result backend URL or fallback to Redis URL."""
        return self.celery_result_backend or self.redis_url


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Create and cache settings instance."""
    return Settings()
