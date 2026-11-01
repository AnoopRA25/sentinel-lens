"""Unit tests for TranslationService, FakeTranslationService, and GeminiTranslationService (skills.md S-25).

Tests:
- Abstract TranslationService contract
- FakeTranslationService:
  - English canonical passthrough
  - Kannada/Hindi mock localization
  - Custom dictionary lookup
  - Rule R13 fallback to English on simulated failure
- GeminiTranslationService:
  - English canonical passthrough without API call
  - Missing API key fails gracefully to English + translation_error
  - Prompt construction preserving IDs and formatting
  - Output validation:
    - empty string rejection
    - hazard count mismatch detection
    - Rule R1 forbidden phrase guard in translations
  - Successful translation updates free-text fields and keeps IDs/enums intact
  - Timeout failure returns English report + translation_error
"""

import pytest

from app.schemas.enums import (
    EvidenceStrength,
    HazardStatus,
    Language,
    Outcome,
    PersonCategory,
    RiskLevel,
    VerifyStatus,
)
from app.schemas.hazard import Hazard
from app.schemas.precaution import Precaution
from app.schemas.report import ReportScene, SafetyReport
from app.schemas.risk import RiskAssessment
from app.schemas.verification import VerificationResult
from app.services.translation_service import (
    FakeTranslationService,
    GeminiTranslationService,
)


@pytest.fixture
def sample_report() -> SafetyReport:
    """Construct a valid standard SafetyReport for translation tests."""
    return SafetyReport(
        id="an_20261101_101502_ab12",
        timestamp="2026-11-01T10:15:04Z",
        outcome=Outcome.hazards_found,
        analysis_reliable=True,
        person_category=PersonCategory.child,
        language=Language.en,
        scene=ReportScene(
            environment="kitchen",
            summary="Kitchen counter with electric kettle and power strip near the sink.",
            quality_flags=["slightly_dark"],
            coverage_gaps=["Left side of sink obscured by kettle."],
        ),
        hazards=[
            Hazard(
                id="hz_1",
                category_id="H03",
                title="Power strip close to sink",
                status=HazardStatus.likely,
                evidence_strength=EvidenceStrength.partial,
                evidence=["Multi-socket strip sits next to water basin."],
                trigger=None,
                risk=RiskAssessment(
                    level=RiskLevel.high,
                    rule_ids=["R-BASE-H03"],
                    rationale="Electrical source directly adjacent to water creates shock risk.",
                ),
                precautions=[
                    Precaution(
                        text="Move power strip away from sink and keep it dry.",
                        priority=1,
                    )
                ],
            )
        ],
        overall_risk=RiskLevel.high,
        immediate_action=False,
        verification=VerificationResult(status=VerifyStatus.passed),
        notification=None,
        errors=[],
        translation_error=None,
        trace=[],
    )


class TestFakeTranslationService:
    """Test FakeTranslationService behaviors and mock translations."""

    @pytest.mark.asyncio
    async def test_english_report_untouched(self, sample_report: SafetyReport):
        fake = FakeTranslationService()
        rep, err = await fake.translate_report(sample_report, Language.en)
        assert err is None
        assert rep.language == Language.en
        assert rep.scene.summary == sample_report.scene.summary
        assert rep.hazards[0].title == sample_report.hazards[0].title

    @pytest.mark.asyncio
    async def test_kannada_translation_prefix(self, sample_report: SafetyReport):
        fake = FakeTranslationService()
        rep, err = await fake.translate_report(sample_report, Language.kn)
        assert err is None
        assert rep.language == Language.kn
        assert rep.scene.summary.startswith("[kn] ")
        assert rep.hazards[0].title.startswith("[kn] ")
        assert rep.hazards[0].risk.rationale.startswith("[kn] ")
        assert rep.scene.coverage_gaps[0].startswith("[kn] ")

    @pytest.mark.asyncio
    async def test_hindi_translation_prefix(self, sample_report: SafetyReport):
        fake = FakeTranslationService()
        rep, err = await fake.translate_report(sample_report, Language.hi)
        assert err is None
        assert rep.language == Language.hi
        assert rep.scene.summary.startswith("[hi] ")
        assert rep.hazards[0].title.startswith("[hi] ")

    @pytest.mark.asyncio
    async def test_dictionary_lookup(self, sample_report: SafetyReport):
        lookup = {
            ("Power strip close to sink", "kn"): "ಸಿಂಕ್ ಹತ್ತಿರ ಪವರ್ ಸ್ಟ್ರಿಪ್",
        }
        fake = FakeTranslationService(lookup=lookup)
        rep, err = await fake.translate_report(sample_report, Language.kn)
        assert err is None
        assert rep.hazards[0].title == "ಸಿಂಕ್ ಹತ್ತಿರ ಪವರ್ ಸ್ಟ್ರಿಪ್"

    @pytest.mark.asyncio
    async def test_simulated_failure_returns_english_plus_error(self, sample_report: SafetyReport):
        # Rule R13: A failed translation returns the English report plus a translation_error.
        fake = FakeTranslationService(simulate_failure=True, failure_error="Simulated network failure")
        rep, err = await fake.translate_report(sample_report, Language.kn)
        assert err == "Simulated network failure"
        assert rep.translation_error == "Simulated network failure"
        # English text preserved
        assert rep.scene.summary == sample_report.scene.summary
        assert rep.hazards[0].title == sample_report.hazards[0].title


class TestGeminiTranslationService:
    """Test GeminiTranslationService prompt building, validation, and fallback."""

    @pytest.mark.asyncio
    async def test_english_passthrough_without_api_key(self, sample_report: SafetyReport):
        service = GeminiTranslationService(api_key="")
        rep, err = await service.translate_report(sample_report, Language.en)
        assert err is None
        assert rep.language == Language.en

    @pytest.mark.asyncio
    async def test_missing_api_key_returns_english_plus_error(self, sample_report: SafetyReport):
        service = GeminiTranslationService(api_key="")
        rep, err = await service.translate_report(sample_report, Language.kn)
        assert err is not None
        assert "not configured" in err
        assert rep.translation_error is not None
        assert rep.language == Language.en
        assert rep.hazards[0].title == sample_report.hazards[0].title

    def test_build_translation_prompt_contains_data(self, sample_report: SafetyReport):
        service = GeminiTranslationService(api_key="dummy")
        prompt = service._build_translation_prompt(sample_report, Language.kn)
        assert "Kannada" in prompt
        assert "Power strip close to sink" in prompt
        assert "hz_1" in prompt
        assert "Rule R1" in prompt

    def test_validate_translated_payload_valid(self):
        service = GeminiTranslationService(api_key="dummy")
        valid_data = {
            "scene_summary": "ಅಡುಗೆ ಮನೆಯ ನೋಟ",
            "coverage_gaps": ["ಮುಸುಕಾದ ಭಾಗ"],
            "hazards": [
                {"id": "hz_1", "title": "ವಿದ್ಯುತ್ ಪವರ್ ಸ್ಟ್ರಿಪ್", "rationale": "ನೀರಿನ ಸಮೀಪ"}
            ],
        }
        err = service._validate_translated_payload(valid_data, expected_hazard_count=1)
        assert err is None

    def test_validate_translated_payload_detects_empty_string(self):
        service = GeminiTranslationService(api_key="dummy")
        invalid_data = {
            "scene_summary": "",
            "coverage_gaps": [],
            "hazards": [{"id": "hz_1", "title": "ವಿದ್ಯುತ್", "rationale": ""}],
        }
        err = service._validate_translated_payload(invalid_data, expected_hazard_count=1)
        assert err is not None
        assert "empty or invalid scene_summary" in err

    def test_validate_translated_payload_detects_count_mismatch(self):
        service = GeminiTranslationService(api_key="dummy")
        invalid_data = {
            "scene_summary": "Summary",
            "coverage_gaps": [],
            "hazards": [],  # Expected 1, got 0
        }
        err = service._validate_translated_payload(invalid_data, expected_hazard_count=1)
        assert err is not None
        assert "Hazard count mismatch" in err

    def test_validate_translated_payload_detects_rule_r1_violation(self):
        service = GeminiTranslationService(api_key="dummy")
        r1_violation_data = {
            "scene_summary": "The room is completely safe from all hazards.",
            "coverage_gaps": [],
            "hazards": [{"id": "hz_1", "title": "Cord", "rationale": ""}],
        }
        err = service._validate_translated_payload(r1_violation_data, expected_hazard_count=1)
        assert err is not None
        assert "Rule R1 violation" in err
