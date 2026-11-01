# Sentinel Lens v2.0 — Windows Quick Start & Deployment Guide

Welcome to **Sentinel Lens v2.0**, an autonomous multimodal safety and hazard advisory system powered by a 9-agent LangGraph execution pipeline and a Terminal Ember user interface.

---

## 🚀 How to Run on Windows

You have two convenient ways to launch Sentinel Lens on Windows:

### Option 1: Native Windows Executable (`SentinelLens.exe`) — Recommended
Simply double-click:
```
SentinelLens.exe
```
**What it does automatically:**
1. Detects your Python environment (`.venv`, `venv`, or system `python.exe`).
2. Starts the Sentinel Lens FastAPI high-concurrency server on port `8000`.
3. Automatically opens your default web browser to `http://localhost:8000`.
4. Serves the full compiled React SPA with real-time active agent telemetry.

---

### Option 2: Windows Batch Launcher (`SentinelLens.bat`)
Double-click:
```
SentinelLens.bat
```
**What it does automatically:**
1. Verifies Python 3.10+ is installed.
2. Automatically installs any missing Python dependencies (`pip install -r requirements.txt`).
3. Launches the FastAPI server and opens your web browser to `http://localhost:8000`.

---

## 🐧 How to Run on Linux / macOS

On Linux or macOS, run:
```bash
./run_app.sh
```
Or start the backend and frontend separately:
```bash
# Backend (serves API & SPA on http://localhost:8000)
.venv/bin/python -m uvicorn app.api:app --host 0.0.0.0 --port 8000

# Optional frontend development hot-reload server (port 5174)
cd frontend && npm run dev
```

---

## 🤖 9-Agent Pipeline & Real-Time Telemetry

Sentinel Lens displays the exact agent executing at each moment during analysis:

| Step | Agent Name | Canonical Role | UI Badge |
|---|---|---|---|
| **01** | Ingestion & EXIF Sanitizer Agent | Privacy & Ingestion Integrity | `AGENT 01/09` |
| **02** | Multimodal Scene Perception Agent | Visual Environmental Understanding | `AGENT 02/09` |
| **03** | Hazard Taxonomy Routing Agent | 15-Category Safety Taxonomy | `AGENT 03/09` |
| **04** | Demographic Reachability Agent | Demographic Vulnerability Profiler | `AGENT 04/09` |
| **05** | Deterministic Risk Prioritization Agent | Auditable Clearance & Risk Rules | `AGENT 05/09` |
| **06** | Guideline Provenance & Citations Agent | Safety Guideline Matcher & Citations | `AGENT 06/09` |
| **07** | Verification & Guardrail Agent | Rule R1 Fail-Closed Auditor | `AGENT 07/09` |
| **08** | Safety Report Synthesis Agent | Trilingual Report Synthesis (EN, KN, HI) | `AGENT 08/09` |
| **09** | Caregiver Notification & Dispatch Agent | Telegram Alert Coordinator & Cooldown | `AGENT 09/09` |

### Telemetry Displays in the UI:
- **Viewfinder HUD Overlay**: During photo capture or live stream analysis, a floating HUD card appears directly on top of the camera viewfinder with the active agent's name, role, and task description.
- **Pipeline Strip**: A dedicated status strip indicates which agent is active with an animated pulsing aura and step number. Clicking any agent opens a detailed inspection tooltip.
- **Agent Workflow Page (`/workflow`)**: Full topology view of the compiled LangGraph architecture with real run latencies, attempt counts, and verification fail-closed guarantees.

---

## 🌐 Instant Trilingual Switching & Multi-Page PDF

- **Instant Language Switching**: Toggle between English, Kannada (ಕನ್ನಡ), and Hindi (हिन्दी) in the top header. All UI labels, hazard categories, risk levels, and descriptions update immediately without rescanning.
- **Full Trilingual PDF Export**: Generates a complete, multi-page diagnostic safety report containing side-by-side English, Kannada, and Hindi translations, auditable rule IDs, guideline citations, and Rule R1 safety disclaimers.

---

## ⚙️ Requirements & Troubleshooting

- **Python**: 3.10, 3.11, 3.12, 3.13, or 3.14.
- **Gemini API Key**: Sentinel Lens will automatically guide you to input your free Gemini API key in the web settings dialog, or you can add it to `.env`:
  ```ini
  GEMINI_API_KEY=your_gemini_api_key_here
  ```
- **Rule R1 Safety Notice**: Sentinel Lens adheres to the strict fail-closed safety rule: It will *never* state that an area is "safe", "all clear", or "hazard-free". Findings are categorized as: `Hazards Detected`, `None Observed in Captured Area`, `Inconclusive / Limited View`, or `Failed Analysis`.
