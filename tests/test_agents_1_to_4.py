"""Comprehensive tests for Pipeline Agents 1 through 4 (agent.md §6).

Tests cover:
- Agent 1 (Scene Perception): prompt composition, fake vision calls, fail-closed behavior
  (missing key, timeout, 429 rate limit, invalid JSON, model safety block), non-scene inputs,
  and deep-scan 2x2 tile cropping & merging.
- Agent 2 (Hazard Classifier): category normalization, keyword fallback to H15, trigger gating
  (possible without trigger dropped to audit log), token Jaccard duplicate merging, checklist
  finding conversion, and possible-item capping.
- Agent 3 (Person Context): complete table coverage (15 categories x 4 person types),
  modifier clamping (-1 to +2), never-drop guarantee for low-relevance hazards, and specific profiles.
- Agent 4 (Risk Assessor): deterministic rule engine (base + person + combo modifiers),
  auditable rule IDs, evidence gating (possible/weak -> uncertain with potential_level),
  immediate action triggers, overall risk aggregation, and strict idempotence.
"""

import io
import pytest
from PIL import Image

from app.agents.hazard_classifier import (
    HazardClassifierAgent,
    classify_hazards,
    token_jaccard,
)
from app.agents.person_context import (
    PersonContextAgent,
    contextualize_hazards,
)
from app.agents.risk_assessor import (
    RiskAssessorAgent,
    assess_hazards_risk,
)
from app.agents.scene_perception import (
    ScenePerceptionAgent,
    perceive_scene,
)
from app.schemas.enums import (
    ChecklistFindingStatus,
    EvidenceStrength,
    HazardStatus,
    Mode,
    PersonCategory,
    RelevanceLevel,
    RiskLevel,
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
from app.services.vision_service import FakeVisionService


@pytest.fixture
def sample_prepared_image() -> PreparedImage:
    """Create a minimal valid test image in memory."""
    img = Image.new("RGB", (400, 300), color="white")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return PreparedImage(
        data=buf.getvalue(),
        format="JPEG",
        width=400,
        height=300,
    )


# ===========================================================================
# Agent 1 — Scene Perception Tests
# ===========================================================================

class TestAgent1ScenePerception:
    """Tests for Agent 1 Scene Perception."""

    @pytest.mark.asyncio
    async def test_successful_perception(self, sample_prepared_image: PreparedImage):
        fake = FakeVisionService()
        agent = ScenePerceptionAgent(vision_service=fake)

        result = await agent.perceive(sample_prepared_image, mode=Mode.quick)

        assert isinstance(result, PerceptionResult)
        assert result.environment.label == "kitchen"
        assert len(result.candidate_hazards) >= 1
        assert len(result.objects) >= 1
        assert result.errors == []
        assert fake.call_count == 1

    @pytest.mark.asyncio
    async def test_missing_api_key_fail_closed(self, sample_prepared_image: PreparedImage):
        fake = FakeVisionService(error_to_raise="missing_api_key")
        agent = ScenePerceptionAgent(vision_service=fake)

        result = await agent.perceive(sample_prepared_image)

        assert "missing_api_key" in result.errors
        assert result.candidate_hazards == []
        assert len(result.coverage_gaps) >= 1
        assert result.environment.confidence_band == "low"

    @pytest.mark.asyncio
    async def test_timeout_fail_closed(self, sample_prepared_image: PreparedImage):
        fake = FakeVisionService(error_to_raise="timeout")
        agent = ScenePerceptionAgent(vision_service=fake)

        result = await agent.perceive(sample_prepared_image)

        assert "timeout" in result.errors
        assert result.candidate_hazards == []
        assert len(result.coverage_gaps) >= 1

    @pytest.mark.asyncio
    async def test_rate_limited_fail_closed(self, sample_prepared_image: PreparedImage):
        fake = FakeVisionService(error_to_raise="rate_limited")
        agent = ScenePerceptionAgent(vision_service=fake)

        result = await agent.perceive(sample_prepared_image)

        assert "rate_limited" in result.errors
        assert result.candidate_hazards == []

    @pytest.mark.asyncio
    async def test_model_blocked_fail_closed(self, sample_prepared_image: PreparedImage):
        fake = FakeVisionService(error_to_raise="model_blocked")
        agent = ScenePerceptionAgent(vision_service=fake)

        result = await agent.perceive(sample_prepared_image)

        assert "model_blocked" in result.errors
        assert result.candidate_hazards == []

    @pytest.mark.asyncio
    async def test_invalid_json_fail_closed(self, sample_prepared_image: PreparedImage):
        fake = FakeVisionService(error_to_raise="invalid_json", repair_succeeds=False)
        agent = ScenePerceptionAgent(vision_service=fake)

        result = await agent.perceive(sample_prepared_image)

        assert "invalid_json" in result.errors
        assert result.candidate_hazards == []

    @pytest.mark.asyncio
    async def test_non_scene_input_detection(self, sample_prepared_image: PreparedImage):
        canned_non_scene = PerceptionResult(
            environment=EnvironmentInfo(label="screenshot", confidence_band="high"),
            scene_summary="Desktop screenshot of a web browser and text editor.",
            objects=["browser_window", "text"],
            candidate_hazards=[],
            checklist=[],
            quality=QualityFlags(),
            coverage_gaps=[],
            errors=[],
        )
        fake = FakeVisionService(canned_result=canned_non_scene)
        agent = ScenePerceptionAgent(vision_service=fake)

        result = await agent.perceive(sample_prepared_image)

        assert result.environment.label == "non_scene"
        assert result.candidate_hazards == []
        assert any("not depict an assessable physical scene" in gap for gap in result.coverage_gaps)

    @pytest.mark.asyncio
    async def test_prompt_composition_and_retry_focus(self, sample_prepared_image: PreparedImage):
        agent = ScenePerceptionAgent(vision_service=FakeVisionService())
        prompt = agent.build_prompt(
            environment_hint="kitchen",
            retry_focus=["H03", "electrical"],
        )

        assert "Allowed categories:" in prompt
        assert "H01" in prompt
        assert "H03" in prompt
        assert "IMPORTANT RE-INSPECTION FOCUS:" in prompt
        assert "electrical" in prompt

    @pytest.mark.asyncio
    async def test_deep_mode_2x2_tiling(self, sample_prepared_image: PreparedImage):
        fake = FakeVisionService()
        agent = ScenePerceptionAgent(vision_service=fake, deep_scan_max_calls=4)

        result = await agent.perceive(sample_prepared_image, mode=Mode.deep)

        assert isinstance(result, PerceptionResult)
        # Base image call + up to 4 tile calls
        assert fake.call_count >= 2


# ===========================================================================
# Agent 2 — Hazard Classification Tests
# ===========================================================================

class TestAgent2HazardClassifier:
    """Tests for Agent 2 Hazard Classifier."""

    def test_token_jaccard(self):
        s1 = "power strip near kitchen sink"
        s2 = "power strip next to sink basin"
        # Overlap tokens: power, strip, sink (3 out of 8 union) = 0.375
        sim = token_jaccard(s1, s2)
        assert sim >= 0.35

        # Exact match
        assert token_jaccard("power strip", "power strip") == 1.0

        assert token_jaccard("completely different", "unrelated text here") == 0.0

    def test_category_normalization_direct_hint(self):
        agent = HazardClassifierAgent()
        cand = CandidateHazard(
            raw_title="Damaged cable",
            category_hint="H03",
            description="Exposed copper wire",
            evidence=["Visible bare copper on cord"],
        )
        cat = agent.normalize_category(cand)
        assert cat == "H03"

    def test_category_normalization_keyword_fallback(self):
        agent = HazardClassifierAgent()
        cand = CandidateHazard(
            raw_title="Large puddle of spilled liquid on the floor tiles",
            category_hint=None,  # Missing hint
            description="Slippery patch near bathroom door",
            evidence=["Shiny wet reflection on floor tiles"],
        )
        cat = agent.normalize_category(cand)
        assert cat == "H01"

    def test_category_normalization_unknown_fallback_to_h15(self):
        agent = HazardClassifierAgent()
        cand = CandidateHazard(
            raw_title="Mysterious unidentifiable physical artifact",
            category_hint="INVALID_999",
            description="Odd object in room",
            evidence=["Strange object"],
        )
        cat = agent.normalize_category(cand)
        assert cat == "H15"

    def test_trigger_gating_possible_without_trigger_dropped(self):
        agent = HazardClassifierAgent()
        perception = PerceptionResult(
            environment=EnvironmentInfo(label="living_room"),
            scene_summary="Living room",
            objects=["sofa"],
            candidate_hazards=[
                # Possible with trigger -> kept
                CandidateHazard(
                    raw_title="Potential tip-over risk",
                    category_hint="H07",
                    description="Unanchored shelf",
                    evidence=["Tall bookcase against wall"],
                    trigger="tall unanchored bookcase",
                    visibility=EvidenceStrength.weak,
                ),
                # Possible WITHOUT trigger -> must be dropped (Rule R2)
                CandidateHazard(
                    raw_title="Possible loose wire hidden somewhere",
                    category_hint="H03",
                    description="Could be wiring",
                    evidence=["Hidden behind wall"],
                    trigger=None,
                    visibility=EvidenceStrength.weak,
                ),
            ],
            checklist=[],
            quality=QualityFlags(),
            coverage_gaps=[],
            errors=[],
        )

        result = agent.classify(perception)

        assert len(result.hazards) == 1
        assert result.hazards[0].category_id == "H07"
        assert result.hazards[0].trigger == "tall unanchored bookcase"

        # Check dropped audit
        assert len(result.dropped) >= 1
        dropped_item = result.dropped[0]
        assert dropped_item.reason == "possible_without_trigger"
        assert "loose wire" in dropped_item.raw_title.lower()

    def test_duplicate_merge_token_jaccard(self):
        agent = HazardClassifierAgent(jaccard_threshold=0.6)
        perception = PerceptionResult(
            environment=EnvironmentInfo(label="kitchen"),
            scene_summary="Kitchen counter",
            objects=["strip"],
            candidate_hazards=[
                CandidateHazard(
                    raw_title="Multi socket power strip near water sink",
                    category_hint="H03",
                    description="Extension cord near water",
                    evidence=["Power strip 10 cm from faucet"],
                    visibility=EvidenceStrength.partial,
                ),
                CandidateHazard(
                    raw_title="Multi socket power strip near sink basin",
                    category_hint="H03",
                    description="Strip near water",
                    evidence=["Plug resting adjacent to wet sink edge"],
                    visibility=EvidenceStrength.clear,
                ),
            ],
            checklist=[],
            quality=QualityFlags(),
            coverage_gaps=[],
            errors=[],
        )

        result = agent.classify(perception)

        # Duplicates merged into 1 hazard
        assert len(result.hazards) == 1
        merged = result.hazards[0]
        assert merged.category_id == "H03"
        # Evidence was unioned
        assert len(merged.evidence) == 2
        # Higher visibility tier retained
        assert merged.status == HazardStatus.observed
        # Dropped audit records the duplicate
        assert any("duplicate_merged" in d.reason for d in result.dropped)

    def test_checklist_hit_converted_to_hazard(self):
        agent = HazardClassifierAgent()
        perception = PerceptionResult(
            environment=EnvironmentInfo(label="bathroom"),
            scene_summary="Bathroom floor",
            objects=["tub"],
            candidate_hazards=[],  # No candidate hazards detected by open observation
            checklist=[
                ChecklistFinding(
                    category_id="H01",
                    finding=ChecklistFindingStatus.present,
                    evidence="Wet soap scum and standing water on slippery tub exit floor.",
                ),
                ChecklistFinding(
                    category_id="H04",
                    finding=ChecklistFindingStatus.absent,
                    evidence=None,
                ),
            ],
            quality=QualityFlags(),
            coverage_gaps=[],
            errors=[],
        )

        result = agent.classify(perception)

        assert len(result.hazards) == 1
        h = result.hazards[0]
        assert h.category_id == "H01"
        assert "standing water" in h.evidence[0]
        assert h.status in [HazardStatus.observed, HazardStatus.likely]

    def test_possible_cap_enforcement(self):
        agent = HazardClassifierAgent(max_possible_items=4)
        candidates = []
        for i in range(10):
            candidates.append(
                CandidateHazard(
                    raw_title=f"Potential hazard {i + 1}",
                    category_hint=f"H0{i % 8 + 1}",
                    description=f"Potential issue {i}",
                    evidence=[f"Evidence {i}"],
                    trigger=f"trigger_object_{i}",
                    visibility=EvidenceStrength.weak,
                )
            )

        perception = PerceptionResult(
            environment=EnvironmentInfo(label="unknown"),
            scene_summary="Scene with many possible items",
            objects=[],
            candidate_hazards=candidates,
            checklist=[],
            quality=QualityFlags(),
            coverage_gaps=[],
            errors=[],
        )

        result = agent.classify(perception)

        assert len(result.hazards) == 4
        assert len(result.dropped) == 6
        assert all(d.reason == "possible_cap_exceeded" for d in result.dropped)


# ===========================================================================
# Agent 3 — Person Context Tests
# ===========================================================================

class TestAgent3PersonContext:
    """Tests for Agent 3 Person Context."""

    def test_full_table_coverage_all_categories_all_persons(self):
        agent = PersonContextAgent()
        categories = [f"H{i:02d}" for i in range(1, 16)]
        persons = [PersonCategory.baby, PersonCategory.child, PersonCategory.adult, PersonCategory.elderly]

        for p in persons:
            dummy_hazards = [
                Hazard(
                    id=f"hz_{cat}",
                    category_id=cat,
                    title=f"Hazard {cat}",
                    status=HazardStatus.observed,
                    evidence_strength=EvidenceStrength.clear,
                    evidence=["Visible issue"],
                )
                for cat in categories
            ]

            contexts = agent.contextualize(dummy_hazards, person_category=p)

            # Guarantees: Every hazard has a context
            assert len(contexts) == 15
            for h in dummy_hazards:
                ctx = contexts[h.id]
                assert isinstance(ctx, PersonContext)
                assert ctx.relevance in [RelevanceLevel.high, RelevanceLevel.normal, RelevanceLevel.low]
                assert -1 <= ctx.severity_modifier <= 2
                assert len(ctx.note) > 0

    def test_never_drop_low_relevance_hazard(self):
        agent = PersonContextAgent()
        # Choking small objects for adults is low relevance
        hazard = Hazard(
            id="hz_choking",
            category_id="H09",
            title="Coin on table",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Coin on desk"],
        )

        contexts = agent.contextualize([hazard], person_category=PersonCategory.adult)

        assert "hz_choking" in contexts
        ctx = contexts["hz_choking"]
        assert ctx.relevance == RelevanceLevel.low
        # Modifier is -1 for adult x H09
        assert ctx.severity_modifier == -1
        assert hazard.person_relevance == RelevanceLevel.low

    def test_baby_specific_vulnerabilities(self):
        agent = PersonContextAgent()
        h_choking = Hazard(
            id="hz_choke",
            category_id="H09",
            title="Button battery on floor",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Small shiny lithium coin battery on carpet"],
        )

        contexts = agent.contextualize([h_choking], person_category=PersonCategory.baby)

        ctx = contexts["hz_choke"]
        assert ctx.relevance == RelevanceLevel.high
        assert ctx.severity_modifier == 2
        assert any("mouthing" in f.lower() for f in ctx.vulnerability_factors)

    def test_elderly_specific_vulnerabilities(self):
        agent = PersonContextAgent()
        h_slip = Hazard(
            id="hz_slip",
            category_id="H01",
            title="Wet bathroom floor",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Water pooled outside shower stall"],
        )

        contexts = agent.contextualize([h_slip], person_category=PersonCategory.elderly)

        ctx = contexts["hz_slip"]
        assert ctx.relevance == RelevanceLevel.high
        assert ctx.severity_modifier == 2


# ===========================================================================
# Agent 4 — Risk Assessment Tests
# ===========================================================================

class TestAgent4RiskAssessor:
    """Tests for Agent 4 Risk Assessment."""

    def test_base_severity_evaluation(self):
        agent = RiskAssessorAgent()
        h = Hazard(
            id="hz_1",
            category_id="H05",  # sharp_glass, base score 2 -> Low
            title="Kitchen knife on counter",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Chef knife resting on chopping board"],
        )
        ctx_map = {
            "hz_1": PersonContext(
                relevance=RelevanceLevel.normal,
                vulnerability_factors=[],
                severity_modifier=0,
                note="",
            )
        }

        res = agent.assess([h], ctx_map, person_category="adult")

        assert "hz_1" in res.risks
        assessment = res.risks["hz_1"]
        assert assessment.level == RiskLevel.low
        assert "R-BASE-H05" in assessment.rule_ids
        assert res.overall_risk == RiskLevel.low

    def test_combo_rule_water_elec(self):
        agent = RiskAssessorAgent()
        h = Hazard(
            id="hz_elec_sink",
            category_id="H03",  # electrical base 3
            title="Power strip near wet sink",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Multi-socket strip placed directly next to sink with puddles"],
        )
        ctx_map = {
            "hz_elec_sink": PersonContext(
                relevance=RelevanceLevel.high,
                vulnerability_factors=[],
                severity_modifier=0,
                note="",
            )
        }

        res = agent.assess([h], ctx_map, person_category="adult")

        assessment = res.risks["hz_elec_sink"]
        # base 3 + combo 2 = 5 -> High
        assert assessment.level == RiskLevel.high
        assert "R-COMBO-WATER-ELEC" in assessment.rule_ids
        assert res.overall_risk == RiskLevel.high

    def test_combo_rule_flame_flammable(self):
        agent = RiskAssessorAgent()
        h = Hazard(
            id="hz_stove_curtain",
            category_id="H04",  # fire_heat base 3
            title="Curtains blowing near gas burner stove",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Lightweight cotton curtains hanging directly above active burner flame"],
        )
        ctx_map = {
            "hz_stove_curtain": PersonContext(
                relevance=RelevanceLevel.high,
                vulnerability_factors=[],
                severity_modifier=0,
                note="",
            )
        }

        res = agent.assess([h], ctx_map, person_category="adult")

        assessment = res.risks["hz_stove_curtain"]
        assert "R-COMBO-FLAME-FLAMMABLE" in assessment.rule_ids
        assert assessment.level == RiskLevel.high

    def test_combo_rule_tall_furniture_child(self):
        agent = RiskAssessorAgent()
        h = Hazard(
            id="hz_dresser",
            category_id="H07",  # unstable_falling base 2
            title="Tall unanchored dresser with pull-out drawers",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Tall wooden dresser not bolted to wall"],
        )
        # Child modifier +2 from person profile
        ctx_map = {
            "hz_dresser": PersonContext(
                relevance=RelevanceLevel.high,
                vulnerability_factors=["Toddler climbing"],
                severity_modifier=2,
                note="Child climbing danger",
            )
        }

        res = agent.assess([h], ctx_map, person_category="child")

        assessment = res.risks["hz_dresser"]
        # base 2 + child mod 2 + combo mod 1 = 5 (clamped) -> High
        assert "R-COMBO-TALL-FURNITURE-CHILD" in assessment.rule_ids
        assert assessment.level == RiskLevel.high

    def test_evidence_gate_possible_hazard_becomes_uncertain(self):
        agent = RiskAssessorAgent()
        h = Hazard(
            id="hz_possible_shelf",
            category_id="H07",
            title="Bookcase might be unanchored",
            status=HazardStatus.possible,  # Status is possible
            evidence_strength=EvidenceStrength.weak,
            evidence=["Visible tall bookcase"],
            trigger="tall unanchored bookcase",
        )
        ctx_map = {
            "hz_possible_shelf": PersonContext(
                relevance=RelevanceLevel.normal,
                vulnerability_factors=[],
                severity_modifier=0,
                note="",
            )
        }

        res = agent.assess([h], ctx_map, person_category="adult")

        assessment = res.risks["hz_possible_shelf"]
        # Evidence gate rule applied
        assert assessment.level == RiskLevel.uncertain
        assert assessment.potential_level in [RiskLevel.low, RiskLevel.medium, RiskLevel.high]
        assert "R-GATE-EVIDENCE" in assessment.rule_ids
        assert "Evidence Gate" in assessment.rationale
        # Overall risk with only possible items is uncertain
        assert res.overall_risk == RiskLevel.uncertain

    def test_immediate_action_fire(self):
        agent = RiskAssessorAgent()
        h = Hazard(
            id="hz_fire",
            category_id="H04",
            title="Active fire spreading on towel",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Open flame actively burning dish towel near stove"],
        )
        ctx_map = {
            "hz_fire": PersonContext(
                relevance=RelevanceLevel.high,
                vulnerability_factors=[],
                severity_modifier=2,
                note="Fire",
            )
        }

        res = agent.assess([h], ctx_map, person_category="adult")

        assert res.immediate_action is True
        assert "CRITICAL:" in res.rationale

    def test_immediate_action_live_wire_in_water(self):
        agent = RiskAssessorAgent()
        h = Hazard(
            id="hz_wire_water",
            category_id="H03",
            title="Exposed electrical wire in water puddle",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Cut power cord conductor submerged in water on bathroom tile"],
        )
        ctx_map = {
            "hz_wire_water": PersonContext(
                relevance=RelevanceLevel.high,
                vulnerability_factors=[],
                severity_modifier=1,
                note="Electrocution risk",
            )
        }

        res = agent.assess([h], ctx_map, person_category="adult")

        assert res.immediate_action is True
        assert res.overall_risk == RiskLevel.high

    def test_idempotence(self):
        """Verifies that re-running risk assessment produces identical results (Rule R4/Agent 6)."""
        agent = RiskAssessorAgent()
        h = Hazard(
            id="hz_1",
            category_id="H03",
            title="Power strip near sink basin",
            status=HazardStatus.observed,
            evidence_strength=EvidenceStrength.clear,
            evidence=["Socket strip within 5cm of sink faucet"],
        )
        ctx_map = {
            "hz_1": PersonContext(
                relevance=RelevanceLevel.high,
                vulnerability_factors=["Curiosity"],
                severity_modifier=1,
                note="Child reach",
            )
        }

        res1 = agent.assess([h], ctx_map, person_category="child")
        res2 = agent.assess([h], ctx_map, person_category="child")

        assert res1.overall_risk == res2.overall_risk
        assert res1.immediate_action == res2.immediate_action
        assert res1.risks["hz_1"].level == res2.risks["hz_1"].level
        assert res1.risks["hz_1"].rule_ids == res2.risks["hz_1"].rule_ids
        assert res1.risks["hz_1"].rationale == res2.risks["hz_1"].rationale


# ===========================================================================
# End-to-End Functional Pipeline Integration (Agents 1 -> 2 -> 3 -> 4)
# ===========================================================================

@pytest.mark.asyncio
async def test_pipeline_chain_agents_1_through_4(sample_prepared_image: PreparedImage):
    """Verifies that Agents 1 -> 2 -> 3 -> 4 chain seamlessly with full schema fidelity."""
    # 1. Agent 1: Scene Perception
    fake_vision = FakeVisionService()
    perception = await perceive_scene(sample_prepared_image, mode=Mode.quick, vision_service=fake_vision)
    assert isinstance(perception, PerceptionResult)
    assert len(perception.candidate_hazards) >= 1

    # 2. Agent 2: Hazard Classification
    classification = classify_hazards(perception)
    assert len(classification.hazards) >= 1
    for h in classification.hazards:
        assert h.id.startswith("hz_")
        assert h.status in [HazardStatus.observed, HazardStatus.likely, HazardStatus.possible]
        if h.status == HazardStatus.possible:
            assert h.trigger is not None

    # 3. Agent 3: Person Context
    person_contexts = contextualize_hazards(classification.hazards, person_category=PersonCategory.child)
    assert len(person_contexts) == len(classification.hazards)
    for h in classification.hazards:
        assert h.id in person_contexts

    # 4. Agent 4: Risk Assessor
    risk_result = assess_hazards_risk(
        hazards=classification.hazards,
        person_context=person_contexts,
        person_category="child",
        perception=perception,
    )
    assert risk_result.overall_risk in [RiskLevel.low, RiskLevel.medium, RiskLevel.high, RiskLevel.uncertain]
    assert len(risk_result.risks) == len(classification.hazards)

    for h in classification.hazards:
        assert h.risk is not None
        assert h.risk.level in [RiskLevel.low, RiskLevel.medium, RiskLevel.high, RiskLevel.uncertain]
        assert len(h.risk.rule_ids) >= 1
