"""End-to-end tests for the LangGraph workflow in Hazard Precaution Advisor v2.

Validates:
- End-to-end execution with FakeVisionService (ok route: hazards_found)
- Clean scene execution (none_observed route)
- Error routing to finalize_failed on model/key/timeout error
- Image quality or non-scene routing to finalize_inconclusive
- Bounded retry loop (MAX_RETRIES enforced, no infinite loop)
- Mermaid graph generation and doc drift assertion (skills.md S-39)
"""

import pytest

from app.pipeline.workflow import get_workflow_graph, run_pipeline
from app.schemas.api import AnalysisRequest
from app.schemas.enums import (
    ChecklistFindingStatus,
    EvidenceStrength,
    HazardStatus,
    Language,
    Mode,
    Outcome,
    PersonCategory,
    RiskLevel,
    Source,
)
from app.schemas.perception import (
    CandidateHazard,
    ChecklistFinding,
    EnvironmentInfo,
    PerceptionResult,
    QualityFlags,
)
from app.services.guideline_service import GuidelineService
from app.services.notification_service import FakeNotificationService
from app.services.translation_service import FakeTranslationService
from app.services.vision_service import FakeVisionService

# Minimal valid 1x1 JPEG bytes for testing
TINY_JPEG = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00"
    b"\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13"
    b"\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff"
    b"\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01"
    b"\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b"
    b"\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
)


class TestWorkflowExecution:
    """Test full LangGraph state transition and branching."""

    @pytest.mark.asyncio
    async def test_workflow_hazards_found_ok_route(self):
        fake_vision = FakeVisionService()  # Default has H03 and H01 hazards
        fake_notify = FakeNotificationService(should_succeed=True)
        fake_trans = FakeTranslationService()
        services = {
            "vision": fake_vision,
            "notification": fake_notify,
            "translation": fake_trans,
            "guideline": GuidelineService(),
        }

        req = AnalysisRequest(
            person_category=PersonCategory.child,
            language=Language.en,
            mode=Mode.quick,
            source=Source.photo,
        )

        report = await run_pipeline(request=req, image_bytes=TINY_JPEG, services=services)

        assert report.outcome == Outcome.hazards_found
        assert report.analysis_reliable is True
        assert len(report.hazards) >= 1
        assert report.overall_risk in (RiskLevel.medium, RiskLevel.high)
        # Verify trace contains execution nodes
        trace_nodes = {t.node for t in report.trace}
        assert "perceive" in trace_nodes or "classify" in trace_nodes

    @pytest.mark.asyncio
    async def test_workflow_clean_scene_none_observed_route(self):
        # Vision finds zero hazards with adequate quality
        clean_perception = PerceptionResult(
            environment=EnvironmentInfo(label="bedroom", confidence_band="high"),
            scene_summary="Clean, well-lit bedroom with clear floor.",
            objects=["bed", "nightstand"],
            candidate_hazards=[],
            checklist=[],
            quality=QualityFlags(blur=False, darkness=False, glare=False, framing=False),
            coverage_gaps=[],
        )
        fake_vision = FakeVisionService(canned_result=clean_perception)
        services = {
            "vision": fake_vision,
            "guideline": GuidelineService(),
        }

        req = AnalysisRequest(
            person_category=PersonCategory.adult,
            language=Language.en,
            mode=Mode.quick,
            source=Source.photo,
        )

        report = await run_pipeline(request=req, image_bytes=TINY_JPEG, services=services)

        assert report.outcome == Outcome.none_observed
        assert report.analysis_reliable is True
        assert len(report.hazards) == 0
        assert report.headline == "No hazards observed in this view"
        assert report.overall_risk == RiskLevel.low

    @pytest.mark.asyncio
    async def test_workflow_finalize_failed_route(self):
        # Missing API key or upstream error routes to finalize_failed
        fake_vision = FakeVisionService(simulate_error="missing_api_key", raise_exceptions=True)
        services = {"vision": fake_vision}

        req = AnalysisRequest(
            person_category=PersonCategory.baby,
            language=Language.en,
            mode=Mode.quick,
            source=Source.photo,
        )

        report = await run_pipeline(request=req, image_bytes=TINY_JPEG, services=services)

        assert report.outcome == Outcome.failed
        assert report.analysis_reliable is False
        assert report.outcome != Outcome.none_observed  # Non-negotiable Rule R1!
        assert len(report.hazards) == 0

    @pytest.mark.asyncio
    async def test_workflow_finalize_inconclusive_route(self):
        # Non-scene input (screenshot, blank) routes to finalize_inconclusive
        fake_vision = FakeVisionService(simulate_error="non_scene")
        services = {"vision": fake_vision}

        req = AnalysisRequest(
            person_category=PersonCategory.elderly,
            language=Language.en,
            mode=Mode.quick,
            source=Source.photo,
        )

        report = await run_pipeline(request=req, image_bytes=TINY_JPEG, services=services)

        assert report.outcome == Outcome.inconclusive
        assert report.outcome != Outcome.none_observed

    @pytest.mark.asyncio
    async def test_workflow_retry_loop_bounding(self):
        # Even if verification triggers re-check, workflow must terminate within MAX_RETRIES (1)
        fake_vision = FakeVisionService()
        services = {"vision": fake_vision}

        req = AnalysisRequest(
            person_category=PersonCategory.child,
            language=Language.en,
            mode=Mode.quick,
            source=Source.photo,
        )

        report = await run_pipeline(request=req, image_bytes=TINY_JPEG, services=services)
        assert report.verification.retries_used <= 1


class TestMermaidGraphDrift:
    """Validate that the compiled graph topology matches agent.md §4.1 specifications."""

    def test_mermaid_graph_nodes_and_edges(self):
        graph = get_workflow_graph()
        mermaid_text = graph.get_graph().draw_mermaid()

        # All canonical nodes from agent.md §4.1 must exist in compiled graph
        expected_nodes = [
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

        for node in expected_nodes:
            assert f"{node}(" in mermaid_text or f"{node};" in mermaid_text, (
                f"Architecture drift: node '{node}' is missing from the compiled LangGraph workflow!"
            )

        # Key transitions must exist
        assert "perceive -.-> classify" in mermaid_text or "perceive --> classify" in mermaid_text
        assert "verify -.-> report" in mermaid_text or "verify --> report" in mermaid_text
        assert "verify -.-> perceive" in mermaid_text  # Retry edge
