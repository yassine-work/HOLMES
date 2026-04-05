"""Base Groq LLM client shared by agent implementations."""

import asyncio
from typing import Any

import httpx

from app.core.config import get_settings


settings = get_settings()


class BaseLLMAgent:
    """Base class for Groq-powered analysis agents."""

    system_prompt: str = "You are a factual analysis assistant."

    @staticmethod
    def _degraded_response(message: str) -> dict[str, Any]:
        """Return a consistent degraded payload when LLM call cannot complete."""
        return {
            "status": "degraded",
            "message": message,
            "content": f"LLM response unavailable: {message}",
        }

    async def complete(self, user_prompt: str) -> dict[str, Any]:
        """Generate a structured response from Groq chat-completions API."""
        if not settings.groq_api_key:
            return self._degraded_response("Missing GROQ_API_KEY; returning fallback output.")

        model_name = "llama-3.1-8b-instant"
        if settings.groq_default_model == "llama-3.1-8b-instant":
            model_name = "gemma2-9b-it"

        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
        }
        headers = {"Authorization": f"Bearer {settings.groq_api_key}"}

        rate_limit_backoffs = [5, 15, 30]
        rate_limit_retry_index = 0
        max_attempts = 3
        backoff_seconds = 1.0

        async with httpx.AsyncClient(base_url=settings.groq_base_url, timeout=30.0) as client:
            for attempt in range(1, max_attempts + 1):
                try:
                    response = await client.post("/chat/completions", json=payload, headers=headers)
                    response.raise_for_status()
                    data: dict[str, Any] = response.json()
                    choices = data.get("choices", [])
                    content = choices[0]["message"]["content"] if choices else ""
                    return {"status": "ok", "content": content, "raw": data}
                except httpx.HTTPStatusError as exc:
                    status_code = exc.response.status_code
                    if status_code == 429:
                        if rate_limit_retry_index < len(rate_limit_backoffs):
                            await asyncio.sleep(rate_limit_backoffs[rate_limit_retry_index])
                            rate_limit_retry_index += 1
                            continue
                        return self._degraded_response("LLM provider rate limited the request (HTTP 429).")

                    if status_code in {500, 502, 503, 504} and attempt < max_attempts:
                        await asyncio.sleep(backoff_seconds)
                        backoff_seconds *= 2
                        continue
                    return self._degraded_response(f"LLM provider returned HTTP {status_code}.")
                except httpx.HTTPError as exc:
                    if attempt < max_attempts:
                        await asyncio.sleep(backoff_seconds)
                        backoff_seconds *= 2
                        continue
                    return self._degraded_response(f"Network error while contacting LLM provider: {exc!s}")

        return self._degraded_response("Unexpected LLM completion failure.")
