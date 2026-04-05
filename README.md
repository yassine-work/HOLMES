# Holmes — AI-Powered Content Verification Platform

![Python 3.14](https://img.shields.io/badge/Python-3.14-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.116+-009688) ![Next.js](https://img.shields.io/badge/Next.js-14-black) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791) ![Redis](https://img.shields.io/badge/Redis-Cache-red) ![Groq](https://img.shields.io/badge/LLM-Groq-orange) ![Stripe](https://img.shields.io/badge/Payments-Stripe-635BFF)

**Live Platform URL:** (https://holmes-teal.vercel.app)

> 📊 **Presentation:** [View on Canva](https://www.canva.com/design/DAHF87NKv9I/dhecJsjTZn_n4CkXv_hCog/edit)


Holmes is a production-style verification platform for journalists, trust-and-safety teams, investigators, and moderation backends that need to triage suspicious text, URLs, images, and video quickly. It combines asynchronous tool intelligence, adversarial multi-agent reasoning, and deterministic caching to produce explainable verdicts with bounded latency and controlled API spend. Instead of a single opaque LLM answer, Holmes persists auditable evidence and debate traces in PostgreSQL and exposes them through a FastAPI API and Next.js frontend.

![Holmes Home](docs/home.jpeg)

---

## The Problem

Misinformation and synthetic media now scale faster than manual review teams, and single-signal detectors fail when attackers vary payload type (text, URL, deepfake image/video). Most pipelines either overfit one modality or return non-explainable scores that are hard to operationalize. Holmes is different because it fuses heterogeneous signals, runs adversarial reasoning, and returns a concise user-facing verdict plus structured evidence for downstream systems.

---

## Architecture Overview

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                            CLIENT LAYER                                                       │
│  Next.js 14 frontend (frontend/)                                                                             │
│  - Auth, verify, upload-file, pricing, history, admin dashboard                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
												  │ HTTPS / JSON / JWT
												  ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         FASTAPI BACKEND (app/main.py)                                        │
│  /api/v1 router composition (app/api/router.py)                                                               │
│                                                                                                               │
│  Routers:                                                                                                     │
│   • /auth      (register/login/me)                                                                            │
│   • /upload    (verify + verify-file)                                                                         │
│   • /history   (user verification history)                                                                    │
│   • /admin     (dashboard + user management)                                                                  │
│   • /stripe    (checkout + webhook + unsubscribe)                                                             │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
												  │
												  ▼
┌────────────────────────────────────────────── Tier Switch ───────────────────────────────────────────────────┐
│ upload_router.verify_content():                                                                               │
│   if current_user.is_premium or current_user.is_admin → WorkflowManager (premium)                            │
│   else                                                        → FreeWorkflowManager (free)                    │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
						│                                                               │
						│                                                               │
						▼                                                               ▼
┌──────────────────────────────────────────────┐            ┌──────────────────────────────────────────────┐
│          FREE PIPELINE (text/url)           │             │               PREMIUM PIPELINE               │
│  Zenserp + single Groq verdict call         │             │  1) Redis cache check                        │
│  (no image/video/audio)                     │             │  2) asyncio.gather tool fan-out              │
└──────────────────────────────────────────────┘            │  3) URL source intel (Ninja, conditional)    │
															│  4) DebateManager (parallel defense/prosecution)
															│  5) JudgeAgent verdict + heuristic fallback  │
															│  6) Persist + cache write                    │
															└──────────────────────────────────────────────┘
																										│
																									    ▼
┌────────────────────────────────────────────── Tool Intelligence Layer ───────────────────────────────────────┐
│ sightengine_tool.py    zenserp_tool.py    virustotal_tool.py    ninja_tool.py                                │
│ hf_text_tool.py        bitmind_image_tool.py                    bitmind_video_tool.py                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
																											 │
																											 ▼
┌────────────────────────────────────────────── Agent Layer ───────────────────────────────────────────────────┐
│ prosecution_agent.py  defense_agent.py  judge_agent.py  (+ agent_utils.py evidence summarization)           │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
																						  │
								 ┌────────────────────────────────────────────────────────┴────────────────┐
								 ▼                                                                         ▼
┌──────────────────────────────────────────────┐                           ┌───────────────────────────────────┐
│ Redis cache (CacheManager)                  │                           │ Neon PostgreSQL                   │
│ key: verification:{content_type}:{content}  │                           │ users / verification_history /tasks│
│ (+ :b64:{sha256} for uploaded bytes)        │                           │ SQLAlchemy async ORM              │
│ TTL: 300s                                    │                           │ persistent audit trail            │
└──────────────────────────────────────────────┘                           └───────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Stripe Flow                                                                                                  │
│ create-checkout-session → Stripe Checkout → /api/v1/stripe/webhook → User.is_premium toggle                  │
│ customer.subscription.deleted / invoice.payment_failed → downgrade (except admin users)                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Background Worker                                                                                            │
│ Celery app (app/worker/background_tasks.py) with Redis broker/backend;                                       │
│ process_verification task currently scaffolded for queued async expansion.                                   │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Verification Pipelines

### Free Tier Pipeline

Free tier supports only `ContentType.TEXT` and `ContentType.URL` (`ALLOWED_FREE_CONTENT_TYPES` in `FreeWorkflowManager`). The pipeline runs Zenserp web-presence lookup and then a single Groq call (`_groq_analyze`) with a strict JSON-only prompt. This path is cheap and fast because it avoids multi-tool fan-out and multi-agent debate. Output is still persisted as `VerificationHistory` with `verdict`, `confidence`, and free-tier details including rationale.

### Premium Tier Pipeline

**Step 1 — Cache Check (Redis)**
- `WorkflowManager._build_cache_key()` uses deterministic keys:
  - text/url: `verification:{content_type}:{content}`
  - uploaded bytes: `verification:{content_type}:{content}:b64:{sha256(content_b64)}`
- TTL is set via `CacheManager.set_json(..., ttl_seconds=300)`.
- Cache hit short-circuits all external APIs and agent calls.

**Step 2 — Parallel Tool Execution (`asyncio.gather`)**
- `WorkflowManager.run_verification()` launches 6 tool coroutines concurrently:
  `sightengine`, `zenserp`, `virustotal`, `hf_text`, `bitmind_image`, `bitmind_video`.
- Each tool self-selects by `content_type` and returns `status in {ok, skipped, degraded, error}`.
- Conditional activation by modality:
  - Text: HuggingFace RoBERTa (`HFTextTool`) + Zenserp
  - URL: VirusTotal + Zenserp + SightEngine (URL-based visual check where applicable)
  - Image: BitMind Image + SightEngine (+ Zenserp only if routed via text/url pathways)
  - Video: BitMind Video + SightEngine
- URL also gets API Ninjas source intelligence as an additional step (below).
- Net effect: parallel fan-out compresses end-to-end latency versus serial external calls.

**Step 3 — Confidence Gate (typosquatting + domain signals)**
- URL workflow calls `NinjaTool.analyze_source()` for WHOIS/IP intelligence.
- `agent_utils.detect_typosquatting()` performs leet-speak normalization (`LEET_MAP`) and known-brand proximity checks (`KNOWN_BRANDS`).
- Signals injected into downstream reasoning include:
  - Typosquatting warnings
  - `domain_age_days` (new domain risk)
  - WHOIS availability/risk flags (`whois_unavailable`, `new_domain`)

**Step 4 — Parallel Agent Debate (`asyncio.gather`)**
- `DebateManager.evaluate()` executes defense and prosecution in parallel.
- Agents do not consume each other’s outputs before writing their own positions.
- Both sides receive normalized plain-language evidence via
  `agent_utils.summarize_tool_findings()` (no raw JSON payloads, no provider names, skipped/error states filtered out).

**Step 5 — Judge Verdict**
- `JudgeAgent.decide()` reads both analyst positions plus evidence summary.
- Prompt guidance is conditionally injected (`ai_guidance`, `url_guidance`, `text_guidance`), including:
  - AI detection score ≥ 75% → critical manipulation guidance
  - Typosquatting warnings → strong deception guidance
  - Clean VirusTotal profile (many harmless, zero malicious) → legitimacy signal
  - Very new domains (`domain_age_days <= 30`) → elevated risk guidance
- Returns structured JSON-like verdict: `label`, `confidence`, `rationale`.
- If parsing or LLM output quality fails, `_fallback_from_signals()` computes heuristic label/confidence.

**Step 6 — Persistence + Cache Write**
- Result is stored in `verification_history` via `_store_history()`.
- Response payload is cached in Redis for 300 seconds.
- API returns a full `VerificationResponse` mapped from `VerificationHistory`.

---

## Tool Intelligence Layer

1. **SightEngine — genai/deepfake visual analysis**  
	`SightengineTool` calls `https://api.sightengine.com/1.0/check.json` with `models=genai,deepfake` (or `deepfake` for video). It provides visual synthetic/manipulation evidence from public media URLs and attempts redirect resolution via `_resolve_final_url()`. It activates primarily for `image`, `video`, and URL-backed media checks; if credentials are absent it returns `status="degraded"`, and if content is unsupported/unreachable it returns `status="skipped"` with explicit summary.

2. **Zenserp — web presence and source verification**  
	`ZenserpTool` calls `https://app.zenserp.com/api/v2/search` and returns `organic_results` counts plus raw search metadata. It provides corroboration/absence signals (presence across multiple sources vs zero discoverability). It activates only for `text` and `url`. Missing API key yields `degraded`; HTTP failures yield `error`.

3. **VirusTotal — domain reputation (72+ vendor-style consensus output)**  
	`VirusTotalTool` calls `https://www.virustotal.com/api/v3/domains/{domain}` and surfaces `last_analysis_stats` (`malicious`, `suspicious`, `harmless`, `undetected`). It provides domain risk/cleanliness signals and activates only for `url`. Missing key degrades gracefully; non-URL input is explicitly skipped.

4. **API Ninjas (Ninja) — WHOIS domain age + risk flags**  
	`NinjaTool` calls API Ninjas `/whois` and `/iplookup`, extracts `domain_created_at`, computes `domain_age_days`, and emits risk flags (`new_domain`, `whois_unavailable`). It activates for URL source analysis (`analyze_source`) after core tool fan-out in premium flow. Missing key returns `degraded` rather than raising.

5. **HuggingFace RoBERTa — AI-generated text detection**  
	`HFTextTool` uses `InferenceClient.text_classification()` with model `openai-community/roberta-base-openai-detector`, producing normalized `label_scores` (`fake`, `real`). It activates only for `text`, and can optionally enrich output with Gemini explanations. If `HF_TOKEN` is missing, it degrades or falls back to Gemini-only explanation mode when configured.

6. **BitMind Image — image deepfake detection (rich mode)**  
	`BitmindImageTool` calls `https://api.bitmind.ai/oracle/v1/34/detect-image` with `{"rich": true}` and supports direct `content_b64` or downloaded URL bytes. It provides synthetic-image probability plus optional Gemini explanation. It activates only for `image`; missing key degrades, wrong modality skips, and runtime exceptions return `error`.

7. **BitMind Video — video deepfake detection**  
	`BitmindVideoTool` calls `https://api.bitmind.ai/detect-video` with multipart video bytes and returns confidence-oriented detection JSON. It provides temporal/deepfake risk evidence for `video` only. Missing key degrades, unsupported content skips, and failures are contained as `error`.

---

## Multi-Agent Debate System

Holmes uses adversarial reasoning because a single LLM completion is prone to anchoring and overconfident hallucination, while two constrained positions plus a judge improve calibration and auditability. `DebateManager.evaluate()` runs defense and prosecution concurrently (`asyncio.gather`) so neither agent conditions on the other’s narrative, reducing first-answer bias.

`agent_utils.summarize_tool_findings()` is a key abstraction layer: it filters out `skipped/degraded/error` tool states, removes provider-level implementation details, and converts raw signals into plain-language evidence bullets. Agents therefore reason over stable semantics instead of raw JSON schema noise.

`DefenseAgent` contains a hard surrender policy via `AI_DETECTION_SURRENDER_THRESHOLD = 0.75`; when max AI score exceeds this threshold, it explicitly concedes strong synthetic evidence instead of manufacturing a weak authenticity argument. `JudgeAgent` then applies additional content-aware prompt injections (`ai_guidance`, `url_guidance`, `text_guidance`) and, if the LLM output is malformed or inconclusive, falls back to `_fallback_from_signals()` deterministic scoring.

---

## Tier System & Monetization

- `User` model includes `is_premium` and `is_admin` booleans.
- API routing split is a single branch in `upload_router.verify_content()`:
  premium/admin → `WorkflowManager`; free users → `FreeWorkflowManager`.
- `POST /api/v1/stripe/create-checkout-session` creates Stripe subscription sessions (or instant upgrade in simulation mode).
- `POST /api/v1/stripe/webhook` upgrades users on successful subscription/payment events by setting `is_premium=True`.
- Unsubscribe/downgrade paths set `is_premium=False` for non-admin users (`/stripe/unsubscribe` and cancellation/payment-failure events).
- Admin users always retain premium capabilities (`is_admin` bypass in upload and unsubscribe logic).
- Free tier is intentionally constrained to text+URL to control external API spend and reserve high-cost deepfake analysis for subscribed users.

---

## Caching Strategy

Holmes uses Redis via `CacheManager` as a read-through/write-through acceleration layer on verification outputs.

- Deterministic key format: `verification:{content_type}:{content}` (or `...:b64:{sha256}` for uploaded bytes).
- TTL is 300 seconds to balance freshness (rapidly changing URLs/content) against repeated-query cost reduction.
- Cache hit path: returns immediately from cached verdict payload and avoids all third-party calls and debate inference.
- Cache miss path: runs full premium pipeline, persists DB record, then writes cached payload.
- `CacheManager` is dependency-injected in `WorkflowManager.__init__(cache: CacheManager | None = None)` and defaults to Redis from `settings.redis_url` when omitted.

---

## API Reference

Base prefix: `/api/v1`

### Auth Router

| Method | Path | Auth | Description | Request | Response |
|---|---|---|---|---|---|
| POST | `/auth/register` | No | Create user account | `{ email, password }` | `UserRead` (`id,email,is_active,is_admin,is_premium,created_at`) |
| POST | `/auth/login` | No | Authenticate and return JWT | `{ email, password }` | `Token` (`access_token, token_type, is_admin, is_premium`) |
| GET | `/auth/me` | Bearer | Return current profile + tier flags | None | `{ id,email,is_admin,is_premium,is_active,created_at }` |

### Verify Router

| Method | Path | Auth | Description | Request | Response |
|---|---|---|---|---|---|
| POST | `/upload/verify` | Bearer | Verify text/url/image/video/audio reference | `VerificationRequest { content_type, content, content_b64? }` | `VerificationResponse` |
| POST | `/upload/verify-file` | Bearer (premium/admin) | Upload image/video/audio file then verify | `multipart/form-data: content_type + file` | `VerificationResponse` |

### History Router

| Method | Path | Auth | Description | Request | Response |
|---|---|---|---|---|---|
| GET | `/history` | Bearer | List current user’s latest 100 verifications | None | `VerificationResponse[]` sorted by `created_at desc` |

### Admin Router

| Method | Path | Auth | Description | Request | Response |
|---|---|---|---|---|---|
| GET | `/admin/dashboard` | Admin Bearer | Aggregate totals across users/verifications/tasks | None | `DashboardResponse { total_users,total_verifications,total_tasks }` |
| GET | `/admin/users` | Admin Bearer | List users for admin control | None | `AdminUsersListResponse` |
| POST | `/admin/users` | Admin Bearer | Create user as admin | `AdminUserCreateRequest` | `AdminUserResponse` |
| PATCH | `/admin/users/{user_id}` | Admin Bearer | Toggle user flags | `AdminUserUpdateRequest` | `AdminUserResponse` |
| DELETE | `/admin/users/{user_id}` | Admin Bearer | Delete user (self-delete blocked) | None | `{ status, id }` |

### Stripe Router

| Method | Path | Auth | Description | Request | Response |
|---|---|---|---|---|---|
| POST | `/stripe/create-checkout-session` | Bearer | Create Stripe subscription checkout session | None | `{ checkout_url }` |
| POST | `/stripe/webhook` | Stripe signature header | Process Stripe lifecycle events and sync tier flags | Raw webhook payload | `{ status: "ok" }` |
| POST | `/stripe/unsubscribe` | Bearer | Downgrade current user (admins remain premium) | None | `{ status, is_premium, message? }` |

---

## Database Schema

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ users                                                                        │
├───────────────────────┬───────────────────────────────┬──────────────────────┤
│ column                │ type                          │ notes                │
├───────────────────────┼───────────────────────────────┼──────────────────────┤
│ id                    │ UUID (PK)                     │ default uuid4         │
│ email                 │ VARCHAR(320)                  │ unique, indexed       │
│ hashed_password       │ VARCHAR(255)                  │ required              │
│ is_active             │ BOOLEAN                       │ default true          │
│ is_admin              │ BOOLEAN                       │ default false         │
│ is_premium            │ BOOLEAN                       │ default false         │
│ created_at            │ TIMESTAMPTZ                   │ server default now()  │
│ updated_at            │ TIMESTAMPTZ                   │ onupdate now()        │
└───────────────────────┴───────────────────────────────┴──────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ verification_history                                                         │
├───────────────────────┬───────────────────────────────┬──────────────────────┤
│ column                │ type                          │ notes                │
├───────────────────────┼───────────────────────────────┼──────────────────────┤
│ id                    │ UUID (PK)                     │ default uuid4         │
│ user_id               │ UUID (FK → users.id)          │ indexed, CASCADE      │
│ content_type          │ ENUM(content_type)            │ text/image/video/audio/url │
│ input_reference       │ TEXT                          │ required              │
│ verdict               │ VARCHAR(64)                   │ required              │
│ confidence            │ FLOAT                         │ required              │
│ details               │ JSON                          │ tool + debate payload │
│ created_at            │ TIMESTAMPTZ                   │ server default now()  │
└───────────────────────┴───────────────────────────────┴──────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ tasks                                                                        │
├───────────────────────┬───────────────────────────────┬──────────────────────┤
│ column                │ type                          │ notes                │
├───────────────────────┼───────────────────────────────┼──────────────────────┤
│ id                    │ UUID (PK)                     │ default uuid4         │
│ user_id               │ UUID (FK → users.id)          │ nullable, SET NULL    │
│ task_type             │ VARCHAR(64)                   │ required              │
│ status                │ ENUM(task_status)             │ pending/running/...   │
│ progress              │ INTEGER                       │ default 0             │
│ payload               │ JSON                          │ required              │
│ result                │ JSON                          │ nullable              │
│ error_message         │ TEXT                          │ nullable              │
│ created_at            │ TIMESTAMPTZ                   │ server default now()  │
│ updated_at            │ TIMESTAMPTZ                   │ onupdate now()        │
└───────────────────────┴───────────────────────────────┴──────────────────────┘

Relationships:
- `users 1 ── * verification_history`
- `users 1 ── * tasks`

Indexes:
- `users.email` (unique + index)
- `verification_history.user_id` (index)
- `tasks.user_id` (index)
- composite `ix_tasks_status_created_at(status, created_at)`
```

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **Core Framework** |  |
| FastAPI | API framework and dependency injection |
| Uvicorn (`uvicorn[standard]`) | ASGI server |
| Pydantic v2 + `pydantic-settings` | Request/response validation and env config |
| HTTPX | Async HTTP client for external APIs |
| Python 3.14 | Runtime |
| Next.js 14 + React 18 + TypeScript | Frontend client |
| **Database** |  |
| SQLAlchemy 2 (async ORM) | Data access layer |
| asyncpg | PostgreSQL async driver |
| Alembic | Schema migration support |
| Neon PostgreSQL | Serverless primary relational store |
| **Caching / Queueing** |  |
| Redis (`redis.asyncio`) | Verification cache |
| Celery | Background task orchestration scaffold |
| **AI / ML** |  |
| Groq Chat Completions | Defense/prosecution/judge reasoning + free-tier verdict |
| Hugging Face Hub (`InferenceClient`) | RoBERTa text detector inference |
| Google Generative AI (`google-generativeai`) | Explanations for HF/BitMind outputs |
| **External APIs** |  |
| SightEngine API | Image/video genAI + deepfake checks |
| Zenserp API | Web search corroboration |
| VirusTotal API | Domain reputation intelligence |
| API Ninjas WHOIS/IP APIs | Domain age + source risk flags |
| BitMind APIs | Image and video deepfake detection |
| **Auth** |  |
| `python-jose[cryptography]` | JWT signing/verification |
| `passlib[bcrypt]` + `bcrypt` | Password hashing and verification |
| `email-validator` | Email validation in schemas |
| **Payments** |  |
| Stripe Python SDK | Checkout + webhook subscription lifecycle |
| **Testing** |  |
| Pytest + pytest-asyncio | Async integration/service tests |

---

## Testing

Holmes uses integration-heavy backend tests with selective monkey-patching for deterministic service behavior.

- `tests/conftest.py`
  - Initializes real schema via `init_db()`.
  - Provides `AsyncClient` against the ASGI app.
  - Uses real async DB sessions (not mocked).
  - Cleans test users and seeded verification rows after each test.

- `tests/test_api_auth_admin.py`
  - Covers register/login JWT flow.
  - Validates admin authorization boundaries for `/admin/dashboard`.

- `tests/test_workflow_manager.py`
  - Validates `WorkflowManager` orchestration behavior: cache hit/miss, URL-only Ninja usage, tool fan-out, debate integration.
  - Uses monkey-patching (`monkeypatch.setattr` + async fakes) to isolate orchestration logic while preserving async control flow.
  - Includes modality guard tests for tool self-selection and `content_b64` paths.

- `tests/test_tier_and_stripe.py`
  - Verifies tier flags in auth responses and premium gating for file upload.
  - Validates Stripe endpoints fail gracefully when unconfigured.
  - Validates simulation mode upgrade path.

- `tests/test_seed.py`
  - Ensures seeding creates baseline admin and starter history records.

- `tests/live/`
  - Real third-party integration tests (`@pytest.mark.live`, `@pytest.mark.integration`).
  - Run only when `RUN_LIVE_TESTS=1` and keys are present.

Run commands:

```bash
# fast local suites (skip live providers)
pytest tests/ -m "not live" -v

# focused suites
pytest tests/test_api_auth_admin.py -v
pytest tests/test_workflow_manager.py -v
pytest tests/test_tier_and_stripe.py -v
pytest tests/test_seed.py -v

# live provider checks (cost + network dependent)
RUN_LIVE_TESTS=1 pytest tests/live -v
```

Current coverage focus is API auth/admin/tier controls, workflow orchestration, and tool-routing behavior. Intentionally not deeply tested yet: frontend UI logic, full Stripe production webhook signature permutations, and Celery worker execution beyond scaffold behavior.

---

## Local Development Setup

1. **Clone**
	```bash
	git clone <your-repo-url>
	cd holmes
	```

2. **Create virtualenv**
	```bash
	python3.14 -m venv env
	source env/bin/activate
	```

3. **Install backend dependencies**
	```bash
	pip install -r backend/requirements.txt
	```

4. **Create environment file**
	```bash
	cp .env.example .env
	```
	Fill in required keys (see tables below).

5. **Environment variables**
	Use the `Environment Variables` section in this README for each variable, purpose, and source.

6. **Start Redis (Docker)**
	```bash
	docker run --name holmes-redis -p 6379:6379 -d redis:7
	```

7. **Initialize database schema**
	```bash
	cd backend
	python -c "import asyncio; from app.db.database import init_db; asyncio.run(init_db())"
	```

8. **Seed initial data**
	```bash
	python seed.py
	```

9. **Start backend**
	```bash
	uvicorn app.main:app --reload
	```

10. **Start frontend**
	```bash
	cd ../frontend
	npm install
	npm run dev
	```

11. **Run tests**
	```bash
	cd ../backend
	pytest tests/ -m "not live" -v
	```

---

## Environment Variables

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `APP_NAME` | No | FastAPI app title | Local config |
| `ENVIRONMENT` | No | Runtime environment name (`development`, etc.) | Local config |
| `DEBUG` | No | Enable debug logging/behavior | Local config |
| `API_V1_PREFIX` | No | API prefix (default `/api/v1`) | Local config |
| `ALLOWED_ORIGINS` | No | CORS origin list | Local config |
| `SECRET_KEY` | **Yes** | JWT signing secret | Generate securely (`openssl rand -base64 32`) |
| `JWT_ALGORITHM` | No | JWT algorithm (default `HS256`) | Local config |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | JWT access token TTL | Local config |
| `DATABASE_URL` | **Yes** | Async PostgreSQL DSN (Neon recommended) | Neon project dashboard |
| `REDIS_URL` | **Yes** | Redis DSN for cache | Local Redis / Upstash |
| `CELERY_BROKER_URL` | No | Celery broker URL (falls back to `REDIS_URL`) | Redis/Upstash |
| `CELERY_RESULT_BACKEND` | No | Celery result backend URL (falls back to `REDIS_URL`) | Redis/Upstash |
| `GROQ_API_KEY` | **Yes** for LLM verdicts | Groq API key | Groq console |
| `GROQ_BASE_URL` | No | Groq API base URL | Groq docs |
| `GROQ_DEFAULT_MODEL` | No | Preferred Groq model hint | Groq docs |
| `SIGHTENGINE_API_USER` | Optional (required for SightEngine) | SightEngine account user id | SightEngine dashboard |
| `SIGHTENGINE_API_SECRET` | Optional (required for SightEngine) | SightEngine API secret | SightEngine dashboard |
| `ZENSERP_API_KEY` | Optional (required for Zenserp) | Zenserp search API key | Zenserp dashboard |
| `VIRUSTOTAL_API_KEY` | Optional (required for VirusTotal) | VirusTotal API key | VirusTotal account |
| `NINJA_API_KEY` | Optional (required for WHOIS/IP intel) | API Ninjas key | API Ninjas dashboard |
| `HF_TOKEN` | Optional (required for RoBERTa detection) | HuggingFace token | Hugging Face settings |
| `BITMIND_API_KEY` | Optional (required for image/video deepfake APIs) | BitMind key | BitMind dashboard |
| `GEMINI_API_KEY` | Optional | Gemini key for explanation generation | Google AI Studio |
| `STRIPE_SECRET_KEY` | Optional (required for real checkout) | Stripe secret key | Stripe dashboard |
| `STRIPE_PRICE_ID` | Optional (required for real checkout) | Stripe subscription price id | Stripe products/pricing |
| `STRIPE_WEBHOOK_SECRET` | Optional (required for webhook verify) | Stripe webhook signing secret | Stripe webhook settings |
| `STRIPE_SUCCESS_URL` | No | Redirect URL after successful checkout | Frontend URL |
| `STRIPE_CANCEL_URL` | No | Redirect URL after canceled checkout | Frontend URL |
| `STRIPE_SIMULATION_MODE` | No | Simulate premium upgrade without live Stripe (`true/false`) | Local testing |
| `DEFAULT_ADMIN_EMAIL` | No | Seeded initial admin email | Local config |
| `DEFAULT_ADMIN_PASSWORD` | No | Seeded initial admin password | Local config |

---

## Deployment

- Holmes is already deployed in a live environment.
- **Live platform URL**: holmes-teal.vercel.app
- **Production data/services**: Neon PostgreSQL, Redis cache, and Stripe webhook integration are wired through environment variables in the backend settings model.

---

## Browser Extension

Holmes ships with a Chrome extension (`ai-detector-extension/`) that lets users run URL, page-media, image, and video checks directly from a popup UI or right-click context menu, then view confidence/explainability and scan history without leaving the browser; the extension connects to Holmes by posting detections to `${backendBase}/api/detect/{type}` (default base is `holmes-teal.vercel.app/` and can be overridden in extension Settings, with optional `Authorization` / `X-API-Key` headers), installation is `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `ai-detector-extension/` (or your `extension/` folder alias), and tier requirements follow backend policy: free tier supports text/URL flows while premium is required for full media verification paths (image/video upload and advanced pipeline access).

![Holmes Extension](docs/extension.jpeg)

---

## What Makes Holmes Different

- Adversarial multi-agent architecture (`DefenseAgent` + `ProsecutionAgent` + `JudgeAgent`) replaces brittle single-pass LLM verdicting.
- Parallelism is first-class: tool fan-out and debate both run through `asyncio.gather` to reduce latency under network-bound workloads.
- Content-type-aware tool routing is self-selecting inside each tool, so unsupported modalities degrade/skip safely instead of hard-failing.
- Evidence abstraction (`summarize_tool_findings`) separates agent reasoning from raw provider payload schemas and hides operational noise.
- Graceful degradation is explicit at every integration boundary (`ok/skipped/degraded/error`), preserving partial utility when external APIs are unavailable.
