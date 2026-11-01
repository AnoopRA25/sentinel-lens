"""Precaution schemas for Agent 5 (Safety Knowledge).

Defines Precaution per agent.md §6 and skills.md S-20.
Adheres to Rule R8: provenance required, no invented citations.
"""

from pydantic import BaseModel, Field

from app.schemas.enums import PersonCategory, PrecautionProvenance


class Precaution(BaseModel):
    """Actionable safety precaution mapped to a hazard.
    Per Rule R8: Every precaution carries its provenance ('guideline' or 'generic').
    """
    text: str = Field(..., description="Actionable safety precaution guidance")
    provenance: PrecautionProvenance = Field(
        default=PrecautionProvenance.guideline,
        description="Origin of precaution: guideline, generic, or ai_general"
    )
    guideline_id: str | None = Field(
        default=None,
        description="Guideline reference ID (e.g. G-H03-002) if retrieved from knowledge base"
    )
    source_note: str | None = Field(
        default=None,
        description="Verified citation or standard reference note (never fabricated)"
    )
    priority: int = Field(
        default=1,
        ge=1,
        description="Precaution priority order (1 is most urgent)"
    )
    applies_to: list[PersonCategory | str] = Field(
        default_factory=list,
        description="Target person categories this precaution applies to (empty = all)"
    )
