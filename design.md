# design.md — Interface design specification

Working title: **Sentinel Lens** (rename freely)
Companion files: `agent.md` · `skills.md` · `implementation_plan.md`

---

## 1. Brief

**Subject:** A hazard scanner used mostly on a phone, in homes (kitchen, bathroom, stairs, a baby's room) and sometimes outdoors.
**Audience:** parents, caregivers of elderly relatives, and — for the course demo — an evaluator on a laptop.
**Primary job:** "Show me what could hurt someone here, and what to do about it" within a few seconds of pointing the camera.
**Secondary job:** present the multi-agent system credibly on a large screen (agent workflow, history, reports).

## 2. Principles

1. **The camera is the product.** The viewport fills the screen; chrome recedes.
2. **Coverage is part of the answer.** Show what was and was not assessed, not only what was found.
3. **Honest states over pretty states.** Every animation is bound to a real state (request in flight, node finished, camera active). No decorative "AI is thinking" motion.
4. **Calm until it matters.** Most of the interface is neutral. Color is reserved for risk and for "the system is working".
5. **One hand, one thumb.** Primary actions sit in the bottom 40% of the phone screen.
6. **Never imply safety.** No green "all good" state anywhere.

## 3. The one memorable element — the Coverage Arc

The shutter button is also the status instrument. A ring around it is divided into segments, one per view captured in this **room sweep** (photo, video sample, or live snapshot). Each segment is coloured by the highest risk found in that view, hatched grey if that view was inconclusive, and empty if not yet scanned.

Why: it answers "have I looked everywhere?" — the real weakness of any camera-based "all hazards" claim — and it turns a limitation into the interface's signature. Everything else stays quiet so this reads first.

## 4. Review against generic defaults (decisions taken)

| Default we are avoiding | What we do instead |
|---|---|
| Sidebar + four stat cards + line chart + table | Full-bleed viewport + bottom sheet (phone) / three-zone canvas (desktop); no KPI-card grid |
| Near-black + one acid accent | Midnight blue base, three risk colours with distinct icon shapes and patterns; cyan reserved for "system active", never for a risk level |
| Identical rounded cards everywhere | Hazard rows are list items with a risk edge; the sheet, viewport and ring each use different radii/treatments by role |
| ALL-CAPS eyebrow labels, `A · B · C` meta strings, `→` on buttons | Sentence-case labels, plain verbs on buttons ("Scan room", "Stop camera") |
| Numbered 01/02/03 markers | Numbers only where the content is a sequence (agent pipeline, retry attempts) |
| Fade-and-slide entrance on every block | One orchestrated moment (result reveal); other motion answers a tap or a real state change |
| Glowing borders on everything | No glow except the risk halo on the viewport edge, only while a result is showing |

## 5. User flows (phone)

**Snap** — Photo mode → tap shutter (opens the phone's camera app or in-app camera) → preview with quality hint → *Analyze* (or auto-analyze) → pipeline strip animates from real events → result sheet slides to half height → tap a hazard for evidence and precautions.

**Record** — Video mode → pick or record video → set interval and frame limit → *Analyze video* → progress with live count of frames done → timeline of findings → merged summary ("seen in 4 of 12 frames").

**Live** — Live mode → explicit *Start camera* → rear camera preview → analysis every N seconds only when the scene changed → latest findings and event stream → *Pause* / *Stop camera* always one tap away, never hidden in a menu.

**Room sweep** — From any mode, *Scan room* starts a session; each capture adds a Coverage Arc segment; *Finish* produces the merged room report. Prompt copy nudges: "Now scan the floor and the corners."

## 6. Information architecture and navigation

Requirement list: Overview, Scene Analysis, Live Monitoring, Video Analysis, Agent Workflow, Safety Reports, Event History, Settings.

**Mode Dial** replaces the sidebar. A horizontal, snap-scrolling strip at the bottom of the phone (top of the canvas on desktop) like a camera app's mode selector:

`Overview · Photo · Video · Live · Workflow · Reports · History · Settings`

- On phone the three capture modes (Photo, Video, Live) sit in the centre of the dial and open on Photo by default; first launch lands on Photo, not Overview, because the job is scanning.
- Routes: `/` (Overview), `/photo` (Scene Analysis), `/live`, `/video`, `/workflow`, `/reports`, `/history`, `/settings`.
- Desktop shows the same dial as a slim top bar plus a persistent three-zone canvas.
- Overview is a "situation board": last result, session Coverage Arc, system status (backend, Gemini configured, Telegram configured), and a start-scan button. No fabricated analytics; charts appear only when backed by real history (Recharts, e.g. hazards by category over saved scans).

## 7. Layouts

### 7.1 Phone — scanning (portrait)

```text
┌──────────────────────────────┐
│ Child ▾            EN ▾   ⚙  │  HUD: person + language (translucent)
│                              │
│                              │
│        CAMERA / PHOTO        │  full-bleed viewport
│                              │
│  ┌────────────────────────┐  │
│  │ Too dark — retake?     │  │  contextual hint (only when relevant)
│  └────────────────────────┘  │
│  ○ ○ ● ○ ○ ○ ○ ○            │  pipeline strip (real node states)
│          ( ◯ )               │  shutter inside Coverage Arc
│  Photo  Video  Live  ···     │  Mode Dial
├──────────────────────────────┤
│ ▔▔▔▔ 3 confirmed · 2 to check │  sheet, peek state
└──────────────────────────────┘
```

### 7.2 Phone — result sheet (three snap points)

```text
Peek (≈15%)   headline only: "High risk · 3 confirmed · 2 to check"
Half (≈55%)   hazard list, confirmed first, risk edge on the left of each row
Full (≈92%)   selected hazard: evidence, why this risk (rule ids), precautions with
              provenance, then Coverage and limits, then actions: Save, Share/Print, Re-scan
```

Hazard row: icon shape (by risk) · title · status chip (Confirmed / Likely / Check this) · one-line reason. Tap opens the evidence drawer. On desktop the same row reveals its explanation on hover and on keyboard focus; on touch the first tap expands, the second opens (hover parity).

### 7.3 Desktop (≥1024 px)

```text
┌───────────────────────────────────────────────────────────────────────┐
│ Mode Dial (top)                       Person ▾  Language ▾  ● Backend │
├───────────────┬─────────────────────────────────┬─────────────────────┤
│ Scan controls │                                 │ Result panel        │
│ • source      │      Scene viewport             │ • risk indicator    │
│ • interval    │      (image / camera / frame)   │ • hazards           │
│ • deep scan   │      + approximate regions      │ • evidence          │
│ • room sweep  │        when available           │ • precautions       │
│ Coverage Arc  │                                 │ • coverage and limits│
├───────────────┴─────────────────────────────────┴─────────────────────┤
│ Agent timeline: ingest → perceive → classify → person → risk → guidelines → verify → report → notify │
│ Event stream (timestamped, newest first)                              │
└───────────────────────────────────────────────────────────────────────┘
```

### 7.4 Agent Workflow page

An interactive graph generated from the real compiled graph's node and edge list. Node states: `idle | running | done | failed | skipped | retried`. Clicking a node shows its responsibility, the input and output summary of the **last real run**, duration, and errors. Before any run, all nodes are idle and a note says so. A separate static architecture view (for slides/README) is the same graph without run state.

## 8. Visual system

### 8.1 Colour tokens

```css
:root {
  --ink-900: #0F1B2D;   /* Midnight: app background */
  --ink-800: #16263B;   /* panels, sheet */
  --ink-700: #20344D;   /* raised surfaces, borders */
  --mist-100: #E6EEF7;  /* primary text */
  --mist-400: #9FB1C6;  /* secondary text */
  --signal-cyan: #2DD4E8;   /* system active: scanning, selection, focus ring */
  --risk-high:   #F2554B;
  --risk-medium: #F5A524;
  --risk-low:    #7FA7D6;   /* steel blue: calm, deliberately not green */
  --risk-uncertain: #8A9BB0; /* always drawn with hatch pattern */
}
```

Check every text/background pair against WCAG AA with a contrast tool before finalising; adjust values rather than assuming. A **Daylight** variant (light background, same risk hues darkened for contrast) is provided because phones are used in bright rooms and outdoors; default follows `prefers-color-scheme`.

### 8.2 Risk visual language

| Level | Colour | Icon shape | Pattern / edge | Label |
|---|---|---|---|---|
| High | `--risk-high` | filled triangle with bar | solid 4 px edge | "High" |
| Medium | `--risk-medium` | diamond | solid 3 px edge | "Medium" |
| Low | `--risk-low` | outlined circle | 2 px edge | "Low" |
| Uncertain | `--risk-uncertain` | square with "?" | **diagonal hatch** edge | "Check this" / "Uncertain" |

Colour is never the only signal: icon shape, edge pattern and text label always accompany it. The word "safe" never appears.

### 8.3 Typography

- **UI, headlines, body:** Atkinson Hyperlegible — designed for legibility, which suits safety information. Headlines use weight and size, not decoration.
- **Data readouts (timestamps, rule IDs, counts):** IBM Plex Sans Condensed with tabular figures. Clearly distinct from the UI face.
- **Indic scripts:** Noto Sans Kannada and Noto Sans Devanagari as explicit fallbacks in the font stack; Atkinson has no Kannada/Devanagari glyphs. Give `kn`/`hi` text more line height (≈1.6–1.7) and test long wrapped lines on a 360 px screen.
- Self-host fonts through `@fontsource/*` packages (no third-party font requests at runtime; confirm package names at install).
- Scale: 12 / 14 / 16 / 20 / 28 / 40 px, body 16 px minimum on phone; line length under ~70 characters; respect browser text zoom up to 200%.
- Sentence case everywhere; no tracked-out all-caps labels.

### 8.4 Shape, spacing, depth

- 4 px base grid. Touch targets ≥ 44 × 44 px.
- Radii by role: viewport corners 20 px on phone (0 on desktop), sheet top 24 px, chips full, hazard rows 12 px, buttons 12 px. Not one radius for everything.
- Depth from tone steps (`ink-900 → 700`), not drop shadows. The only glow: the **risk halo** — a 2 px inner edge light on the viewport coloured by overall risk, visible only while a result is showing.
- Use `100dvh` and `env(safe-area-inset-*)` for notches/home indicators.

## 9. Components

| Component | Purpose | Key props / behaviour |
|---|---|---|
| `ModeDial` | Navigation | snap scroll, keyboard arrows, `aria-current`, roving tabindex |
| `SceneViewport` | Image / camera / frame | `source`, `status`, optional `regions` (approximate, only if provided), risk halo, scan sweep line **only while a request is in flight** |
| `CoverageArc` | Shutter + session coverage | `segments[{state, maxRisk}]`, tap = capture, long-press = finish sweep |
| `ResultSheet` | Hazards and details | three snap points, drag + buttons for accessibility, focus management |
| `HazardRow` / `HazardDetail` | List item / evidence drawer | status chip, risk edge, evidence list, rule ids, precautions with provenance badge (Guideline / General) |
| `RiskIndicator` | Overall risk | text + icon + pattern; includes `potential_level` for "check this" items |
| `PipelineStrip` | Phone agent progress | nodes mirror real events; tap a node → mini popover |
| `AgentGraph` | Workflow page | built from backend graph definition endpoint (`/api/graph`) |
| `EventStream` | Timestamped events | newest first, virtualised past ~200 items; filterable by type |
| `QualityHint` | Pre-upload advice | dark/blur/glare messages; "Analyze anyway" |
| `CoverageNotes` | Limits | coverage gaps list + sampling disclaimer |
| `UploadZone` | Desktop drag-and-drop | JPEG/PNG/WebP, 10 MB, replace, inline errors |
| `VideoPanel` | Video setup + progress | interval, frame cap, start/cancel, progress, final summary |
| `NotifyChip` | Caregiver status | `sent / skipped / disabled / failed` — mirrors backend record |
| `ReportView` | Print-friendly report | A4 stylesheet, language-aware fonts |

## 10. Motion (state-bound)

| Element | Triggered by | Effect | Reduced-motion alternative |
|---|---|---|---|
| Scan sweep line | request `in_flight = true` | slow vertical sweep on viewport | static "Analyzing" label |
| Pipeline node | real `node_started / finished / failed` event | idle → running pulse → filled / cross | state change without pulse |
| Result reveal | `result` event | sheet rises to half height, halo fades in over ~300 ms | sheet appears, no transition |
| Risk change | overall risk differs from previous | halo colour cross-fade | instant swap |
| Coverage segment | capture completes | segment fills | instant fill |
| Camera active | tracks live | small cyan dot beside the preview | same dot, no pulse |

Rule: if a state cannot be named, the animation does not exist. No looping ambient animation. All motion respects `prefers-reduced-motion`.

## 11. States and copy

Sentence case, active voice, specific, no apology.

| State | Message and action |
|---|---|
| Empty (no scan yet) | "No scan yet. Take a photo of the area you want to check." — button: **Take photo** |
| Permission denied | "Camera access is blocked. Allow the camera in this site's browser settings, or use Photo mode." |
| Insecure context | "Live mode needs a secure (HTTPS) connection. Photo and Video modes still work. See Settings, Phone access." |
| Analyzing | "Analyzing. Perception is running." (names the actual current node) |
| Too dark / blurry | "Too dark to check reliably. Turn on a light or move closer to a window." — **Retake** · **Analyze anyway** |
| Hazards found | Headline: "3 confirmed hazards, 2 to check" |
| None observed | "No hazards observed in this view. Parts of the room weren't visible. Scan from another angle." |
| Failed | "Analysis didn't complete, so this is not a safe result. Check your connection and try again." — **Try again** |
| Rate limited | "Analysis is rate-limited. Slowing down. Next check in {n} s." |
| Translation failed | "Couldn't translate this report. Showing English." |
| Telegram off / failed | "Caregiver alert not sent: {reason}." Never "sent" unless the backend says so |
| Video sampling | "Checks one frame every {n} s. Events between frames can be missed." |
| Unsupported video | "This browser can't read this video format. Try Live mode or record again." |
| Empty history | "Nothing saved yet. Finished scans appear here." |
| Emergency banner | "Possible fire or exposed live wiring visible. Move people away and call your local emergency number." (number configurable in Settings; no default assumed) |

Report footer (once): "This report is based on the image(s) analyzed and does not guarantee safety. It cannot assess anything outside the frame."

## 12. Accessibility

- Visible focus ring (`--signal-cyan`, 2 px offset) on every interactive element; full keyboard operation of Mode Dial, sheet (buttons as alternative to dragging), hazard list and graph nodes.
- Results announced via `aria-live="polite"`; High risk and errors via `role="alert"`.
- No hover-only content; touch gets tap-to-expand.
- Contrast AA for text and non-text UI; risk never colour-only.
- Reduced motion, text zoom to 200%, landscape layouts that don't clip the shutter.
- Camera controls labelled for screen readers ("Stop camera", "Pause monitoring").
- Language attribute set on the document and on translated report regions (`lang="kn"` / `"hi"`).

## 13. Internationalisation

- UI strings in `src/i18n/{en,kn,hi}.json`; category names, risk labels and state copy are curated, not machine-translated at runtime.
- Report free text is translated by the backend (see `agent.md`, Agent 7). If it fails, show English with the translation notice.
- Dates and numbers via `Intl` with the selected locale; layout tested with the longest Kannada/Hindi strings.
- Native-speaker review of safety wording is listed as a release task, not assumed.

## 14. Frontend architecture

```text
frontend/
├── index.html
├── vite.config.ts            # host: true, /api proxy → http://127.0.0.1:8000
├── tailwind.config.ts        # tokens above
├── src/
│   ├── main.tsx · App.tsx · routes.tsx
│   ├── pages/        Overview, Photo, Live, Video, Workflow, Reports, History, Settings
│   ├── components/   viewport/, sheet/, hazards/, pipeline/, capture/, report/, ui/
│   ├── hooks/        useCamera, useFrameSampler, useAnalysisJob, useWakeLock, useHistory, useSession
│   ├── services/     api.ts (typed fetch + SSE), graph.ts
│   ├── lib/          frameCapture, quality, videoFrames, exporters, readout, historyStore
│   ├── i18n/         en.json, kn.json, hi.json
│   ├── types/        api.ts (mirrors backend schemas), ui.ts
│   └── styles/       tokens.css, print.css
└── tests/            vitest + Testing Library; e2e in /e2e (Playwright)
```

- State: React context + `useReducer` for the active analysis/session; no global state library unless a real need appears.
- Types mirror the backend Pydantic schemas (generate from OpenAPI where practical; otherwise keep in `types/api.ts` with a contract test).
- The API base is relative (`/api/...`) so phone, desktop and tunnel all work through the Vite proxy; no keys in any `VITE_*` variable.
- Libraries: React, TypeScript, Vite, Tailwind CSS, Lucide React, Framer Motion (sheet, pipeline, halo), Recharts (history only). Pin the versions that install resolves.

## 15. Responsive rules

| Width | Layout |
|---|---|
| < 640 px | Full-bleed viewport, bottom sheet, Mode Dial at bottom, pipeline strip above shutter |
| 640–1023 px | Viewport top, result panel below or side-by-side in landscape, dial at top |
| ≥ 1024 px | Three-zone canvas, bottom timeline + event stream |

Landscape phone: shutter and Coverage Arc move to the right edge; sheet becomes a side panel.

## 16. Privacy surfaced in the UI

- First-run notice and Settings → Privacy: what is sent (a compressed still frame, no EXIF), when (only on analyze / each sampled frame while Live is running), where (your backend, then Google Gemini), what is kept (results on this device; no images or video by default).
- Live mode shows a persistent "Camera on · frames sent every {n} s" indicator.
- Check Google's current terms for your Gemini API tier before pointing the camera at people or private documents; the note in Settings says to review them.
- "Clear all local data" in Settings.

## 17. Design acceptance checklist

- [ ] First screen on a 390 px phone shows viewport + shutter + dial without scrolling.
- [ ] Coverage Arc updates with real captures and survives a page reload only if the session is saved (otherwise it resets and says so).
- [ ] Every risk level distinguishable in greyscale.
- [ ] Every animation maps to a named state; reduced-motion verified.
- [ ] Every state in section 11 implemented and screenshot-reviewed.
- [ ] Kannada and Hindi report renders with correct fonts, no clipped lines.
- [ ] Keyboard-only run-through of scan → result → evidence → print.
- [ ] Desktop and phone screenshots reviewed at 390, 768 and 1440 px.
- [ ] No sidebar-plus-KPI-cards composition anywhere.
