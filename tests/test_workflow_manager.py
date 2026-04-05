"""Service-layer tests for verification workflow orchestration."""

from __future__ import annotations

import asyncio
import base64
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.auth import get_password_hash
from app.db.models import ContentType, User
from app.schemas.requests import VerificationRequest
from app.services.debate_manager import DebateManager
from app.services.workflow_manager import WorkflowManager


class FakeCache:
    """Simple in-memory async cache for workflow tests."""

    def __init__(self, initial: dict[str, dict[str, Any]] | None = None) -> None:
        self.store: dict[str, dict[str, Any]] = initial or {}

    async def get_json(self, key: str) -> dict[str, Any] | None:
        """Get payload by key."""
        return self.store.get(key)

    async def set_json(self, key: str, payload: dict[str, Any], ttl_seconds: int = 300) -> None:
        """Set payload by key."""
        self.store[key] = payload


@pytest.mark.asyncio
async def test_workflow_uses_ninja_for_url_content(db_session) -> None:
    """Workflow should call Ninja tool when content type is URL."""
    user = User(
        email=f"test_workflow_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=get_password_hash("WorkflowPass123!"),
        is_active=True,
        is_admin=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    manager = WorkflowManager(db=db_session, cache=FakeCache())

    called = {"ninja": False}

    async def fake_tool(*_: Any, **__: Any) -> dict[str, Any]:
        return {"status": "ok"}

    async def fake_ninja(url: str) -> dict[str, Any]:
        called["ninja"] = True
        return {"provider": "api_ninjas", "domain_age_days": 14, "risk_flags": ["new_domain"]}

    async def fake_debate(
        content: str,
        source_data: dict[str, Any] | None = None,
        tool_findings: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        assert content.startswith("https://")
        assert source_data is not None
        assert tool_findings is not None
        return {
            "defense": {"content": "low confidence authenticity"},
            "prosecution": {"content": "new domain indicates possible fake source"},
            "verdict": {"label": "likely_manipulated", "confidence": 0.88},
        }

    manager.sightengine.analyze = fake_tool
    manager.zenserp.analyze = fake_tool
    manager.virustotal.analyze = fake_tool
    manager.ninja.analyze_source = fake_ninja
    manager.debate_manager.evaluate = fake_debate

    payload = VerificationRequest(content_type=ContentType.URL, content="https://new-fake-source.test/post")
    history = await manager.run_verification(user_id=user.id, payload=payload)

    assert called["ninja"] is True
    assert history.verdict == "likely_manipulated"
    assert history.details["tools"]["ninja"]["risk_flags"] == ["new_domain"]


@pytest.mark.asyncio
async def test_workflow_skips_ninja_for_non_url_content(db_session) -> None:
    """Workflow should not call Ninja tool for non-URL content."""
    user = User(
        email=f"test_workflow_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=get_password_hash("WorkflowPass123!"),
        is_active=True,
        is_admin=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    manager = WorkflowManager(db=db_session)

    called = {"ninja": False}

    async def fake_tool(*_: Any, **__: Any) -> dict[str, Any]:
        return {"status": "ok"}

    async def fake_ninja(_: str) -> dict[str, Any]:
        called["ninja"] = True
        return {"provider": "api_ninjas"}

    async def fake_debate(
        content: str,
        source_data: dict[str, Any] | None = None,
        tool_findings: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        assert source_data is None
        assert tool_findings is not None
        return {
            "defense": {"content": "authenticity plausible"},
            "prosecution": {"content": "low manipulation evidence"},
            "verdict": {"label": "likely_authentic", "confidence": 0.74},
        }

    manager.sightengine.analyze = fake_tool
    manager.zenserp.analyze = fake_tool
    manager.virustotal.analyze = fake_tool
    manager.ninja.analyze_source = fake_ninja
    manager.debate_manager.evaluate = fake_debate

    payload = VerificationRequest(content_type=ContentType.TEXT, content="A plain claim text")
    history = await manager.run_verification(user_id=user.id, payload=payload)

    assert called["ninja"] is False
    assert history.verdict == "likely_authentic"
    assert "ninja" not in history.details["tools"]


@pytest.mark.asyncio
async def test_cache_hit_skips_all_tools_and_agents(db_session) -> None:
    """Cache hit should bypass tools and debate manager entirely."""
    user = User(
        email=f"test_workflow_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=get_password_hash("WorkflowPass123!"),
        is_active=True,
        is_admin=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    payload = VerificationRequest(content_type=ContentType.URL, content="https://cache-hit.example/news")
    cache_key = f"verification:{payload.content_type.value}:{payload.content}"
    cached_data = {
        "verdict": "likely_manipulated",
        "confidence": 0.93,
        "details": {"tools": {"source": "cache"}, "debate_skipped": True},
    }
    cache = FakeCache(initial={cache_key: cached_data})
    manager = WorkflowManager(db=db_session, cache=cache)

    called = {"sightengine": False, "zenserp": False, "virustotal": False, "ninja": False, "debate": False}

    async def _mark(name: str, result: dict[str, Any] | None = None) -> dict[str, Any]:
        called[name] = True
        return result or {"status": "ok"}

    manager.sightengine.analyze = lambda *args, **kwargs: _mark("sightengine")
    manager.zenserp.analyze = lambda *args, **kwargs: _mark("zenserp")
    manager.virustotal.analyze = lambda *args, **kwargs: _mark("virustotal")
    manager.ninja.analyze_source = lambda *args, **kwargs: _mark("ninja")
    manager.debate_manager.evaluate = lambda *args, **kwargs: _mark("debate")

    history = await manager.run_verification(user_id=user.id, payload=payload)

    assert all(value is False for value in called.values())
    assert history.verdict == "likely_manipulated"
    assert history.confidence == pytest.approx(0.93)


@pytest.mark.asyncio
async def test_cache_miss_stores_result_after_computation(db_session) -> None:
    """Cache miss should compute and then persist cache entry."""
    user = User(
        email=f"test_workflow_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=get_password_hash("WorkflowPass123!"),
        is_active=True,
        is_admin=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    cache = AsyncMock()
    cache.get_json = AsyncMock(return_value=None)
    cache.set_json = AsyncMock()
    manager = WorkflowManager(db=db_session, cache=cache)

    async def fake_tool(*_: Any, **__: Any) -> dict[str, Any]:
        return {"status": "ok"}

    async def fake_debate(*_: Any, **__: Any) -> dict[str, Any]:
        return {
            "defense": {"content": "d"},
            "prosecution": {"content": "p"},
            "verdict": {"label": "likely_authentic", "confidence": 0.71},
        }

    manager.sightengine.analyze = fake_tool
    manager.zenserp.analyze = fake_tool
    manager.virustotal.analyze = fake_tool
    manager.debate_manager.evaluate = fake_debate

    payload = VerificationRequest(content_type=ContentType.TEXT, content="Cache miss test")
    history = await manager.run_verification(user_id=user.id, payload=payload)

    assert history.verdict == "likely_authentic"
    cache_key = f"verification:{payload.content_type.value}:{payload.content}"
    cache.get_json.assert_awaited_once_with(cache_key)
    cache.set_json.assert_awaited_once()
    call_args = cache.set_json.await_args
    assert call_args.args[0] == cache_key
    assert call_args.args[1]["verdict"] == "likely_authentic"
    assert call_args.kwargs["ttl_seconds"] == 300


@pytest.mark.asyncio
async def test_tools_run_in_parallel_via_gather(db_session, monkeypatch) -> None:
    """Workflow should dispatch the three fast tools via asyncio.gather."""
    user = User(
        email=f"test_workflow_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=get_password_hash("WorkflowPass123!"),
        is_active=True,
        is_admin=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    manager = WorkflowManager(db=db_session, cache=FakeCache())

    async def fake_sightengine(*_: Any, **__: Any) -> dict[str, Any]:
        await asyncio.sleep(0)
        return {"provider": "sightengine", "status": "ok"}

    async def fake_zenserp(*_: Any, **__: Any) -> dict[str, Any]:
        await asyncio.sleep(0)
        return {"provider": "zenserp", "status": "ok"}

    async def fake_virustotal(*_: Any, **__: Any) -> dict[str, Any]:
        await asyncio.sleep(0)
        return {"provider": "virustotal", "status": "ok", "analysis_stats": {"malicious": 0}}

    manager.sightengine.analyze = fake_sightengine
    manager.zenserp.analyze = fake_zenserp
    manager.virustotal.analyze = fake_virustotal

    gather_called = {"count": 0}
    original_gather = asyncio.gather

    async def tracked_gather(*coroutines):
        gather_called["count"] = len(coroutines)
        return await original_gather(*coroutines)

    monkeypatch.setattr("app.services.workflow_manager.asyncio.gather", tracked_gather)

    async def fake_debate(*_: Any, **__: Any) -> dict[str, Any]:
        return {
            "defense": {"content": "d"},
            "prosecution": {"content": "p"},
            "verdict": {"label": "likely_authentic", "confidence": 0.7},
        }

    manager.debate_manager.evaluate = fake_debate

    payload = VerificationRequest(content_type=ContentType.TEXT, content="parallel tools test")
    await manager.run_verification(user_id=user.id, payload=payload)

    assert gather_called["count"] == 3


@pytest.mark.asyncio
async def test_debate_manager_runs_agents_in_parallel(db_session, monkeypatch) -> None:
    """Debate manager should gather defense/prosecution analyses concurrently."""
    manager = DebateManager()

    async def fake_defense(content: str, tool_findings: dict[str, Any] | None = None) -> dict[str, Any]:
        return {"role": "defense", "content": content}

    async def fake_prosecution(
        content: str,
        source_data: dict[str, Any] | None = None,
        tool_findings: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {"role": "prosecution", "content": content, "source": source_data}

    manager.defense.analyze = fake_defense
    manager.prosecution.analyze = fake_prosecution
    manager.judge.decide = AsyncMock(return_value={"label": "likely_authentic", "confidence": 0.66})

    gather_called = {"count": 0}
    original_gather = asyncio.gather

    async def tracked_gather(*coroutines):
        gather_called["count"] = len(coroutines)
        return await original_gather(*coroutines)

    monkeypatch.setattr("app.services.debate_manager.asyncio.gather", tracked_gather)

    source_data = {"domain_age_days": 20}
    result = await manager.evaluate("content", source_data=source_data)

    assert gather_called["count"] == 2
    manager.judge.decide.assert_awaited_once_with(
        "content",
        {"role": "defense", "content": "content"},
        {"role": "prosecution", "content": "content", "source": source_data},
        tool_findings=None,
    )
    assert result["verdict"]["label"] == "likely_authentic"


@pytest.mark.asyncio
async def test_hf_text_tool_skips_for_non_text() -> None:
    """HF text tool should skip when content type is not text."""
    from app.tools.hf_text_tool import HFTextTool

    tool = HFTextTool()
    result = await tool.analyze("image", "https://example.com/img.jpg")

    assert result["status"] == "skipped"


@pytest.mark.asyncio
async def test_bitmind_image_tool_skips_for_non_image() -> None:
    """BitMind image tool should skip when content type is not image."""
    from app.tools.bitmind_image_tool import BitmindImageTool

    tool = BitmindImageTool()
    result = await tool.analyze("text", "some text content")

    assert result["status"] == "skipped"


@pytest.mark.asyncio
async def test_bitmind_video_tool_skips_for_non_video() -> None:
    """BitMind video tool should skip when content type is not video."""
    from app.tools.bitmind_video_tool import BitmindVideoTool

    tool = BitmindVideoTool()
    result = await tool.analyze("text", "some text content")

    assert result["status"] == "skipped"


@pytest.mark.asyncio
async def test_workflow_includes_all_six_tools_in_findings(db_session) -> None:
    """Workflow tool findings should include all six parallel tool outputs."""
    user = User(
        email=f"test_workflow_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=get_password_hash("WorkflowPass123!"),
        is_active=True,
        is_admin=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    manager = WorkflowManager(db=db_session, cache=FakeCache())

    async def fake_tool(*_: Any, **__: Any) -> dict[str, Any]:
        return {"status": "ok"}

    async def fake_debate(*_: Any, **__: Any) -> dict[str, Any]:
        return {
            "defense": {"content": "d"},
            "prosecution": {"content": "p"},
            "verdict": {"label": "likely_authentic", "confidence": 0.75},
        }

    manager.sightengine.analyze = fake_tool
    manager.zenserp.analyze = fake_tool
    manager.virustotal.analyze = fake_tool
    manager.hf_text.analyze = fake_tool
    manager.bitmind_image.analyze = fake_tool
    manager.bitmind_video.analyze = fake_tool
    manager.debate_manager.evaluate = fake_debate

    payload = VerificationRequest(content_type=ContentType.TEXT, content="tool coverage test")
    history = await manager.run_verification(user_id=user.id, payload=payload)

    tools = history.details["tools"]
    assert "sightengine" in tools
    assert "zenserp" in tools
    assert "virustotal" in tools
    assert "hf_text" in tools
    assert "bitmind_image" in tools
    assert "bitmind_video" in tools


@pytest.mark.asyncio
async def test_bitmind_image_uses_content_b64_when_provided(monkeypatch) -> None:
    """BitMind image tool should use provided content_b64 and skip URL fetch."""
    from app.tools.bitmind_image_tool import BitmindImageTool

    tool = BitmindImageTool()
    tool.api_key = "fake-key"
    tool.gemini_api_key = ""

    tool._fetch_image = AsyncMock(side_effect=AssertionError("_fetch_image should not be called"))
    tool._detect = AsyncMock(return_value={"score": 0.9, "label": "ai-generated"})
    monkeypatch.setattr(tool, "_explain", lambda *_args, **_kwargs: "explanation text")

    content_b64 = base64.b64encode(b"fake-image-bytes").decode("utf-8")
    result = await tool.analyze("image", "filename.jpg", content_b64=content_b64)

    assert result["status"] == "ok"
    tool._fetch_image.assert_not_awaited()


@pytest.mark.asyncio
async def test_bitmind_image_skips_when_no_url_and_no_b64() -> None:
    """BitMind image tool should skip when neither URL nor base64 content is provided."""
    from app.tools.bitmind_image_tool import BitmindImageTool

    tool = BitmindImageTool()
    result = await tool.analyze("image", "not-a-url-just-filename.jpg", content_b64=None)

    assert result["status"] == "skipped"


@pytest.mark.asyncio
async def test_hf_text_falls_back_to_gemini_when_no_hf_token(monkeypatch) -> None:
    """HF text tool should run Gemini-only fallback path when HF token is missing."""
    from app.tools import hf_text_tool
    from app.tools.hf_text_tool import HFTextTool

    tool = HFTextTool()
    tool.hf_token = ""
    tool.gemini_api_key = "fake"

    mock_response = MagicMock()
    mock_response.text = "Verdict: likely AI-generated\nWhy: ...\nCaveats: ..."
    mock_model = MagicMock()
    mock_model.generate_content.return_value = mock_response
    monkeypatch.setattr(hf_text_tool.genai, "configure", lambda **_kwargs: None)
    monkeypatch.setattr(hf_text_tool.genai, "GenerativeModel", lambda _name: mock_model)

    result = await tool.analyze("text", "Some text to analyze")

    assert result["status"] == "ok"
    assert result["provider"] == "gemini_text"


@pytest.mark.asyncio
async def test_workflow_passes_content_b64_to_image_tool(db_session) -> None:
    """Workflow manager should pass payload content_b64 into BitMind image tool call."""
    user = User(
        email=f"test_workflow_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=get_password_hash("WorkflowPass123!"),
        is_active=True,
        is_admin=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    manager = WorkflowManager(db=db_session, cache=FakeCache())
    captured: dict[str, Any] = {}

    async def fake_tool(*_: Any, **__: Any) -> dict[str, Any]:
        return {"status": "ok"}

    async def fake_bitmind_image(content_type: str, content: str, content_b64: str | None = None) -> dict[str, Any]:
        captured["content_type"] = content_type
        captured["content"] = content
        captured["content_b64"] = content_b64
        return {"status": "ok"}

    async def fake_debate(*_: Any, **__: Any) -> dict[str, Any]:
        return {
            "defense": {"content": "d"},
            "prosecution": {"content": "p"},
            "verdict": {"label": "likely_authentic", "confidence": 0.7},
        }

    manager.sightengine.analyze = fake_tool
    manager.zenserp.analyze = fake_tool
    manager.virustotal.analyze = fake_tool
    manager.hf_text.analyze = fake_tool
    manager.bitmind_image.analyze = fake_bitmind_image
    manager.bitmind_video.analyze = fake_tool
    manager.debate_manager.evaluate = fake_debate

    payload = VerificationRequest(
        content_type=ContentType.IMAGE,
        content="photo.jpg",
        content_b64="abc123base64",
    )
    await manager.run_verification(user_id=user.id, payload=payload)

    assert captured["content_b64"] == "abc123base64"
