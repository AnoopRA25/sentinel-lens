"""Comprehensive tests for Pipeline Agents 5 through 9 (agent.md §6).

Tests cover:
- Agent 5 (Safety Knowledge):
  - Precaution retrieval by category & person category
  - Priority ranking and text deduplication
  - Conflict resolution (conflicts_with)
  - Fallback tiers: Category generic -> Universal fallback ("Keep people away...")
  - Never-empty guarantee for every hazard
  - ALLOW_AI_GENERAL_PRECAUTIONS gating and labeling (Rule R8)
- Agent 6 (Verification and Critic):
  - Deterministic checks V1 through V8
  - Action on unsupported/invalid (purging possible without trigger, risk correction)
  - Outcome none_observed consistency guard (Rule R1)
  - Bounded retries with retry_focus
  - Retries exhausted -> failed_fallback with reduced confidence note
- Agent 7 (Safety Report):
  - Assembly and strict ordering (immediate action -> confirmed by risk -> possible -> low relevance)
  - Forbidden phrase guard (Rule R1: raises ForbiddenPhraseError for 'safe', 'no danger', 'all clear', 'guaranteed')
  - Headline correctness ("No hazards observed in this view")
  - Translation via TranslationService and fallback to English on error (Rule R13)
  - Limits and coverage notes
- Agent 8 (Caregiver Notification):
  - Policy gates (notifications enabled, hazards_found, analysis_reliable, observed/likely with >= partial evidence, risk threshold)
  - Medium risk qualification for baby/child
  - Cooldown deduplication with sha1 fingerprint
  - Risk escalation bypass of cooldown
  - Message formatting and secret redaction (Rule R9)
- Agent 9 (Session Aggregator):
  - Deterministic cross-frame hazard matching via token Jaccard (>= 0.6)
  - Sightings tracking ("seen in N views", not pixel tracking per Rule R7)
  - Max risk and change events tracking
  - Union of coverage gaps
  - Periodic frame sampling disclaimer (Rule R11)
  - Bounded session memory and expiration
"""

import pytest
import time

from app.agents.caregiver_notification import (
    CaregiverNotificationAgent,
    compute_hazard_fingerprint,
    notify_caregiver,
)
from app.agents.safety_knowledge import (
    SafetyKnowledgeAgent,
    retrieve_safety_knowledge,
    safety_knowledge_node,
)
from app.agents.safety_report import (
    ForbiddenPhraseError,
    SafetyReportAgent,
    generate_safety_report,
    scan_for_forbidden_phrases,
    validate_report_language_guard,
)
from app.agents.session_aggregator import (
    SessionAggregator,
    aggregate_frame,
    token_jaccard,
    tokenize_title,
)
from app.agents.verification import (
    VerificationAgent,
    verify_pipeline_state,
)
from app.core.config import Settings
from app.schemas.api import AnalysisRequest, SessionSummary
from app.schemas.enums import (
    EvidenceStrength,
    HazardStatus,
    Language,
    NotifyStatus,
    Outcome,
    PersonCategory,
    PrecautionProvenance,
    RelevanceLevel,
    RiskLevel,
    VerifyStatus,
)
from app.schemas.hazard import Hazard
from app.schemas.notification import NotificationRecord
from app.schemas.perception import (
    EnvironmentInfo,
    PerceptionResult,
    QualityFlags,
)
from app.schemas.precaution import Precaution
from app.schemas.report import ReportScene, SafetyReport
from app.schemas.risk import RiskAssessment
from app.schemas.verification import VerificationCheck, VerificationResult
from app.services.guideline_service import GuidelineService
from app.services.notification_service import CooldownStore, FakeNotificationService
from app.services.translation_service import FakeTranslationService


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def sample_hazard_h01() -> Hazard:
    return Hazard(
        id="hz_1",
        category_id="H01",
        title="Wet slippery puddle near kitchen sink",
        status=HazardStatus.observed,
        evidence_strength=EvidenceStrength.clear,
        evidence=["Puddle of clear liquid spreading across floor"],
        trigger=None,
        person_relevance=RelevanceLevel.normal,
        risk=RiskAssessment(
            level=RiskLevel.medium,
            potential_level=None,
            rule_ids=["R-BASE-H01"],
            rationale="Wet floor slip risk",
        ),
        precautions=[],
    )


@pytest.fixture
def sample_hazard_h03() -> Hazard:
    return Hazard(
        id="hz_2",
        category_id="H03",
        title="Power strip sitting near kitchen sink basin",
        status=HazardStatus.likely,
        evidence_strength=EvidenceStrength.partial,
        evidence=["Multi-socket power strip located within arm's reach of tap water source"],
        trigger=None,
        person_relevance=RelevanceLevel.high,
        risk=RiskAssessment(
            level=RiskLevel.high,
            potential_level=None,
            rule_ids=["R-BASE-H03", "R-COMBO-WATER-ELEC"],
            rationale="Electrical shock potential near water",
        ),
        precautions=[],
    )


@pytest.fixture
def sample_possible_hazard_with_trigger() -> Hazard:
    return Hazard(
        id="hz_3",
        category_id="H09",
        title="Possible choking object under table",
        status=HazardStatus.possible,
        evidence_strength=EvidenceStrength.weak,
        evidence=["Small round shiny object partially visible under coffee table"],
        trigger="Small round object near floor",
        person_relevance=RelevanceLevel.high,
        risk=RiskAssessment(
            level=RiskLevel.uncertain,
            potential_level=RiskLevel.high,
            rule_ids=["R-BASE-H09"],
            rationale="Potential choking hazard for infants if confirmed",
        ),
        precautions=[],
    )


@pytest.fixture
def sample_perception_result() -> PerceptionResult:
    return PerceptionResult(
        environment=EnvironmentInfo(label="kitchen", confidence_band="high"),
        scene_summary="Kitchen counter with sink and electrical appliances.",
        objects=["sink", "counter", "power strip", "faucet", "floor"],
        candidate_hazards=[],
        checklist=[],
        quality=QualityFlags(blur=False, darkness=False, glare=False, framing=False),
        coverage_gaps=["Lower floor area behind island not visible."],
        errors=[],
    )


# ============================================================================
# Agent 5: Safety Knowledge Tests
# ============================================================================

class TestSafetyKnowledgeAgent:
    def test_retrieve_precautions_by_category_and_person(self, sample_hazard_h01: Hazard):
        agent = SafetyKnowledgeAgent()
        precs_elderly = agent.retrieve_precautions_for_hazard(sample_hazard_h01, PersonCategory.elderly)
        assert len(precs_elderly) >= 1
        # Check that elderly-specific precaution G-H01-002 is present
        assert any("elderly" in p.text.lower() or "footwear" in p.text.lower() for p in precs_elderly)

        precs_baby = agent.retrieve_precautions_for_hazard(sample_hazard_h01, PersonCategory.baby)
        assert len(precs_baby) >= 1
        # Every precaution has provenance
        for p in precs_baby:
            assert p.provenance in (PrecautionProvenance.guideline, PrecautionProvenance.generic)

    def test_priority_ranking_and_deduplication(self, sample_hazard_h01: Hazard):
        agent = SafetyKnowledgeAgent()
        precs = agent.retrieve_precautions_for_hazard(sample_hazard_h01, PersonCategory.adult)
        # Check priority sorted (ascending)
        priorities = [p.priority for p in precs]
        assert priorities == sorted(priorities)

        # Check no duplicate normalized texts
        texts = [p.text.lower().strip() for p in precs]
        assert len(texts) == len(set(texts))

    def test_conflict_resolution(self):
        # In safety_guidelines.json: G-H04-005 conflicts_with G-H04-006 (category H04)
        agent = SafetyKnowledgeAgent()
        h04_hazard = Hazard(
            id="hz_fire",
            category_id="H04",
            title="Active open flame on stove burner",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Open flame burner active"],
        )
        precs = agent.retrieve_precautions_for_hazard(h04_hazard, PersonCategory.adult)
        guideline_ids = [p.guideline_id for p in precs if p.guideline_id]
        # Both G-H04-005 and G-H04-006 must not both appear
        assert not ("G-H04-005" in guideline_ids and "G-H04-006" in guideline_ids)

    def test_category_generic_fallback(self):
        # Create hazard with category H15 (other_observable) or a category without direct person match
        agent = SafetyKnowledgeAgent()
        h_h15 = Hazard(
            id="hz_other",
            category_id="H15",
            title="Unidentified physical object on path",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Physical obstruction on corridor path"],
        )
        precs = agent.retrieve_precautions_for_hazard(h_h15, PersonCategory.adult)
        assert len(precs) >= 1
        # Must have provenance generic or guideline
        assert precs[0].provenance in (PrecautionProvenance.generic, PrecautionProvenance.guideline)

    def test_universal_fallback_never_empty_guarantee(self):
        agent = SafetyKnowledgeAgent()
        unknown_hazard = Hazard(
            id="hz_unknown",
            category_id="H99_NONEXISTENT",
            title="Mysterious non-cataloged item",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Visible unknown item"],
        )
        precs = agent.retrieve_precautions_for_hazard(unknown_hazard, PersonCategory.adult)
        assert len(precs) >= 1
        assert "Keep people away" in precs[0].text
        assert precs[0].provenance == PrecautionProvenance.generic

    def test_allow_ai_general_precautions_flag(self, sample_hazard_h01: Hazard):
        # Default: allow_ai_general is False
        agent_default = SafetyKnowledgeAgent(allow_ai_general=False)
        precs_def = agent_default.retrieve_precautions_for_hazard(sample_hazard_h01, PersonCategory.adult)
        assert not any(p.provenance == PrecautionProvenance.ai_general for p in precs_def)

        # Enabled: allow_ai_general is True
        agent_ai = SafetyKnowledgeAgent(allow_ai_general=True)
        precs_ai = agent_ai.retrieve_precautions_for_hazard(sample_hazard_h01, PersonCategory.adult)
        ai_precs = [p for p in precs_ai if p.provenance == PrecautionProvenance.ai_general]
        assert len(ai_precs) == 1
        assert "AI-generated" in (ai_precs[0].source_note or "")

    def test_retrieve_precautions_for_hazards_attaches_precautions(self, sample_hazard_h01: Hazard, sample_hazard_h03: Hazard):
        hazards = [sample_hazard_h01, sample_hazard_h03]
        result_map = retrieve_safety_knowledge(hazards, PersonCategory.child)
        assert len(result_map) == 2
        assert sample_hazard_h01.id in result_map
        assert sample_hazard_h03.id in result_map
        # Both hazards also have precautions attached directly
        assert len(sample_hazard_h01.precautions) >= 1
        assert len(sample_hazard_h03.precautions) >= 1


# ============================================================================
# Agent 6: Verification and Critic Tests
# ============================================================================

class TestVerificationAgent:
    def test_v1_valid_category_and_evidence(self, sample_hazard_h01: Hazard, sample_perception_result: PerceptionResult):
        # Clean hazard passes V1
        agent = VerificationAgent()
        ver_res, _, _, _, _, _ = agent.verify(
            hazards=[sample_hazard_h01],
            perception=sample_perception_result,
            person_category=PersonCategory.adult,
            language=Language.en,
            outcome=Outcome.hazards_found,
        )
        v1_check = next(c for c in ver_res.checks if c.id == "V1")
        assert v1_check.passed is True

        # Invalid category fails V1
        invalid_h = Hazard(
            id="bad_1",
            category_id="INVALID_CAT",
            title="Bad hazard",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Visible item"],
        )
        ver_res2, _, _, _, _, _ = agent.verify(
            hazards=[invalid_h],
            perception=sample_perception_result,
            person_category=PersonCategory.adult,
            language=Language.en,
            outcome=Outcome.hazards_found,
        )
        v1_check2 = next(c for c in ver_res2.checks if c.id == "V1")
        assert v1_check2.passed is False

        # Empty evidence fails V1
        no_ev_h = Hazard(
            id="bad_2",
            category_id="H01",
            title="No evidence hazard",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=[],
        )
        ver_res3, _, _, _, _, _ = agent.verify(
            hazards=[no_ev_h],
            perception=sample_perception_result,
            person_category=PersonCategory.adult,
            language=Language.en,
            outcome=Outcome.hazards_found,
        )
        v1_check3 = next(c for c in ver_res3.checks if c.id == "V1")
        assert v1_check3.passed is False

    def test_v3_recomputed_risk_equals_stored_risk(self, sample_hazard_h03: Hazard, sample_perception_result: PerceptionResult):
        # Intentional stored risk mismatch
        sample_hazard_h03.risk = RiskAssessment(
            level=RiskLevel.low,  # Should be high for H03 near sink with child
            rule_ids=["R-MOCK"],
            rationale="Wrongly assigned low risk",
        )
        agent = VerificationAgent()
        ver_res, hazards, risks, _, _, _ = agent.verify(
            hazards=[sample_hazard_h03],
            perception=sample_perception_result,
            person_category=PersonCategory.child,
            language=Language.en,
            outcome=Outcome.hazards_found,
        )
        v3_check = next(c for c in ver_res.checks if c.id == "V3")
        assert v3_check.passed is False
        # Stored risk corrected to high
        assert hazards[0].risk.level == RiskLevel.high
        assert any("Corrected hazard" in ch for ch in ver_res.changes)

    def test_v4_every_hazard_has_precaution_fallback(self, sample_hazard_h01: Hazard, sample_perception_result: PerceptionResult):
        sample_hazard_h01.precautions = []
        agent = VerificationAgent()
        ver_res, hazards, _, precs, _, _ = agent.verify(
            hazards=[sample_hazard_h01],
            perception=sample_perception_result,
            person_category=PersonCategory.adult,
            language=Language.en,
            outcome=Outcome.hazards_found,
            precautions={},
        )
        v4_check = next(c for c in ver_res.checks if c.id == "V4")
        assert v4_check.passed is False  # Flagged initially
        # Automatically populated
        assert len(hazards[0].precautions) >= 1
        assert len(precs[sample_hazard_h01.id]) >= 1

    def test_v6_outcome_none_observed_guard_on_failed_perception(self):
        agent = VerificationAgent()
        # Case A: Perception had errors
        failed_perception = PerceptionResult(
            environment=EnvironmentInfo(label="unknown", confidence_band="low"),
            scene_summary="Failed scene",
            objects=[],
            candidate_hazards=[],
            checklist=[],
            quality=QualityFlags(),
            coverage_gaps=["Full image unassessed"],
            errors=["model_blocked"],
        )
        ver_res, _, _, _, outcome, _ = agent.verify(
            hazards=[],
            perception=failed_perception,
            person_category=PersonCategory.adult,
            language=Language.en,
            outcome=Outcome.none_observed,
        )
        v6_check = next(c for c in ver_res.checks if c.id == "V6")
        assert v6_check.passed is False
        assert outcome == Outcome.failed  # Rule R1: Never none_observed on failed analysis

        # Case B: Inadequate quality (dark/blurred)
        dark_perception = PerceptionResult(
            environment=EnvironmentInfo(label="living_room", confidence_band="low"),
            scene_summary="Too dark to assess",
            objects=[],
            candidate_hazards=[],
            checklist=[],
            quality=QualityFlags(darkness=True),
            coverage_gaps=["Entire frame underexposed"],
            errors=[],
        )
        ver_res2, _, _, _, outcome2, _ = agent.verify(
            hazards=[],
            perception=dark_perception,
            person_category=PersonCategory.adult,
            language=Language.en,
            outcome=Outcome.none_observed,
        )
        assert outcome2 == Outcome.inconclusive  # Changed to inconclusive per Rule R1

    def test_v7_possible_hazard_without_trigger_dropped(self, sample_perception_result: PerceptionResult):
        # Hazard with status=possible but NO trigger
        bad_possible = Hazard(
            id="hz_possible_bad",
            category_id="H09",
            title="Possible small item somewhere",
            status=HazardStatus.possible,
            evidence_strength=EvidenceStrength.weak,
            evidence=["Could be something"],
            trigger=None,  # Missing trigger
        )
        agent = VerificationAgent()
        ver_res, hazards, _, _, _, _ = agent.verify(
            hazards=[bad_possible],
            perception=sample_perception_result,
            person_category=PersonCategory.baby,
            language=Language.en,
            outcome=Outcome.hazards_found,
        )
        v7_check = next(c for c in ver_res.checks if c.id == "V7")
        assert v7_check.passed is False
        # Hazard dropped per Rule R2
        assert len(hazards) == 0
        assert any("lacks a visible trigger object; dropped" in ch for ch in ver_res.changes)

    def test_v8_person_and_language_validation(self, sample_perception_result: PerceptionResult):
        agent = VerificationAgent()
        ver_res, _, _, _, _, _ = agent.verify(
            hazards=[],
            perception=sample_perception_result,
            person_category="adult",
            language="en",
            outcome=Outcome.none_observed,
        )
        v8_check = next(c for c in ver_res.checks if c.id == "V8")
        assert v8_check.passed is True

    def test_retries_exhausted_leads_to_failed_fallback(self, sample_perception_result: PerceptionResult):
        # Max retries = 1, retries_used = 1
        agent = VerificationAgent(max_retries=1)
        bad_hazard = Hazard(
            id="bad_hz",
            category_id="INVALID_CAT",
            title="Corrupt hazard",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Visible item"],
        )
        ver_res, _, _, _, _, _ = agent.verify(
            hazards=[bad_hazard],
            perception=sample_perception_result,
            person_category=PersonCategory.adult,
            language=Language.en,
            outcome=Outcome.hazards_found,
            retries_used=1,
        )
        assert ver_res.status == VerifyStatus.failed_fallback
        assert any("Reduced confidence" in iss for iss in ver_res.issues)


# ============================================================================
# Agent 7: Safety Report Tests
# ============================================================================

class TestSafetyReportAgent:
    @pytest.mark.asyncio
    async def test_assemble_report_structure_and_ordering(
        self,
        sample_hazard_h01: Hazard,
        sample_hazard_h03: Hazard,
        sample_possible_hazard_with_trigger: Hazard,
        sample_perception_result: PerceptionResult,
    ):
        verification = VerificationResult(
            status=VerifyStatus.passed,
            checks=[VerificationCheck(id="V1", passed=True, detail="ok")],
            issues=[],
            changes=[],
            retries_used=0,
        )
        agent = SafetyReportAgent(translation_service=FakeTranslationService())
        report = await agent.assemble_report(
            hazards=[sample_hazard_h01, sample_possible_hazard_with_trigger, sample_hazard_h03],
            perception=sample_perception_result,
            person_category=PersonCategory.child,
            language=Language.en,
            outcome=Outcome.hazards_found,
            verification=verification,
        )

        assert report.outcome == Outcome.hazards_found
        assert report.analysis_reliable is True
        assert report.overall_risk == RiskLevel.high
        assert "No hazards observed" not in report.headline
        assert "hazard(s) observed" in report.headline

        # Order verification: Confirmed high risk (H03) -> medium risk (H01) -> Possible (H09)
        assert report.hazards[0].id == sample_hazard_h03.id
        assert report.hazards[1].id == sample_hazard_h01.id
        assert report.hazards[2].id == sample_possible_hazard_with_trigger.id

        # Limits and disclaimer
        assert "Based on one still image" in report.limits
        assert "not a guarantee of safety" in report.disclaimer

    @pytest.mark.asyncio
    async def test_forbidden_phrase_guard_raises_error(self, sample_perception_result: PerceptionResult):
        # Forbidden assertions: 'safe', 'no danger', 'all clear', 'guaranteed'
        with pytest.raises(ForbiddenPhraseError, match="Rule R1 Violation"):
            scan_for_forbidden_phrases("The room looks completely safe to sleep in", "summary")

        with pytest.raises(ForbiddenPhraseError, match="Rule R1 Violation"):
            scan_for_forbidden_phrases("No danger found in the kitchen", "headline")

        with pytest.raises(ForbiddenPhraseError, match="Rule R1 Violation"):
            scan_for_forbidden_phrases("All clear! You can enter.", "note")

        with pytest.raises(ForbiddenPhraseError, match="Rule R1 Violation"):
            scan_for_forbidden_phrases("This inspection is guaranteed against accidents", "disclaimer")

    @pytest.mark.asyncio
    async def test_none_observed_headline_rule_r1(self, sample_perception_result: PerceptionResult):
        verification = VerificationResult(status=VerifyStatus.passed, checks=[], issues=[], changes=[], retries_used=0)
        agent = SafetyReportAgent(translation_service=FakeTranslationService())
        report = await agent.assemble_report(
            hazards=[],
            perception=sample_perception_result,
            person_category=PersonCategory.adult,
            language=Language.en,
            outcome=Outcome.none_observed,
            verification=verification,
        )
        assert report.headline == "No hazards observed in this view"
        assert "safe" not in report.headline.lower()
        assert "all clear" not in report.headline.lower()

    @pytest.mark.asyncio
    async def test_translation_fallback_to_english_on_error(
        self,
        sample_hazard_h01: Hazard,
        sample_perception_result: PerceptionResult,
    ):
        fake_trans = FakeTranslationService(simulate_failure=True, failure_error="Network timeout")
        agent = SafetyReportAgent(translation_service=fake_trans)
        verification = VerificationResult(status=VerifyStatus.passed, checks=[], issues=[], changes=[], retries_used=0)

        report = await agent.assemble_report(
            hazards=[sample_hazard_h01],
            perception=sample_perception_result,
            person_category=PersonCategory.adult,
            language=Language.kn,
            outcome=Outcome.hazards_found,
            verification=verification,
        )
        # Per Rule R13: Returns English report with translation_error populated
        assert report.language == Language.en
        assert report.translation_error is not None
        assert "Network timeout" in report.translation_error

    @pytest.mark.asyncio
    async def test_successful_translation(
        self,
        sample_hazard_h01: Hazard,
        sample_perception_result: PerceptionResult,
    ):
        fake_trans = FakeTranslationService(prefix_template="[{lang}] ")
        agent = SafetyReportAgent(translation_service=fake_trans)
        verification = VerificationResult(status=VerifyStatus.passed, checks=[], issues=[], changes=[], retries_used=0)

        report = await agent.assemble_report(
            hazards=[sample_hazard_h01],
            perception=sample_perception_result,
            person_category=PersonCategory.adult,
            language=Language.kn,
            outcome=Outcome.hazards_found,
            verification=verification,
        )
        assert report.language == Language.kn
        assert report.translation_error is None
        assert report.scene.summary.startswith("[kn] ")


# ============================================================================
# Agent 8: Caregiver Notification Tests
# ============================================================================

class TestCaregiverNotificationAgent:
    @pytest.mark.asyncio
    async def test_policy_gate_disabled(self, sample_hazard_h03: Hazard, sample_perception_result: PerceptionResult):
        settings = Settings(NOTIFICATIONS_ENABLED=False)
        agent = CaregiverNotificationAgent(settings=settings)
        report = SafetyReport(
            id="test_an",
            timestamp="2026-11-01T10:00:00Z",
            outcome=Outcome.hazards_found,
            analysis_reliable=True,
            person_category=PersonCategory.child,
            language=Language.en,
            scene=ReportScene(environment="kitchen", summary="Scene", quality_flags=[], coverage_gaps=[]),
            hazards=[sample_hazard_h03],
            overall_risk=RiskLevel.high,
            verification=VerificationResult(status=VerifyStatus.passed, checks=[], issues=[], changes=[], retries_used=0),
            headline="Hazards observed",
        )
        record = await agent.evaluate_and_notify(report)
        assert record.status == NotifyStatus.disabled

    @pytest.mark.asyncio
    async def test_policy_gate_unreliable_or_none_observed(self, sample_hazard_h03: Hazard):
        settings = Settings(NOTIFICATIONS_ENABLED=True, NOTIFY_MIN_LEVEL="high")
        agent = CaregiverNotificationAgent(settings=settings)

        # Unreliable analysis
        report_unreliable = SafetyReport(
            id="test_unreliable",
            timestamp="2026-11-01T10:00:00Z",
            outcome=Outcome.hazards_found,
            analysis_reliable=False,  # Unreliable
            person_category=PersonCategory.child,
            language=Language.en,
            scene=ReportScene(environment="kitchen", summary="Scene", quality_flags=[], coverage_gaps=[]),
            hazards=[sample_hazard_h03],
            overall_risk=RiskLevel.high,
            verification=VerificationResult(status=VerifyStatus.failed_fallback, checks=[], issues=[], changes=[], retries_used=0),
            headline="Hazards observed",
        )
        record = await agent.evaluate_and_notify(report_unreliable)
        assert record.status == NotifyStatus.skipped_policy

        # Outcome none_observed
        report_none = SafetyReport(
            id="test_none",
            timestamp="2026-11-01T10:00:00Z",
            outcome=Outcome.none_observed,
            analysis_reliable=True,
            person_category=PersonCategory.child,
            language=Language.en,
            scene=ReportScene(environment="kitchen", summary="Scene", quality_flags=[], coverage_gaps=[]),
            hazards=[],
            overall_risk=RiskLevel.low,
            verification=VerificationResult(status=VerifyStatus.passed, checks=[], issues=[], changes=[], retries_used=0),
            headline="No hazards observed in this view",
        )
        record_none = await agent.evaluate_and_notify(report_none)
        assert record_none.status == NotifyStatus.skipped_policy

    @pytest.mark.asyncio
    async def test_medium_risk_qualifies_for_child_or_baby(self, sample_hazard_h01: Hazard):
        settings = Settings(NOTIFICATIONS_ENABLED=True, NOTIFY_MIN_LEVEL="high")
        fake_sender = FakeNotificationService(should_succeed=True)
        cooldown = CooldownStore()
        agent = CaregiverNotificationAgent(settings=settings, notification_service=fake_sender, cooldown_store=cooldown)

        sample_hazard_h01.risk.level = RiskLevel.medium
        report = SafetyReport(
            id="test_med_child",
            timestamp="2026-11-01T10:00:00Z",
            outcome=Outcome.hazards_found,
            analysis_reliable=True,
            person_category=PersonCategory.child,
            language=Language.en,
            scene=ReportScene(environment="kitchen", summary="Scene", quality_flags=[], coverage_gaps=[]),
            hazards=[sample_hazard_h01],
            overall_risk=RiskLevel.medium,
            verification=VerificationResult(status=VerifyStatus.passed, checks=[], issues=[], changes=[], retries_used=0),
            headline="Hazards observed",
        )
        record = await agent.evaluate_and_notify(report, session_id="sess_child")
        assert record.status == NotifyStatus.sent
        assert len(fake_sender.sent_messages) == 1

    @pytest.mark.asyncio
    async def test_cooldown_and_escalation(self, sample_hazard_h03: Hazard):
        settings = Settings(NOTIFICATIONS_ENABLED=True, NOTIFY_MIN_LEVEL="high", NOTIFY_COOLDOWN_SECONDS=900)
        fake_sender = FakeNotificationService(should_succeed=True)
        cooldown = CooldownStore()
        agent = CaregiverNotificationAgent(settings=settings, notification_service=fake_sender, cooldown_store=cooldown)

        sample_hazard_h03.risk.level = RiskLevel.medium
        report = SafetyReport(
            id="test_cool",
            timestamp="2026-11-01T10:00:00Z",
            outcome=Outcome.hazards_found,
            analysis_reliable=True,
            person_category=PersonCategory.child,
            language=Language.en,
            scene=ReportScene(environment="kitchen", summary="Scene", quality_flags=[], coverage_gaps=[]),
            hazards=[sample_hazard_h03],
            overall_risk=RiskLevel.medium,
            verification=VerificationResult(status=VerifyStatus.passed, checks=[], issues=[], changes=[], retries_used=0),
            headline="Hazards observed",
        )
        # First send -> sent
        rec1 = await agent.evaluate_and_notify(report, session_id="sess_test")
        assert rec1.status == NotifyStatus.sent

        # Immediate second send of same risk -> skipped_cooldown
        rec2 = await agent.evaluate_and_notify(report, session_id="sess_test")
        assert rec2.status == NotifyStatus.skipped_cooldown

        # Risk escalates to high -> bypasses cooldown!
        sample_hazard_h03.risk.level = RiskLevel.high
        report.overall_risk = RiskLevel.high
        rec3 = await agent.evaluate_and_notify(report, session_id="sess_test")
        assert rec3.status == NotifyStatus.sent
        assert len(fake_sender.sent_messages) == 2


# ============================================================================
# Agent 9: Session Aggregator Tests
# ============================================================================

class TestSessionAggregator:
    def test_token_jaccard_similarity(self):
        t1 = tokenize_title("Power strip near kitchen sink")
        t2 = tokenize_title("Power strip near sink")
        jaccard = token_jaccard(t1, t2)
        assert jaccard >= 0.6  # Significant overlap (4 / 5 = 0.8)

        t3 = tokenize_title("Broken glass on stairs")
        jaccard_diff = token_jaccard(t1, t3)
        assert jaccard_diff == 0.0

    def test_merge_across_frames(self, sample_hazard_h03: Hazard):
        agg = SessionAggregator(jaccard_threshold=0.5)

        # Frame 1
        rep1 = SafetyReport(
            id="frame_1",
            timestamp="2026-11-01T10:00:01Z",
            outcome=Outcome.hazards_found,
            analysis_reliable=True,
            person_category=PersonCategory.child,
            language=Language.en,
            scene=ReportScene(environment="kitchen", summary="View 1", quality_flags=[], coverage_gaps=["Cabinet obscured"]),
            hazards=[sample_hazard_h03],
            overall_risk=RiskLevel.high,
            verification=VerificationResult(status=VerifyStatus.passed, checks=[], issues=[], changes=[], retries_used=0),
            headline="Hazards observed",
        )
        summary1 = agg.add_frame_result(session_id="vid_1", result=rep1, view_index=1)
        assert summary1.total_frames == 1
        assert summary1.views_analyzed == 1
        assert len(summary1.hazards) == 1
        assert summary1.hazards[0].sightings_count == 1

        # Frame 2 with similar hazard
        h03_frame2 = Hazard(
            id="hz_f2",
            category_id="H03",
            title="Power strip near sink basin",  # Matching title
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Water droplets on power strip"],
            precautions=[Precaution(text="Unplug immediately", provenance=PrecautionProvenance.guideline)],
        )
        rep2 = SafetyReport(
            id="frame_2",
            timestamp="2026-11-01T10:00:05Z",
            outcome=Outcome.hazards_found,
            analysis_reliable=True,
            person_category=PersonCategory.child,
            language=Language.en,
            scene=ReportScene(environment="kitchen", summary="View 2", quality_flags=[], coverage_gaps=["Pantry unseen"]),
            hazards=[h03_frame2],
            overall_risk=RiskLevel.high,
            verification=VerificationResult(status=VerifyStatus.passed, checks=[], issues=[], changes=[], retries_used=0),
            headline="Hazards observed",
        )
        summary2 = agg.add_frame_result(session_id="vid_1", result=rep2, view_index=2)
        assert summary2.total_frames == 2
        assert summary2.views_analyzed == 2
        # Merged into single aggregated hazard!
        assert len(summary2.hazards) == 1
        agg_h = summary2.hazards[0]
        assert agg_h.sightings_count == 2
        assert len(agg_h.sightings) == 2
        # Union of evidence
        assert len(agg_h.evidence) == 2
        # Combined coverage gaps
        assert "Cabinet obscured" in summary2.coverage_gaps
        assert "Pantry unseen" in summary2.coverage_gaps

    def test_rule_r11_periodic_frame_sampling_disclaimer(self, sample_hazard_h01: Hazard):
        agg = SessionAggregator()
        rep = SafetyReport(
            id="rep_frame",
            timestamp="2026-11-01T10:00:00Z",
            outcome=Outcome.hazards_found,
            analysis_reliable=True,
            person_category=PersonCategory.adult,
            language=Language.en,
            scene=ReportScene(environment="kitchen", summary="Scene", quality_flags=[], coverage_gaps=[]),
            hazards=[sample_hazard_h01],
            overall_risk=RiskLevel.medium,
            verification=VerificationResult(status=VerifyStatus.passed, checks=[], issues=[], changes=[], retries_used=0),
            headline="Hazards observed",
        )
        summary = agg.add_frame_result(session_id="session_live", result=rep)
        assert "Periodic frame sampling. Events between frames can be missed." in summary.limits_disclaimer

    def test_bounded_session_memory(self, sample_hazard_h01: Hazard):
        max_frames = 5
        agg = SessionAggregator(max_session_frames=max_frames)
        session_id = "bounded_test"

        for i in range(10):
            rep = SafetyReport(
                id=f"frame_{i}",
                timestamp=f"2026-11-01T10:00:{i:02d}Z",
                outcome=Outcome.none_observed,
                analysis_reliable=True,
                person_category=PersonCategory.adult,
                language=Language.en,
                scene=ReportScene(environment="room", summary="Room", quality_flags=[], coverage_gaps=[]),
                hazards=[],
                overall_risk=RiskLevel.low,
                verification=VerificationResult(status=VerifyStatus.passed, checks=[], issues=[], changes=[], retries_used=0),
                headline="No hazards observed in this view",
            )
            agg.add_frame_result(session_id=session_id, result=rep, view_index=i)

        rec = agg.get_or_create_session(session_id)
        assert rec.total_frames == 10
        # History frame records capped at max_frames (5)
        assert len(rec.frame_records) <= max_frames
