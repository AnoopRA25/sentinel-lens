"""Person context schemas for Agent 3 (Person Context).

Defines how hazards affect the user-selected person category
(baby, child, adult, elderly).
"""

from pydantic import BaseModel, Field

from app.schemas.enums import RelevanceLevel


class PersonContext(BaseModel):
    """Contextual vulnerability assessment of a hazard for a specific person category.
    Per Rule R6: Person category is a user input, never inferred.
    """
    relevance: RelevanceLevel = Field(
        default=RelevanceLevel.normal,
        description="Relevance rating for this person category (high, normal, low)"
    )
    vulnerability_factors: list[str] = Field(
        default_factory=list,
        description="Specific behavioral or developmental factors (e.g. mouthing, limited reach)"
    )
    severity_modifier: int = Field(
        default=0,
        ge=-1,
        le=2,
        description="Risk rule severity adjustment (-1 to +2)"
    )
    note: str = Field(
        default="",
        description="Human-readable explanation of why this hazard matters to the person category"
    )
