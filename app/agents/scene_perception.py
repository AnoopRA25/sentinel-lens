"""Agent 1 — Scene Perception (scene_perception.py).

Per agent.md §6 and skills.md S-12, S-13, S-14:
- Understand the visible environment and list candidate hazards with evidence.
- Person-agnostic on purpose: reports hazards for everyone; person category applied later.
- Reads environment checklists from data/hazard_checklists.json.
- In deep mode, generates 2x2 tile crops (S-14) up to DEEP_SCAN_MAX_CALLS and merges findings.
- Non-scene inputs (screenshots, blank frames, documents) -> inconclusive signal.
- Fails closed on missing key, timeout, rate limit, or invalid JSON -> populates errors.
  Never returns empty hazards as safe (Rule R1).
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
from pathlib import Path
from typing import Any

from PIL import Image

from app.core.config import get_settings
from app.schemas.enums import ChecklistFindingStatus, EvidenceStrength, Mode
from app.schemas.image import PreparedImage
from app.schemas.perception import (
    CandidateHazard,
    ChecklistFinding,
    EnvironmentInfo,
    PerceptionResult,
    QualityFlags,
)
from app.services.vision_service import (
    GeminiVisionService,
    VisionService,
    VisionServiceError,
)

logger = logging.getLogger(__name__)

DEFAULT_CHECKLIST_PATH = Path("/home/blue/anup/data/hazard_checklists.json")
DEFAULT_TAXONOMY_PATH = Path("/home/blue/anup/data/taxonomy.json")
DEFAULT_PROMPT_PATH = Path("/home/blue/anup/app/agents/prompts/perception.md")

NON_SCENE_KEYWORDS = [
    "screenshot",
    "screen capture",
    "document",
    "receipt",
    "sheet of paper",
    "blank frame",
    "black screen",
    "pure black",
    "solid black",
    "blank image",
    "desktop screenshot",
    "user interface",
    "phone screen",
]


class ScenePerceptionAgent:
    """Agent 1: Scene Perception.

    Pure, typed, with injectable VisionService, checklists, and prompt dependencies.
    """

    def __init__(
        self,
        vision_service: VisionService | None = None,
        checklist_path: Path | str = DEFAULT_CHECKLIST_PATH,
        taxonomy_path: Path | str = DEFAULT_TAXONOMY_PATH,
        prompt_path: Path | str = DEFAULT_PROMPT_PATH,
        deep_scan_max_calls: int | None = None,
    ) -> None:
        self.vision_service = vision_service or GeminiVisionService()
        self.checklist_path = Path(checklist_path)
        self.taxonomy_path = Path(taxonomy_path)
        self.prompt_path = Path(prompt_path)
        settings = get_settings()
        self.deep_scan_max_calls = (
            deep_scan_max_calls if deep_scan_max_calls is not None else settings.DEEP_SCAN_MAX_CALLS
        )

        self._checklists_cache: dict[str, Any] | None = None
        self._taxonomy_cache: dict[str, Any] | None = None
        self._prompt_template_cache: str | None = None

    def _load_checklists(self) -> dict[str, Any]:
        if self._checklists_cache is None:
            if self.checklist_path.exists():
                with open(self.checklist_path, "r", encoding="utf-8") as f:
                    self._checklists_cache = json.load(f)
            else:
                self._checklists_cache = {"environments": {}}
        return self._checklists_cache

    def _load_taxonomy(self) -> dict[str, Any]:
        if self._taxonomy_cache is None:
            if self.taxonomy_path.exists():
                with open(self.taxonomy_path, "r", encoding="utf-8") as f:
                    self._taxonomy_cache = json.load(f)
            else:
                self._taxonomy_cache = {"categories": []}
        return self._taxonomy_cache

    def _load_prompt_template(self) -> str:
        if self._prompt_template_cache is None:
            if self.prompt_path.exists():
                with open(self.prompt_path, "r", encoding="utf-8") as f:
                    self._prompt_template_cache = f.read()
            else:
                self._prompt_template_cache = (
                    "Identify environment, safety objects, candidate hazards with evidence, "
                    "checklist sweep (present|absent|cannot_see), quality flags, coverage gaps. Return JSON."
                )
        return self._prompt_template_cache

    def build_prompt(
        self,
        environment_hint: str | None = None,
        retry_focus: list[str] | None = None,
    ) -> str:
        """Compose prompt with allowed taxonomy categories and environment checklist."""
        template = self._load_prompt_template()
        taxonomy_data = self._load_taxonomy()
        checklists_data = self._load_checklists()

        # Build taxonomy summary string
        categories = taxonomy_data.get("categories", [])
        taxonomy_lines: list[str] = []
        for cat in categories:
            cat_id = cat.get("id", "")
            cat_name = cat.get("name", "")
            cat_desc = cat.get("description", "")
            taxonomy_lines.append(f"- {cat_id}: {cat_name} ({cat_desc})")
        taxonomy_str = "\n".join(taxonomy_lines)

        # Build checklist summary string
        env_key = (environment_hint or "unknown").lower()
        envs = checklists_data.get("environments", {})
        env_checklist = envs.get(env_key) or envs.get("unknown", {})

        prompt_queries = env_checklist.get("prompt_queries", [])
        if not prompt_queries and "queries" in env_checklist:
            prompt_queries = [
                {"category_id": k, "query": v} for k, v in env_checklist["queries"].items()
            ]

        checklist_lines: list[str] = []
        for q in prompt_queries:
            checklist_lines.append(f"- {q.get('category_id')}: {q.get('query')}")
        checklist_str = "\n".join(checklist_lines) if checklist_lines else "Perform all-category sweep."

        # Build retry focus block
        retry_focus_block = ""
        if retry_focus:
            focus_items = ", ".join(retry_focus)
            retry_focus_block = (
                f"\nIMPORTANT RE-INSPECTION FOCUS:\n"
                f"Previous analysis flagged low confidence or inconsistencies on: {focus_items}.\n"
                f"Specifically scrutinize the image for physical evidence regarding these categories."
            )

        prompt = template.replace("{taxonomy}", taxonomy_str)
        prompt = prompt.replace("{checklist}", checklist_str)
        prompt = prompt.replace("{retry_focus_block}", retry_focus_block)
        return prompt

    def _is_non_scene(self, perception: PerceptionResult) -> bool:
        """Check if perception output indicates a non-physical scene."""
        env_label = (perception.environment.label or "").lower()
        summary = (perception.scene_summary or "").lower()

        if env_label in ["screenshot", "document", "blank", "blank_frame", "text", "ui", "synthetic", "non_scene"]:
            return True

        for kw in NON_SCENE_KEYWORDS:
            if kw in summary or kw in env_label:
                return True

        # Check for completely blank/black quality flag or empty objects & candidate hazards with dark/black notes
        if not perception.objects and not perception.candidate_hazards:
            if "black" in summary or "blank" in summary or "empty" in summary:
                return True

        return False

    def _create_crops_2x2(self, image: PreparedImage) -> list[tuple[PreparedImage, tuple[float, float, float, float]]]:
        """Generate 2x2 overlapping tile crops (S-14).

        Returns list of (tile_image, (ymin_ratio, xmin_ratio, ymax_ratio, xmax_ratio)).
        """
        try:
            pil_img = Image.open(io.BytesIO(image.data))
        except Exception as e:
            logger.warning("Could not open image for deep scan crops: %s", e)
            return []

        w, h = pil_img.size
        # 60% tile dimension gives 20% central overlap between tiles
        tile_w = int(w * 0.6)
        tile_h = int(h * 0.6)

        boxes = [
            # Top-Left: [0, 0, tile_w, tile_h]
            (0, 0, tile_w, tile_h, (0.0, 0.0, 0.6, 0.6)),
            # Top-Right: [w - tile_w, 0, w, tile_h]
            (w - tile_w, 0, w, tile_h, (0.0, 0.4, 0.6, 1.0)),
            # Bottom-Left: [0, h - tile_h, tile_w, h]
            (0, h - tile_h, tile_w, h, (0.4, 0.0, 1.0, 0.6)),
            # Bottom-Right: [w - tile_w, h - tile_h, w, h]
            (w - tile_w, h - tile_h, w, h, (0.4, 0.4, 1.0, 1.0)),
        ]

        tiles: list[tuple[PreparedImage, tuple[float, float, float, float]]] = []
        for x0, y0, x1, y1, coord_ratio in boxes:
            crop = pil_img.crop((x0, y0, x1, y1))
            buf = io.BytesIO()
            crop.save(buf, format="JPEG", quality=85)
            tile_bytes = buf.getvalue()
            tile_prep = PreparedImage(
                data=tile_bytes,
                format="JPEG",
                width=crop.width,
                height=crop.height,
            )
            tiles.append((tile_prep, coord_ratio))

        return tiles

    async def _execute_deep_scan(
        self,
        image: PreparedImage,
        base_result: PerceptionResult,
        prompt: str,
    ) -> PerceptionResult:
        """Execute deep-scan 2x2 tiles up to deep_scan_max_calls and merge findings."""
        tiles = self._create_crops_2x2(image)
        tiles_to_scan = tiles[: self.deep_scan_max_calls]

        tile_tasks = [self.vision_service.perceive(tile_img, prompt) for tile_img, _ in tiles_to_scan]

        results = await asyncio.gather(*tile_tasks, return_exceptions=True)

        merged_candidates = list(base_result.candidate_hazards)
        existing_candidate_keys = {
            (c.category_hint or "", c.raw_title.strip().lower()) for c in merged_candidates
        }

        merged_objects = list(base_result.objects)
        merged_coverage_gaps = list(base_result.coverage_gaps)

        for idx, res in enumerate(results):
            if isinstance(res, Exception):
                logger.warning("Deep scan tile %d failed: %s", idx, res)
                continue

            # Merge objects
            for obj in res.objects:
                if obj not in merged_objects:
                    merged_objects.append(obj)

            # Map coordinates and merge candidate hazards
            _, (ymin_offset, xmin_offset, ymax_offset, xmax_offset) = tiles_to_scan[idx]
            span_y = ymax_offset - ymin_offset
            span_x = xmax_offset - xmin_offset

            for cand in res.candidate_hazards:
                key = (cand.category_hint or "", cand.raw_title.strip().lower())
                if key in existing_candidate_keys:
                    continue

                # Adjust bounding box if present
                if cand.approximate_box and len(cand.approximate_box) == 4:
                    ty0, tx0, ty1, tx1 = cand.approximate_box
                    cand.approximate_box = [
                        round(ymin_offset + ty0 * span_y, 4),
                        round(xmin_offset + tx0 * span_x, 4),
                        round(ymin_offset + ty1 * span_y, 4),
                        round(xmin_offset + tx1 * span_x, 4),
                    ]

                merged_candidates.append(cand)
                existing_candidate_keys.add(key)

            # Merge coverage gaps
            for gap in res.coverage_gaps:
                if gap not in merged_coverage_gaps:
                    merged_coverage_gaps.append(gap)

        return PerceptionResult(
            environment=base_result.environment,
            scene_summary=base_result.scene_summary,
            objects=merged_objects,
            candidate_hazards=merged_candidates,
            checklist=base_result.checklist,
            quality=base_result.quality,
            coverage_gaps=merged_coverage_gaps,
            errors=base_result.errors,
        )

    async def perceive(
        self,
        image: PreparedImage,
        mode: Mode | str = Mode.quick,
        retry_focus: list[str] | None = None,
    ) -> PerceptionResult:
        """Run Scene Perception on image.

        Args:
            image: Preprocessed PreparedImage.
            mode: Mode.quick or Mode.deep.
            retry_focus: Optional list of hazard IDs or categories to re-check.

        Returns:
            PerceptionResult. Fail-closed: on error, returns schema-valid result with
            errors populated, never an empty hazard list marked as safe.
        """
        mode_enum = Mode(mode) if isinstance(mode, str) else mode
        prompt = self.build_prompt(retry_focus=retry_focus)

        try:
            base_result = await self.vision_service.perceive(image, prompt)
        except VisionServiceError as e:
            logger.error("VisionServiceError during scene perception: %s (code: %s)", e, e.error_code)
            return PerceptionResult(
                environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                scene_summary=f"Analysis failed due to upstream perception error: {e}",
                objects=[],
                candidate_hazards=[],
                checklist=[],
                quality=QualityFlags(),
                coverage_gaps=["Entire frame unassessed due to perception service error."],
                errors=[e.error_code],
            )
        except Exception as e:
            logger.exception("Unexpected error during scene perception: %s", e)
            return PerceptionResult(
                environment=EnvironmentInfo(label="unknown", confidence_band="low"),
                scene_summary=f"Analysis failed unexpectedly: {e}",
                objects=[],
                candidate_hazards=[],
                checklist=[],
                quality=QualityFlags(),
                coverage_gaps=["Entire frame unassessed due to internal processing error."],
                errors=["upstream_error"],
            )

        # If base result already contains errors, fail-closed immediately
        if base_result.errors:
            logger.warning("Perception returned with errors: %s", base_result.errors)
            return base_result

        # Check for non-scene image (screenshot, document, blank frame)
        if self._is_non_scene(base_result):
            logger.info("Non-scene input detected: %s / %s", base_result.environment.label, base_result.scene_summary)
            gaps = list(base_result.coverage_gaps)
            non_scene_gap = "Image does not depict an assessable physical scene (e.g. screenshot, document, or blank frame)."
            if non_scene_gap not in gaps:
                gaps.append(non_scene_gap)

            return PerceptionResult(
                environment=EnvironmentInfo(label="non_scene", confidence_band="high"),
                scene_summary=base_result.scene_summary or "The image is a non-scene input (screenshot, document, or blank frame).",
                objects=base_result.objects,
                candidate_hazards=[],
                checklist=[],
                quality=base_result.quality,
                coverage_gaps=gaps,
                errors=[],
            )

        # In deep mode, execute tile scans and merge findings
        if mode_enum == Mode.deep:
            return await self._execute_deep_scan(image, base_result, prompt)

        return base_result


async def perceive_scene(
    image: PreparedImage,
    mode: Mode | str = Mode.quick,
    retry_focus: list[str] | None = None,
    vision_service: VisionService | None = None,
) -> PerceptionResult:
    """Convenience functional wrapper for Agent 1."""
    agent = ScenePerceptionAgent(vision_service=vision_service)
    return await agent.perceive(image=image, mode=mode, retry_focus=retry_focus)
