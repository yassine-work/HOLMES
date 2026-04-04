"""Rate limiting utilities backed by Redis."""

from datetime import datetime, timezone

from fastapi import HTTPException, Request, status
from redis.asyncio import Redis

from app.core.config import get_settings


settings = get_settings()


class RedisRateLimiter:
    """Fixed-window rate limiter using Redis counters."""

    def __init__(self, redis_client: Redis, max_requests: int, window_seconds: int) -> None:
        self.redis_client = redis_client
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def enforce(self, request: Request, key_prefix: str = "rl") -> None:
        """Raise HTTP 429 when request count exceeds configured window."""
        client_ip = request.client.host if request.client else "unknown"
        window = int(datetime.now(timezone.utc).timestamp() // self.window_seconds)
        redis_key = f"{key_prefix}:{client_ip}:{window}"

        request_count = await self.redis_client.incr(redis_key)
        if request_count == 1:
            await self.redis_client.expire(redis_key, self.window_seconds)

        if request_count > self.max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests",
            )


def build_rate_limiter(max_requests: int = 60, window_seconds: int = 60) -> RedisRateLimiter:
    """Factory for rate limiter dependency instances."""
    redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
    return RedisRateLimiter(redis_client, max_requests=max_requests, window_seconds=window_seconds)
