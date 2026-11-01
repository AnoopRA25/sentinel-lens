"""Safety report schemas for Agent 7 (Safety Report).

Defines ReportScene, SafetyReport, TraceEvent, and ErrorInfo per agent.md §5.3, §6,
and skills.md S-24.
Adheres strictly to Rule R1: Never claims 'safe', 'no danger', or 'all clear'.
"""

import re
from typing import Any
from pydantic import BaseModel, Field, model_validator

from app.schemas.enums import Language, Outcome, PersonCategory, RiskLevel
from app.schemas.hazard import Hazard
from app.schemas.notification import NotificationRecord
from app.schemas.verification import VerificationResult

# Rule R1: Forbidden phrases in user-facing statements
FORBIDDEN_ASSERTIONS = (
    r"\ball\s+clear\b",
    r"\bno\s+danger\b",
    r"\bguaranteed\b",
    r"\bsafe\b",
)


def check_forbidden_phrases(text: str, field_name: str) -> None:
    """Validate that text does not violate Rule R1."""
    if not text:
        return
    text_lower = text.lower()
    for pattern in FORBIDDEN_ASSERTIONS:
        if re.search(pattern, text_lower):
            raise ValueError(
                f"Rule R1 Violation in '{field_name}': User-facing text must never say "
                f"'safe', 'no danger', or 'all clear'. Use 'No hazards observed in this view'."
            )


class TraceEvent(BaseModel):
    """Execution event emitted during pipeline run."""
    type: str = Field(default="node_finished", description="Event type: node_started, node_finished, node_failed, retry, preview, result, error")
    node: str = Field(..., description="Pipeline node name (e.g. perceive, classify, verify)")
    status: str = Field(default="ok", description="Status: ok, error, retry, preview")
    duration_ms: float = Field(default=0.0, ge=0.0, description="Real execution duration in milliseconds")
    attempt: int = Field(default=1, ge=1, description="Attempt number")
    ts: str | None = Field(default=None, description="ISO timestamp")
    summary: str | None = Field(default=None, description="Event summary note")


class ErrorInfo(BaseModel):
    """Structured error descriptor."""
    code: str = Field(..., description="Error identifier code (e.g. missing_api_key, rate_limited)")
    message: str = Field(..., description="Descriptive error explanation")
    node: str | None = Field(default=None, description="Node where error occurred")
    recoverable: bool = Field(default=False, description="Whether error can be retried")


class ReportScene(BaseModel):
    """High-level summary of the assessed scene environment and coverage."""
    environment: str = Field(..., description="Environment label (e.g. kitchen, bathroom)")
    summary: str = Field(..., description="Neutral factual description of visible scene")
    quality_flags: list[str] = Field(default_factory=list, description="Quality issue tags")
    coverage_gaps: list[str] = Field(
        default_factory=list,
        description="Explicitly identified unassessed or obscured areas"
    )

    @model_validator(mode="after")
    def validate_wording(self) -> "ReportScene":
        check_forbidden_phrases(self.summary, "scene.summary")
        return self


class SafetyReport(BaseModel):
    """Final verified safety report generated for UI presentation and export.
    Per Rule R1: A failed or unreliable analysis is never shown as safe.
    User-facing text never says 'safe', 'no danger' or 'all clear'.
    """
    id: str = Field(..., description="Unique analysis result ID")
    timestamp: str = Field(..., description="ISO 8601 completion timestamp")
    outcome: Outcome = Field(..., description="hazards_found | none_observed | inconclusive | failed")
    analysis_reliable: bool = Field(..., description="Whether perception and verification met reliability criteria")
    person_category: PersonCategory = Field(..., description="Target person category evaluated")
    language: Language = Field(..., description="Report language")
    scene: ReportScene = Field(..., description="Scene overview, environment, and coverage gaps")
    hazards: list[Hazard] = Field(default_factory=list, description="Active verified hazards")
    overall_risk: RiskLevel = Field(..., description="Overall risk rating (low, medium, high, uncertain)")
    immediate_action: bool = Field(default=False, description="Whether immediate intervention is warranted")
    verification: VerificationResult = Field(..., description="Verification critic evaluation results")
    notification: NotificationRecord | None = Field(default=None, description="Caregiver alert dispatch record")
    errors: list[str] = Field(default_factory=list, description="Errors encountered during execution")
    translation_error: str | None = Field(default=None, description="Translation error if non-English translation failed")
    trace: list[TraceEvent] = Field(default_factory=list, description="Node execution trace events")
    limits: str = Field(
        default="Based on one still image. Hazards outside the frame or hidden from view are not assessed.",
        description="Boundary disclaimer on visual assessment scope"
    )
    disclaimer: str = Field(
        default="This assessment is not a guarantee of safety. Hazards outside the frame or hidden from view cannot be assessed.",
        description="Standard legal / medical safety disclaimer"
    )
    headline: str = Field(
        default="",
        description="Headline summary for user view (e.g. 'No hazards observed in this view')"
    )

    @model_validator(mode="after")
    def validate_r1_and_defaults(self) -> "SafetyReport":
        # Rule R1: Validate headline and limits
        if self.headline:
            check_forbidden_phrases(self.headline, "headline")
        else:
            if self.outcome == Outcome.none_observed:
                self.headline = "No hazards observed in this view"
            elif self.outcome == Outcome.hazards_found:
                self.headline = f"{len(self.hazards)} hazard(s) observed"
            elif self.outcome == Outcome.inconclusive:
                self.headline = "Analysis inconclusive - visual conditions prevent reliable assessment"
            elif self.outcome == Outcome.failed:
                self.headline = "Analysis could not run. This is not a verified view."

        # Rule R1: Ensure unreliable/failed analysis is never outcome none_observed
        if (not self.analysis_reliable or self.outcome == Outcome.failed) and self.outcome == Outcome.none_observed:
            raise ValueError("Rule R1 Violation: An unreliable or failed analysis cannot have outcome 'none_observed'.")

        return self
