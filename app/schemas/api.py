"""API schemas for HTTP endpoints, background jobs, and multi-frame sessions.

Defines AnalysisRequest, AnalysisResult, JobStatus, and SessionSummary
per agent.md §4.3, §5.3, §6 (Agent 9), and skills.md S-23, S-28.
"""

from typing import Any
from pydantic import BaseModel, Field

from app.schemas.enums import (
    HazardStatus,
    JobStatusEnum,
    Language,
    Mode,
    Outcome,
    PersonCategory,
    RiskLevel,
    Source,
)
from app.schemas.hazard import Hazard
from app.schemas.notification import NotificationRecord
from app.schemas.precaution import Precaution
from app.schemas.report import ErrorInfo, ReportScene, TraceEvent
from app.schemas.verification import VerificationResult


class AnalysisRequest(BaseModel):
    """Parameters submitted with an image or video frame for analysis."""
    person_category: PersonCategory = Field(
        default=PersonCategory.adult,
        description="User-selected target person category (baby, child, adult, elderly)"
    )
    language: Language = Field(
        default=Language.en,
        description="Target output language (en, kn, hi)"
    )
    mode: Mode = Field(
        default=Mode.quick,
        description="Analysis mode (quick, deep)"
    )
    source: Source = Field(
        default=Source.photo,
        description="Input source type (photo, frame, video_frame)"
    )
    session_id: str | None = Field(
        default=None,
        description="Optional session ID for video or live monitoring streams"
    )
    frame_ts: float | None = Field(
        default=None,
        description="Timestamp offset (seconds) for video frames"
    )
    view_index: int | None = Field(
        default=None,
        description="Sequential index of frame within session"
    )
    deep_scan: bool = Field(
        default=False,
        description="Whether to run multi-tile deep scan"
    )


class AnalysisResult(BaseModel):
    """The canonical analysis response rendered by the frontend.
    Strictly matches the schema in agent.md §5.3.
    """
    id: str = Field(..., description="Unique result identifier (e.g. an_20261101_101502_ab12)")
    timestamp: str = Field(..., description="ISO 8601 completion timestamp")
    outcome: Outcome = Field(..., description="Outcome: hazards_found, none_observed, inconclusive, failed")
    analysis_reliable: bool = Field(..., description="True if analysis completed reliably without critical defects")
    person_category: PersonCategory = Field(..., description="Person category evaluated")
    language: Language = Field(..., description="Report language")
    scene: ReportScene = Field(..., description="Scene overview, environment, and coverage gaps")
    hazards: list[Hazard] = Field(default_factory=list, description="Verified hazards found")
    overall_risk: RiskLevel = Field(..., description="Overall highest risk level among confirmed hazards")
    immediate_action: bool = Field(default=False, description="Whether immediate action is warranted")
    verification: VerificationResult = Field(..., description="Verification critic results")
    notification: NotificationRecord | None = Field(default=None, description="Caregiver notification status")
    errors: list[str] = Field(default_factory=list, description="List of operational errors if any")
    translation_error: str | None = Field(default=None, description="Translation error details if fallback to English")
    trace: list[TraceEvent] = Field(default_factory=list, description="Real execution trace events")
    limits: str = Field(
        default="Based on one still image. Hazards outside the frame or hidden from view are not assessed.",
        description="Honest boundary limits statement"
    )


class JobStatus(BaseModel):
    """Asynchronous analysis job status for SSE and polling (skills.md S-28)."""
    job_id: str = Field(..., description="Unique background job identifier")
    status: JobStatusEnum = Field(default=JobStatusEnum.pending, description="Job lifecycle status")
    created_at: str = Field(..., description="ISO 8601 job creation timestamp")
    updated_at: str | None = Field(default=None, description="ISO 8601 last status update")
    result: AnalysisResult | None = Field(default=None, description="Completed analysis result")
    error: str | None = Field(default=None, description="Job failure message if status is failed")


class AggregatedHazard(BaseModel):
    """A hazard tracked across multiple frames or views in a session (Agent 9)."""
    id: str = Field(..., description="Unified hazard identifier")
    category_id: str = Field(..., description="Taxonomy category identifier")
    title: str = Field(..., description="Hazard title")
    status: HazardStatus = Field(default=HazardStatus.observed, description="Highest confirmed status")
    max_risk: RiskLevel = Field(default=RiskLevel.low, description="Maximum observed risk level")
    sightings_count: int = Field(default=1, ge=1, description="Number of views/frames where this hazard was seen")
    sightings: list[str] = Field(default_factory=list, description="Frame identifiers or timestamps")
    first_seen: str | None = Field(default=None, description="Timestamp first observed")
    last_seen: str | None = Field(default=None, description="Timestamp most recently observed")
    evidence: list[str] = Field(default_factory=list, description="Consolidated visible evidence")
    precautions: list[Precaution] = Field(default_factory=list, description="Applicable precautions")


class SessionSummary(BaseModel):
    """Aggregated summary of a live or video monitoring session (Agent 9).
    Per Rule R11: Periodic frame sampling disclaimer included.
    """
    session_id: str = Field(..., description="Monitoring session identifier")
    total_frames: int = Field(default=0, ge=0, description="Total frames received")
    views_analyzed: int = Field(default=0, ge=0, description="Frames successfully analyzed")
    first_seen: str | None = Field(default=None, description="Session start timestamp")
    last_seen: str | None = Field(default=None, description="Session end / latest timestamp")
    hazards: list[AggregatedHazard] = Field(default_factory=list, description="Deduplicated cross-frame hazards")
    max_risk: RiskLevel = Field(default=RiskLevel.low, description="Maximum risk level recorded across all views")
    change_events: list[dict[str, Any]] = Field(default_factory=list, description="Notable risk escalation or change events")
    coverage_gaps: list[str] = Field(default_factory=list, description="Combined coverage gaps across views")
    limits_disclaimer: str = Field(
        default="Periodic frame sampling. Events between frames can be missed.",
        description="Disclaimer per Rule R11"
    )
