"""BitMind + Gemini tool for AI-generated image detection."""

from __future__ import annotations

import asyncio
import base64
from typing import Any
from urllib.parse import urlparse

import google.generativeai as genai
import httpx

from app.core.config import get_settings


class BitmindImageTool:
    """Detects AI-generated images via BitMind and explains via Gemini."""

    DETECT_URL = "https://api.bitmind.ai/oracle/v1/34/detect-image"

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.bitmind_api_key
        self.gemini_api_key = settings.gemini_api_key

    async def analyze(
        self,
        content_type: str,
        content: str,
        content_b64: str | None = None,
    ) -> dict[str, Any]:
        """Run image deepfake detection. Only applies to image content type."""
        if content_type != "image":
            return {
                "provider": "bitmind",
                "content_type": content_type,
                "status": "skipped",
                "summary": "BitMind image detection only applies to image content.",
            }

        if not self.api_key:
            return {
                "provider": "bitmind",
                "content_type": content_type,
                "status": "degraded",
                "summary": "BITMIND_API_KEY not configured.",
            }

        try:
            if content_b64:
                image_b64 = content_b64
                image_bytes = base64.b64decode(content_b64)
            elif self._is_url(content):
                image_bytes = await self._fetch_image(content)
                image_b64 = base64.b64encode(image_bytes).decode("utf-8")
            else:
                return {
                    "provider": "bitmind",
                    "content_type": content_type,
                    "status": "skipped",
                    "summary": "Provide image URL or upload file",
                }

            data_uri = f"data:image/jpeg;base64,{image_b64}"
            detection_result = await self._detect(data_uri)
            explanation = await asyncio.to_thread(
                self._explain, image_bytes, detection_result
            )
            return {
                "provider": "bitmind",
                "content_type": content_type,
                "status": "ok",
                "summary": "BitMind image detection completed.",
                "detection": detection_result,
                "explanation": explanation,
            }
        except Exception as error:
            return {
                "provider": "bitmind",
                "content_type": content_type,
                "status": "error",
                "summary": str(error),
            }

    async def _fetch_image(self, url: str) -> bytes:
        """Download image bytes from public URL."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.content

    async def _detect(self, data_uri: str) -> dict[str, Any]:
        """Send base64 image to BitMind detection API."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "x-bitmind-application": "oracle-api",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self.DETECT_URL,
                headers=headers,
                json={"image": data_uri, "rich": True},
            )
            response.raise_for_status()
            return response.json()

    def _explain(self, image_bytes: bytes, detection_result: Any) -> str:
        """Generate Gemini explanation for image detection result."""
        if not self.gemini_api_key:
            return "Gemini explanation unavailable: GEMINI_API_KEY not configured."

        image_part = {"mime_type": "image/jpeg", "data": image_bytes}
        prompt = f"""You are an expert in AI-generated image detection.
A detection model analyzed an image and returned:

{detection_result}

Based on the detection data:
1. State clearly whether the image is likely AI-generated or real.
2. Explain key signals (unnatural textures, lighting, facial anomalies,
   metadata patterns, confidence breakdown).
3. Mention uncertainty if confidence is borderline (40-60%).
4. Keep it concise and accessible to a non-technical user."""

        try:
            genai.configure(api_key=self.gemini_api_key)
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content([image_part, prompt])
            return response.text
        except Exception as error:
            return f"Gemini explanation unavailable: {error}"

    @staticmethod
    def _is_url(value: str) -> bool:
        parsed = urlparse(value.strip())
        return bool(parsed.scheme in {"http", "https"} and parsed.netloc)
