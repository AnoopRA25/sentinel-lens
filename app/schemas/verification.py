"""Verification schemas for Agent 6 (Verification and Critic).

Defines VerificationCheck and VerificationResult per agent.md §6 and skills.md S-21.
Enforces validation checks V1-V8 and safety boundaries.
"""

from pydantic import BaseModel, Field

from app.schemas.enums import VerifyStatus


class VerificationCheck(BaseModel):
    """Result of an individual deterministic consistency check (V1-V8)."""
    id: str = Field(..., description="Check identifier: V1, V2, V3, V4, V5, V6, V7, V8")
    passed: bool = Field(..., description="Whether the check passed")
    detail: str = Field(default="", description="Descriptive findings or reason for failure")


class VerificationResult(BaseModel):
    """Output of Agent 6 Verification critic."""
    status: VerifyStatus = Field(
        default=VerifyStatus.passed,
        description="passed | passed_with_changes | failed_fallback"
    )
    checks: list[VerificationCheck] = Field(
        default_factory=list,
        description="Detailed results for individual V1-V8 checks"
    )
    issues: list[str] = Field(
        default_factory=list,
        description="Summary of issues or inconsistencies discovered"
    )
    changes: list[str] = Field(
        default_factory=list,
        description="Corrections applied (e.g. downgrade to possible, duplicate merged)"
    )
    retries_used: int = Field(
        default=0,
        ge=0,
        description="Number of targeted perception retries consumed"
    )
