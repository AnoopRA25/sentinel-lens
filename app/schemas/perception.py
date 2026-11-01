"""Perception schemas for Agent 1 (Scene Perception).

Defines CandidateHazard, ChecklistFinding, QualityFlags, EnvironmentInfo,
and PerceptionResult according to agent.md §6 and skills.md S-12/S-13.
"""

from typing import Any
from pydantic import BaseModel, Field, computed_field, field_validator

from app.schemas.enums import ChecklistFindingStatus, EvidenceStrength


class EnvironmentInfo(BaseModel):
    """Identified physical environment in the image."""
    label: str = Field(..., description="e.g. kitchen, bathroom, bedroom, living_room, stairs, outdoor, other, unknown")
    confidence_band: str = Field(default="medium", description="Confidence band: high, medium, low")

    def get(self, key: str, default: Any = None) -> Any:
        """Allow dict-like get access for pipeline routing."""
        return getattr(self, key, default)


class QualityFlags(BaseModel):
    """Visual quality defects that could impede reliable safety analysis."""
    blur: bool = Field(default=False, description="Significant motion or focus blur")
    darkness: bool = Field(default=False, description="Insufficient illumination or severe underexposure")
    glare: bool = Field(default=False, description="High specular reflection, bloom, or harsh lighting")
    framing: bool = Field(default=False, description="Excessively tight crop or poor view framing")

    @computed_field
    @property
    def has_defects(self) -> bool:
        """True if any image quality issue is flagged."""
        return self.blur or self.darkness or self.glare or self.framing

    def to_flag_list(self) -> list[str]:
        """Convert active quality flags into string tags for report scene."""
        flags: list[str] = []
        if self.blur:
            flags.append("blurred")
        if self.darkness:
            flags.append("dark")
        if self.glare:
            flags.append("glare")
        if self.framing:
            flags.append("tight_framing")
        return flags


class CandidateHazard(BaseModel):
    """Raw unverified hazard candidate identified by vision perception.
    Per Rule R2: Evidence before claim.
    Per Rule R3: Observed facts and assumptions are stored in separate fields.
    """
    raw_title: str = Field(..., description="Short descriptive title of the candidate hazard")
    category_hint: str | None = Field(default=None, description="Suggested hazard category ID (e.g. H01, H03)")
    description: str = Field(default="", description="Detailed factual description of what is seen")
    evidence: list[str] = Field(default_factory=list, description="Direct statements naming visible evidence")
    trigger: str | None = Field(default=None, description="Named visible trigger object for potential hazards")
    visibility: EvidenceStrength = Field(default=EvidenceStrength.clear, description="Visibility clarity band")
    assumptions: str | None = Field(default=None, description="Inferred assumptions, strictly kept separate from visible evidence")
    approximate_box: list[float] | None = Field(
        default=None,
        description="Optional approximate bounding box [ymin, xmin, ymax, xmax] normalized to [0, 1]"
    )


class ChecklistFinding(BaseModel):
    """Finding for a specific hazard category evaluated in the environment checklist sweep.
    Per Agent 1: cannot_see feeds coverage gaps, never hazards.
    """
    category_id: str = Field(..., description="Taxonomy hazard category ID, e.g. H01")
    finding: ChecklistFindingStatus = Field(..., description="present, absent, or cannot_see")
    evidence: str | None = Field(default=None, description="Visible evidence explaining the finding")


class PerceptionResult(BaseModel):
    """Output of Agent 1 Scene Perception."""
    environment: EnvironmentInfo = Field(..., description="Identified room or space environment")
    scene_summary: str = Field(..., description="Neutral objective description of the overall scene")
    objects: list[str] = Field(default_factory=list, description="Visible safety-relevant objects identified")
    candidate_hazards: list[CandidateHazard] = Field(default_factory=list, description="Candidate hazards detected")
    checklist: list[ChecklistFinding] = Field(default_factory=list, description="Environment checklist sweep results")
    quality: QualityFlags = Field(default_factory=QualityFlags, description="Image quality indicators")
    coverage_gaps: list[str] = Field(default_factory=list, description="Areas or angles that could not be assessed")
    errors: list[str] = Field(default_factory=list, description="Perception processing or parsing errors")

    @field_validator("environment", mode="before")
    @classmethod
    def parse_environment(cls, v: Any) -> Any:
        if isinstance(v, str):
            return EnvironmentInfo(label=v, confidence_band="medium")
        if isinstance(v, dict) and "label" not in v and "name" in v:
            return EnvironmentInfo(label=v["name"], confidence_band=v.get("confidence_band", "medium"))
        return v
