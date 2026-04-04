"""Async SQLAlchemy engine and session management for Neon PostgreSQL."""

from collections.abc import AsyncGenerator
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


settings = get_settings()


def _normalize_database_url(raw_url: str) -> str:
    """Normalize common PostgreSQL URL variants to asyncpg dialect."""
    if raw_url.startswith("postgresql+asyncpg://"):
        return raw_url
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
    return raw_url


def _extract_connect_args(db_url: str) -> tuple[str, dict[str, object]]:
    """Extract asyncpg-compatible connect args from database URL query string."""
    parsed = urlparse(db_url)
    query_params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    connect_args: dict[str, object] = {}

    sslmode = query_params.pop("sslmode", None)
    if sslmode:
        normalized_sslmode = sslmode.lower().strip()
        if normalized_sslmode in {"require", "verify-ca", "verify-full"}:
            connect_args["ssl"] = "require"
        elif normalized_sslmode in {"disable", "allow", "prefer"}:
            connect_args["ssl"] = False

    unsupported_params = {
        "channel_binding",
        "gssencmode",
        "krbsrvname",
        "target_session_attrs",
    }
    for key in unsupported_params:
        query_params.pop(key, None)

    normalized_query = urlencode(query_params)
    cleaned_url = urlunparse(parsed._replace(query=normalized_query))
    return cleaned_url, connect_args


DATABASE_URL = _normalize_database_url(settings.database_url)
DATABASE_URL, DATABASE_CONNECT_ARGS = _extract_connect_args(DATABASE_URL)

engine = create_async_engine(
    DATABASE_URL,
    connect_args=DATABASE_CONNECT_ARGS,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
    future=True,
    echo=settings.debug,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base SQLAlchemy declarative class."""


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield async database session for request lifetime."""
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    """Initialize database schema; for bootstrap/dev usage."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
