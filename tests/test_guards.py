"""Safety guards, non-negotiable Rule R1, and translation fallback tests.

Validates:
- Non-negotiable Rule R1: A failed or unreliable analysis is NEVER shown as safe.
  Outcomes are strictly: hazards_found, none_observed, inconclusive, failed.
- User-facing text NEVER contains forbidden phrases: 'safe', 'no danger', 'all clear', 'guaranteed'.
- All perception failure modes (missing_api_key, rate_limited, timeout, model_blocked,
  invalid_json, upstream_error) guarantee outcome != none_observed.
- Non-scene inputs (blank, screenshot, document) guarantee outcome != none_observed.
- Translation failure fallback (Rule R13): falls back to English with translation_error populated;
  never fabricates translation.
"""

import pytest

from app.pipeline.workflow import run_pipeline
from app.schemas.api import AnalysisRequest
from app.schemas.enums import (
    Language,
    Mode,
    Outcome,
    PersonCategory,
    Source,
)
from app.schemas.perception import (
    EnvironmentInfo,
    PerceptionResult,
    QualityFlags,
)
from app.schemas.report import (
    FORBIDDEN_ASSERTIONS,
    ReportScene,
    SafetyReport,
    check_forbidden_phrases,
)
from app.services.guideline_service import GuidelineService
from app.services.translation_service import FakeTranslationService
from app.services.vision_service import FakeVisionService

# Minimal valid JPEG bytes
SAMPLE_JPEG = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00"
    b"\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13"
    b"\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff"
    b"\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01"
    b"\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b"
    b"\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
)


class TestRuleR1Guards:
    """Test strict enforcement of Rule R1 (no false-safe claims)."""

    @pytest.mark.parametrize(
        "simulated_error",
        [
            "missing_api_key",
            "rate_limited",
            "timeout",
            "model_blocked",
            "invalid_json",
            "upstream_error",
        ],
    )
    @pytest.mark.asyncio
    async def test_failed_perception_never_produces_none_observed_or_safe(self, simulated_error):
        """Rule R1 Guard: An analysis with ANY failure must NEVER be outcome none_observed."""
        fake_vision = FakeVisionService(
            simulate_error=simulated_error,
            raise_exceptions=True,
            repair_succeeds=False,
        )
        services = {"vision": fake_vision}

        req = AnalysisRequest(
            person_category=PersonCategory.baby,
            language=Language.en,
            mode=Mode.quick,
            source=Source.photo,
        )

        report = await run_pipeline(request=req, image_bytes=SAMPLE_JPEG, services=services)

        # Rule R1 checks
        assert report.outcome != Outcome.none_observed, (
            f"Violation of Rule R1: Error mode '{simulated_error}' returned outcome 'none_observed'!"
        )
        assert report.outcome == Outcome.failed
        assert report.analysis_reliable is False

        # Wording check: headline must not claim safety
        headline_lower = report.headline.lower()
        for forbidden in ["all clear", "no danger", "safe"]:
            assert forbidden not in headline_lower, f"Forbidden phrase '{forbidden}' found in headline!"

    @pytest.mark.asyncio
    async def test_non_scene_input_produces_inconclusive_never_none_observed(self):
        """Rule R1 Guard: Non-scene images (documents, screenshots) must be inconclusive, never none_observed."""
        fake_vision = FakeVisionService(simulate_error="non_scene")
        services = {"vision": fake_vision}

        req = AnalysisRequest(
            person_category=PersonCategory.elderly,
            language=Language.en,
            mode=Mode.quick,
            source=Source.photo,
        )

        report = await run_pipeline(request=req, image_bytes=SAMPLE_JPEG, services=services)

        assert report.outcome == Outcome.inconclusive
        assert report.outcome != Outcome.none_observed
        assert report.analysis_reliable is False

    @pytest.mark.parametrize(
        "forbidden_text",
        [
            "This room is completely safe",
            "Safe for children",
            "All clear in the kitchen",
            "No danger observed here",
            "Environment is totally safe",
            "100% safe living area",
        ],
    )
    def test_forbidden_phrases_trigger_validation_error(self, forbidden_text):
        """Rule R1: check_forbidden_phrases must reject forbidden claims."""
        with pytest.raises(ValueError, match="Rule R1 Violation"):
            check_forbidden_phrases(forbidden_text, "test_field")

    def test_safe_alternative_phrasing_is_accepted(self):
        """Rule R1: The exact permitted phrase 'No hazards observed in this view' passes."""
        allowed = "No hazards observed in this view"
        check_forbidden_phrases(allowed, "headline")
        assert True


class TestRuleR13TranslationResilience:
    """Test translation failure fallback to English per Rule R13."""

    @pytest.mark.parametrize("target_lang", [Language.kn, Language.hi])
    @pytest.mark.asyncio
    async def test_translation_failure_gracefully_falls_back_to_english(self, target_lang):
        """Rule R13: When translation fails, return English report + translation_error."""
        fake_trans = FakeTranslationService(simulate_failure=True, failure_error="Simulated network failure")
        fake_vision = FakeVisionService()  # Valid perception
        services = {
            "vision": fake_vision,
            "translation": fake_trans,
            "guideline": GuidelineService(),
        }

        req = AnalysisRequest(
            person_category=PersonCategory.child,
            language=target_lang,
            mode=Mode.quick,
            source=Source.photo,
        )

        report = await run_pipeline(request=req, image_bytes=SAMPLE_JPEG, services=services)

        assert report.translation_error is not None
        assert "Simulated network failure" in report.translation_error
        # English report returned
        assert report.language == Language.en
        # Hazards and evidence are intact
        assert len(report.hazards) >= 1
        # No forbidden phrases introduced
        headline_lower = report.headline.lower()
        assert "all clear" not in headline_lower
        assert "safe" not in headline_lower
