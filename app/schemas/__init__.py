"""Schemas package for Hazard Precaution Advisor v2.

Central re-export of all Pydantic models and Enums.
"""

from app.schemas.enums import (
    ChecklistFindingStatus,
    EvidenceStrength,
    HazardStatus,
    JobStatusEnum,
    Language,
    Mode,
    NotifyStatus,
    Outcome,
    PersonCategory,
    PrecautionProvenance,
    RelevanceLevel,
    RiskLevel,
    Source,
    TraceEventType,
    VerifyStatus,
)
from app.schemas.image import PreparedImage
from app.schemas.perception import (
    CandidateHazard,
    ChecklistFinding,
    EnvironmentInfo,
    PerceptionResult,
    QualityFlags,
)
from app.schemas.hazard import (
    Hazard,
    HazardAudit,
    HazardClassificationResult,
)
from app.schemas.person_context import PersonContext
from app.schemas.risk import RiskAssessment, RiskResult
from app.schemas.precaution import Precaution
from app.schemas.verification import VerificationCheck, VerificationResult
from app.schemas.notification import NotificationRecord
from app.schemas.report import (
    ErrorInfo,
    ReportScene,
    SafetyReport,
    TraceEvent,
)
from app.schemas.api import (
    AggregatedHazard,
    AnalysisRequest,
    AnalysisResult,
    JobStatus,
    SessionSummary,
)

__all__ = [
    # Enums
    "ChecklistFindingStatus",
    "EvidenceStrength",
    "HazardStatus",
    "JobStatusEnum",
    "Language",
    "Mode",
    "NotifyStatus",
    "Outcome",
    "PersonCategory",
    "PrecautionProvenance",
    "RelevanceLevel",
    "RiskLevel",
    "Source",
    "TraceEventType",
    "VerifyStatus",
    # Image
    "PreparedImage",
    # Perception
    "CandidateHazard",
    "ChecklistFinding",
    "EnvironmentInfo",
    "PerceptionResult",
    "QualityFlags",
    # Hazard
    "Hazard",
    "HazardAudit",
    "HazardClassificationResult",
    # Person Context
    "PersonContext",
    # Risk
    "RiskAssessment",
    "RiskResult",
    # Precaution
    "Precaution",
    # Verification
    "VerificationCheck",
    "VerificationResult",
    # Notification
    "NotificationRecord",
    # Report
    "ErrorInfo",
    "ReportScene",
    "SafetyReport",
    "TraceEvent",
    # API
    "AggregatedHazard",
    "AnalysisRequest",
    "AnalysisResult",
    "JobStatus",
    "SessionSummary",
]
