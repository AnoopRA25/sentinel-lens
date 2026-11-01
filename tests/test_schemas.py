"""Tests for typed Pydantic schemas and enums."""

import pytest
from pydantic import ValidationError

from app.schemas import (
    AggregatedHazard,
    AnalysisRequest,
    AnalysisResult,
    CandidateHazard,
    ChecklistFinding,
    ChecklistFindingStatus,
    EnvironmentInfo,
    ErrorInfo,
    EvidenceStrength,
    Hazard,
    HazardAudit,
    HazardClassificationResult,
    HazardStatus,
    JobStatus,
    JobStatusEnum,
    Language,
    Mode,
    NotificationRecord,
    NotifyStatus,
    Outcome,
    PerceptionResult,
    PersonCategory,
    PersonContext,
    Precaution,
    PrecautionProvenance,
    PreparedImage,
    QualityFlags,
    RelevanceLevel,
    ReportScene,
    RiskAssessment,
    RiskLevel,
    RiskResult,
    SafetyReport,
    SessionSummary,
    Source,
    TraceEvent,
    VerificationCheck,
    VerificationResult,
    VerifyStatus,
)


def test_enums_values():
    assert PersonCategory.baby.value == "baby"
    assert Language.kn.value == "kn"
    assert Mode.deep.value == "deep"
    assert Source.photo.value == "photo"
    assert HazardStatus.observed.value == "observed"
    assert EvidenceStrength.clear.value == "clear"
    assert RiskLevel.uncertain.value == "uncertain"
    assert Outcome.none_observed.value == "none_observed"
    assert VerifyStatus.passed.value == "passed"
    assert NotifyStatus.sent.value == "sent"


def test_quality_flags_to_list():
    flags = QualityFlags(blur=True, darkness=True)
    flag_list = flags.to_flag_list()
    assert "blurred" in flag_list
    assert "dark" in flag_list
    assert "glare" not in flag_list
    assert flags.has_defects is True


def test_perception_result_schema():
    p = PerceptionResult(
        environment="kitchen",
        scene_summary="A clean kitchen counter.",
        objects=["counter", "sink"],
        candidate_hazards=[
            CandidateHazard(
                raw_title="Wet floor",
                category_hint="H01",
                description="Puddle on floor near sink",
                evidence=["Water reflection on tiles"],
                visibility=EvidenceStrength.clear,
            )
        ],
        checklist=[
            ChecklistFinding(
                category_id="H01",
                finding=ChecklistFindingStatus.present,
                evidence="Water sheen",
            )
        ],
    )
    assert p.environment.label == "kitchen"
    assert p.environment.confidence_band == "medium"
    assert len(p.candidate_hazards) == 1
    assert p.candidate_hazards[0].raw_title == "Wet floor"


def test_hazard_schema():
    h = Hazard(
        id="hz_1",
        category_id="H03",
        title="Power strip near sink",
        status=HazardStatus.likely,
        evidence_strength=EvidenceStrength.partial,
        evidence=["Socket strip placed 10cm from sink faucet"],
        trigger=None,
        person_relevance=RelevanceLevel.high,
        risk=RiskAssessment(
            level=RiskLevel.high,
            potential_level=None,
            rule_ids=["R-BASE-H03", "R-COMBO-WATER-ELEC"],
            rationale="Water and electricity proximity",
        ),
        precautions=[
            Precaution(
                text="Move power strip away from wet area.",
                provenance=PrecautionProvenance.guideline,
                guideline_id="G-H03-002",
                priority=1,
            )
        ],
    )
    assert h.id == "hz_1"
    assert h.risk.level == RiskLevel.high
    assert len(h.precautions) == 1


def test_person_context_schema():
    pc = PersonContext(
        relevance=RelevanceLevel.high,
        vulnerability_factors=["curiosity", "low height reach"],
        severity_modifier=1,
        note="Child is able to reach counter edge",
    )
    assert pc.severity_modifier == 1


def test_rule_r1_forbidden_wording_in_safety_report():
    scene = ReportScene(
        environment="living_room",
        summary="A tidy room.",
    )
    ver = VerificationResult(status=VerifyStatus.passed)

    # Valid report with none_observed outcome
    rep = SafetyReport(
        id="an_123",
        timestamp="2026-11-01T12:00:00Z",
        outcome=Outcome.none_observed,
        analysis_reliable=True,
        person_category=PersonCategory.adult,
        language=Language.en,
        scene=scene,
        overall_risk=RiskLevel.low,
        verification=ver,
    )
    # Default headline per Rule R1
    assert rep.headline == "No hazards observed in this view"

    # Forbidden word "safe" in headline must raise ValueError
    with pytest.raises(ValidationError, match="Rule R1 Violation"):
        SafetyReport(
            id="an_124",
            timestamp="2026-11-01T12:00:00Z",
            outcome=Outcome.none_observed,
            analysis_reliable=True,
            person_category=PersonCategory.adult,
            language=Language.en,
            scene=scene,
            overall_risk=RiskLevel.low,
            verification=ver,
            headline="The room is safe",
        )

    # Forbidden phrase "all clear" in headline must raise ValueError
    with pytest.raises(ValidationError, match="Rule R1 Violation"):
        SafetyReport(
            id="an_125",
            timestamp="2026-11-01T12:00:00Z",
            outcome=Outcome.none_observed,
            analysis_reliable=True,
            person_category=PersonCategory.adult,
            language=Language.en,
            scene=scene,
            overall_risk=RiskLevel.low,
            verification=ver,
            headline="All clear - no issues",
        )

    # Forbidden phrase "no danger" must raise ValueError
    with pytest.raises(ValidationError, match="Rule R1 Violation"):
        SafetyReport(
            id="an_126",
            timestamp="2026-11-01T12:00:00Z",
            outcome=Outcome.none_observed,
            analysis_reliable=True,
            person_category=PersonCategory.adult,
            language=Language.en,
            scene=scene,
            overall_risk=RiskLevel.low,
            verification=ver,
            headline="There is no danger here",
        )


def test_rule_r1_unreliable_cannot_be_none_observed():
    scene = ReportScene(environment="unknown", summary="Dark frame")
    ver = VerificationResult(status=VerifyStatus.failed_fallback)

    with pytest.raises(ValidationError, match="unreliable or failed analysis cannot have outcome 'none_observed'"):
        SafetyReport(
            id="an_127",
            timestamp="2026-11-01T12:00:00Z",
            outcome=Outcome.none_observed,
            analysis_reliable=False,  # Unreliable cannot claim none_observed!
            person_category=PersonCategory.child,
            language=Language.en,
            scene=scene,
            overall_risk=RiskLevel.uncertain,
            verification=ver,
        )


def test_analysis_result_contract():
    result = AnalysisResult(
        id="an_20261101_101502_ab12",
        timestamp="2026-11-01T10:15:04Z",
        outcome=Outcome.hazards_found,
        analysis_reliable=True,
        person_category=PersonCategory.child,
        language=Language.en,
        scene=ReportScene(
            environment="kitchen",
            summary="Kitchen counter with a kettle and a power strip near the sink.",
            quality_flags=["slightly_dark"],
            coverage_gaps=["Left third of the frame is out of focus", "Floor not visible"],
        ),
        hazards=[
            Hazard(
                id="hz_1",
                category_id="H03",
                title="Power strip close to the sink",
                status=HazardStatus.likely,
                evidence_strength=EvidenceStrength.partial,
                evidence=["A multi-socket strip sits on the counter a hand-width from the sink basin"],
                trigger=None,
                region=None,
                person_relevance=RelevanceLevel.high,
                risk=RiskAssessment(
                    level=RiskLevel.high,
                    potential_level=None,
                    rule_ids=["R-BASE-H03", "R-COMBO-WATER-ELEC"],
                    rationale="Electrical item near a water source; children can reach counters.",
                ),
                precautions=[
                    Precaution(
                        text="Move the strip away from the sink and keep it dry.",
                        provenance=PrecautionProvenance.guideline,
                        guideline_id="G-H03-002",
                        priority=1,
                    )
                ],
            )
        ],
        overall_risk=RiskLevel.high,
        immediate_action=False,
        verification=VerificationResult(status=VerifyStatus.passed),
        notification=NotificationRecord(
            status=NotifyStatus.sent,
            reason="high risk, child, partial evidence",
            attempts=1,
        ),
        errors=[],
        translation_error=None,
        trace=[TraceEvent(node="perceive", status="ok", duration_ms=120.0)],
        limits="Based on one still image. Hazards outside the frame or hidden from view are not assessed.",
    )
    d = result.model_dump()
    assert d["outcome"] == "hazards_found"
    assert d["hazards"][0]["id"] == "hz_1"
    assert d["notification"]["status"] == "sent"
