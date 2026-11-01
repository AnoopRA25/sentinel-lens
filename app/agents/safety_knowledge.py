"""Agent 5 — Safety Knowledge (safety_knowledge.py).

Per agent.md §6 and skills.md S-20:
- Matches hazards to actionable precautions from the structured knowledge base.
- Uses GuidelineService to retrieve, filter by person category, rank, and deduplicate precautions.
- Fallback tiers: Category-level generic -> Universal fallback ("Keep people away...").
- Guarantee: Never returns an empty precaution list for any hazard.
- Adheres to Rule R8: Provenance required ('guideline', 'generic', 'ai_general'); no invented citations.
- Default: No model-written precautions unless ALLOW_AI_GENERAL_PRECAUTIONS=true.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from app.core.config import get_settings
from app.schemas.enums import PersonCategory, PrecautionProvenance
from app.schemas.hazard import Hazard
from app.schemas.precaution import Precaution
from app.services.guideline_service import GuidelineService

logger = logging.getLogger(__name__)


class SafetyKnowledgeAgent:
    """Agent responsible for matching hazards to verified precautions."""

    def __init__(
        self,
        guideline_service: GuidelineService | None = None,
        allow_ai_general: bool | None = None,
    ) -> None:
        self.guideline_service = guideline_service or GuidelineService()
        settings = get_settings()
        self.allow_ai_general = (
            allow_ai_general
            if allow_ai_general is not None
            else settings.ALLOW_AI_GENERAL_PRECAUTIONS
        )

    def retrieve_precautions_for_hazard(
        self,
        hazard: Hazard,
        person_category: PersonCategory | str,
    ) -> list[Precaution]:
        """Retrieve deduplicated, ranked precautions for a single hazard.

        Fallback tiers:
        1. Curated guidelines matching category & person
        2. Category generic fallback
        3. Universal fallback
        """
        person = (
            person_category
            if isinstance(person_category, PersonCategory)
            else PersonCategory(str(person_category))
        )

        precautions = self.guideline_service.get_precautions_for_hazard(
            category_id=hazard.category_id,
            person=person,
        )

        # AI General precautions (strictly opt-in and marked per Rule R8)
        if self.allow_ai_general and not any(p.provenance == PrecautionProvenance.ai_general for p in precautions):
            ai_prec = Precaution(
                text=f"Inspect visible area around {hazard.title} and consult local safety guidelines.",
                provenance=PrecautionProvenance.ai_general,
                guideline_id=None,
                source_note="AI-generated general recommendation (review before relying)",
                priority=20,
                applies_to=[person],
            )
            precautions.append(ai_prec)

        return precautions

    def retrieve_precautions_for_hazards(
        self,
        hazards: list[Hazard],
        person_category: PersonCategory | str,
    ) -> dict[str, list[Precaution]]:
        """Retrieve precautions for all hazards and attach them to hazard instances.

        Returns a dictionary mapping hazard ID to its list of precautions.
        """
        person = (
            person_category
            if isinstance(person_category, PersonCategory)
            else PersonCategory(str(person_category))
        )

        results: dict[str, list[Precaution]] = {}
        for h in hazards:
            precs = self.retrieve_precautions_for_hazard(hazard=h, person_category=person)
            h.precautions = precs
            results[h.id] = precs

        return results


def retrieve_safety_knowledge(
    hazards: list[Hazard],
    person_category: PersonCategory | str,
    guideline_service: GuidelineService | None = None,
    allow_ai_general: bool | None = None,
) -> dict[str, list[Precaution]]:
    """Functional interface for Agent 5."""
    agent = SafetyKnowledgeAgent(
        guideline_service=guideline_service,
        allow_ai_general=allow_ai_general,
    )
    return agent.retrieve_precautions_for_hazards(
        hazards=hazards,
        person_category=person_category,
    )


def safety_knowledge_node(state: dict[str, Any]) -> dict[str, Any]:
    """LangGraph node execution wrapper for Agent 5."""
    start_time = time.monotonic()
    hazards: list[Hazard] = state.get("hazards", [])
    request = state.get("request")
    person_category = getattr(request, "person_category", PersonCategory.adult)
    if isinstance(person_category, str):
        person_category = PersonCategory(person_category)

    agent = SafetyKnowledgeAgent()
    precautions_map = agent.retrieve_precautions_for_hazards(
        hazards=hazards,
        person_category=person_category,
    )

    elapsed_ms = (time.monotonic() - start_time) * 1000.0
    trace_event = {
        "node": "retrieve_guidelines",
        "status": "ok",
        "duration_ms": round(elapsed_ms, 2),
        "attempt": 1,
        "summary": f"Retrieved precautions for {len(hazards)} hazard(s)",
    }

    return {
        "precautions": precautions_map,
        "hazards": hazards,
        "trace": [trace_event],
    }
