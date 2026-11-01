"""Pipeline conditional routing functions for Hazard Precaution Advisor v2.

Defines dynamic workflow routing branches per agent.md §4.1.
Adheres to Rule R1: A failed or unreliable analysis is never routed to a safe path.
"""
from __future__ import annotations

from app.pipeline.state import PipelineState
from app.schemas.enums import VerifyStatus


def route_after_perception(state: PipelineState) -> str:
    """Determine the next pipeline node following scene perception.

    Rules:
    - If errors occurred, perception is None, or perception reported errors:
      Route to 'finalize_failed'.
    - If environment label is 'unknown' and no candidate hazards detected:
      Route to 'finalize_inconclusive'.
    - Otherwise:
      Route to 'classify'.
    """
    errors = state.get("errors")
    perception = state.get("perception")

    if errors or perception is None:
        return "finalize_failed"

    # Check perception-level errors (supports both model and dict)
    perception_errors = getattr(perception, "errors", None)
    if perception_errors is None and isinstance(perception, dict):
        perception_errors = perception.get("errors")
    if perception_errors:
        return "finalize_failed"

    # Extract environment label safely
    env = getattr(perception, "environment", None)
    if env is None and isinstance(perception, dict):
        env = perception.get("environment", {})
    if env is None:
        env = {}
    env_label = env.get("label") if hasattr(env, "get") else getattr(env, "label", None)

    # Extract candidate hazards safely
    candidates = getattr(perception, "candidate_hazards", None)
    if candidates is None and isinstance(perception, dict):
        candidates = perception.get("candidate_hazards", [])
    if candidates is None:
        candidates = []

    if env_label == "unknown" and not candidates:
        return "finalize_inconclusive"

    return "classify"


def route_after_verification(state: PipelineState) -> str:
    """Determine the next pipeline node following verification critic check.

    Rules:
    - If verification status is 'failed_fallback': route to 'report' (fallback mode).
    - If verification found issues and retries_used < 1: route to 'perceive' (bounded retry).
    - Otherwise: route to 'report'.
    """
    verification = state.get("verification")
    if verification:
        status = getattr(verification, "status", None)
        if status is None and isinstance(verification, dict):
            status = verification.get("status")

        if status == VerifyStatus.failed_fallback or status == "failed_fallback":
            return "report"

        issues = getattr(verification, "issues", None)
        if issues is None and isinstance(verification, dict):
            issues = verification.get("issues", [])
        if issues is None:
            issues = []

        retries_used = state.get("retries_used", 0)
        if len(issues) > 0 and retries_used < 1:
            return "perceive"

    return "report"
