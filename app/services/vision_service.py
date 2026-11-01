"""Vision service interface and implementations (skills.md S-12).

Provides:
- VisionService: Abstract base class supporting analyze_scene and perceive.
- FakeVisionService: Fully configurable test fake for offline/mock testing.
- GeminiVisionService: Production Gemini-backed vision analyzer using google-genai.

Adheres strictly to:
- Rule R1: Never produces 'safe' or 'all clear' assertions.
- Rule R9: Secrets and raw image bytes are NEVER logged.
- Rule R10: Bounded timeouts and retries.
- Rule R12: EXIF/GPS stripped before processing; no image bytes logged.
"""

from __future__ import annotations

import abc
import asyncio
import io
import json
import logging
import os
import re
from typing import Any, Literal
from PIL import Image, ImageOps
from pydantic import ValidationError

from app.core.config import get_settings
from app.schemas.enums import (
    ChecklistFindingStatus,
    EvidenceStrength,
    Mode,
)
from app.schemas.image import PreparedImage
from app.schemas.perception import (
    CandidateHazard,
    ChecklistFinding,
    EnvironmentInfo,
    PerceptionResult,
    QualityFlags,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Typed Exceptions
# ---------------------------------------------------------------------------

class VisionServiceError(Exception):
    """Base error for vision service failures."""

    error_code: str = "upstream_error"

    def __init__(self, message: str, error_code: str | None = None) -> None:
        super().__init__(message)
        if error_code:
            self.error_code = error_code


class MissingApiKeyError(VisionServiceError):
    """GEMINI_API_KEY is not set or empty."""

    error_code = "missing_api_key"


class RateLimitedError(VisionServiceError):
    """Upstream vision model quota exceeded or 429 rate limit."""

    error_code = "rate_limited"


class VisionTimeoutError(VisionServiceError):
    """Vision request exceeded GEMINI_TIMEOUT_SECONDS."""

    error_code = "timeout"


class ModelBlockedError(VisionServiceError):
    """Model safety filter or content moderation blocked the response."""

    error_code = "model_blocked"


class InvalidJsonError(VisionServiceError):
    """Model output failed schema validation after repair attempt."""

    error_code = "invalid_json"


class UpstreamVisionError(VisionServiceError):
    """Unexpected upstream error from the vision provider."""

    error_code = "upstream_error"


# ---------------------------------------------------------------------------
# Image & JSON Helpers
# ---------------------------------------------------------------------------

def strip_exif(image_bytes: bytes) -> bytes:
    """Strip EXIF metadata, auto-transpose orientation, and re-encode to clean JPEG bytes.
    Per Rule R12: Images are stripped of GPS and device metadata before model submission.
    Never logs image bytes.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        try:
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=85)
        return out.getvalue()
    except Exception as exc:
        logger.debug("Failed to strip EXIF via Pillow (%s); continuing with original bytes", exc)
        return image_bytes


def extract_json_snippet(text: str) -> str:
    """Extract JSON object from raw response text, stripping markdown backticks if present."""
    text = text.strip()
    pattern = r"```(?:json)?\s*(\{.*?\})\s*```"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()

    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        return text[first_brace : last_brace + 1].strip()

    return text


# ---------------------------------------------------------------------------
# Abstract Base Class
# ---------------------------------------------------------------------------

class VisionService(abc.ABC):
    """Abstract interface for structured scene perception calls."""

    @abc.abstractmethod
    async def analyze_scene(
        self,
        image_bytes: bytes,
        mode: Mode = Mode.quick,
        retry_focus: list[str] | None = None,
    ) -> PerceptionResult:
        """Analyze a physical scene from raw image bytes and return structured perception results."""
        raise NotImplementedError

    async def perceive(
        self,
        image: PreparedImage | bytes,
        prompt: str,
    ) -> PerceptionResult:
        """Alternative perceive signature accepting PreparedImage and prompt."""
        data = image.data if isinstance(image, PreparedImage) else image
        return await self.analyze_scene(image_bytes=data)


# ---------------------------------------------------------------------------
# Fake Vision Service
# ---------------------------------------------------------------------------

class FakeVisionService(VisionService):
    """Fully configurable mock VisionService for unit tests and pipeline simulation.

    Supports:
    - canned responses (PerceptionResult or raw JSON)
    - simulated timeouts
    - simulated model safety blocks
    - simulated invalid JSON (with or without repair)
    - simulated missing API key
    - simulated non-scene inputs
    - simulated rate limits (429)
    - configurable exception raising or result error-flagging
    """

    def __init__(
        self,
        canned_result: PerceptionResult | None = None,
        canned_json: str | None = None,
        simulate_error: Literal[
            "missing_api_key",
            "rate_limited",
            "timeout",
            "model_blocked",
            "invalid_json",
            "upstream_error",
            "non_scene",
        ] | None = None,
        error_to_raise: str | None = None,
        raise_exceptions: bool = False,
        repair_succeeds: bool = True,
    ) -> None:
        self.canned_result = canned_result
        self.canned_json = canned_json
        self.simulate_error = simulate_error or error_to_raise
        self.raise_exceptions = raise_exceptions or bool(error_to_raise)
        self.repair_succeeds = repair_succeeds
        self.call_count: int = 0
        self.call_history: list[dict[str, Any]] = []

    def configure(
        self,
        simulate_error: Literal[
            "missing_api_key",
            "rate_limited",
            "timeout",
            "model_blocked",
            "invalid_json",
            "upstream_error",
            "non_scene",
        ] | None = None,
        canned_result: PerceptionResult | None = None,
        canned_json: str | None = None,
        raise_exceptions: bool = False,
        repair_succeeds: bool = True,
    ) -> None:
        """Update test parameters dynamically."""
        self.simulate_error = simulate_error
        if canned_result is not None:
            self.canned_result = canned_result
        if canned_json is not None:
            self.canned_json = canned_json
        self.raise_exceptions = raise_exceptions
        self.repair_succeeds = repair_succeeds

    async def analyze_scene(
        self,
        image_bytes: bytes,
        mode: Mode = Mode.quick,
        retry_focus: list[str] | None = None,
    ) -> PerceptionResult:
        self.call_count += 1
        self.call_history.append({
            "mode": mode,
            "retry_focus": retry_focus,
            "image_len": len(image_bytes),
        })

        # Error simulation
        err = self.simulate_error
        if err == "timeout":
            if self.raise_exceptions:
                raise VisionTimeoutError("Vision call timed out.", error_code="timeout")
            return PerceptionResult(
                environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                scene_summary="Scene perception timed out.",
                errors=["timeout"],
            )

        if err == "missing_api_key":
            if self.raise_exceptions:
                raise MissingApiKeyError("Gemini API key is not configured.", error_code="missing_api_key")
            return PerceptionResult(
                environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                scene_summary="Analysis could not run due to missing API key.",
                errors=["missing_api_key"],
            )

        if err == "rate_limited":
            if self.raise_exceptions:
                raise RateLimitedError("Quota exceeded / 429 rate limit.", error_code="rate_limited")
            return PerceptionResult(
                environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                scene_summary="Analysis rate limited by upstream provider.",
                errors=["rate_limited"],
            )

        if err == "model_blocked":
            if self.raise_exceptions:
                raise ModelBlockedError("Response was blocked by safety filters.", error_code="model_blocked")
            return PerceptionResult(
                environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                scene_summary="Image analysis blocked by model safety filters.",
                errors=["model_blocked"],
            )

        if err == "invalid_json":
            if not self.repair_succeeds:
                if self.raise_exceptions:
                    raise InvalidJsonError("Invalid JSON returned by model.", error_code="invalid_json")
                return PerceptionResult(
                    environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                    scene_summary="Upstream model returned unparseable JSON.",
                    errors=["invalid_json"],
                )
            # If repair succeeds, proceed to valid canned result

        if err == "upstream_error":
            if self.raise_exceptions:
                raise UpstreamVisionError("Upstream service failure.", error_code="upstream_error")
            return PerceptionResult(
                environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                scene_summary="Upstream service returned a server error.",
                errors=["upstream_error"],
            )

        if err == "non_scene":
            return PerceptionResult(
                environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                scene_summary="Input does not appear to be a physical room or scene.",
                objects=[],
                candidate_hazards=[],
                checklist=[],
                quality=QualityFlags(blur=False, darkness=False, glare=False, framing=True),
                coverage_gaps=["Non-scene input (document, screenshot, or blank frame)"],
                errors=[],
            )

        if self.canned_json:
            try:
                data = json.loads(extract_json_snippet(self.canned_json))
                return PerceptionResult.model_validate(data)
            except Exception as e:
                if self.repair_succeeds and self.canned_result:
                    return self.canned_result.model_copy(deep=True)
                if self.raise_exceptions:
                    raise InvalidJsonError(f"Could not parse canned JSON: {e}") from e
                return PerceptionResult(
                    environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                    scene_summary="Invalid canned JSON.",
                    errors=["invalid_json"],
                )

        if self.canned_result is not None:
            return self.canned_result.model_copy(deep=True)

        # Default realistic perception result for testing
        return PerceptionResult(
            environment=EnvironmentInfo(label="kitchen", confidence_band="high"),
            scene_summary="Kitchen counter area near a stainless steel sink with an electric kettle.",
            objects=["sink", "countertop", "electric_kettle", "power_strip", "wall_outlet"],
            candidate_hazards=[
                CandidateHazard(
                    raw_title="Power strip near water source",
                    category_hint="H03",
                    description="A multi-socket electrical power strip sits on the counter adjacent to the sink basin.",
                    evidence=["Power strip is resting directly on the counter within splash distance of the faucet."],
                    trigger=None,
                    visibility=EvidenceStrength.partial,
                    assumptions=None,
                ),
                CandidateHazard(
                    raw_title="Damp floor near cabinet base",
                    category_hint="H01",
                    description="Glossy reflective wet patch visible on tiled floor beneath the counter.",
                    evidence=["Reflective sheen on floor tiles indicates standing liquid."],
                    trigger=None,
                    visibility=EvidenceStrength.clear,
                    assumptions=None,
                ),
            ],
            checklist=[
                ChecklistFinding(category_id="H01", finding=ChecklistFindingStatus.present, evidence="Liquid patch on floor"),
                ChecklistFinding(category_id="H03", finding=ChecklistFindingStatus.present, evidence="Power strip near sink"),
                ChecklistFinding(category_id="H04", finding=ChecklistFindingStatus.absent, evidence=None),
                ChecklistFinding(category_id="H06", finding=ChecklistFindingStatus.cannot_see, evidence="No stairs visible in frame"),
            ],
            quality=QualityFlags(blur=False, darkness=False, glare=False, framing=False),
            coverage_gaps=["Left side of sink basin is cut off by the camera frame"],
            errors=[],
        )

    async def perceive(
        self,
        image: PreparedImage | bytes,
        prompt: str,
    ) -> PerceptionResult:
        data = image.data if isinstance(image, PreparedImage) else image
        return await self.analyze_scene(image_bytes=data)


# ---------------------------------------------------------------------------
# Gemini Production Vision Service
# ---------------------------------------------------------------------------

class GeminiVisionService(VisionService):
    """Production Gemini Vision service using google-genai SDK.

    Features:
    - Strips EXIF metadata before transmission (Rule R12)
    - Constructs structured system prompts with taxonomy and checklist context
    - Enforces strict JSON response MIME type
    - Handles timeouts, quota/rate limits, safety blocks, and upstream failures
    - Executes one JSON repair attempt on malformed syntax
    - Never logs image bytes, raw base64, or API keys (Rule R9)
    """

    DEFAULT_PROMPT_PATH = "/home/blue/anup/app/agents/prompts/perception.md"
    FALLBACK_PROMPT = """You are a home-and-surroundings safety observer. You are given one still image.
Report only what is visible. Do not guess about anything outside the frame.

1. Identify the environment (kitchen, bathroom, bedroom, living room, stairs, outdoor, other, unknown).
2. List safety-relevant objects you can actually see.
3. List candidate hazards. For each: a short title, a category from the allowed list,
   the visible evidence (what, where in the frame in words), and how clearly it is visible
   (clear | partial | weak). If the hazard is only a possibility because of a visible trigger
   object, say which object — otherwise do not list it.
4. Checklist sweep: for each category below, answer present | absent | cannot_see, with evidence.
5. Report image quality problems (blur, darkness, glare, tight framing) and any areas you
   could not assess.
Do not identify people. Do not infer age, health or identity. Do not give precautions.
Return JSON matching the schema and nothing else.

Allowed categories: {taxonomy}
Checklist for this environment: {checklist}
{retry_focus_block}
"""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        model_name: str | None = None,
        timeout_seconds: int | None = None,
        prompt_path: str | None = None,
    ) -> None:
        settings = get_settings()
        self.api_key = api_key if api_key is not None else settings.GEMINI_API_KEY
        self.model = model or model_name or settings.GEMINI_MODEL
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else settings.GEMINI_TIMEOUT_SECONDS
        self.prompt_path = prompt_path or self.DEFAULT_PROMPT_PATH

    def _get_client(self) -> Any:
        if not self.api_key or not self.api_key.strip():
            raise MissingApiKeyError("GEMINI_API_KEY is not configured in environment.", error_code="missing_api_key")
        try:
            from google import genai
            return genai.Client(api_key=self.api_key)
        except Exception as e:
            raise UpstreamVisionError(f"Failed to initialize Gemini GenAI client: {e}") from e

    def _load_prompt_template(self) -> str:
        if os.path.exists(self.prompt_path):
            try:
                with open(self.prompt_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as exc:
                logger.warning("Failed to read prompt template from %s: %s", self.prompt_path, exc)
        return self.FALLBACK_PROMPT

    def _build_prompt(self, retry_focus: list[str] | None = None) -> str:
        template = self._load_prompt_template()

        # Taxonomy
        taxonomy_text = (
            "H01: slip_wet, H02: trip_clutter, H03: electrical, H04: fire_heat, "
            "H05: sharp_glass, H06: fall_height, H07: unstable_falling, "
            "H08: chemical_poison, H09: choking_small_objects, H10: water_drowning, "
            "H11: strangulation_entrapment, H12: structural_damage, "
            "H13: poor_visibility, H14: outdoor_traffic_terrain, H15: other_observable"
        )
        tax_path = "/home/blue/anup/data/taxonomy.json"
        if os.path.exists(tax_path):
            try:
                with open(tax_path, "r", encoding="utf-8") as f:
                    t_data = json.load(f)
                    cats = [f"{c['id']}: {c['name']}" for c in t_data.get("categories", [])]
                    if cats:
                        taxonomy_text = ", ".join(cats)
            except Exception:
                pass

        # Checklists
        checklist_text = "kitchen, bathroom, bedroom, living_room, stairs, outdoor, other, unknown"
        chk_path = "/home/blue/anup/data/hazard_checklists.json"
        if os.path.exists(chk_path):
            try:
                with open(chk_path, "r", encoding="utf-8") as f:
                    chk_data = json.load(f)
                    envs = chk_data.get("environments", {})
                    if envs:
                        checklist_text = ", ".join(envs.keys())
            except Exception:
                pass

        retry_block = ""
        if retry_focus:
            retry_block = f"RETRY FOCUS: Verify and scrutinize specifically these items or categories: {', '.join(retry_focus)}"

        json_schema_instruction = """
Output JSON schema:
{
  "environment": {"label": "kitchen|bathroom|bedroom|living_room|stairs|outdoor|other|unknown", "confidence_band": "high|medium|low"},
  "scene_summary": "Factual description of the visible scene",
  "objects": ["visible_object_1", "visible_object_2"],
  "candidate_hazards": [
    {
      "raw_title": "Short title",
      "category_hint": "H01|H02|...|H15",
      "description": "Details",
      "evidence": ["Visible evidence statement"],
      "trigger": "Visible trigger object if status is possible, else null",
      "visibility": "clear|partial|weak",
      "assumptions": "Assumptions or null"
    }
  ],
  "checklist": [
    {"category_id": "H01", "finding": "present|absent|cannot_see", "evidence": "text or null"}
  ],
  "quality": {"blur": false, "darkness": false, "glare": false, "framing": false},
  "coverage_gaps": ["Unassessed or obscured area description"],
  "errors": []
}
"""
        return (
            template.replace("{taxonomy}", taxonomy_text)
            .replace("{checklist}", checklist_text)
            .replace("{retry_focus_block}", retry_block)
            + "\n\n"
            + json_schema_instruction
        )

    async def _repair_json(self, client: Any, bad_output: str, error_detail: str) -> PerceptionResult:
        """One repair retry asking model to fix syntax or schema violations."""
        from google.genai import types

        repair_prompt = (
            "You previously generated invalid JSON for the PerceptionResult schema.\n"
            f"Validation Error: {error_detail}\n\n"
            f"Bad Output:\n{bad_output[:2500]}\n\n"
            "Please return ONLY a valid, corrected JSON object conforming exactly to the PerceptionResult schema with keys: "
            "environment (label, confidence_band), scene_summary, objects, candidate_hazards, checklist, quality, coverage_gaps, errors."
        )

        try:
            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.0,
            )
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=self.model,
                    contents=repair_prompt,
                    config=config,
                ),
                timeout=float(min(15, self.timeout_seconds)),
            )
            raw = response.text or ""
            data = json.loads(extract_json_snippet(raw))
            return PerceptionResult.model_validate(data)
        except Exception as e:
            raise InvalidJsonError(f"Failed to produce valid JSON after repair attempt: {e}") from e

    async def analyze_scene(
        self,
        image_bytes: bytes,
        mode: Mode = Mode.quick,
        retry_focus: list[str] | None = None,
    ) -> PerceptionResult:
        """Execute structured scene analysis using Gemini model."""
        if not self.api_key or not self.api_key.strip():
            logger.error("Scene analysis failed: GEMINI_API_KEY is not configured")
            return PerceptionResult(
                environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                scene_summary="Analysis could not run due to missing API key.",
                errors=["missing_api_key"],
            )

        client = self._get_client()

        # Rule R12: Strip EXIF metadata
        clean_bytes = strip_exif(image_bytes)
        prompt = self._build_prompt(retry_focus=retry_focus)

        from google.genai import types

        image_part = types.Part.from_bytes(data=clean_bytes, mime_type="image/jpeg")
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2 if mode == Mode.quick else 0.1,
        )

        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=self.model,
                    contents=[image_part, prompt],
                    config=config,
                ),
                timeout=float(self.timeout_seconds),
            )

            # Check safety filter finish reason
            candidates = getattr(response, "candidates", None)
            if candidates:
                cand = candidates[0]
                finish_reason = str(getattr(cand, "finish_reason", "")).upper()
                if any(x in finish_reason for x in ("SAFETY", "BLOCK", "PROHIBITED")):
                    logger.warning("Gemini vision analysis blocked by safety filters (%s)", finish_reason)
                    return PerceptionResult(
                        environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                        scene_summary="Image analysis blocked by model safety filters.",
                        errors=["model_blocked"],
                    )

            raw_text = response.text or ""
            clean_json = extract_json_snippet(raw_text)

            try:
                data = json.loads(clean_json)
                return PerceptionResult.model_validate(data)
            except (json.JSONDecodeError, ValidationError) as parse_err:
                logger.warning("Initial JSON parsing failed: %s. Initiating one repair retry.", parse_err)
                return await self._repair_json(client, raw_text, str(parse_err))

        except asyncio.TimeoutError:
            logger.error("Gemini vision request timed out after %ds", self.timeout_seconds)
            return PerceptionResult(
                environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                scene_summary=f"Analysis timed out after {self.timeout_seconds} seconds.",
                errors=["timeout"],
            )
        except InvalidJsonError:
            return PerceptionResult(
                environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                scene_summary="Upstream model returned unparseable JSON after repair.",
                errors=["invalid_json"],
            )
        except Exception as exc:
            err_str = str(exc).lower()
            if "429" in err_str or "quota" in err_str or "resource_exhausted" in err_str:
                logger.error("Gemini rate limit exceeded: %s", exc)
                return PerceptionResult(
                    environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                    scene_summary="Rate limited by Gemini API.",
                    errors=["rate_limited"],
                )
            if "key" in err_str and ("api" in err_str or "auth" in err_str):
                return PerceptionResult(
                    environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                    scene_summary="Gemini API authentication failed.",
                    errors=["missing_api_key"],
                )
            logger.error("Gemini vision upstream error: %s", exc)
            return PerceptionResult(
                environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                scene_summary="Upstream vision service encountered an error.",
                errors=["upstream_error"],
            )

    async def perceive(
        self,
        image: PreparedImage | bytes,
        prompt: str,
    ) -> PerceptionResult:
        data = image.data if isinstance(image, PreparedImage) else image
        return await self.analyze_scene(image_bytes=data)
