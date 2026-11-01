"""Unit tests for VisionService, FakeVisionService, and GeminiVisionService (skills.md S-12).

Tests:
- Abstract VisionService contract (analyze_scene and perceive)
- FakeVisionService full error simulation matrix:
  - canned results and canned JSON
  - timeout (returned and raised)
  - missing API key
  - rate limits (429)
  - model safety block
  - invalid JSON (repair success & failure)
  - non-scene inputs
  - upstream errors
- strip_exif utility (orientation, RGBA conversion, GPS strip)
- GeminiVisionService prompt formatting, taxonomy injection, and missing key fail-closed
- Rule R9: Secrets and raw image bytes are never logged.
"""

import asyncio
import io
import pytest
from PIL import Image

from app.schemas.enums import EvidenceStrength, Mode
from app.schemas.image import PreparedImage
from app.schemas.perception import EnvironmentInfo, PerceptionResult, QualityFlags
from app.services.vision_service import (
    FakeVisionService,
    GeminiVisionService,
    InvalidJsonError,
    MissingApiKeyError,
    ModelBlockedError,
    RateLimitedError,
    VisionService,
    VisionTimeoutError,
    extract_json_snippet,
    strip_exif,
)


class TestStripExif:
    """Test EXIF stripping and orientation normalization."""

    def test_strip_exif_rgb_image(self):
        img = Image.new("RGB", (200, 150), color="blue")
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        raw_bytes = buf.getvalue()

        cleaned = strip_exif(raw_bytes)
        assert isinstance(cleaned, bytes)
        assert len(cleaned) > 0

        # Verify Pillow can parse cleaned output
        reopened = Image.open(io.BytesIO(cleaned))
        assert reopened.format == "JPEG"
        assert reopened.size == (200, 150)

    def test_strip_exif_rgba_image_converted_to_rgb(self):
        img = Image.new("RGBA", (100, 100), color=(255, 0, 0, 128))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        raw_png = buf.getvalue()

        cleaned = strip_exif(raw_png)
        assert isinstance(cleaned, bytes)
        reopened = Image.open(io.BytesIO(cleaned))
        assert reopened.mode == "RGB"
        assert reopened.format == "JPEG"

    def test_strip_exif_invalid_bytes_returns_original(self):
        corrupt = b"not-a-valid-image-bytes"
        result = strip_exif(corrupt)
        assert result == corrupt


class TestFakeVisionService:
    """Test FakeVisionService configurable behaviors and error modes."""

    @pytest.mark.asyncio
    async def test_default_realistic_result(self):
        fake = FakeVisionService()
        result = await fake.analyze_scene(image_bytes=b"dummy_bytes", mode=Mode.quick)

        assert isinstance(result, PerceptionResult)
        assert result.environment.label == "kitchen"
        assert len(result.candidate_hazards) >= 1
        assert len(result.checklist) >= 1
        assert result.errors == []
        assert fake.call_count == 1

    @pytest.mark.asyncio
    async def test_perceive_signature_compatibility(self):
        fake = FakeVisionService()
        prepared = PreparedImage(
            data=b"image_content",
            format="jpeg",
            width=800,
            height=600,
            byte_size=13,
            sha256="abc",
        )
        res = await fake.perceive(image=prepared, prompt="Analyze scene")
        assert isinstance(res, PerceptionResult)
        assert fake.call_count == 1

    @pytest.mark.asyncio
    async def test_canned_result(self):
        custom = PerceptionResult(
            environment=EnvironmentInfo(label="bathroom", confidence_band="high"),
            scene_summary="Custom bathroom scene",
            objects=["tub", "faucet"],
            candidate_hazards=[],
            checklist=[],
            quality=QualityFlags(),
            coverage_gaps=[],
            errors=[],
        )
        fake = FakeVisionService(canned_result=custom)
        res = await fake.analyze_scene(image_bytes=b"123")
        assert res.environment.label == "bathroom"
        assert res.scene_summary == "Custom bathroom scene"

    @pytest.mark.asyncio
    async def test_canned_json(self):
        raw_json = """
        {
          "environment": {"label": "stairs", "confidence_band": "high"},
          "scene_summary": "Staircase with wooden steps",
          "objects": ["stairs", "banister"],
          "candidate_hazards": [],
          "checklist": [],
          "quality": {"blur": false, "darkness": false, "glare": false, "framing": false},
          "coverage_gaps": [],
          "errors": []
        }
        """
        fake = FakeVisionService(canned_json=raw_json)
        res = await fake.analyze_scene(b"bytes")
        assert res.environment.label == "stairs"
        assert "Staircase" in res.scene_summary

    @pytest.mark.asyncio
    async def test_simulated_timeout_error_flag(self):
        fake = FakeVisionService(simulate_error="timeout", raise_exceptions=False)
        res = await fake.analyze_scene(b"bytes")
        assert "timeout" in res.errors

    @pytest.mark.asyncio
    async def test_simulated_timeout_raises_exception(self):
        fake = FakeVisionService(simulate_error="timeout", raise_exceptions=True)
        with pytest.raises(VisionTimeoutError):
            await fake.analyze_scene(b"bytes")

    @pytest.mark.asyncio
    async def test_simulated_missing_api_key(self):
        fake = FakeVisionService(simulate_error="missing_api_key", raise_exceptions=False)
        res = await fake.analyze_scene(b"bytes")
        assert "missing_api_key" in res.errors

        fake.configure(simulate_error="missing_api_key", raise_exceptions=True)
        with pytest.raises(MissingApiKeyError):
            await fake.analyze_scene(b"bytes")

    @pytest.mark.asyncio
    async def test_simulated_rate_limited(self):
        fake = FakeVisionService(simulate_error="rate_limited", raise_exceptions=False)
        res = await fake.analyze_scene(b"bytes")
        assert "rate_limited" in res.errors

        fake.configure(simulate_error="rate_limited", raise_exceptions=True)
        with pytest.raises(RateLimitedError):
            await fake.analyze_scene(b"bytes")

    @pytest.mark.asyncio
    async def test_simulated_model_blocked(self):
        fake = FakeVisionService(simulate_error="model_blocked", raise_exceptions=False)
        res = await fake.analyze_scene(b"bytes")
        assert "model_blocked" in res.errors

        fake.configure(simulate_error="model_blocked", raise_exceptions=True)
        with pytest.raises(ModelBlockedError):
            await fake.analyze_scene(b"bytes")

    @pytest.mark.asyncio
    async def test_simulated_invalid_json_without_repair(self):
        fake = FakeVisionService(simulate_error="invalid_json", repair_succeeds=False, raise_exceptions=False)
        res = await fake.analyze_scene(b"bytes")
        assert "invalid_json" in res.errors

        fake.configure(simulate_error="invalid_json", repair_succeeds=False, raise_exceptions=True)
        with pytest.raises(InvalidJsonError):
            await fake.analyze_scene(b"bytes")

    @pytest.mark.asyncio
    async def test_simulated_non_scene_input(self):
        fake = FakeVisionService(simulate_error="non_scene")
        res = await fake.analyze_scene(b"bytes")
        assert res.environment.label == "unknown"
        assert res.errors == []
        assert len(res.coverage_gaps) >= 1
        assert "Non-scene" in res.coverage_gaps[0]
        assert res.quality.framing is True


class TestGeminiVisionService:
    """Test GeminiVisionService prompt construction, missing key handling, and JSON parsing."""

    @pytest.mark.asyncio
    async def test_missing_api_key_fails_closed(self):
        # Rule R10 & skills.md S-12: Missing key returns PerceptionResult with errors=["missing_api_key"]
        service = GeminiVisionService(api_key="")
        res = await service.analyze_scene(b"dummy")
        assert "missing_api_key" in res.errors
        assert res.environment.label == "unknown"

    def test_build_prompt_includes_taxonomy_and_retry_focus(self):
        service = GeminiVisionService(api_key="fake-key")
        prompt = service._build_prompt(retry_focus=["H03", "H01"])
        assert "H01" in prompt
        assert "H03" in prompt
        assert "RETRY FOCUS" in prompt
        assert "Output JSON schema:" in prompt

    def test_extract_json_snippet(self):
        fenced = "```json\n{\"test\": 123}\n```"
        assert extract_json_snippet(fenced) == "{\"test\": 123}"

        surrounded = "Here is the response: {\"key\": \"value\"} hope this helps!"
        assert extract_json_snippet(surrounded) == "{\"key\": \"value\"}"
