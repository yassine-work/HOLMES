"""Redis cache manager abstraction."""

import json
from typing import Any

from redis.asyncio import Redis

from app.core.config import get_settings


settings = get_settings()


class CacheManager:
    """Thin cache service wrapper over Redis operations."""

    def __init__(self, redis_client: Redis | None = None) -> None:
        self.redis_client = redis_client or Redis.from_url(settings.redis_url, decode_responses=True)

    async def get_json(self, key: str) -> dict[str, Any] | None:
        """Load JSON object from Redis by key."""
        value = await self.redis_client.get(key)
        return json.loads(value) if value else None

    async def set_json(self, key: str, payload: dict[str, Any], ttl_seconds: int = 300) -> None:
        """Save JSON object to Redis with TTL."""
        await self.redis_client.set(key, json.dumps(payload), ex=ttl_seconds)
