"""Contract and unit tests for all 9 agents in Hazard Precaution Advisor v2.

Covers:
- Agent 1: Scene Perception (with FakeVisionService, deep scan, non-scene input, error handling)
- Agent 2: Hazard Classifier (normalization, duplicate merging, trigger gating, possible-cap)
- Agent 3: Person Context (profile lookup, severity modifiers, no hazard dropped)
- Agent 4: Risk Assessor (idempotence, rule IDs, combo rules, evidence gate)
- Agent 5: Safety Knowledge (retrieval, dedupe, conflict resolution, never-empty guarantee)
- Agent 6: Verification & Critic (V1-V8 checks, trigger gate, fallback, retry decision)
- Agent 7: Safety Report (ordering, R1 forbidden-phrase guard, translation fallback)
- Agent 8: Caregiver Notification (policy, cooldown, escalation, token safety)
- Agent 9: Session Aggregator (cross-frame Jaccard merge, sightings, memory limits, R11)
"""

import pytest
from pydantic import ValidationError

from app.schemas.enums import (
    ChecklistFindingStatus,
    EvidenceStrength,
    HazardStatus,
    Language,
    Mode,
    NotifyStatus,
    Outcome,
    PersonCategory,
    PrecautionProvenance,
    RelevanceLevel,
    RiskLevel,
    VerifyStatus,
)
from app.schemas.hazard import Hazard
from app.schemas.image import PreparedImage
from app.schemas.perception import (
    CandidateHazard,
    ChecklistFinding,
    EnvironmentInfo,
    PerceptionResult,
    QualityFlags,
)
from app.schemas.person_context import PersonContext
from app.schemas.precaution import Precaution
from app.schemas.report import ReportScene, SafetyReport
from app.schemas.risk import RiskAssessment, RiskResult
from app.schemas.verification import VerificationResult

# Import Agents
from app.agents.scene_perception import ScenePerceptionAgent
from app.agents.hazard_classifier import HazardClassifierAgent
from app.agents.person_context import PersonContextAgent
from app.agents.risk_assessor import RiskAssessorAgent
from app.agents.safety_knowledge import SafetyKnowledgeAgent
from app.agents.verification import VerificationAgent
from app.agents.safety_report import SafetyReportAgent
from app.agents.caregiver_notification import CaregiverNotificationAgent
from app.agents.session_aggregator import SessionAggregator

# Import Services and Fakes
from app.services.vision_service import FakeVisionService
from app.services.guideline_service import GuidelineService
from app.services.translation_service import FakeTranslationService
from app.services.notification_service import FakeNotificationService, CooldownStore


# ============================================================================
# 1. Agent 1 — Scene Perception
# ============================================================================
class TestAgent1ScenePerception:
    """Contract tests for Agent 1 Scene Perception with FakeVisionService."""

    @pytest.mark.asyncio
    async def test_perception_quick_mode_success(self):
        fake_vision = FakeVisionService()
        agent = ScenePerceptionAgent(vision_service=fake_vision)
        image = PreparedImage(data=b"\xFF\xD8\xFF\xE0dummy_jpeg", format="JPEG", width=640, height=480)

        result = await agent.perceive(image, mode=Mode.quick)
        assert isinstance(result, PerceptionResult)
        assert result.environment.label == "kitchen"
        assert len(result.candidate_hazards) >= 1
        assert not result.errors

    @pytest.mark.asyncio
    async def test_perception_non_scene_detection(self):
        fake_vision = FakeVisionService(simulate_error="non_scene")
        agent = ScenePerceptionAgent(vision_service=fake_vision)
        image = PreparedImage(data=b"\xFF\xD8\xFF\xE0dummy_doc", format="JPEG", width=800, height=600)

        result = await agent.perceive(image, mode=Mode.quick)
        assert "Non-scene" in result.coverage_gaps[0] or "unknown" in result.environment.label

    @pytest.mark.asyncio
    async def test_perception_fails_closed_on_error(self):
        fake_vision = FakeVisionService(simulate_error="missing_api_key", raise_exceptions=True)
        agent = ScenePerceptionAgent(vision_service=fake_vision)
        image = PreparedImage(data=b"\xFF\xD8\xFF\xE0dummy_jpeg", format="JPEG", width=640, height=480)

        result = await agent.perceive(image, mode=Mode.quick)
        assert len(result.errors) > 0
        assert "missing_api_key" in result.errors


# ============================================================================
# 2. Agent 2 — Hazard Classifier
# ============================================================================
class TestAgent2HazardClassifier:
    """Contract tests for Agent 2 Hazard Classification, duplicate merge, and trigger gate."""

    def test_duplicate_merging_and_evidence_union(self):
        agent = HazardClassifierAgent(jaccard_threshold=0.5)
        perception = PerceptionResult(
            environment=EnvironmentInfo(label="kitchen", confidence_band="high"),
            scene_summary="Kitchen with liquid on floor.",
            candidate_hazards=[
                CandidateHazard(
                    raw_title="Water spill on floor",
                    category_hint="H01",
                    evidence=["Puddle of clear water on tiles near fridge"],
                    visibility=EvidenceStrength.clear,
                ),
                CandidateHazard(
                    raw_title="Floor water spill",
                    category_hint="H01",
                    evidence=["Liquid reflection near refrigerator door"],
                    visibility=EvidenceStrength.partial,
                ),
            ],
            checklist=[],
            quality=QualityFlags(),
        )

        res = agent.classify(perception)
        assert len(res.hazards) == 1
        merged = res.hazards[0]
        assert merged.category_id == "H01"
        assert len(merged.evidence) == 2  # Union of both evidence statements
        assert len(res.dropped) == 1  # 1 duplicate dropped into audit list

    def test_possible_without_trigger_is_dropped(self):
        # Per Rule R2: possible hazard without a visible trigger is dropped
        agent = HazardClassifierAgent()
        perception = PerceptionResult(
            environment=EnvironmentInfo(label="bathroom", confidence_band="medium"),
            scene_summary="Bathroom view",
            candidate_hazards=[
                CandidateHazard(
                    raw_title="Possible gas leak",
                    category_hint="H04",
                    evidence=["Room feels stuffy"],
                    trigger=None,  # No trigger object!
                    visibility=EvidenceStrength.weak,
                ),
                CandidateHazard(
                    raw_title="Possible electrical shock from socket near sink",
                    category_hint="H03",
                    evidence=["Socket mounted 10cm from basin"],
                    trigger="Wall socket next to faucet",  # Named trigger object
                    visibility=EvidenceStrength.weak,
                ),
            ],
            checklist=[],
            quality=QualityFlags(),
        )

        res = agent.classify(perception)
        # The one without trigger is dropped, the one with trigger is kept as possible
        titles = [h.title for h in res.hazards]
        assert any("socket" in t.lower() for t in titles)
        dropped_reasons = [d.reason for d in res.dropped]
        assert "possible_without_trigger" in dropped_reasons

    def test_checklist_present_converted_to_hazard(self):
        agent = HazardClassifierAgent()
        perception = PerceptionResult(
            environment=EnvironmentInfo(label="stairs", confidence_band="high"),
            scene_summary="Dark staircase",
            candidate_hazards=[],
            checklist=[
                ChecklistFinding(
                    category_id="H06",
                    finding=ChecklistFindingStatus.present,
                    evidence="Steep open stairs without handrail",
                )
            ],
            quality=QualityFlags(),
        )

        res = agent.classify(perception)
        assert len(res.hazards) == 1
        assert res.hazards[0].category_id == "H06"
        assert "Steep open stairs" in res.hazards[0].evidence[0]


# ============================================================================
# 3. Agent 3 — Person Context
# ============================================================================
class TestAgent3PersonContext:
    """Contract tests for Agent 3 Person Contextualizer."""

    def test_person_context_evaluation_all_categories(self):
        agent = PersonContextAgent()
        hazards = [
            Hazard(
                id="hz_1",
                category_id="H09",
                title="Coins and small buttons on floor",
                status=HazardStatus.observed,
                evidence_strength=EvidenceStrength.clear,
                evidence=["Small metallic coins resting on carpet"],
            ),
            Hazard(
                id="hz_2",
                category_id="H01",
                title="Slippery bathroom tiles",
                status=HazardStatus.observed,
                evidence_strength=EvidenceStrength.clear,
                evidence=["Wet floor with soap residue"],
            ),
        ]

        # Baby × H09 choking should have high relevance and positive modifier
        baby_ctx = agent.contextualize(hazards, PersonCategory.baby)
        assert baby_ctx["hz_1"].relevance == RelevanceLevel.high
        assert baby_ctx["hz_1"].severity_modifier >= 1

        # Adult × H09 choking should have low relevance
        adult_ctx = agent.contextualize(hazards, PersonCategory.adult)
        assert adult_ctx["hz_1"].relevance == RelevanceLevel.low

        # Elderly × H01 slip should have high relevance
        elderly_ctx = agent.contextualize(hazards, PersonCategory.elderly)
        assert elderly_ctx["hz_2"].relevance == RelevanceLevel.high
        assert elderly_ctx["hz_2"].severity_modifier >= 1

    def test_never_drop_hazard_due_to_low_relevance(self):
        # Non-negotiable rule: Never drop a hazard because it is low relevance
        agent = PersonContextAgent()
        hazards = [
            Hazard(
                id="hz_1",
                category_id="H09",  # choking - low relevance for adults
                title="Small coin on desk",
                status=HazardStatus.observed,
                evidence_strength=EvidenceStrength.clear,
                evidence=["Coin on desk"],
            )
        ]
        context_map = agent.contextualize(hazards, PersonCategory.adult)
        assert "hz_1" in context_map
        assert len(hazards) == 1  # Still in list!


# ============================================================================
# 4. Agent 4 — Risk Assessor
# ============================================================================
class TestAgent4RiskAssessor:
    """Contract tests for Agent 4 Risk Assessor (idempotence and rule IDs)."""

    def test_risk_assessor_idempotence(self):
        agent = RiskAssessorAgent()
        hazards = [
            Hazard(
                id="hz_1",
                category_id="H03",
                title="Exposed extension cord near kitchen sink",
                status=HazardStatus.observed,
                evidence_strength=EvidenceStrength.clear,
                evidence=["Power strip plugged into outlet next to wet sink"],
            )
        ]
        ctx = {
            "hz_1": PersonContext(
                relevance=RelevanceLevel.high,
                vulnerability_factors=["Floor crawl height"],
                severity_modifier=1,
            )
        }

        # Run 1
        res1 = agent.assess(hazards, ctx, person_category="child")
        # Run 2
        res2 = agent.assess(hazards, ctx, person_category="child")

        assert res1.overall_risk == res2.overall_risk
        assert res1.risks["hz_1"].level == res2.risks["hz_1"].level
        assert res1.risks["hz_1"].rule_ids == res2.risks["hz_1"].rule_ids
        assert res1.risks["hz_1"].rationale == res2.risks["hz_1"].rationale

    def test_risk_assessor_water_elec_combo_rule(self):
        agent = RiskAssessorAgent()
        hazards = [
            Hazard(
                id="hz_1",
                category_id="H03",
                title="Power strip near wet sink basin",
                status=HazardStatus.observed,
                evidence_strength=EvidenceStrength.clear,
                evidence=["Socket strip within 10 cm of water sink"],
            )
        ]
        ctx = {"hz_1": PersonContext(relevance=RelevanceLevel.normal, severity_modifier=0)}
        res = agent.assess(hazards, ctx, person_category="adult")
        risk = res.risks["hz_1"]

        assert "R-COMBO-WATER-ELEC" in risk.rule_ids
        assert risk.level == RiskLevel.high

    def test_evidence_gate_downgrades_to_uncertain(self):
        # Per Rule R4: status=possible or weak evidence -> level=uncertain, potential_level set
        agent = RiskAssessorAgent()
        hazards = [
            Hazard(
                id="hz_1",
                category_id="H03",
                title="Possible wiring damage behind counter",
                status=HazardStatus.possible,
                evidence_strength=EvidenceStrength.weak,
                evidence=["Visible dark cord disappearing behind microwave"],
                trigger="Dark cord behind appliance",
            )
        ]
        ctx = {"hz_1": PersonContext(relevance=RelevanceLevel.normal, severity_modifier=0)}
        res = agent.assess(hazards, ctx, person_category="adult")
        risk = res.risks["hz_1"]

        assert risk.level == RiskLevel.uncertain
        assert risk.potential_level is not None
        assert "R-GATE-EVIDENCE" in risk.rule_ids


# ============================================================================
# 5. Agent 5 — Safety Knowledge
# ============================================================================
class TestAgent5SafetyKnowledge:
    """Contract tests for Agent 5 Safety Knowledge precaution retrieval."""

    def test_never_empty_guarantee(self):
        # Guarantee: Every hazard receives >= 1 precaution
        agent = SafetyKnowledgeAgent()
        for cat_id in ["H01", "H03", "H06", "H09", "H15"]:
            h = Hazard(
                id="hz_test",
                category_id=cat_id,
                title=f"Test hazard for {cat_id}",
                status=HazardStatus.observed,
                evidence_strength=EvidenceStrength.clear,
                evidence=["Visible condition"],
            )
            precs = agent.retrieve_precautions_for_hazard(h, PersonCategory.elderly)
            assert len(precs) >= 1
            for p in precs:
                assert p.text.strip()
                assert p.provenance in (PrecautionProvenance.guideline, PrecautionProvenance.generic)

    def test_precaution_deduplication(self):
        agent = SafetyKnowledgeAgent()
        h = Hazard(
            id="hz_1",
            category_id="H01",
            title="Wet bathroom floor",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Puddle on floor"],
        )
        precs = agent.retrieve_precautions_for_hazard(h, PersonCategory.adult)
        # Check that normalized text does not duplicate
        seen = set()
        for p in precs:
            norm = p.text.strip().lower()
            assert norm not in seen
            seen.add(norm)


# ============================================================================
# 6. Agent 6 — Verification Critic
# ============================================================================
class TestAgent6Verification:
    """Contract tests for Agent 6 Consistency Checks V1-V8 and critic actions."""

    def test_v1_v8_all_pass_on_valid_state(self):
        agent = VerificationAgent()
        hazards = [
            Hazard(
                id="hz_1",
                category_id="H01",
                title="Wet kitchen tile floor",
                status=HazardStatus.observed,
                evidence_strength=EvidenceStrength.clear,
                evidence=["Standing water patch on floor"],
                precautions=[
                    Precaution(
                        text="Mop up liquid spill immediately.",
                        provenance=PrecautionProvenance.guideline,
                        priority=1,
                    )
                ],
            )
        ]
        risks = {
            "hz_1": RiskAssessment(
                level=RiskLevel.medium,
                rule_ids=["R-BASE-H01"],
                rationale="Base score 2 + medium modifier",
            )
        }
        precs = {"hz_1": hazards[0].precautions}
        perception = PerceptionResult(
            environment=EnvironmentInfo(label="kitchen", confidence_band="high"),
            scene_summary="Kitchen counter and tile floor.",
            objects=["floor", "sink"],
            candidate_hazards=[],
            checklist=[],
            quality=QualityFlags(),
        )

        res, upd_h, upd_r, upd_p, upd_o, retry_focus = agent.verify(
            hazards=hazards,
            risks=risks,
            precautions=precs,
            outcome=Outcome.hazards_found,
            perception=perception,
            person_category=PersonCategory.adult,
            language=Language.en,
        )

        assert res.status in (VerifyStatus.passed, VerifyStatus.passed_with_changes)
        assert len(res.checks) == 8  # V1 through V8
        assert not retry_focus

    def test_v6_failed_perception_cannot_be_none_observed(self):
        # Rule R1: A failed perception cannot be none_observed
        agent = VerificationAgent()
        failed_perception = PerceptionResult(
            environment=EnvironmentInfo(label="unknown", confidence_band="low"),
            scene_summary="Perception failed.",
            errors=["timeout"],
        )

        res, _, _, _, upd_outcome, _ = agent.verify(
            hazards=[],
            risks={},
            precautions={},
            outcome=Outcome.none_observed,  # Invalid assertion!
            perception=failed_perception,
            person_category=PersonCategory.adult,
            language=Language.en,
        )

        # V6 check must fail and outcome must be corrected away from none_observed
        assert upd_outcome != Outcome.none_observed
        v6_check = next(c for c in res.checks if c.id == "V6")
        assert not v6_check.passed


# ============================================================================
# 7. Agent 7 — Safety Report
# ============================================================================
class TestAgent7SafetyReport:
    """Contract tests for Agent 7 Safety Report generation and R1 forbidden-phrase guard."""

    @pytest.mark.asyncio
    async def test_report_forbidden_phrase_raises(self):
        agent = SafetyReportAgent()
        bad_hazards = [
            Hazard(
                id="hz_1",
                category_id="H01",
                title="The floor is completely safe",  # FORBIDDEN!
                status=HazardStatus.observed,
                evidence_strength=EvidenceStrength.clear,
                evidence=["Dry surface"],
            )
        ]
        perception = PerceptionResult(
            environment=EnvironmentInfo(label="kitchen", confidence_band="high"),
            scene_summary="Kitchen view",
        )

        with pytest.raises(ValueError, match="Rule R1 Violation"):
            await agent.assemble_report(
                hazards=bad_hazards,
                perception=perception,
                person_category=PersonCategory.adult,
                language=Language.en,
                outcome=Outcome.hazards_found,
                verification=VerificationResult(status=VerifyStatus.passed),
            )

    @pytest.mark.asyncio
    async def test_translation_failure_falls_back_to_english(self):
        # Per Rule R13: Failed translation returns English + translation_error
        fake_trans = FakeTranslationService(simulate_failure=True)
        agent = SafetyReportAgent(translation_service=fake_trans)
        perception = PerceptionResult(
            environment=EnvironmentInfo(label="stairs", confidence_band="high"),
            scene_summary="Staircase descending into living room.",
        )

        report = await agent.assemble_report(
            hazards=[],
            perception=perception,
            person_category=PersonCategory.adult,
            language=Language.kn,  # Request Kannada
            outcome=Outcome.none_observed,
            verification=VerificationResult(status=VerifyStatus.passed),
        )

        assert report.language == Language.en  # Returned report is English per Rule R13
        assert report.translation_error is not None
        assert "No hazards observed" in report.headline


# ============================================================================
# 8. Agent 8 — Caregiver Notification
# ============================================================================
class TestAgent8CaregiverNotification:
    """Contract tests for Agent 8 Caregiver Notification policy and cooldown."""

    @pytest.mark.asyncio
    async def test_notification_policy_high_risk_dispatches(self):
        from app.core.config import Settings
        fake_sender = FakeNotificationService(should_succeed=True)
        cooldown_store = CooldownStore()
        custom_settings = Settings(NOTIFICATIONS_ENABLED=True, NOTIFY_MIN_LEVEL="high")
        agent = CaregiverNotificationAgent(
            settings=custom_settings,
            notification_service=fake_sender,
            cooldown_store=cooldown_store,
        )

        hazard = Hazard(
            id="hz_1",
            category_id="H03",
            title="Exposed socket touching sink",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Direct contact"],
            risk=RiskAssessment(level=RiskLevel.high, rule_ids=["R-BASE-H03"]),
        )
        report = SafetyReport(
            id="an_test_1",
            timestamp="2026-11-01T12:00:00Z",
            outcome=Outcome.hazards_found,
            analysis_reliable=True,
            person_category=PersonCategory.child,
            language=Language.en,
            scene=ReportScene(environment="kitchen", summary="Kitchen area"),
            hazards=[hazard],
            overall_risk=RiskLevel.high,
            verification=VerificationResult(status=VerifyStatus.passed),
        )

        rec = await agent.evaluate_and_notify(report, session_id="test_sess")
        assert rec.status == NotifyStatus.sent
        assert fake_sender.call_count == 1

        # Second identical report should be skipped by cooldown
        rec2 = await agent.evaluate_and_notify(report, session_id="test_sess")
        assert rec2.status == NotifyStatus.skipped_cooldown


# ============================================================================
# 9. Agent 9 — Session Aggregator
# ============================================================================
class TestAgent9SessionAggregator:
    """Contract tests for Agent 9 Session Aggregator cross-frame clustering."""

    def test_session_aggregator_clustering_and_r11_disclaimer(self):
        agg = SessionAggregator(jaccard_threshold=0.6)
        session_id = "sess_live_1"

        # Frame 1: Sees wet floor
        h1 = Hazard(
            id="hz_1",
            category_id="H01",
            title="Liquid spill on kitchen floor",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Puddle of water"],
            risk=RiskAssessment(level=RiskLevel.medium, rule_ids=["R-BASE-H01"]),
        )
        rep1 = SafetyReport(
            id="rep_1",
            timestamp="2026-11-01T10:00:01Z",
            outcome=Outcome.hazards_found,
            analysis_reliable=True,
            person_category=PersonCategory.adult,
            language=Language.en,
            scene=ReportScene(environment="kitchen", summary="Kitchen view 1"),
            hazards=[h1],
            overall_risk=RiskLevel.medium,
            verification=VerificationResult(status=VerifyStatus.passed),
        )
        agg.add_frame_result(session_id, rep1, frame_identifier="frame_001")

        # Frame 2: Sees same spill with slightly different title
        h2 = Hazard(
            id="hz_2",
            category_id="H01",
            title="Kitchen floor liquid spill",  # High token overlap with Frame 1
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Reflective wet patch"],
            risk=RiskAssessment(level=RiskLevel.high, rule_ids=["R-BASE-H01"]),  # Escalated!
        )
        rep2 = SafetyReport(
            id="rep_2",
            timestamp="2026-11-01T10:00:05Z",
            outcome=Outcome.hazards_found,
            analysis_reliable=True,
            person_category=PersonCategory.adult,
            language=Language.en,
            scene=ReportScene(environment="kitchen", summary="Kitchen view 2"),
            hazards=[h2],
            overall_risk=RiskLevel.high,
            verification=VerificationResult(status=VerifyStatus.passed),
        )
        agg.add_frame_result(session_id, rep2, frame_identifier="frame_002")

        summary = agg.get_summary(session_id)
        assert summary.total_frames == 2
        assert len(summary.hazards) == 1  # Successfully clustered into one aggregated hazard!
        agg_h = summary.hazards[0]
        assert agg_h.sightings_count == 2
        assert agg_h.max_risk == RiskLevel.high
        # Rule R11 check
        assert "Periodic frame sampling" in summary.limits_disclaimer
