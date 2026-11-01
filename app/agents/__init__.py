"""Pipeline agents package for Hazard Precaution Advisor v2."""

from app.agents.caregiver_notification import (
    CaregiverNotificationAgent,
    caregiver_notification_node,
    notify_caregiver,
)
from app.agents.hazard_classifier import HazardClassifierAgent, classify_hazards
from app.agents.person_context import PersonContextAgent, contextualize_hazards
from app.agents.risk_assessor import RiskAssessorAgent, assess_hazards_risk
from app.agents.safety_knowledge import (
    SafetyKnowledgeAgent,
    retrieve_safety_knowledge,
    safety_knowledge_node,
)
from app.agents.safety_report import (
    ForbiddenPhraseError,
    SafetyReportAgent,
    generate_safety_report,
    safety_report_node,
)
from app.agents.scene_perception import ScenePerceptionAgent, perceive_scene
from app.agents.session_aggregator import (
    SessionAggregator,
    aggregate_frame,
    get_session_aggregator,
)
from app.agents.verification import (
    VerificationAgent,
    verification_node,
    verify_pipeline_state,
)

__all__ = [
    # Agent 1
    "ScenePerceptionAgent",
    "perceive_scene",
    # Agent 2
    "HazardClassifierAgent",
    "classify_hazards",
    # Agent 3
    "PersonContextAgent",
    "contextualize_hazards",
    # Agent 4
    "RiskAssessorAgent",
    "assess_hazards_risk",
    # Agent 5
    "SafetyKnowledgeAgent",
    "retrieve_safety_knowledge",
    "safety_knowledge_node",
    # Agent 6
    "VerificationAgent",
    "verify_pipeline_state",
    "verification_node",
    # Agent 7
    "SafetyReportAgent",
    "generate_safety_report",
    "safety_report_node",
    "ForbiddenPhraseError",
    # Agent 8
    "CaregiverNotificationAgent",
    "notify_caregiver",
    "caregiver_notification_node",
    # Agent 9
    "SessionAggregator",
    "aggregate_frame",
    "get_session_aggregator",
]
