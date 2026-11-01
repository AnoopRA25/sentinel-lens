"""Agent 3 — Person Context (person_context.py).

Per agent.md §6 and skills.md S-18:
- Describe how each hazard affects the selected person category (baby, child, adult, elderly).
- Reads data/person_profiles.json.
- Returns dict[str, PersonContext] keyed by hazard id.
- Rule R6: Person category is a user input, never inferred from the image.
- Non-negotiable rule: NEVER drop a hazard because of low relevance.
  Low-relevance hazards remain in the report and are ordered lower.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.schemas.enums import PersonCategory, RelevanceLevel
from app.schemas.hazard import Hazard
from app.schemas.person_context import PersonContext

logger = logging.getLogger(__name__)

DEFAULT_PROFILES_PATH = Path("/home/blue/anup/data/person_profiles.json")


class PersonContextAgent:
    """Agent 3: Person Contextualizer.

    Evaluates behavioral vulnerabilities, reach capabilities, and hazard relevance
    for the selected person category.
    """

    def __init__(self, profiles_path: Path | str = DEFAULT_PROFILES_PATH) -> None:
        self.profiles_path = Path(profiles_path)
        self._profiles_cache: dict[str, Any] | None = None

    def _ensure_profiles_loaded(self) -> dict[str, Any]:
        if self._profiles_cache is None:
            if self.profiles_path.exists():
                with open(self.profiles_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._profiles_cache = data.get("profiles", {})
            else:
                logger.warning("Person profiles file not found at %s. Using default empty profiles.", self.profiles_path)
                self._profiles_cache = {}
        return self._profiles_cache

    def evaluate_hazard(
        self,
        hazard: Hazard,
        person_category: PersonCategory | str,
    ) -> PersonContext:
        """Evaluate a single hazard against the target person profile."""
        profiles = self._ensure_profiles_loaded()
        person_key = person_category.value if isinstance(person_category, PersonCategory) else str(person_category).lower()

        profile = profiles.get(person_key, {})
        cat_id = hazard.category_id

        # 1. Relevance level (high | normal | low)
        raw_relevance = profile.get("relevance", {}).get(cat_id, "normal")
        try:
            relevance = RelevanceLevel(raw_relevance)
        except ValueError:
            relevance = RelevanceLevel.normal

        # 2. Severity modifier (-1 to +2, strictly clamped)
        raw_modifier = profile.get("severity_modifiers", {}).get(cat_id, 0)
        try:
            clamped_modifier = max(-1, min(2, int(raw_modifier)))
        except (ValueError, TypeError):
            clamped_modifier = 0

        # 3. Vulnerability description / factors
        vuln_text = profile.get("category_vulnerabilities", {}).get(cat_id, "")
        factors: list[str] = []
        if vuln_text:
            factors.append(vuln_text)

        # Append reach/mobility characteristic if relevant
        reach_chars = profile.get("reach_mobility_characteristics", {})
        if relevance == RelevanceLevel.high and reach_chars:
            hazard_recog = reach_chars.get("hazard_recognition")
            if hazard_recog and "none" in hazard_recog.lower():
                factors.append(f"Zero hazard recognition: {hazard_recog}")
            mouthing = reach_chars.get("mouthing_behaviour")
            if mouthing and cat_id in ["H08", "H09"] and "universal" in mouthing.lower():
                factors.append(f"Mouthing behavior: {mouthing}")

        # 4. Context note
        note = vuln_text or f"Evaluated for {person_key} profile."

        return PersonContext(
            relevance=relevance,
            vulnerability_factors=factors,
            severity_modifier=clamped_modifier,
            note=note,
        )

    def contextualize(
        self,
        hazards: list[Hazard],
        person_category: PersonCategory | str,
    ) -> dict[str, PersonContext]:
        """Contextualize all hazards for the selected person category.

        Args:
            hazards: List of classified hazards.
            person_category: Target person category (baby, child, adult, elderly).

        Returns:
            dict[str, PersonContext] keyed by hazard.id.
            Guarantees: Every input hazard is present; NO hazard is dropped due to low relevance.
        """
        person_enum = (
            PersonCategory(person_category)
            if isinstance(person_category, str)
            else person_category
        )

        context_map: dict[str, PersonContext] = {}
        for h in hazards:
            ctx = self.evaluate_hazard(h, person_enum)
            context_map[h.id] = ctx
            # Also attach person_relevance to the hazard object
            h.person_relevance = ctx.relevance

        return context_map


def contextualize_hazards(
    hazards: list[Hazard],
    person_category: PersonCategory | str,
    profiles_path: Path | str = DEFAULT_PROFILES_PATH,
) -> dict[str, PersonContext]:
    """Convenience functional wrapper for Agent 3."""
    agent = PersonContextAgent(profiles_path=profiles_path)
    return agent.contextualize(hazards=hazards, person_category=person_category)
