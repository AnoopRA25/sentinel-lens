"""Unit and integration tests for LangGraph Pipeline workflow and routing.

Tests:
- PipelineState TypedDict definition and reducers
- Routing logic (route_after_perception, route_after_verification)
- Graph compilation, node topology, and Mermaid diagram generation
- Node trace wrapper (@traced_node)
- End-to-end async pipeline execution with services and fallbacks
- Non-negotiable Rule R1 compliance across all execution paths
"""
from __future__ import annotations

import io
import pytest
from PIL import Image

from app.pipeline import (
    PipelineState,
    create_initial_state,
    get_workflow_graph,
    route_after_perception,
    route_after_verification,
    run_pipeline,
    traced_node,
)
from app.schemas import (
    AnalysisRequest,
    CandidateHazard,
    EnvironmentInfo,
    EvidenceStrength,
    Hazard,
    HazardStatus,
    Language,
    Outcome,
    PerceptionResult,
    PersonCategory,
    QualityFlags,
    RiskAssessment,
    RiskLevel,
    SafetyReport,
    VerifyStatus,
    VerificationResult,
)


def _make_dummy_image_bytes(width: int = 100, height: int = 100) -> bytes:
    """Create JPEG image bytes for testing."""
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(100, 150, 200))
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# 1. State Tests
# ---------------------------------------------------------------------------

def test_pipeline_state_fields():
    """Verify PipelineState specifies all 15 required typed fields."""
    expected_fields = {
        "request",
        "image",
        "perception",
        "hazards",
        "person_context",
        "risks",
        "precautions",
        "verification",
        "report",
        "notification",
        "retries_used",
        "retry_focus",
        "errors",
        "trace",
        "outcome",
    }
    assert expected_fields.issubset(set(PipelineState.__annotations__.keys()))


def test_create_initial_state():
    """Verify initial state helper builds valid clean state."""
    req = AnalysisRequest(person_category=PersonCategory.baby, language=Language.en)
    state = create_initial_state(req)
    assert state["request"] == req
    assert state["image"] is None
    assert state["hazards"] == []
    assert state["retries_used"] == 0
    assert state["errors"] == []
    assert state["trace"] == []
    assert state["outcome"] is None


# ---------------------------------------------------------------------------
# 2. Routing Tests
# ---------------------------------------------------------------------------

def test_route_after_perception_failed():
    """Routing should route to 'finalize_failed' on errors or None perception."""
    req = AnalysisRequest()

    # Case 1: errors in state
    state1: PipelineState = create_initial_state(req)
    state1["errors"] = ["Upstream timeout"]
    assert route_after_perception(state1) == "finalize_failed"

    # Case 2: perception is None
    state2: PipelineState = create_initial_state(req)
    state2["perception"] = None
    assert route_after_perception(state2) == "finalize_failed"

    # Case 3: perception contains errors
    state3: PipelineState = create_initial_state(req)
    state3["perception"] = PerceptionResult(
        environment=EnvironmentInfo(label="kitchen"),
        scene_summary="Error",
        errors=["Model quota exhausted"],
    )
    assert route_after_perception(state3) == "finalize_failed"


def test_route_after_perception_inconclusive():
    """Routing should route to 'finalize_inconclusive' if environment is unknown with no hazards."""
    req = AnalysisRequest()
    state: PipelineState = create_initial_state(req)
    state["perception"] = PerceptionResult(
        environment=EnvironmentInfo(label="unknown"),
        scene_summary="Unclear scene",
        candidate_hazards=[],
    )
    assert route_after_perception(state) == "finalize_inconclusive"


def test_route_after_perception_classify():
    """Routing should route to 'classify' when perception is valid."""
    req = AnalysisRequest()
    state: PipelineState = create_initial_state(req)
    state["perception"] = PerceptionResult(
        environment=EnvironmentInfo(label="kitchen"),
        scene_summary="Kitchen with stove",
        candidate_hazards=[],
    )
    assert route_after_perception(state) == "classify"


def test_route_after_verification_fallback():
    """Routing should route to 'report' if verification status is failed_fallback."""
    req = AnalysisRequest()
    state: PipelineState = create_initial_state(req)
    state["verification"] = VerificationResult(
        status=VerifyStatus.failed_fallback,
        issues=["Critical mismatch"],
        retries_used=0,
    )
    assert route_after_verification(state) == "report"


def test_route_after_verification_retry():
    """Routing should route to 'perceive' if issues exist and retries_used < 1."""
    req = AnalysisRequest()
    state: PipelineState = create_initial_state(req)
    state["retries_used"] = 0
    state["verification"] = VerificationResult(
        status=VerifyStatus.passed_with_changes,
        issues=["Missing trigger for possible hazard"],
        retries_used=0,
    )
    assert route_after_verification(state) == "perceive"


def test_route_after_verification_retries_exhausted():
    """Routing should route to 'report' once retries_used >= 1, even if issues exist."""
    req = AnalysisRequest()
    state: PipelineState = create_initial_state(req)
    state["retries_used"] = 1
    state["verification"] = VerificationResult(
        status=VerifyStatus.passed_with_changes,
        issues=["Missing trigger"],
        retries_used=1,
    )
    assert route_after_verification(state) == "report"


def test_route_after_verification_passed():
    """Routing should route to 'report' when verification passed without issues."""
    req = AnalysisRequest()
    state: PipelineState = create_initial_state(req)
    state["verification"] = VerificationResult(
        status=VerifyStatus.passed,
        issues=[],
        retries_used=0,
    )
    assert route_after_verification(state) == "report"


# ---------------------------------------------------------------------------
# 3. Workflow Graph & Architecture Tests
# ---------------------------------------------------------------------------

def test_workflow_graph_compilation():
    """Verify get_workflow_graph compiles cleanly and exposes all 12 nodes."""
    graph = get_workflow_graph()
    assert graph is not None

    mermaid = graph.get_graph().draw_mermaid()
    assert isinstance(mermaid, str)
    assert len(mermaid) > 0

    # Ensure all required node names appear in the architecture diagram
    required_nodes = [
        "ingest",
        "perceive",
        "classify",
        "person_context",
        "assess_risk",
        "retrieve_guidelines",
        "verify",
        "report",
        "notify",
        "finalize",
        "finalize_failed",
        "finalize_inconclusive",
    ]
    for node in required_nodes:
        assert node in mermaid, f"Node '{node}' missing from compiled graph mermaid"


# ---------------------------------------------------------------------------
# 4. Trace Decorator Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_traced_node_decorator_success():
    """Verify traced decorator records started and finished events with duration."""
    @traced_node("test_unit")
    async def sample_node(state: PipelineState):
        return {"hazards": []}

    req = AnalysisRequest()
    state = create_initial_state(req)
    res = await sample_node(state)

    trace = res.get("trace", [])
    assert len(trace) >= 2
    started = trace[0]
    finished = trace[1]

    assert started["type"] == "node_started"
    assert started["node"] == "test_unit"
    assert finished["type"] == "node_finished"
    assert finished["node"] == "test_unit"
    assert finished["duration_ms"] >= 0.0


@pytest.mark.asyncio
async def test_traced_node_decorator_failure():
    """Verify traced decorator catches unhandled exceptions and logs node_failed event."""
    @traced_node("failing_node")
    async def failing_node(state: PipelineState):
        raise ValueError("Simulated node crash")

    req = AnalysisRequest()
    state = create_initial_state(req)
    res = await failing_node(state)

    assert "errors" in res
    assert any("Simulated node crash" in err for err in res["errors"])

    trace = res.get("trace", [])
    assert len(trace) == 2
    failed_evt = trace[1]
    assert failed_evt["type"] == "node_failed"
    assert failed_evt["node"] == "failing_node"
    assert failed_evt["status"] == "error"


# ---------------------------------------------------------------------------
# 5. End-to-End Execution & Rule R1 Compliance Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_pipeline_clean_image():
    """Verify run_pipeline with valid image returns SafetyReport adhering to R1."""
    class CleanVision:
        async def perceive(self, image, mode, retry_focus=None):
            return PerceptionResult(
                environment=EnvironmentInfo(label="living_room"),
                scene_summary="A clean living room with hardwood floors.",
                candidate_hazards=[],
                errors=[],
            )

    image_bytes = _make_dummy_image_bytes(200, 200)
    req = AnalysisRequest(person_category=PersonCategory.elderly, language=Language.en)
    services = {"vision_service": CleanVision()}

    report = await run_pipeline(req, image_bytes, services=services)
    assert isinstance(report, SafetyReport)
    assert report.outcome in (Outcome.none_observed, Outcome.hazards_found, Outcome.inconclusive)
    assert report.person_category == PersonCategory.elderly

    # Rule R1: Never claims safe, no danger, or all clear
    summary = report.scene.summary.lower()
    assert "all clear" not in summary
    assert "no danger" not in summary
    assert "completely safe" not in summary
    assert "totally safe" not in summary


@pytest.mark.asyncio
async def test_run_pipeline_routes_to_failed():
    """Verify run_pipeline routes to finalize_failed when vision service reports error."""
    class FailingVision:
        async def perceive(self, image, mode, retry_focus):
            return PerceptionResult(
                environment=EnvironmentInfo(label="unknown"),
                scene_summary="",
                errors=["API Key Invalid or Quota Exceeded"],
            )

    image_bytes = _make_dummy_image_bytes(100, 100)
    req = AnalysisRequest()
    services = {"vision_service": FailingVision()}

    report = await run_pipeline(req, image_bytes, services=services)
    assert isinstance(report, SafetyReport)
    assert report.outcome == Outcome.failed
    assert report.analysis_reliable is False
    assert any("API Key Invalid" in err for err in report.errors)

    # Rule R1: Failed analysis must never show safe
    summary = report.scene.summary.lower()
    assert "all clear" not in summary
    assert "no danger" not in summary
    assert "safe" not in summary


@pytest.mark.asyncio
async def test_run_pipeline_routes_to_inconclusive():
    """Verify run_pipeline routes to finalize_inconclusive when environment is unknown."""
    class InconclusiveVision:
        async def perceive(self, image, mode, retry_focus):
            return PerceptionResult(
                environment=EnvironmentInfo(label="unknown"),
                scene_summary="Blank frame",
                candidate_hazards=[],
                errors=[],
            )

    image_bytes = _make_dummy_image_bytes(100, 100)
    req = AnalysisRequest()
    services = {"vision_service": InconclusiveVision()}

    report = await run_pipeline(req, image_bytes, services=services)
    assert isinstance(report, SafetyReport)
    assert report.outcome == Outcome.inconclusive
    assert report.analysis_reliable is False


@pytest.mark.asyncio
async def test_run_pipeline_retry_mechanism():
    """Verify pipeline retries perception when verification detects issues and bounds retries."""
    call_count = 0

    class RetryingVision:
        async def perceive(self, image, mode, retry_focus):
            nonlocal call_count
            call_count += 1
            return PerceptionResult(
                environment=EnvironmentInfo(label="living_room"),
                scene_summary="Living room",
                candidate_hazards=[
                    CandidateHazard(
                        raw_title="Loose rug",
                        category_hint="H01",
                        description="Loose rug on hardwood",
                        evidence=["A curved rug edge on slippery wood"],
                        visibility=EvidenceStrength.clear,
                    )
                ],
                errors=[],
            )

    verify_count = 0

    class FlaggingVerifier:
        def verify(self, state: PipelineState):
            nonlocal verify_count
            verify_count += 1
            if verify_count == 1:
                # First time: flag an issue to trigger retry
                return VerificationResult(
                    status=VerifyStatus.passed_with_changes,
                    issues=["Re-check rug orientation"],
                    retries_used=state.get("retries_used", 0),
                )
            else:
                # Second time (after retry): pass cleanly
                return VerificationResult(
                    status=VerifyStatus.passed,
                    issues=[],
                    retries_used=state.get("retries_used", 0),
                )

    image_bytes = _make_dummy_image_bytes(100, 100)
    req = AnalysisRequest()
    services = {
        "vision_service": RetryingVision(),
        "verification_service": FlaggingVerifier(),
    }

    report = await run_pipeline(req, image_bytes, services=services)
    assert isinstance(report, SafetyReport)
    # Perception was called twice: initial + 1 bounded retry
    assert call_count == 2
    assert verify_count == 2
    assert report.outcome == Outcome.hazards_found
