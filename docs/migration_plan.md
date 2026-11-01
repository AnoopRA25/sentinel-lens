# Migration Plan: Legacy Architecture to Hazard Precaution Advisor v2

Date: 2026-11-01  
Subsystem: Hazard Precaution Advisor v2 (`/home/blue/anup`)  
Pattern: Strangler Fig Pattern (`PIPELINE_VERSION=v2|legacy`)

---

## 1. Objectives & Rationale

Hazard Precaution Advisor v2 represents a major architectural evolution from monolithic, black-box agent scripts to decoupled, deterministic, typed agents coordinated by a verified LangGraph workflow.

The core design goals of this migration are:
1. **Separation of Perception from Reasoning:** Monolithic vision steps in v1 did perception, hazard classification, and risk estimation in a single unconstrained model prompt. In v2, Agent 1 (Perception) is strictly person-agnostic visual observation; Agent 2 (Classification) deterministically maps and de-duplicates hazards; Agent 3 (Person Context) looks up human vulnerability factors; and Agent 4 (Risk Assessor) applies auditable deterministic rules.
2. **Rule Auditing & Ordinal Scores:** Replacing model hallucinated percentages with deterministic, IDed risk rules (`R-BASE-*`, `R-COMBO-*`).
3. **Verification & Self-Correction:** Agent 6 (Verification) checks safety contracts (V1 through V8) and triggers bounded re-checks before users ever receive an assessment.
4. **Resilience & Safe Fallbacks:** Non-negotiable rule R1 guarantees that failed or inconclusive analyses never claim safety.
5. **No Collisions with Package Names:** Ensuring entry points (`app/api.py`) do not collide with package subdirectories (`app/routes/`, `app/pipeline/`).

---

## 2. Module Mapping: Legacy vs. v2 Architecture

| Legacy Module (v1) | v2 Modules & Services | Responsibility Evolution |
|---|---|---|
| `app/scene_analyst.py` | `app/agents/scene_perception.py`<br>`app/agents/hazard_classifier.py`<br>`app/services/vision_service.py` | Perception is split into person-agnostic visual feature extraction with checklist sweeps (Agent 1) and deterministic taxonomy normalization, duplicate merging, and trigger gating (Agent 2). Vision model calls sit behind `VisionService` with fakes. |
| `app/risk_predictor.py` | `app/agents/person_context.py`<br>`app/agents/risk_assessor.py`<br>`data/person_profiles.json`<br>`data/risk_rules.json` | Replaced probabilistic risk guessing with static person profile vulnerability modifiers (Agent 3) and deterministic, auditable risk rule evaluation returning rule IDs (Agent 4). |
| `app/safety_advisor.py` | `app/agents/safety_knowledge.py`<br>`app/services/guideline_service.py`<br>`data/guidelines/safety_guidelines.json` | Precautions retrieved strictly from curated knowledge bases with priority ranking, text de-duplication, conflict resolution, and tiered fallbacks (never empty, never invented citations). |
| `app/reporter.py` | `app/agents/safety_report.py`<br>`app/services/translation_service.py`<br>`data/i18n/{en,kn,hi}.json` | Deterministic template-based structured reporting with strict R1 forbidden-phrase guard. Translation failures safely fall back to canonical English with error reporting. |
| `app/caregiver_alert.py` | `app/agents/caregiver_notification.py`<br>`app/services/notification_service.py` | Multi-criteria safety alerting policy (risk threshold, vulnerability gating, evidence clarity), SHA-1 hazard fingerprinting, 900s cooldown deduplication, and safe logging (zero token leaks). |
| `app/graph.py`<br>`app/state.py` | `app/pipeline/workflow.py`<br>`app/pipeline/state.py`<br>`app/pipeline/routing.py` | Replaced untyped dictionary state with strongly typed Pydantic/TypedDict `PipelineState`. LangGraph graph with bounded retries, explicit routing, and execution tracing. |
| `app/api.py` (monolithic) | `app/api.py` (entry point)<br>`app/routes/analyze.py`<br>`app/routes/jobs.py`<br>`app/routes/sessions.py`<br>`app/routes/system.py` | Preserves `app.api:app` import target for Uvicorn while modularizing endpoints cleanly under `app/routes/` to avoid Python package shadowing collisions. |
| *(None)* | `app/agents/verification.py` (Agent 6) | Introduced deterministic consistency checks (V1–V8), optional LLM critic, and bounded re-check loops. |
| *(None)* | `app/agents/session_aggregator.py` (Agent 9) | Session-level multi-frame aggregator for live camera and room sweeps with cross-frame Jaccard matching and bounded memory. |

---

## 3. Strangler Fig Switch: `PIPELINE_VERSION`

The application supports both pipeline versions during transition:
- `PIPELINE_VERSION=v2` (default): Uses the new LangGraph pipeline (`app/pipeline/workflow.py`).
- `PIPELINE_VERSION=legacy`: Routes to the legacy analysis pipeline for backward compatibility verification.

---

## 4. Migration Execution Phases

1. **Phase 0:** Audit, dependency inventory, and safety net documentation (`docs/audit.md`, `docs/migration_plan.md`).
2. **Phase 1:** Core schemas (`app/schemas/`), config guard (`app/core/config.py`), image ingest (`app/utils/image_ingest.py`), and fake vision service.
3. **Phase 2:** Agents 1 through 8 implementations with contract tests and fake services.
4. **Phase 3:** Recall engine, checklist sweeps, deep scan, evaluation harness (`evaluate_hazards.py`).
5. **Phase 4:** Hardened API routes (`/api/analyze`, `/api/jobs`, `/api/jobs/{id}/events`, `/api/sessions`).
6. **Phase 5–8:** Frontend scan experience, live camera sampling, session aggregator, history, and export.
7. **Phase 9:** Verification, doc-drift assertion, and documentation completion.
