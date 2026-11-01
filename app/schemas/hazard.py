"""Hazard schemas for Agent 2 (Hazard Classification) and pipeline state.

Defines Hazard and HazardAudit per agent.md §5.3 and §6.
Enforces Rule R2 (evidence before claim; no possible hazard without trigger)
and Rule R7 (approximate regions only).
"""

from pydantic import BaseModel, Field

from app.schemas.enums import EvidenceStrength, HazardStatus, RelevanceLevel
from app.schemas.precaution import Precaution
from app.schemas.risk import RiskAssessment


class Hazard(BaseModel):
    """Normalized, verified hazard entity presented in reports.
    Per Rule R2: Evidence before claim. No hazard without an evidence string;
    no 'possible' hazard without a visible trigger.
    Per Rule R7: Regions are labelled approximate.
    """
    id: str = Field(..., description="Unique hazard identifier (e.g. hz_1)")
    category_id: str = Field(..., description="Taxonomy category identifier (e.g. H01, H03)")
    title: str = Field(..., description="Normalized concise title of the hazard")
    status: HazardStatus = Field(..., description="Evidence tier: observed, likely, or possible")
    evidence_strength: EvidenceStrength = Field(..., description="Categorical evidence strength: clear, partial, weak")
    evidence: list[str] = Field(
        default_factory=list,
        description="List of direct observations proving or supporting this hazard"
    )
    trigger: str | None = Field(
        default=None,
        description="Visible object triggering a 'possible' hazard class (required for possible status)"
    )
    region: list[float] | None = Field(
        default=None,
        description="Optional approximate bounding box [ymin, xmin, ymax, xmax] normalized to [0, 1]"
    )
    person_relevance: RelevanceLevel | str | None = Field(
        default=None,
        description="Relevance to selected person category (high, normal, low)"
    )
    risk: RiskAssessment | None = Field(
        default=None,
        description="Evaluated risk assessment for this hazard"
    )
    precautions: list[Precaution] = Field(
        default_factory=list,
        description="Actionable precautions retrieved for this hazard"
    )


class HazardAudit(BaseModel):
    """Audit record for a candidate hazard that was dropped or filtered during classification.
    Per Agent 2: Visible in the audit trace, never in the user report.
    """
    id: str = Field(..., description="Identifier of candidate")
    raw_title: str = Field(..., description="Original raw title from perception")
    category_id: str | None = Field(default=None, description="Category evaluated")
    reason: str = Field(
        ...,
        description="Reason for dropping: possible_without_trigger, duplicate, cap_exceeded, etc."
    )
    evidence: list[str] = Field(default_factory=list, description="Original evidence if any")
    trigger: str | None = Field(default=None, description="Trigger field value")


class HazardClassificationResult(BaseModel):
    """Output bundle from Agent 2 Hazard Classification."""
    hazards: list[Hazard] = Field(default_factory=list, description="Active classified hazards")
    dropped: list[HazardAudit] = Field(default_factory=list, description="Audit log of filtered candidates")
