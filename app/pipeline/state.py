"""Pipeline state definition for Hazard Precaution Advisor v2.

Defines PipelineState TypedDict per agent.md §4.3 and implementation_plan.md.
Tracks execution state across the LangGraph hazard assessment workflow.
"""
from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict

from app.schemas.api import AnalysisRequest
from app.schemas.enums import Outcome
from app.schemas.hazard import Hazard
from app.schemas.image import PreparedImage
from app.schemas.notification import NotificationRecord
from app.schemas.perception import PerceptionResult
from app.schemas.person_context import PersonContext
from app.schemas.precaution import Precaution
from app.schemas.report import SafetyReport
from app.schemas.risk import RiskAssessment
from app.schemas.verification import VerificationResult


class PipelineState(TypedDict):
    """Execution state tracked across the LangGraph hazard assessment workflow.

    Uses operator.add reducers for errors and trace lists to preserve full
    audit and execution history without state collisions.
    """
    request: AnalysisRequest
    image: PreparedImage | None
    perception: PerceptionResult | None
    hazards: list[Hazard]
    person_context: dict[str, PersonContext]
    risks: dict[str, RiskAssessment]
    precautions: dict[str, list[Precaution]]
    verification: VerificationResult | None
    report: SafetyReport | None
    notification: NotificationRecord | None
    retries_used: int
    retry_focus: list[str]
    errors: Annotated[list[str], operator.add]
    trace: Annotated[list[dict[str, Any]], operator.add]
    outcome: Outcome | None


def create_initial_state(
    request: AnalysisRequest,
    image: PreparedImage | None = None,
) -> PipelineState:
    """Helper to initialize a clean PipelineState with empty defaults."""
    return {
        "request": request,
        "image": image,
        "perception": None,
        "hazards": [],
        "person_context": {},
        "risks": {},
        "precautions": {},
        "verification": None,
        "report": None,
        "notification": None,
        "retries_used": 0,
        "retry_focus": [],
        "errors": [],
        "trace": [],
        "outcome": None,
    }
