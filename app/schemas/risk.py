"""Risk assessment schemas for Agent 4 (Risk Assessment).

Defines RiskAssessment and RiskResult per agent.md §6 and skills.md S-19.
Adheres to Rule R4 (ordinal labels, auditable rule IDs, no probabilities).
"""

from pydantic import BaseModel, Field

from app.schemas.enums import RiskLevel


class RiskAssessment(BaseModel):
    """Auditable risk assessment for a single hazard.
    Per Rule R4: Risk comes from documented, auditable rules (rule IDs are returned).
    Risk levels are ordinal labels, not probabilities.
    Per Rule R5: Described as a rule engine, never predictive/trained.
    """
    level: RiskLevel = Field(
        ...,
        description="Assigned ordinal risk level (low, medium, high, uncertain)"
    )
    potential_level: RiskLevel | None = Field(
        default=None,
        description="Potential risk level if confirmed (for 'possible' or weak evidence items)"
    )
    rule_ids: list[str] = Field(
        default_factory=list,
        description="Auditable identifiers of risk rules triggered (e.g. R-BASE-H03, R-COMBO-WATER-ELEC)"
    )
    rationale: str = Field(
        default="",
        description="Factual justification explaining how rule score was computed"
    )
    recommend_reanalysis: bool = Field(
        default=False,
        description="Whether re-scanning from a different angle or lighting is recommended"
    )
    recommend_human_check: bool = Field(
        default=False,
        description="Whether physical on-site human inspection is recommended"
    )


class RiskResult(BaseModel):
    """Aggregate result from Agent 4 across all scene hazards."""
    risks: dict[str, RiskAssessment] = Field(
        default_factory=dict,
        description="Map of hazard_id to RiskAssessment"
    )
    overall_risk: RiskLevel = Field(
        default=RiskLevel.low,
        description="Highest risk level among confirmed (observed/likely) hazards"
    )
    immediate_action: bool = Field(
        default=False,
        description="True if critical hazard triggers immediate safety alert (fire/smoke, active wire in water)"
    )
    rationale: str = Field(
        default="",
        description="Summary rationale for overall scene risk"
    )
