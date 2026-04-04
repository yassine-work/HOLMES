"""Base Groq LLM client shared by agent implementations."""

from typing import Any

import httpx

from app.core.config import get_settings


settings = get_settings()


class BaseLLMAgent:
    """Base class for Groq-powered analysis agents."""

    system_prompt: str = "You are a factual analysis assistant."

    async def complete(self, user_prompt: str) -> dict[str, Any]:
        """Generate a structured response from Groq chat-completions API."""
        if not settings.groq_api_key:
            return {
                "status": "degraded",
                "message": "Missing GROQ_API_KEY; returning fallback output.",
                "content": "",
            }

        payload = {
            "model": settings.groq_default_model,
            "messages": [
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
        }
        headers = {"Authorization": f"Bearer {settings.groq_api_key}"}

        async with httpx.AsyncClient(base_url=settings.groq_base_url, timeout=30.0) as client:
            response = await client.post("/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data: dict[str, Any] = response.json()

        choices = data.get("choices", [])
        content = choices[0]["message"]["content"] if choices else ""
        return {"status": "ok", "content": content, "raw": data}
