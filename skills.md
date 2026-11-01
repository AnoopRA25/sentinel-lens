# skills.md — Reusable capabilities

A **skill** is a small, testable capability with a clear input and output. Agents (see `agent.md`) compose skills; skills never call each other in hidden ways. Each entry lists: what it does → where it lives → rules → how it is tested.

Paths: backend `app/…`, frontend `frontend/src/…`. IDs (S-xx) are stable so `implementation_plan.md` and tests can reference them.

---

## A. Capture and preparation (frontend)

**S-01 · Native photo and video capture**
- `<input type="file" accept="image/*" capture="environment">` and `accept="video/*" capture="environment"` open the phone's own camera app.
- Works on plain `http://` over the LAN (no secure-context requirement), which is why Photo and Video modes are the reliable phone path. Fall back to the gallery picker when `capture` is ignored.
- Lives in `components/capture/NativeCapture.tsx`. Test: renders both inputs with correct attributes; file → `onFile` callback.

**S-02 · Live camera session**
- `getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } })`, started only after an explicit tap.
- Check `window.isSecureContext` first; if false, show the "Live needs HTTPS" state instead of a cryptic error. Distinct states: `idle | requesting | active | paused | denied | unavailable | insecure | error`.
- Stop **all** tracks on stop, `pagehide`, `visibilitychange` (hidden), and unmount. One session at a time.
- Lives in `hooks/useCamera.ts`. Test: tracks stopped on each exit path (mock `MediaStream`).

**S-03 · Frame capture and compression**
- Draw `<video>`/image to canvas, scale longest side to ≤ `MAX_IMAGE_SIDE` (default 1600), `toBlob("image/jpeg", 0.8)`.
- Canvas re-encode drops EXIF/GPS; the server strips again (S-11).
- Returns `{ blob, width, height, capturedAt }`. Lives in `lib/frameCapture.ts`.

**S-04 · Image quality pre-check (advisory)**
- On a ~256 px grayscale copy: blur (variance of Laplacian), mean brightness, fraction of clipped pixels.
- Thresholds are tuned on real phone photos in Phase 3, not guessed. Result is a hint ("Too dark — retake?") with an "Analyze anyway" option; never a hard block.
- Lives in `lib/quality.ts`. Test: fixtures for dark, blurred, normal.

**S-05 · Frame sampler (no-overlap)**
- Interval timer with an `inFlight` guard: a tick that finds a request still running is **skipped, not queued** (queue length is zero).
- Paused → no capture, no upload. Backoff on errors and 429.
- Optional change detection: compare a 32×32 grayscale thumbnail against the last analysed frame; skip if nearly identical, unless `maxGapSeconds` has elapsed. Saves quota; honest caveat: small changes can be missed.
- Lives in `hooks/useFrameSampler.ts`. Test (fake timers): no overlapping requests, no uploads while paused, skip counter increments.

**S-06 · Video frame extractor**
- Hidden `<video muted playsinline preload="metadata">`, object URL (revoked on finish), seek to each sample time, wait for `seeked`, draw to canvas (S-03).
- Controls: interval, max frames (default ≤ 20), max duration; progress callback; `AbortController` cancel.
- Handles decode failure (`video.error`) with a clear message — some formats don't play in every browser.
- Never uploads the video file. Lives in `lib/videoFrames.ts`. Test: seek order, cancel, frame cap (mock video element).

**S-07 · Screen wake lock**
- `navigator.wakeLock.request("screen")` while Live is active; re-request on `visibilitychange`. If unsupported, continue silently and show a small "keep screen on" tip.
- Lives in `hooks/useWakeLock.ts`.

**S-08 · Read-aloud and haptics (off by default)**
- `speechSynthesis` reads the headline result in the report language; check that a voice for `kn`/`hi` exists on the device, otherwise say it isn't available.
- `navigator.vibrate` pulse for High where supported (not iOS Safari).
- Lives in `lib/readout.ts`.

**S-09 · Local history store**
- `localStorage` with a schema version, entry cap (default 200) and size guard; stores results, not images. Clear-all button. CSV export (S-26).
- "This session" vs "saved on this device" are shown separately.
- Lives in `hooks/useHistory.ts`, `lib/historyStore.ts`.

**S-10 · PWA shell**
- Manifest + service worker caching **static assets only**. API responses are never cached. Install prompt on supported browsers.
- Test: build output contains manifest; SW does not intercept `/api`.

---

## B. Perception and structuring (backend)

**S-11 · Image ingest**
- Validate type by content (Pillow `verify()`), not by extension or header; size ≤ `MAX_UPLOAD_MB` (10); dimension cap; `ImageOps.exif_transpose`; strip all metadata; resize; re-encode JPEG in memory.
- No disk writes by default; if a temp file is ever needed, use a restricted temp dir and delete in `finally`.
- Lives in `app/utils/image_ingest.py`. Test: wrong type, oversize, corrupt, EXIF GPS removed, rotated phone photo.

**S-12 · Structured vision call**
- Wraps the Gemini SDK in `app/services/vision_service.py` behind a `VisionService` interface.
- Pydantic response schema, `GEMINI_TIMEOUT_SECONDS`, one JSON repair retry, typed errors: `missing_api_key | rate_limited | timeout | model_blocked | invalid_json | upstream_error`.
- Never logs image bytes or keys. Check which SDK the repo uses in Phase 0 and the current model name from Google's docs.
- Test: `FakeVisionService` for every error type.

**S-13 · Checklist sweep**
- Environment → list of categories and example prompts in `data/hazard_checklists.json` (kitchen, bathroom, bedroom, living room, stairs, outdoor, unknown = all).
- Merged into the perception prompt; output is `present | absent | cannot_see` per category. Editable without code changes.

**S-14 · Deep-scan tiles**
- Full image plus 2×2 overlapping tiles at higher effective resolution for small objects (batteries, coins, wire damage). Hard cap on calls; results merged by S-16.
- Opt-in per scan ("Deep scan"); not used in live mode. Report extra latency/cost honestly in the UI.

**S-15 · Region estimate (optional)**
- If the configured model supports bounding boxes, request normalised boxes for `observed` hazards. Display as "approximate area"; hide when absent or implausible (zero-area, off-image).
- Not required for the core feature; the UI works without it (R7).

---

## C. Reasoning and rules

**S-16 · Hazard normaliser**
- Taxonomy mapping (`data/taxonomy.json`), keyword fallback, duplicate merge (category + token Jaccard), evidence union, `dropped[]` audit list.

**S-17 · Evidence gate**
- Derives `status` and `evidence_strength` from visibility + evidence count; enforces "possible requires trigger"; caps possible items per image.

**S-18 · Person profile lookup**
- Reads `data/person_profiles.json`; returns relevance and severity modifier for each (category, person) pair. Table is human-readable so a reviewer can audit it.

**S-19 · Risk rules engine**
- Reads `data/risk_rules.json`; returns level, `potential_level`, `rule_ids`, rationale. Pure and idempotent. Docs generated from the JSON (`docs/risk_rules.md`).
- Explicitly ordinal; never output a percentage.

**S-20 · Guideline retriever**
- Category + person filter → rank → dedupe → conflict removal → fallback tiers. Never returns an empty list for a hazard.
- Preserves existing guideline IDs; new entries get IDs in the same scheme. Provenance field required.

**S-21 · Consistency checker**
- V1–V8 from `agent.md` as small pure functions returning `{id, passed, detail}`.

**S-22 · Vision critic (optional)**
- Second image+hazards call returning `supported | unsupported | unsure` per hazard. Used only on flagged results to control cost.

**S-23 · Session merge**
- Deterministic cross-frame matching with sightings, first/last seen, max risk and change events. Bounded memory and expiry.

---

## D. Output

**S-24 · Report composer**
- Template-based assembly of the structured report; includes a **forbidden-phrase guard** ("safe", "no danger", "all clear", "guaranteed") enforced by test.

**S-25 · Translation service**
- Curated vocabulary files for `kn` and `hi`; free text through a text-model call with JSON in/out; validation of item count, empty strings, untouched IDs; failure returns English + `translation_error`.
- Interface `TranslationService` so tests use a fake. Fonts for Kannada/Devanagari are a design concern (see `design.md`).

**S-26 · Export**
- CSV (timestamp, input type, person, hazards, risk, confidence/evidence strength, verification, precautions, notification) with spreadsheet-injection protection (prefix cells starting `= + - @`), JSON download, print stylesheet for A4.
- Lives in `lib/exporters.ts`, `styles/print.css`.

---

## E. Operations and safety

**S-27 · Notification stack**
- Policy (`notification_policy.py`) + dedupe/cooldown store + Telegram sender behind `NotificationService`. Details in `agent.md` Agent 8.
- Test with a fake sender; one test asserts the bot token never appears in captured logs.

**S-28 · Job events (SSE)**
- `POST /api/jobs` → job id; `GET /api/jobs/{id}/events` streams node events; `GET /api/jobs/{id}` returns the final result. Per-job asyncio queue, timeout and cleanup. Sync `POST /api/analyze` stays for compatibility.

**S-29 · Safe logging**
- Structured logs with request IDs; redact secrets; `httpx`/`httpcore` at WARNING; never log images, base64, or full model prompts containing user content at INFO.

**S-30 · Config guard**
- `pydantic-settings` loader; startup validation; `/api/status` returns booleans (`gemini_configured`, `telegram_configured`) and non-secret settings only.

**S-31 · Access control for LAN/tunnel use**
- Optional `ACCESS_TOKEN` checked on `/api/*`, per-IP rate limit, CORS limited to the real frontend origin. Needed the moment the backend is reachable beyond localhost.

---

## F. Build and verification skills (for the coding assistant)

**S-32 · Repo audit** — Read-only pass that outputs `docs/audit.md`: file inventory, SDK/version facts, guideline schema, existing test results, endpoint list, gaps.

**S-33 · Strangler migration** — New code beside old; `PIPELINE_VERSION` switch; old → new module map; delete nothing until parity tests pass.

**S-34 · Fakes and fixtures** — `FakeVisionService`, `FakeTranslationService`, `FakeNotificationService`, canned `PerceptionResult` JSONs for each hazard class and each failure.

**S-35 · Evaluation harness** — Extend `evaluate_hazards.py`: labelled images (`tests/fixtures/eval/labels.json`), per-category recall and precision, **false-safe rate** (images with a known hazard where the outcome was `none_observed`), failed-run rate. Reports numbers for *your* small dataset only; no claims beyond it.

**S-36 · Mobile e2e testing** — Playwright with a Pixel-class device profile; Chromium flags `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` (optionally `--use-file-for-fake-video-capture=<file>`) to test Live mode without a real camera; plus a manual real-phone checklist.

**S-37 · Phone access setup (Windows)** — `uvicorn --host 0.0.0.0`, Vite `server.host`, Vite proxy for `/api`, inbound firewall rule on the Private profile, and one of: `adb reverse` (Android), HTTPS dev cert, or a tunnel with `ACCESS_TOKEN`. Exact steps in `implementation_plan.md`.

**S-38 · Frontend design discipline** — Follow `design.md`: token system first, one memorable element, state-bound motion, real copy for every state, screenshot review at 390 px and 1440 px widths.

**S-39 · Docs sync** — Generate the architecture diagram from the compiled graph; test fails on drift; README claims limited to what the tests and eval actually show.

---

## G. Which agent uses which skill

| Agent / layer | Skills |
|---|---|
| Ingest (plumbing) | S-11 |
| 1 Scene Perception | S-12, S-13, S-14, S-15 |
| 2 Hazard Classification | S-16, S-17 |
| 3 Person Context | S-18 |
| 4 Risk Assessment | S-19 |
| 5 Safety Knowledge | S-20 |
| 6 Verification and Critic | S-21, S-22, S-19 (recompute) |
| 7 Safety Report | S-24, S-25 |
| 8 Caregiver Notification | S-27, S-29 |
| 9 Session Aggregator | S-23 |
| API layer | S-28, S-29, S-30, S-31 |
| Frontend capture | S-01 → S-08 |
| Frontend records and output | S-09, S-10, S-26 |
| Build process | S-32 → S-39 |
