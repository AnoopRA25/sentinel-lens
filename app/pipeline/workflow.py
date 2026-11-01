"""LangGraph workflow definition for Hazard Precaution Advisor v2.

Builds and compiles the StateGraph pipeline with nodes:
ingest -> perceive -> classify -> person_context -> assess_risk ->
retrieve_guidelines -> verify -> report -> notify -> finalize.

Branching:
- perceive -> [classify, finalize_failed, finalize_inconclusive]
- verify -> [report, perceive (on retry)]

Includes:
- Trace wrapper recording duration_ms, node_started, node_finished, node_failed
- get_workflow_graph() supporting .get_graph().draw_mermaid()
- async run_pipeline(request, image_bytes, services) -> SafetyReport
"""
from __future__ import annotations

import asyncio
import functools
import inspect
import io
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from PIL import Image, ImageOps
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from app.pipeline.routing import route_after_perception, route_after_verification
from app.pipeline.state import PipelineState, create_initial_state
from app.schemas.api import AnalysisRequest
from app.schemas.enums import (
    HazardStatus,
    Language,
    NotifyStatus,
    Outcome,
    PersonCategory,
    RiskLevel,
    VerifyStatus,
)
from app.schemas.hazard import Hazard
from app.schemas.image import PreparedImage
from app.schemas.notification import NotificationRecord
from app.schemas.perception import EnvironmentInfo, PerceptionResult, QualityFlags
from app.schemas.person_context import PersonContext
from app.schemas.precaution import Precaution
from app.schemas.report import ReportScene, SafetyReport, TraceEvent
from app.schemas.risk import RiskAssessment
from app.schemas.verification import VerificationResult


def _get_services(config: RunnableConfig) -> dict[str, Any]:
    """Extract services dict from RunnableConfig if available."""
    if config and isinstance(config, dict):
        configurable = config.get("configurable", {})
        if isinstance(configurable, dict):
            return configurable.get("services", {}) or {}
    return {}


def traced_node(node_name: str):
    """Decorator for pipeline nodes that tracks started, finished, and failed events in state['trace'].

    Records:
    - node_started: when execution begins
    - node_finished: when execution completes successfully, with duration_ms
    - node_failed: if an exception occurs, with duration_ms and error details
    """
    def decorator(fn: Callable):
        if inspect.iscoroutinefunction(fn):
            @functools.wraps(fn)
            async def async_wrapper(state: PipelineState, *args, **kwargs) -> dict[str, Any]:
                start_perf = time.perf_counter()
                start_iso = datetime.now(timezone.utc).isoformat()
                attempt = state.get("retries_used", 0) + 1
                started_event = {
                    "type": "node_started",
                    "node": node_name,
                    "status": "ok",
                    "attempt": attempt,
                    "ts": start_iso,
                }
                try:
                    res = await fn(state, *args, **kwargs)
                    duration_ms = round((time.perf_counter() - start_perf) * 1000, 2)
                    end_iso = datetime.now(timezone.utc).isoformat()
                    finished_event = {
                        "type": "node_finished",
                        "node": node_name,
                        "status": "ok",
                        "attempt": attempt,
                        "ts": end_iso,
                        "duration_ms": duration_ms,
                    }
                    if not isinstance(res, dict):
                        res = {}
                    existing_trace = res.get("trace", [])
                    res["trace"] = [started_event, finished_event] + existing_trace
                    return res
                except Exception as exc:
                    duration_ms = round((time.perf_counter() - start_perf) * 1000, 2)
                    fail_iso = datetime.now(timezone.utc).isoformat()
                    err_msg = f"{type(exc).__name__}: {str(exc)}"
                    failed_event = {
                        "type": "node_failed",
                        "node": node_name,
                        "status": "error",
                        "attempt": attempt,
                        "ts": fail_iso,
                        "duration_ms": duration_ms,
                        "summary": err_msg,
                    }
                    return {
                        "trace": [started_event, failed_event],
                        "errors": [err_msg],
                    }
            return async_wrapper
        else:
            @functools.wraps(fn)
            def sync_wrapper(state: PipelineState, *args, **kwargs) -> dict[str, Any]:
                start_perf = time.perf_counter()
                start_iso = datetime.now(timezone.utc).isoformat()
                attempt = state.get("retries_used", 0) + 1
                started_event = {
                    "type": "node_started",
                    "node": node_name,
                    "status": "ok",
                    "attempt": attempt,
                    "ts": start_iso,
                }
                try:
                    res = fn(state, *args, **kwargs)
                    duration_ms = round((time.perf_counter() - start_perf) * 1000, 2)
                    end_iso = datetime.now(timezone.utc).isoformat()
                    finished_event = {
                        "type": "node_finished",
                        "node": node_name,
                        "status": "ok",
                        "attempt": attempt,
                        "ts": end_iso,
                        "duration_ms": duration_ms,
                    }
                    if not isinstance(res, dict):
                        res = {}
                    existing_trace = res.get("trace", [])
                    res["trace"] = [started_event, finished_event] + existing_trace
                    return res
                except Exception as exc:
                    duration_ms = round((time.perf_counter() - start_perf) * 1000, 2)
                    fail_iso = datetime.now(timezone.utc).isoformat()
                    err_msg = f"{type(exc).__name__}: {str(exc)}"
                    failed_event = {
                        "type": "node_failed",
                        "node": node_name,
                        "status": "error",
                        "attempt": attempt,
                        "ts": fail_iso,
                        "duration_ms": duration_ms,
                        "summary": err_msg,
                    }
                    return {
                        "trace": [started_event, failed_event],
                        "errors": [err_msg],
                    }
            return sync_wrapper
    return decorator


# ---------------------------------------------------------------------------
# Node Functions
# ---------------------------------------------------------------------------

@traced_node("ingest")
async def node_ingest(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    """Ingest, validate, clean EXIF, and decode raw image into PreparedImage."""
    services = _get_services(config)
    image = state.get("image")
    if image is not None and isinstance(image, PreparedImage):
        return {"image": image}

    raw_bytes = services.get("image_bytes")
    if raw_bytes is None and image and hasattr(image, "data"):
        raw_bytes = image.data

    if not raw_bytes:
        return {"errors": ["Ingest failed: empty image bytes"]}

    try:
        img = Image.open(io.BytesIO(raw_bytes))
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        out_buf = io.BytesIO()
        img.save(out_buf, format="JPEG", quality=85)
        clean_bytes = out_buf.getvalue()

        prepared = PreparedImage(
            data=clean_bytes,
            format="JPEG",
            width=img.width,
            height=img.height,
            original_size_bytes=len(raw_bytes),
        )
        return {"image": prepared}
    except Exception as exc:
        return {"errors": [f"Image ingestion/decoding failed: {str(exc)}"]}


@traced_node("perceive")
async def node_perceive(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    """Perform scene perception via vision service or fallback."""
    services = _get_services(config)
    image = state.get("image")
    req = state.get("request")
    retries_used = state.get("retries_used", 0)

    # If verification previously flagged issues, this run counts as a consumed retry
    if state.get("verification") is not None:
        retries_used += 1

    raw_vision = (
        services.get("scene_perception")
        or services.get("vision_service")
        or services.get("vision")
    )
    if not raw_vision:
        from app.core.config import get_settings
        settings = get_settings()
        if settings.gemini_configured:
            from app.services.vision_service import GeminiVisionService
            raw_vision = GeminiVisionService(
                api_key=settings.GEMINI_API_KEY,
                model=settings.GEMINI_MODEL,
                timeout_seconds=settings.GEMINI_TIMEOUT_SECONDS,
            )
        else:
            from app.services.vision_service import FakeVisionService
            raw_vision = FakeVisionService(simulate_error="missing_api_key")

    if raw_vision:
        from app.agents.scene_perception import ScenePerceptionAgent
        from app.services.vision_service import VisionService
        retry_focus = state.get("retry_focus", [])
        mode = req.mode if req else "quick"
        if isinstance(raw_vision, VisionService):
            perception_agent = ScenePerceptionAgent(vision_service=raw_vision)
            result = await perception_agent.perceive(image, mode=mode, retry_focus=retry_focus)
        elif hasattr(raw_vision, "perceive"):
            fn = raw_vision.perceive
            if inspect.iscoroutinefunction(fn):
                result = await fn(image, mode=mode, retry_focus=retry_focus)
            else:
                result = fn(image, mode=mode, retry_focus=retry_focus)
        elif inspect.iscoroutinefunction(raw_vision):
            result = await raw_vision(image, mode=mode, retry_focus=retry_focus)
        else:
            result = raw_vision(image, mode=mode, retry_focus=retry_focus)
        return {"perception": result, "retries_used": retries_used}


@traced_node("classify")
async def node_classify(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    """Turn raw perception candidates into structured, deduplicated Hazard items."""
    services = _get_services(config)
    classifier = services.get("hazard_classifier")
    perception = state.get("perception")

    if not classifier:
        from app.agents.hazard_classifier import HazardClassifierAgent
        classifier = HazardClassifierAgent()

    if classifier:
        fn = classifier.classify if hasattr(classifier, "classify") else classifier
        if inspect.iscoroutinefunction(fn):
            raw_res = await fn(perception)
        else:
            raw_res = fn(perception)
        hazards = raw_res.hazards if hasattr(raw_res, "hazards") else raw_res
        return {"hazards": hazards}

    hazards: list[Hazard] = []
    if perception and perception.candidate_hazards:
        for idx, cand in enumerate(perception.candidate_hazards, start=1):
            hazards.append(
                Hazard(
                    id=f"hz_{idx}",
                    category_id=cand.category_hint or "H15",
                    title=cand.raw_title,
                    status=HazardStatus.observed,
                    evidence_strength=cand.visibility,
                    evidence=cand.evidence if cand.evidence else [cand.description],
                    trigger=cand.trigger,
                )
            )
    return {"hazards": hazards}


@traced_node("person_context")
async def node_person_context(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    """Map hazard relevance and vulnerabilities for the specified person category."""
    services = _get_services(config)
    context_service = services.get("person_context_service")
    hazards = state.get("hazards", [])
    req = state.get("request")
    person_cat = req.person_category if req else PersonCategory.adult

    if not context_service:
        from app.agents.person_context import PersonContextAgent
        context_service = PersonContextAgent()

    if context_service:
        if hasattr(context_service, "contextualize"):
            fn = context_service.contextualize
        elif hasattr(context_service, "evaluate"):
            fn = context_service.evaluate
        else:
            fn = context_service

        if inspect.iscoroutinefunction(fn):
            res = await fn(hazards, person_cat)
        else:
            res = fn(hazards, person_cat)
        return {"person_context": res}

    ctx: dict[str, PersonContext] = {}
    for h in hazards:
        ctx[h.id] = PersonContext(
            relevance="normal",
            vulnerability_factors=[],
            severity_modifier=0,
            note=f"Context evaluated for {person_cat.value}",
        )
    return {"person_context": ctx}


@traced_node("assess_risk")
async def node_assess_risk(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    """Score risk levels (low, medium, high, uncertain) according to auditable rules."""
    services = _get_services(config)
    assessor = services.get("risk_assessor")
    hazards = list(state.get("hazards", []))
    person_context = state.get("person_context", {})

    if not assessor:
        from app.agents.risk_assessor import RiskAssessorAgent
        assessor = RiskAssessorAgent()

    if assessor:
        fn = assessor.assess if hasattr(assessor, "assess") else assessor
        if inspect.iscoroutinefunction(fn):
            res = await fn(hazards, person_context)
        else:
            res = fn(hazards, person_context)
        # res can be RiskResult or dict
        if hasattr(res, "risks"):
            return {"risks": res.risks, "hazards": hazards, "overall_risk": res.overall_risk, "immediate_action": res.immediate_action}
        return res

    risks: dict[str, RiskAssessment] = {}
    for h in hazards:
        risk = RiskAssessment(
            level=RiskLevel.medium,
            potential_level=None,
            rule_ids=["R-BASE-DEFAULT"],
            rationale=f"Standard risk evaluation for {h.title}",
        )
        risks[h.id] = risk
        h.risk = risk
    return {"risks": risks, "hazards": hazards}


@traced_node("retrieve_guidelines")
async def node_retrieve_guidelines(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    """Retrieve actionable precautions from safety knowledge base for detected hazards."""
    services = _get_services(config)
    guideline_service = services.get("guideline_service") or services.get("safety_knowledge")
    hazards = list(state.get("hazards", []))
    req = state.get("request")
    person_cat = req.person_category if req else PersonCategory.adult

    if not guideline_service:
        from app.services.guideline_service import GuidelineService
        from app.agents.safety_knowledge import SafetyKnowledgeAgent
        guideline_service = SafetyKnowledgeAgent(guideline_service=GuidelineService())

    if guideline_service:
        if hasattr(guideline_service, "retrieve_precautions_for_hazards"):
            fn = guideline_service.retrieve_precautions_for_hazards
        elif hasattr(guideline_service, "retrieve"):
            fn = guideline_service.retrieve
        else:
            fn = guideline_service

        if inspect.iscoroutinefunction(fn):
            precautions = await fn(hazards, person_cat)
        else:
            precautions = fn(hazards, person_cat)

        for h in hazards:
            if h.id in precautions:
                h.precautions = precautions[h.id]
        return {"precautions": precautions, "hazards": hazards}

    precautions: dict[str, list[Precaution]] = {}
    for h in hazards:
        p_list = [
            Precaution(
                text="Exercise caution and keep a safe distance from this hazard.",
                provenance="generic",
                priority=1,
            )
        ]
        precautions[h.id] = p_list
        h.precautions = p_list
    return {"precautions": precautions, "hazards": hazards}


@traced_node("verify")
async def node_verify(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    """Execute deterministic consistency checks V1-V8 and critic verification."""
    services = _get_services(config)
    verifier = services.get("verification_service")

    if verifier:
        fn = verifier.verify if hasattr(verifier, "verify") else verifier
        if inspect.iscoroutinefunction(fn):
            res = await fn(state)
        else:
            res = fn(state)
        return {"verification": res}

    from app.agents.verification import verification_node
    return verification_node(state)


@traced_node("report")
async def node_report(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    """Generate final verified SafetyReport respecting Rule R1."""
    services = _get_services(config)
    reporter = services.get("report_generator")

    if reporter:
        if hasattr(reporter, "assemble_report"):
            rep = await reporter.assemble_report(state)
        elif hasattr(reporter, "generate"):
            fn = reporter.generate
            rep = await fn(state) if inspect.iscoroutinefunction(fn) else fn(state)
        elif inspect.iscoroutinefunction(reporter):
            rep = await reporter(state)
        else:
            rep = reporter(state)
        return {"report": rep, "outcome": rep.outcome}

    trans_svc = services.get("translation_service") or services.get("translation")
    from app.agents.safety_report import safety_report_node
    return await safety_report_node(state, translation_service=trans_svc)


@traced_node("notify")
async def node_notify(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    """Dispatch alert notification to caregiver if policies are satisfied."""
    services = _get_services(config)
    notifier = services.get("notification_service")

    if notifier:
        fn = notifier.notify if hasattr(notifier, "notify") else notifier
        if inspect.iscoroutinefunction(fn):
            notif = await fn(state)
        else:
            notif = fn(state)
        report = state.get("report")
        if report:
            report.notification = notif
        return {"notification": notif}

    from app.agents.caregiver_notification import caregiver_notification_node
    return await caregiver_notification_node(state)


@traced_node("finalize")
async def node_finalize(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    """Finalize successful analysis execution and persist state."""
    report = state.get("report")
    return {"report": report}


@traced_node("finalize_failed")
async def node_finalize_failed(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    """Build failed report when fatal error occurred during analysis."""
    req = state.get("request")
    errors = list(state.get("errors", []))
    perception = state.get("perception")

    if perception and perception.errors:
        errors.extend(perception.errors)

    if not errors:
        errors.append("Scene perception failed or produced invalid output.")

    report_id = f"an_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:4]}"
    ts_str = datetime.now(timezone.utc).isoformat()

    summary_msg = "Analysis failed: unable to assess scene."
    cov_gaps = ["Scene could not be analyzed due to processing error."]
    limits_msg = "Analysis could not be completed reliably."

    if any("missing_api_key" in str(e) for e in errors):
        summary_msg = "Analysis could not run: GEMINI_API_KEY is not configured in backend .env. Please configure your Gemini API key in Settings to scan physical camera photos for hazards."
        cov_gaps = ["AI Vision model inactive: GEMINI_API_KEY is missing."]
        limits_msg = "To analyze custom camera photos, configure your GEMINI_API_KEY in Settings or .env. This is not a safe result."

    report = SafetyReport(
        id=report_id,
        timestamp=ts_str,
        outcome=Outcome.failed,
        analysis_reliable=False,
        person_category=req.person_category if req else PersonCategory.adult,
        language=req.language if req else Language.en,
        scene=ReportScene(
            environment="unknown",
            summary=summary_msg,
            quality_flags=[],
            coverage_gaps=cov_gaps,
        ),
        hazards=[],
        overall_risk=RiskLevel.uncertain,
        immediate_action=False,
        verification=VerificationResult(
            status=VerifyStatus.failed_fallback,
            issues=["Analysis failed prior to verification"],
            retries_used=state.get("retries_used", 0),
        ),
        notification=NotificationRecord(
            status=NotifyStatus.disabled,
            reason="Analysis failed; notifications withheld.",
        ),
        errors=errors,
        trace=[],
        limits=limits_msg,
    )
    return {"report": report, "outcome": Outcome.failed}


@traced_node("finalize_inconclusive")
async def node_finalize_inconclusive(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    """Build inconclusive report when image framing or quality prevents hazard identification."""
    req = state.get("request")
    errors = list(state.get("errors", []))
    perception = state.get("perception")

    cov_gaps = perception.coverage_gaps if perception else []
    if not cov_gaps:
        cov_gaps = ["Image quality, lighting, or framing insufficient for hazard assessment."]

    report_id = f"an_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:4]}"
    ts_str = datetime.now(timezone.utc).isoformat()

    report = SafetyReport(
        id=report_id,
        timestamp=ts_str,
        outcome=Outcome.inconclusive,
        analysis_reliable=False,
        person_category=req.person_category if req else PersonCategory.adult,
        language=req.language if req else Language.en,
        scene=ReportScene(
            environment="unknown",
            summary="Analysis inconclusive: unable to assess scene.",
            quality_flags=perception.quality.to_flag_list() if perception and perception.quality else [],
            coverage_gaps=cov_gaps,
        ),
        hazards=[],
        overall_risk=RiskLevel.uncertain,
        immediate_action=False,
        verification=VerificationResult(
            status=VerifyStatus.failed_fallback,
            issues=["Inconclusive perception; hazards cannot be verified"],
            retries_used=state.get("retries_used", 0),
        ),
        notification=NotificationRecord(
            status=NotifyStatus.disabled,
            reason="Analysis inconclusive; notifications withheld.",
        ),
        errors=errors,
        trace=[],
        limits="Analysis inconclusive: scene details could not be identified.",
    )
    return {"report": report, "outcome": Outcome.inconclusive}


# ---------------------------------------------------------------------------
# Graph Construction & Pipeline Runner
# ---------------------------------------------------------------------------

def build_workflow_graph(services: dict | None = None):
    """Build and compile the LangGraph StateGraph pipeline for hazard analysis."""
    builder = StateGraph(PipelineState)

    # 1. Register all 12 nodes
    builder.add_node("ingest", node_ingest)
    builder.add_node("perceive", node_perceive)
    builder.add_node("classify", node_classify)
    builder.add_node("person_context", node_person_context)
    builder.add_node("assess_risk", node_assess_risk)
    builder.add_node("retrieve_guidelines", node_retrieve_guidelines)
    builder.add_node("verify", node_verify)
    builder.add_node("report", node_report)
    builder.add_node("notify", node_notify)
    builder.add_node("finalize", node_finalize)
    builder.add_node("finalize_failed", node_finalize_failed)
    builder.add_node("finalize_inconclusive", node_finalize_inconclusive)

    # 2. Wire sequential and branching edges
    builder.add_edge(START, "ingest")
    builder.add_edge("ingest", "perceive")

    builder.add_conditional_edges(
        "perceive",
        route_after_perception,
        {
            "classify": "classify",
            "finalize_failed": "finalize_failed",
            "finalize_inconclusive": "finalize_inconclusive",
        },
    )

    builder.add_edge("classify", "person_context")
    builder.add_edge("person_context", "assess_risk")
    builder.add_edge("assess_risk", "retrieve_guidelines")
    builder.add_edge("retrieve_guidelines", "verify")

    builder.add_conditional_edges(
        "verify",
        route_after_verification,
        {
            "report": "report",
            "perceive": "perceive",
        },
    )

    builder.add_edge("report", "notify")
    builder.add_edge("notify", "finalize")
    builder.add_edge("finalize", END)
    builder.add_edge("finalize_failed", END)
    builder.add_edge("finalize_inconclusive", END)

    return builder.compile()


_CACHED_WORKFLOW_GRAPH = None


def get_workflow_graph(services: dict | None = None):
    """Return the compiled workflow graph supporting .get_graph().draw_mermaid().

    Caches the default graph for fast repeated calls and architecture diagram generation.
    """
    global _CACHED_WORKFLOW_GRAPH
    if services is not None:
        return build_workflow_graph(services)
    if _CACHED_WORKFLOW_GRAPH is None:
        _CACHED_WORKFLOW_GRAPH = build_workflow_graph()
    return _CACHED_WORKFLOW_GRAPH


async def run_pipeline(
    request: AnalysisRequest,
    image_bytes: bytes,
    services: dict | None = None,
) -> SafetyReport:
    """Execute the end-to-end hazard precaution analysis pipeline asynchronously.

    Args:
        request: AnalysisRequest containing person_category, language, mode, etc.
        image_bytes: Raw JPEG/PNG image data from camera or upload.
        services: Optional injected service instances (vision, guidelines, telegram, etc.).

    Returns:
        Verified SafetyReport adhering to Rule R1 and shared schema.
    """
    svc = dict(services or {})
    svc["image_bytes"] = image_bytes

    graph = get_workflow_graph(services=svc)
    initial_state = create_initial_state(request)

    final_state = await graph.ainvoke(
        initial_state,
        config={"configurable": {"services": svc}},
    )

    report = final_state.get("report")
    if report is not None and isinstance(report, SafetyReport):
        return report

    outcome = final_state.get("outcome", Outcome.failed)
    return SafetyReport(
        id=f"an_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:4]}",
        timestamp=datetime.now(timezone.utc).isoformat(),
        outcome=outcome,
        analysis_reliable=False,
        person_category=request.person_category,
        language=request.language,
        scene=ReportScene(
            environment="unknown",
            summary="Analysis failed: incomplete pipeline execution.",
            coverage_gaps=["Pipeline returned without final report."],
        ),
        hazards=[],
        overall_risk=RiskLevel.uncertain,
        immediate_action=False,
        verification=VerificationResult(
            status=VerifyStatus.failed_fallback,
            issues=["Incomplete pipeline execution"],
        ),
        notification=NotificationRecord(
            status=NotifyStatus.disabled,
            reason="Pipeline incomplete.",
        ),
        errors=list(final_state.get("errors", ["Incomplete pipeline execution"])),
        trace=[],
        limits="Assessment could not be reliably produced.",
    )
