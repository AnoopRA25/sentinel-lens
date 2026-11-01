# implementation_plan.md — Build plan, phases, tests

Companion files: `agent.md` (agents, contracts, rules) · `skills.md` (capabilities, S-xx IDs) · `design.md` (UI)
Effort sizes: **S** ≈ a focused session · **M** ≈ a few sessions · **L** ≈ a week of part-time work. Adjust to your calendar.

---

## 1. Goal and definition of done

**Goal:** On a phone, take a photo, pick/record a video, or run the live rear camera, and receive a report listing every hazard that can reasonably be identified (observed, likely, and "check this"), personalised to baby / child / adult / elderly, with precautions, coverage gaps and honest limits. Desktop adds the agent-workflow view, history and reports.

**Done means all of these are true and evidenced by real output:**
1. Phone → photo → hazard report works over the LAN (Photo mode needs no HTTPS).
2. Video mode extracts frames in the browser and returns a merged summary.
3. Live mode runs with explicit start/stop/pause, no overlapping requests, tracks released on exit.
4. A failed analysis is never shown as safe (tested).
5. Agent 1–8 contracts pass their tests; graph runs end-to-end with fakes; one real Gemini run is performed if credentials exist (otherwise the plan's report says it was not possible).
6. Reports in English; Kannada and Hindi with fallback-to-English on failure.
7. Telegram notification with cooldown/dedupe, token never in frontend or logs.
8. History, CSV export, print report work.
9. `npm run build` and the backend test suite pass; results pasted from real runs.
10. README documents setup, ports, privacy, limitations, and the eval numbers *for your own test set only*.

## 2. Key decisions (and why)

| # | Decision | Reason |
|---|---|---|
| D1 | **Walking skeleton before polish**: get phone photo → hazard list working end-to-end in Phase 1, then deepen | The headline need is "photo on phone → all hazards"; early feedback on real phone images drives the prompt and UI |
| D2 | Photo and Video use the OS camera via `<input capture>`; Live uses `getUserMedia` | Native capture works on plain HTTP over LAN; `getUserMedia` needs a secure context (HTTPS or `localhost`) |
| D3 | Frames are resized and re-encoded in the browser (≤1600 px, JPEG) | Phone photos are large; saves upload time, quota and strips EXIF |
| D4 | "All possible hazards" = observed / likely / possible-with-trigger + coverage gaps | Maximises recall without violating the "don't infer what can't be seen" rule |
| D5 | Perception is person-agnostic; person category adjusts risk and ordering only | Prevents silently hiding hazards that matter to other people |
| D6 | Deterministic rules for risk, retrieval, verification; LLM only for perception, optional critic, translation of free text | Auditable, testable, cheaper |
| D7 | No model-written precautions by default | Avoids invented safety advice; knowledge base is curated |
| D8 | Vite dev proxy for `/api` | Phone talks to one origin: no CORS issues, no mixed-content problem when the page is HTTPS |
| D9 | Strangler migration with `PIPELINE_VERSION` switch; new packages `app/routes/`, `app/pipeline/` | `app/api.py` + `app/api/` would collide and break `uvicorn app.api:app` |
| D10 | Job + SSE for progress; synchronous `/analyze` kept | Real execution state for the UI; backward compatibility |
| D11 | History in `localStorage`, results only | Matches the brief; no image retention by default |

## 3. Scope and cut line

**MVP (ship first):** Phases 0–4, 5 (core screens), 6 (Live + phone access).
**Next:** Phase 7 (Video, room sweep), Phase 8 (workflow graph, history/reports, PWA).
**Stretch:** region estimates, vision critic, read-aloud/haptics, deep-scan tuning.

If time is short, cut stretch items first, then Video; never cut Verification (R1), the failure states, or the privacy notice.

## 4. Phases

Mapping to the master prompt's phases: P0+P1 → "Audit and architecture"; P2+P3 → "New agent system"; P4 → "Backend API"; P5 → "Distinctive frontend"; P6 → "Live camera"; P7 → "Video sampling"; P8 → "Reports, history, integration"; P9 → "Verification and documentation".

### Phase 0 — Audit and safety net (S)

Tasks
- [ ] Create branch `feature/v2-agents`; tag the current state `v1-baseline` locally.
- [ ] Run the existing tests; record real pass/fail output in `docs/audit.md`.
- [ ] Inventory (S-32): files, Python and package versions, **which Gemini SDK** is used, guideline JSON schema (categories, languages, ids), Telegram flow, `evaluate_hazards.py` behaviour, sample images, endpoints.
- [ ] Check `.gitignore` covers `.env`, `.venv`, `node_modules`, `frontend/dist`, `data/runtime/`, private images. Ensure `.env.example` lists every variable without values. (Do not open or paste `.env`.)
- [ ] Write `docs/migration_plan.md`:

| Old | New |
|---|---|
| `scene_analyst.py` | `scene_perception.py` + `hazard_classifier.py` |
| `risk_predictor.py` | `person_context.py` + `risk_assessor.py` |
| `safety_advisor.py` | `safety_knowledge.py` (+ `guideline_service.py`) |
| `reporter.py` | `safety_report.py` (+ `translation_service.py`) |
| `caregiver_alert.py` | `caregiver_notification.py` (+ `notification_service.py`) |
| `graph.py`, `state.py` | `pipeline/workflow.py`, `pipeline/state.py`, `pipeline/routing.py` |
| `api.py` | stays as entry point; routes move to `app/routes/` |

Acceptance: baseline results documented; nothing deleted; migration table agreed.

### Phase 1 — Contracts and walking skeleton (M)

Tasks
- [ ] `app/schemas/`: enums, `PerceptionResult`, `Hazard`, `RiskAssessment`, `Precaution`, `AnalysisResult` (per `agent.md` §5).
- [ ] `app/core/config.py` (S-30), `GET /health`, `GET /api/status` (booleans only).
- [ ] `image_ingest` (S-11) and `VisionService` interface with `FakeVisionService` and the real Gemini implementation (S-12).
- [ ] LangGraph skeleton with all nodes wired; early nodes real, others pass-through.
- [ ] `POST /api/analyze` (+ `/analyze` alias) returning a schema-valid result; outcomes `failed`/`inconclusive` distinct from `none_observed`.
- [ ] Frontend scaffold (`frontend/`), proxy, one page: native capture (S-01) → upload → raw hazard list.
- [ ] Phone access via the Photo path (see §6, option A).

Acceptance: take a photo on a real phone and see a hazard list; kill the API key and see a "not a safe result" error, not an empty list.

### Phase 2 — The eight agents (L)

One commit per agent, each with fakes and contract tests. Order:
1. Agent 1 Perception (schema, prompt, repair, error mapping)
2. Agent 2 Classification (taxonomy, merge, trigger gate)
3. Agent 3 Person Context (`person_profiles.json`)
4. Agent 4 Risk (`risk_rules.json`, rule IDs, idempotence)
5. Agent 5 Knowledge (migrate guidelines schema, fallback tiers)
6. Agent 6 Verification (V1–V8, retry bound, fallback)
7. Agent 7 Report (+ forbidden-phrase guard, translation service, i18n JSON)
8. Agent 8 Notification (policy, cooldown, fake sender)

Acceptance: every agent's tests pass; graph runs with fakes through all routes (ok, failed, inconclusive, retry, fallback); old pipeline still selectable via `PIPELINE_VERSION=legacy`.

### Phase 3 — Recall engine and evaluation (M)

Tasks
- [ ] Environment checklists (S-13) and checklist-driven perception.
- [ ] Possible-tier gating, per-image cap, coverage gaps, quality flags.
- [ ] Client quality pre-check (S-04) with thresholds tuned on real phone photos.
- [ ] Deep scan (S-14), capped.
- [ ] Optional region estimate (S-15) if the model supports it.
- [ ] Build the eval set: start with 30–50 of your own images (with consent for anyone visible) across kitchen, bathroom, stairs, bedroom, baby corner, outdoor; label expected categories in `labels.json`.
- [ ] Extend `evaluate_hazards.py` (S-35): per-category recall/precision, **false-safe rate**, failure rate, calls per image, latency.
- [ ] Iterate prompt/checklists; log each iteration's numbers.

Acceptance: eval report generated from a real run and committed under `docs/eval/`; README quotes those numbers with the dataset size and the sentence "measured on this small dataset only".

### Phase 4 — API hardening, jobs, sessions (M)

Tasks
- [ ] `POST /api/jobs`, `GET /api/jobs/{id}/events` (SSE), `GET /api/jobs/{id}` (S-28).
- [ ] `GET /api/graph` (node/edge definition for the workflow view), `GET /api/guidelines`.
- [ ] Sessions + Agent 9 aggregator (S-23); `POST /api/sessions`, `POST /api/sessions/{id}/frames`, `GET /api/sessions/{id}/summary`.
- [ ] One in-flight request per session (429 if busy); global concurrency cap; Gemini backoff.
- [ ] Safe logging (S-29), optional `ACCESS_TOKEN` and rate limit (S-31), CORS to actual frontend origin.
- [ ] Validation tests: wrong type, oversize, corrupt, missing fields.

Acceptance: SSE shows real node events; busy-session test passes; no secrets in captured logs.

### Phase 5 — Frontend foundation and scan experience (L)

Tasks
- [ ] Tokens, fonts (including Kannada/Devanagari fallbacks), Tailwind config per `design.md`.
- [ ] `ModeDial`, `SceneViewport`, `CoverageArc` (single-capture first), `ResultSheet`, `HazardRow/Detail`, `RiskIndicator`, `PipelineStrip`, `QualityHint`.
- [ ] `useAnalysisJob` wired to SSE; person/language selectors.
- [ ] All states from `design.md` §11 implemented.
- [ ] Desktop three-zone layout, `UploadZone`, sample-image demo.
- [ ] i18n shell with `en`, `kn`, `hi`.

Acceptance: screenshots at 390 / 768 / 1440 px reviewed against the checklist; UI renders only real API output.

### Phase 6 — Live camera and phone access (M)

Tasks
- [ ] `useCamera` (S-02), `useFrameSampler` (S-05), `useWakeLock` (S-07).
- [ ] Live page: start, pause/resume, stop, capture-now, interval setting (default 5 s), latest findings, event stream, "Camera on" indicator.
- [ ] Notification dedupe observed in a running session.
- [ ] Secure-context handling and the Settings → Phone access page (§6).
- [ ] Real-phone test with the checklist in §8.

Acceptance: tracks are stopped on stop, tab hidden and page close; a slow backend never produces overlapping requests; paused sessions send nothing.

### Phase 7 — Video and room sweep (M)

Tasks
- [ ] `videoFrames` (S-06), `VideoPanel` with interval, frame cap, duration cap, cancel, progress.
- [ ] Per-frame results into session aggregator; final summary ("seen in N of M frames").
- [ ] Room sweep: multi-capture session, Coverage Arc segments, merged report.
- [ ] Sampling disclaimer shown in setup, results and report.

Acceptance: phone-recorded clip (Android and, if available, iPhone) analyses without uploading the video file; cancel stops further requests immediately.

### Phase 8 — Workflow view, history, reports, polish (M)

Tasks
- [ ] `AgentGraph` from `/api/graph` with live run state; static architecture view.
- [ ] History: search, filters (risk, person, input type, date), detail view, CSV export (S-26), print report.
- [ ] Notification status chips; caregiver settings (backend-owned config, frontend shows status only).
- [ ] PWA shell (S-10), optional read-aloud/haptics (S-08).
- [ ] Settings: privacy notice, clear local data, emergency number, intervals, language.

Acceptance: history survives reload; CSV opens correctly in a spreadsheet; print preview is one clean A4 page for a typical report.

### Phase 9 — Verification and documentation (M)

Tasks
- [ ] Run the full backend suite and frontend tests; paste real results into `docs/verification.md`.
- [ ] `npm run build`; fix warnings that matter.
- [ ] Playwright e2e (S-36) for scan → result → history; fake-camera Live test.
- [ ] Real end-to-end Gemini run (if key exists) and one Telegram test message (if configured); otherwise state clearly that they were not run.
- [ ] Generate the architecture diagram from the graph; doc-drift test.
- [ ] README: setup, ports, demo script, privacy, limitations, eval numbers, known gaps.
- [ ] Ask the owner for commit/push permission and propose commit messages per phase.

Acceptance: every claim in the README has a matching test, run output, or eval file.

## 5. API contract (summary)

| Method | Path | Purpose |
|---|---|---|
| GET | `/` , `/health` | liveness |
| GET | `/api/status` | config booleans, versions (no secrets) |
| POST | `/analyze` | legacy-compatible synchronous analysis |
| POST | `/api/analyze` | multipart: `image`, `person_category`, `language`, `mode`, `source`, optional `session_id`, `frame_ts` → `AnalysisResult` |
| POST | `/api/jobs` | same inputs → `{job_id}` (202) |
| GET | `/api/jobs/{id}/events` | SSE node events |
| GET | `/api/jobs/{id}` | final result |
| POST/GET | `/api/sessions…` | start session, add frame, summary |
| GET | `/api/guidelines` | knowledge base (read-only) |
| GET | `/api/graph` | node/edge definition for the workflow view |
| GET | `/api/analytics` | only if computed from real stored data; otherwise omitted |

Errors: 400 invalid fields · 413 too large · 415 unsupported type · 422 schema · 429 busy/rate-limited · 503 upstream unavailable. Body always `{error: {code, message}}`, never a stack trace or secret.

## 6. Environment and phone access (Windows, no Docker)

### 6.1 Configuration (names only; copy to `.env`, never commit values)

Secrets: `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
Config: `GEMINI_MODEL`, `PIPELINE_VERSION` (`v2`|`legacy`), `MAX_UPLOAD_MB` (10), `MAX_IMAGE_SIDE` (1600), `GEMINI_TIMEOUT_SECONDS`, `MAX_RETRIES` (1), `DEEP_SCAN_MAX_CALLS`, `VERIFIER_USE_LLM`, `ALLOW_AI_GENERAL_PRECAUTIONS` (false), `NOTIFICATIONS_ENABLED`, `NOTIFY_MIN_LEVEL`, `NOTIFY_COOLDOWN_SECONDS` (900), `ALLOWED_ORIGINS`, `ACCESS_TOKEN` (optional), `EMERGENCY_NUMBER` (optional, no default)

Values shown in brackets are starting points to tune, not measured recommendations.

### 6.2 Run

```powershell
# Backend (port 8000)
cd D:\Hazard-Precaution-Advisor
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.api:app --reload --host 0.0.0.0 --port 8000

# Frontend (port 5173)
cd D:\Hazard-Precaution-Advisor\frontend
npm install
npm run dev -- --host
```

`vite.config.ts` proxies `/api` and `/analyze` to `http://127.0.0.1:8000`, so the phone only needs the frontend origin.

### 6.3 Reaching it from a phone

Phone and PC on the same Wi-Fi. Find the PC address with `ipconfig` (IPv4 under your Wi-Fi adapter). Allow the frontend port in Windows Firewall (run PowerShell as Administrator):

```powershell
New-NetFirewallRule -DisplayName "Hazard dev 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private
```

| Option | Photo / Video | Live camera | Notes |
|---|---|---|---|
| **A. LAN over HTTP** `http://<pc-ip>:5173` | Works | **Blocked** (not a secure context) | Zero setup; use for Phase 1 and for Photo/Video |
| **B. `adb reverse`** (Android + USB debugging) | Works | Works | `adb reverse tcp:5173 tcp:5173`, then open `http://localhost:5173` on the phone; `localhost` counts as secure |
| **C. HTTPS dev cert** (`@vitejs/plugin-basic-ssl` or mkcert) | Works | Usually works after accepting the warning (mkcert + installing its root CA on the phone is more reliable) | Works for iPhone too |
| **D. Tunnel** (e.g. Cloudflare quick tunnel to port 5173) | Works | Works | Public URL — set `ACCESS_TOKEN` first; add the tunnel hostname to Vite `server.allowedHosts`; traffic passes through a third party |

Recommended: A for early work, B (Android) or C/D (iPhone) when you reach Live.

## 7. Testing plan

**Backend (pytest, all external calls faked)**
- Agent contract tests (per agent file, see `agent.md`).
- Routing: ok, failed, inconclusive, retry once, retry exhausted → fallback.
- R1 guard: a failed perception can never produce `none_observed` (parametrised across error types).
- Risk rules: one case per rule ID; idempotence.
- Guidelines: every category returns ≥1 precaution; no duplicates/conflicts.
- Report: forbidden-phrase test; translation validation + failure path.
- Notification: policy matrix, cooldown, escalation, dedupe across frames, token never in logs.
- API: validation errors, busy session 429, SSE event order, no secrets in `/api/status`.
- Doc drift: README node list equals compiled graph.

**Frontend (Vitest + Testing Library)**
- Sampler: no overlap, no upload while paused, skip counter.
- Camera hook: tracks stopped on stop / `pagehide` / hidden / unmount.
- Video extractor: frame cap, cancel, revoke URLs.
- Components render real fixture responses; failed/inconclusive states never use "safe" wording.
- History: persistence, filters, CSV escaping.

**E2E (Playwright, Pixel-class profile)** — scan flow with a mocked or real backend; Live with Chromium fake-camera flags.

**Evaluation** — `evaluate_hazards.py` on your labelled set (S-35). Report recall, precision, false-safe rate, failure rate, calls and latency per image.

## 8. Real-phone checklist (manual, record results)

1. Photo of a known hazard in good light → hazard listed with evidence.
2. Photo in a dark room → quality hint appears; "Analyze anyway" still works.
3. Blank wall / screenshot → `inconclusive`, not "none observed" claims of safety.
4. Turn off Wi-Fi mid-request → clear error; not marked safe.
5. Kannada and Hindi report → correct glyphs, no clipped text.
6. Video clip 20–30 s → progress, cancel works, summary shows frame counts.
7. Live: start, pause (no uploads), resume, stop (camera indicator off).
8. Lock screen / switch app during Live → camera released.
9. Caregiver alert received once, not repeated within cooldown.
10. History entry created; CSV opens in a spreadsheet; print preview is clean.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Model misses small hazards (batteries, damaged wire) | Checklist sweep, deep scan, coverage gaps, "scan again closer" prompt; measured recall reported honestly |
| Model over-reports "possible" hazards (alarm fatigue) | Trigger requirement, per-image cap, collapsed "Worth checking" group, eval precision tracking |
| Gemini quota / rate limits during Live | Change detection, interval ≥ configured minimum, backoff, visible "slowing down" state |
| Latency on mobile networks | Client-side resize, SSE progress, quick mode default |
| Live camera blocked by non-secure context | Detect and explain; Photo/Video fallback; options B–D |
| Privacy: faces/private areas leave device | Notice, explicit start, no retention, EXIF strip; review Gemini API terms for your tier |
| Kannada/Hindi safety wording errors | Curated vocabulary, fallback to English, native-speaker review before real use |
| Telegram token leakage via HTTP logs | Logger levels, redaction, test |
| Scope too large for the time | Cut line in §3; walking skeleton first |
| Old pipeline regresses | `PIPELINE_VERSION` switch, baseline tag, parity tests before removal |
| `app/api.py` vs package collision | D9 naming |

## 10. Open questions (answer before or during Phase 1)

1. Phone OS: Android, iPhone, or both? (decides option B vs C/D)
2. Gemini tier and model currently available on your key (check Google's docs for the current model name and limits).
3. Existing guideline JSON structure — can it keep its IDs when migrated?
4. Will this stay local, or be deployed (hosted HTTPS removes most phone-access friction)?
5. Who is the caregiver (one Telegram chat or several)?
6. Do you have consent-cleared sample images for the eval set?

## 11. Commit checkpoints (ask permission each time)

After P0 (audit docs) · P1 (skeleton) · each agent in P2 · P3 (eval) · P4 (API) · P5 (frontend core) · P6 (live) · P7 (video) · P8 · P9. Each proposal includes the real test output for that phase.
