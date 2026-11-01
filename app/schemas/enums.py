"""Enumerations for Hazard Precaution Advisor v2.

All enums inherit from (str, Enum) for seamless JSON/Pydantic serialization.
Adheres strictly to contracts in agent.md §5.1 and non-negotiable rules R1-R14.
"""

from enum import Enum


class PersonCategory(str, Enum):
    """Target person category for hazard and risk contextualization.
    Per Rule R6: Person category is a user input, never inferred from the image.
    """
    baby = "baby"
    child = "child"
    adult = "adult"
    elderly = "elderly"


class Language(str, Enum):
    """Supported report and UI languages."""
    en = "en"
    kn = "kn"
    hi = "hi"


class Mode(str, Enum):
    """Analysis mode."""
    quick = "quick"
    deep = "deep"


class Source(str, Enum):
    """Input media source."""
    photo = "photo"
    frame = "frame"
    video_frame = "video_frame"


class HazardStatus(str, Enum):
    """Evidence tier for hazard identification.
    Per agent.md §1:
    - observed: Hazard is directly visible (>=1 evidence statement naming what is visible).
    - likely: Partly visible, or strongly implied by visible context.
    - possible: A hazard class that could exist because of a visible trigger object,
      but the image cannot confirm it.
    """
    observed = "observed"
    likely = "likely"
    possible = "possible"


class EvidenceStrength(str, Enum):
    """Categorical model evidence strength.
    Per Rule R4: Model 'evidence strength' is categorical (clear/partial/weak),
    never a calibrated percentage.
    """
    clear = "clear"
    partial = "partial"
    weak = "weak"


class RiskLevel(str, Enum):
    """Ordinal risk level labels.
    Per Rule R4: Risk levels are ordinal labels, not probabilities.
    """
    low = "low"
    medium = "medium"
    high = "high"
    uncertain = "uncertain"


class Outcome(str, Enum):
    """Analysis execution outcome.
    Per Rule R1: A failed or unreliable analysis is never shown as safe.
    Outcomes are exactly: hazards_found, none_observed, inconclusive, failed.
    User-facing text never says 'safe', 'no danger', or 'all clear' -
    use 'No hazards observed in this view'.
    """
    hazards_found = "hazards_found"
    none_observed = "none_observed"
    inconclusive = "inconclusive"
    failed = "failed"


class VerifyStatus(str, Enum):
    """Verification critic review status."""
    passed = "passed"
    passed_with_changes = "passed_with_changes"
    failed_fallback = "failed_fallback"


class NotifyStatus(str, Enum):
    """Caregiver notification delivery status."""
    sent = "sent"
    skipped_cooldown = "skipped_cooldown"
    skipped_policy = "skipped_policy"
    disabled = "disabled"
    failed = "failed"


class ChecklistFindingStatus(str, Enum):
    """Checklist sweep finding status for a hazard category."""
    present = "present"
    absent = "absent"
    cannot_see = "cannot_see"


class RelevanceLevel(str, Enum):
    """Relevance level of a hazard to the selected person category."""
    high = "high"
    normal = "normal"
    low = "low"


class PrecautionProvenance(str, Enum):
    """Provenance source of a safety precaution.
    Per Rule R8: No invented citations or standards. Every precaution carries
    its provenance ('guideline', 'generic', or 'ai_general').
    """
    guideline = "guideline"
    generic = "generic"
    ai_general = "ai_general"


class TraceEventType(str, Enum):
    """Types of execution trace events emitted during pipeline execution."""
    node_started = "node_started"
    node_finished = "node_finished"
    node_failed = "node_failed"
    retry = "retry"
    preview = "preview"
    result = "result"
    error = "error"


class JobStatusEnum(str, Enum):
    """Status of asynchronous analysis jobs."""
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"
