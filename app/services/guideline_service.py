"""Guideline service for safety precaution retrieval (skills.md S-20).

Loads curated safety guidelines from /home/blue/anup/data/guidelines/safety_guidelines.json.
Retrieves and filters precautions per hazard category and target person profile:
1. Category lookup
2. Person filtering
3. Priority ranking
4. Normalised text de-duplication
5. Conflict resolution via 'conflicts_with'
6. Fallback tiers (Category Generic -> Universal Fallback)
Guarantee: Never returns an empty list for any hazard.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from app.schemas.enums import PersonCategory, PrecautionProvenance
from app.schemas.precaution import Precaution

logger = logging.getLogger(__name__)

DEFAULT_GUIDELINES_PATH = "/home/blue/anup/data/guidelines/safety_guidelines.json"

# Universal hardcoded fallback precaution if file missing or corrupt (guarantee never-empty)
UNIVERSAL_FALLBACK_PRECAUTION = Precaution(
    text="Keep people away from the hazard area, avoid disturbance, and consult a qualified professional.",
    provenance=PrecautionProvenance.generic,
    guideline_id="UNIV-001",
    source_note="Universal baseline safety protocol",
    priority=99,
    applies_to=[],
)


def normalize_precaution_text(text: str) -> str:
    """Normalize precaution text for deduplication: lowercase, strip punctuation and extra spaces."""
    cleaned = re.sub(r"[^\w\s]", "", text.lower())
    return " ".join(cleaned.split())


class GuidelineService:
    """Service to load, filter, and rank safety precautions from the knowledge base."""

    def __init__(self, guidelines_path: str = DEFAULT_GUIDELINES_PATH) -> None:
        self.guidelines_path = guidelines_path
        self._guidelines_by_category: dict[str, list[dict[str, Any]]] = {}
        self._category_generics: dict[str, list[dict[str, Any]]] = {}
        self._universal_fallbacks: list[dict[str, Any]] = []
        self._loaded: bool = False
        self.reload()

    def reload(self) -> None:
        """Reload guidelines from the filesystem."""
        self._guidelines_by_category.clear()
        self._category_generics.clear()
        self._universal_fallbacks.clear()

        if not os.path.exists(self.guidelines_path):
            logger.warning("Guidelines file not found at %s. Using hardcoded fallback.", self.guidelines_path)
            self._loaded = False
            return

        try:
            with open(self.guidelines_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            # 1. Main guidelines
            for item in data.get("guidelines", []):
                cat_id = item.get("category_id")
                if cat_id:
                    self._guidelines_by_category.setdefault(cat_id, []).append(item)

            # 2. Category generic fallbacks
            for cat_id, items in data.get("category_generics", {}).items():
                if isinstance(items, list):
                    self._category_generics[cat_id] = items

            # 3. Universal fallbacks
            univ = data.get("universal_fallback", [])
            if isinstance(univ, list):
                self._universal_fallbacks = univ

            self._loaded = True
            logger.info(
                "Loaded guidelines for %d categories from %s",
                len(self._guidelines_by_category),
                self.guidelines_path,
            )
        except Exception as exc:
            logger.error("Failed to parse guidelines file %s: %s", self.guidelines_path, exc)
            self._loaded = False

    def _matches_person(self, item: dict[str, Any], person: PersonCategory) -> bool:
        """Check if guideline applies to the specified person category."""
        applies = item.get("applies_to")
        if not applies:
            return True
        person_val = person.value if isinstance(person, PersonCategory) else str(person)
        norm_applies = [a.value if isinstance(a, PersonCategory) else str(a).lower() for a in applies]
        if "all" in norm_applies or person_val.lower() in norm_applies:
            return True
        return False

    def _filter_and_resolve(
        self,
        raw_items: list[dict[str, Any]],
        person: PersonCategory,
        provenance: PrecautionProvenance,
    ) -> list[Precaution]:
        """Apply person filter, priority sort, text deduplication, and conflict resolution."""
        # 1. Person category filtering
        eligible = [item for item in raw_items if self._matches_person(item, person)]

        # 2. Priority ranking (lower integer priority = higher urgency)
        eligible.sort(key=lambda x: int(x.get("priority", 10)))

        # 3. Conflict resolution & Deduplication
        selected: list[Precaution] = []
        selected_ids: set[str] = set()
        seen_texts: set[str] = set()
        blocked_ids: set[str] = set()

        for item in eligible:
            item_id = item.get("id")
            conflicts_with = set(item.get("conflicts_with", []))

            # Conflict resolution: Discard if this item is blocked by an earlier higher-priority item
            if item_id and item_id in blocked_ids:
                continue

            # Check if this item conflicts with any already selected item
            if conflicts_with.intersection(selected_ids):
                continue

            # Text deduplication
            raw_text = str(item.get("text", "")).strip()
            if not raw_text:
                continue
            norm_text = normalize_precaution_text(raw_text)
            if norm_text in seen_texts:
                continue

            # Accept item
            seen_texts.add(norm_text)
            if item_id:
                selected_ids.add(item_id)
                # Block all items that this accepted item conflicts with
                blocked_ids.update(conflicts_with)

            prov_val = item.get("provenance", provenance.value)
            try:
                item_prov = PrecautionProvenance(prov_val)
            except ValueError:
                item_prov = provenance

            applies_list = item.get("applies_to", [])
            applies_parsed: list[PersonCategory | str] = []
            for a in applies_list:
                try:
                    applies_parsed.append(PersonCategory(a))
                except ValueError:
                    applies_parsed.append(str(a))

            prec = Precaution(
                text=raw_text,
                provenance=item_prov,
                guideline_id=item_id,
                source_note=item.get("source_note"),
                priority=int(item.get("priority", 1)),
                applies_to=applies_parsed,
            )
            selected.append(prec)

        return selected

    def get_precautions_for_hazard(
        self,
        category_id: str,
        person: PersonCategory,
    ) -> list[Precaution]:
        """Retrieve deduplicated, conflict-resolved precautions for a specific hazard category and person.

        Follows fallback tiers:
        - Tier 0: Direct curated guidelines for category_id
        - Tier 1: Category generic precautions for category_id
        - Tier 2: Universal fallback precautions
        Guarantee: Never returns an empty list.
        """
        # Tier 0: Direct category guidelines
        category_items = self._guidelines_by_category.get(category_id, [])
        precautions = self._filter_and_resolve(
            raw_items=category_items,
            person=person,
            provenance=PrecautionProvenance.guideline,
        )
        if precautions:
            return precautions

        # Tier 1: Category generic fallback
        generic_items = self._category_generics.get(category_id, [])
        if generic_items:
            precautions = self._filter_and_resolve(
                raw_items=generic_items,
                person=person,
                provenance=PrecautionProvenance.generic,
            )
            if precautions:
                return precautions

        # Tier 2: Universal fallback from file
        if self._universal_fallbacks:
            precautions = self._filter_and_resolve(
                raw_items=self._universal_fallbacks,
                person=person,
                provenance=PrecautionProvenance.generic,
            )
            if precautions:
                return precautions

        # Absolute guarantee: Universal hardcoded fallback
        return [UNIVERSAL_FALLBACK_PRECAUTION.model_copy(deep=True)]
