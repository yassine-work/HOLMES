"""HuggingFace + Gemini tool for AI-generated text detection."""

from __future__ import annotations

import asyncio
from typing import Any

import google.generativeai as genai
from huggingface_hub import InferenceClient

from app.core.config import get_settings


class HFTextTool:
    """Detects AI-generated text via RoBERTa and explains via Gemini."""

    MODEL = "openai-community/roberta-base-openai-detector"

    def __init__(self) -> None:
        settings = get_settings()
        self.hf_token = settings.hf_token
        self.gemini_api_key = settings.gemini_api_key

    async def analyze(self, content_type: str, content: str) -> dict[str, Any]:
        """Run AI-text detection. Only applies to text content type."""
        if content_type != "text":
            return {
                "provider": "hf_roberta",
                "content_type": content_type,
                "status": "skipped",
                "summary": "HF text detection only applies to text content.",
            }

        if not self.hf_token:
            if self.gemini_api_key:
                try:
                    explanation = await asyncio.to_thread(self._gemini_only_explain, content)
                    return {
                        "provider": "gemini_text",
                        "content_type": content_type,
                        "status": "ok",
                        "summary": "Gemini-only text analysis (no HF detector)",
                        "explanation": explanation,
                    }
                except Exception as error:
                    return {
                        "provider": "gemini_text",
                        "content_type": content_type,
                        "status": "error",
                        "summary": str(error),
                    }
            return {
                "provider": "hf_roberta",
                "content_type": content_type,
                "status": "degraded",
                "summary": "HF_TOKEN not configured.",
            }

        try:
            detection_result = await asyncio.to_thread(self._detect, content)
            label_scores = self._extract_label_score_map(detection_result)
            explanation = await asyncio.to_thread(
                self._explain, content, detection_result, label_scores
            )
            return {
                "provider": "hf_roberta",
                "content_type": content_type,
                "status": "ok",
                "summary": "AI text detection completed.",
                "label_scores": label_scores,
                "raw_detection": detection_result,
                "explanation": explanation,
            }
        except Exception as error:
            return {
                "provider": "hf_roberta",
                "content_type": content_type,
                "status": "error",
                "summary": str(error),
            }

    def _detect(self, text: str) -> list[dict]:
        """Call HuggingFace inference synchronously (runs in thread)."""
        client = InferenceClient(provider="hf-inference", api_key=self.hf_token)
        return client.text_classification(text, model=self.MODEL)

    @staticmethod
    def _extract_label_score_map(detection_result: Any) -> dict[str, float]:
        """Normalize detector output to lowercased label->score map."""
        label_scores: dict[str, float] = {}
        if isinstance(detection_result, list):
            for item in detection_result:
                if not isinstance(item, dict):
                    continue
                label = item.get("label")
                score = item.get("score")
                if isinstance(label, str) and isinstance(score, (int, float)):
                    label_scores[label.strip().lower()] = float(score)
        return label_scores

    def _explain(
        self,
        text: str,
        detection_result: Any,
        label_scores: dict[str, float],
    ) -> str:
        """Generate Gemini explanation for detection result."""
        if not self.gemini_api_key:
            return "Gemini explanation unavailable: GEMINI_API_KEY not configured."

        fake_score = label_scores.get("fake")
        real_score = label_scores.get("real")
        margin_percent = (
            abs(fake_score - real_score) * 100
            if isinstance(fake_score, float) and isinstance(real_score, float)
            else None
        )

        top_score = max(label_scores.values()) if label_scores else None
        if top_score is None:
            confidence_band = "unknown"
        elif top_score >= 0.85:
            confidence_band = "high"
        elif top_score >= 0.60:
            confidence_band = "medium"
        else:
            confidence_band = "low"

        prompt = f"""You are an expert in AI-generated text detection.
A detector analyzed the following text and returned this result:

Text: {text}

Detection Result: {detection_result}

Parsed score summary:
- fake_score: {fake_score}
- real_score: {real_score}
- margin_percent: {margin_percent}
- confidence_band: {confidence_band}

Based on the result above:
1. Give a one-line verdict: likely AI-generated, likely human-written, or inconclusive.
2. Explain why using BOTH detector evidence and at least 2 writing-pattern observations.
3. If text is too short for pattern analysis, say so explicitly.
4. Calibrate certainty to the score gap.
5. Do NOT just restate percentages.
6. Output exactly:
Verdict: <one sentence>
Why: <2-4 sentences>
Caveats: <1 sentence>"""

        try:
            genai.configure(api_key=self.gemini_api_key)
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(prompt)
            return response.text
        except Exception as error:
            return f"Gemini explanation unavailable: {error}"

    def _gemini_only_explain(self, text: str) -> str:
        """Run Gemini-only text analysis when HF detector is unavailable."""
        prompt = f"""You are an expert in AI-generated text detection.
Analyze the following text and determine if it is likely
AI-generated or human-written.
Text: {text}
Output exactly:
Verdict: <one sentence>
Why: <2-4 sentences>
Caveats: <1 sentence>"""

        genai.configure(api_key=self.gemini_api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(prompt)
        return response.text
