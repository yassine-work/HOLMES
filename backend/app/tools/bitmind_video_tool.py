"""BitMind + Gemini tool for AI-generated video detection."""

from __future__ import annotations

import asyncio
import base64
from typing import Any
from urllib.parse import urlparse

import google.generativeai as genai
import httpx

from app.core.config import get_settings


class BitmindVideoTool:
    """Detects AI-generated video via BitMind and explains via Gemini."""

    DETECT_URL = "https://api.bitmind.ai/detect-video"

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
        """Run video deepfake detection. Only applies to video content type."""
        if content_type != "video":
            return {
                "provider": "bitmind_video",
                "content_type": content_type,
                "status": "skipped",
                "summary": "BitMind video detection only applies to video content.",
            }

        if not self.api_key:
            return {
                "provider": "bitmind_video",
                "content_type": content_type,
                "status": "degraded",
                "summary": "BITMIND_API_KEY not configured.",
            }

        try:
            if content_b64:
                video_bytes = base64.b64decode(content_b64)
            elif self._is_url(content):
                video_bytes = await self._fetch_video(content)
            else:
                return {
                    "provider": "bitmind_video",
                    "content_type": content_type,
                    "status": "skipped",
                    "summary": "Provide video URL or upload file",
                }

            detection_result = await self._detect(video_bytes)
            explanation = await asyncio.to_thread(
                self._explain, video_bytes, detection_result
            )
            return {
                "provider": "bitmind_video",
                "content_type": content_type,
                "status": "ok",
                "summary": "BitMind video detection completed.",
                "detection": detection_result,
                "explanation": explanation,
            }
        except Exception as error:
            return {
                "provider": "bitmind_video",
                "content_type": content_type,
                "status": "error",
                "summary": str(error),
            }

    async def _fetch_video(self, url: str) -> bytes:
        """Download video bytes from public URL."""
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.content

    async def _detect(self, video_bytes: bytes) -> dict[str, Any]:
        """Send video bytes to BitMind detection API."""
        headers = {"Authorization": f"Bearer {self.api_key}"}
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                self.DETECT_URL,
                headers=headers,
                files={"video": ("video.mp4", video_bytes, "video/mp4")},
            )
            response.raise_for_status()
            return response.json()

    def _explain(self, video_bytes: bytes, detection_result: Any) -> str:
        """Generate Gemini explanation for video detection result."""
        if not self.gemini_api_key:
            return "Gemini explanation unavailable: GEMINI_API_KEY not configured."

        video_part = {"mime_type": "video/mp4", "data": video_bytes}
        prompt = f"""You are an expert in AI-generated video detection.
A detection model analyzed a video and returned:

{detection_result}

Based on the detection data:
1. State clearly whether the video is likely AI-generated or authentic.
2. Explain key indicators (motion inconsistencies, face/lip-sync artifacts,
   temporal flicker, lighting shifts, compression artifacts, confidence patterns).
3. Mention uncertainty if confidence is borderline (40-60%).
4. Keep it concise and accessible to a non-technical user."""

        try:
            genai.configure(api_key=self.gemini_api_key)
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content([video_part, prompt])
            return response.text
        except Exception as error:
            return f"Gemini explanation unavailable: {error}"

    @staticmethod
    def _is_url(value: str) -> bool:
        parsed = urlparse(value.strip())
        return bool(parsed.scheme in {"http", "https"} and parsed.netloc)
