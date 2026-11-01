# Audit & Safety Net Inventory (Phase 0)

Date: 2026-11-01  
Subsystem: Hazard Precaution Advisor v2 (`/home/blue/anup`)  
Audit Skill: S-32 (Repo audit)

---

## 1. Executive Summary

This audit establishes the baseline environment, dependencies, software development kit (SDK) facts, schema requirements, security rules, and architectural invariants for the Hazard Precaution Advisor v2 system. Hazard Precaution Advisor v2 transforms visual scene inputs (still photos, sampled video frames, or live camera feeds) into structured hazard assessments tailored to vulnerable person categories (`baby`, `child`, `adult`, `elderly`), backed by auditable deterministic risk rules, curated safety precautions, verification checks, and caregiver alerting.

---

## 2. Environment & System Inventory

### 2.1 Operating System & Python Runtime
- **Operating System:** Linux (Arch Linux x86_64)
- **Python Executable:** `/home/blue/anup/.venv/bin/python3` (Python 3.14.0)
- **Virtual Environment:** Dedicated `.venv` located at `/home/blue/anup/.venv`
- **Shell / Process Management:** bash / systemd / background job runner

### 2.2 Installed Package Manifest (.venv)

The virtual environment was inspected via `pip list`. Key packages and their exact resolved versions:

| Package | Version | Purpose |
|---|---|---|
| `fastapi` | 0.162.0 | Async web API framework for backend |
| `uvicorn` | 0.54.0 | ASGI server for FastAPI application |
| `pydantic` | 2.14.2 | Data validation and typed contract schemas |
| `pydantic-settings` | 2.16.2 | Typed environment and config management |
| `pydantic_core` | 2.50.2 | Core rust engine for Pydantic v2 |
| `google-genai` | 2.34.0 | **Official modern Google GenAI SDK** (`google.genai`) |
| `langgraph` | 1.2.19 | State graph orchestration runtime |
| `langchain-core` | 1.7.3 | Core graph contracts and state representations |
| `pillow` | 13.0.0 | Image ingest, verification, EXIF stripping, resizing |
| `httpx` | 0.28.1 | Async HTTP client for external integrations |
| `sse-starlette` | 3.6.0 | Server-Sent Events (SSE) streaming for job tracking |
| `pytest` | 9.2.0 | Test runner and assertion framework |
| `pytest-asyncio` | 1.4.1 | Async fixture and test execution for pytest |
| `python-multipart` | 0.0.33 | Multipart form data parser for image uploads |
| `python-dotenv` | 1.2.4 | `.env` file loader for configuration |
| `PyYAML` | 6.0.3 | YAML configuration parser |

### 2.3 Gemini SDK Verification & Facts
- **SDK Detected:** `google-genai` version `2.34.0` (NOT legacy `google-generativeai`).
- **Namespace:** `from google import genai` and `from google.genai import types`.
- **Primary Model Configured:** `gemini-2.5-flash` (fast, structured multimodal reasoning).
- **Client Initialization Pattern:** `client = genai.Client(api_key=settings.GEMINI_API_KEY)`.
- **Structured Output Mechanism:** Supports Pydantic schemas directly or JSON mode with `response_mime_type="application/json"` and `response_schema`.
- **Architectural Abstraction:** In compliance with Rule R10 and contract S-12, the Gemini SDK is strictly encapsulated behind an abstract `VisionService` interface with `FakeVisionService` for deterministic offline testing.

---

## 3. Security, Secret Management & Git Hygiene

### 3.1 Rules R9 & Secret Isolation
- `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID` reside **strictly** within `.env`.
- Under no circumstances are secret keys exposed to:
  1. Frontend bundles or browser client code.
  2. API endpoints (such as `GET /api/status` or `GET /health`).
  3. Logging sinks or console output.
- `httpx` and `httpcore` loggers are configured at `WARNING` level to prevent Telegram bot tokens from leaking through logged request URLs.

### 3.2 Gitignore and Configuration Verification
Inspection of `.gitignore` verifies that the following patterns are ignored:
- `.env`, `.env.local`
- `.venv/`, `venv/`
- `node_modules/`, `frontend/node_modules/`, `frontend/dist/`, `frontend/.vite/`
- `data/runtime/`
- `*.log`, `.pytest_cache/`, `.coverage`, `htmlcov/`
- Private test fixtures and uncommitted media

Inspection of `.env.example` confirms:
- All required environment variable names are enumerated.
- No real credentials or secret tokens are present in `.env.example`.

---

## 4. Taxonomy & Schema Contracts

### 4.1 Hazard Taxonomy (Categories H01 - H15)
The 15 canonical hazard categories defined in `agent.md §5.2` and stored in `data/taxonomy.json`:
- `H01`: slip_wet (wet/shiny floor, spills, soap residue, loose rug)
- `H02`: trip_clutter (objects in walkways, loose cables on floor, uneven threshold)
- `H03`: electrical (exposed wiring, damaged cable, overloaded socket strip, socket near water)
- `H04`: fire_heat (open flame, stove/burner, hot appliance, hot liquid, gas cylinder)
- `H05`: sharp_glass (knives, broken glass, exposed blades, sharp edges)
- `H06`: fall_height (stairs without guard, balcony/window edge, ladder, open drain)
- `H07`: unstable_falling (tall unanchored furniture, TV on narrow stand, heavy items on high shelves)
- `H08`: chemical_poison (medicines, cleaning agents, pesticides, alcohol within reach)
- `H09`: choking_small_objects (coins, button batteries, small toy parts, beads, magnets)
- `H10`: water_drowning (open bucket/tub/tank with water, pool, pond)
- `H11`: strangulation_entrapment (blind/curtain cords, plastic bags, gaps between furniture)
- `H12`: structural_damage (cracks, hanging plaster, damp/mould patches, loose fixtures)
- `H13`: poor_visibility (dark stairs/corridors, glare, blocked sight lines)
- `H14`: outdoor_traffic_terrain (road/vehicle proximity, potholes, uneven ground)
- `H15`: other_observable (physical hazard not fitting above, marked uncertain)

### 4.2 Core Enums
- `PersonCategory`: `baby`, `child`, `adult`, `elderly`
- `Language`: `en`, `kn`, `hi`
- `Mode`: `quick`, `deep`
- `Source`: `photo`, `frame`, `video_frame`
- `HazardStatus`: `observed`, `likely`, `possible`
- `EvidenceStrength`: `clear`, `partial`, `weak`
- `RiskLevel`: `low`, `medium`, `high`, `uncertain`
- `Outcome`: `hazards_found`, `none_observed`, `inconclusive`, `failed`
- `VerifyStatus`: `passed`, `passed_with_changes`, `failed_fallback`
- `NotifyStatus`: `sent`, `skipped_cooldown`, `skipped_policy`, `disabled`, `failed`

---

## 5. Non-Negotiable Contract Guardrails (R1 - R14)

1. **R1 (No False-Safe):** Failed or unreliable analysis NEVER produces `none_observed` or claims of safety. Forbidden strings (`safe`, `no danger`, `all clear`) never appear in report output. Standard text: "No hazards observed in this view".
2. **R2 (Evidence Before Claim):** No hazard without an evidence string; no `possible` hazard without a named visible trigger object.
3. **R3 (Facts vs Assumptions):** Observed facts and model assumptions are segregated into discrete schema fields.
4. **R4 (Auditable Ordinal Rules):** Risk levels are strictly ordinal (`low`, `medium`, `high`, `uncertain`). No probabilities or percentages.
5. **R5 (Rule Engine Transparency):** The risk calculation is described as an auditable rule engine, never as a black-box predictive model.
6. **R6 (Person Category as Input):** Person category is purely a user input. Never inferred from image; no medical diagnosis.
7. **R7 (No False Precision):** No pixel-level claims; bounding boxes are approximate.
8. **R8 (Precaution Provenance):** Precautions require provenance (`guideline`, `generic`, or `ai_general`).
9. **R9 (Secret Isolation):** Secrets remain backend-only.
10. **R10 (Bounded Execution):** Bounded retries (default 1), timeouts, frame queues (max 1 in-flight per session).
11. **R11 (Periodic Sampling Disclaimer):** Live/video analysis clearly disclaims that periodic sampling may miss events between frames.
12. **R12 (Privacy by Default):** Images are not retained on disk; EXIF/GPS stripped immediately.
13. **R13 (Translation Resilience):** Translation failures gracefully fall back to canonical English with `translation_error` flagged.
14. **R14 (Execution Trace Integrity):** UI agent state reflects authentic pipeline events only, never synthetic timers.

---

## 6. Endpoints & API Surface

| Method | Path | Description |
|---|---|---|
| `GET` | `/` and `/health` | Service liveness healthcheck |
| `GET` | `/api/status` | Configuration status and booleans (zero secrets) |
| `POST` | `/analyze` | Legacy-compatible synchronous analysis endpoint |
| `POST` | `/api/analyze` | Multipart analysis returning `AnalysisResult` |
| `POST` | `/api/jobs` | Asynchronous job creation returning `job_id` |
| `GET` | `/api/jobs/{id}/events` | Server-Sent Events (SSE) streaming execution trace |
| `GET` | `/api/jobs/{id}` | Final result retrieval for async job |
| `POST` | `/api/sessions` | Create a multi-frame / live monitoring session |
| `POST` | `/api/sessions/{id}/frames` | Ingest frame (with 429 busy guard on overlap) |
| `GET` | `/api/sessions/{id}/summary` | Retrieve cross-frame aggregated session summary |
| `GET` | `/api/guidelines` | Read-only access to curated safety knowledge base |
| `GET` | `/api/graph` | Workflow node and edge topology |
