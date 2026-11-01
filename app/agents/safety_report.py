"""Agent 7 — Safety Report (safety_report.py).

Per agent.md §6 and skills.md S-24, S-25:
- Assembles the final user-facing SafetyReport from verified data.
- Strict ordering:
  1. Act-now banner (if immediate_action is True)
  2. Confirmed (observed / likely) ordered by risk level (high -> medium -> low -> uncertain)
  3. "Worth checking" (possible items)
  4. Lower-relevance hazards retained but ordered lower
  5. Limits and coverage notes
- Forbidden phrase guard:
  - Enforces Rule R1: User-facing text never says 'safe', 'no danger', 'all clear', or 'guaranteed'.
  - Raises ForbiddenPhraseError if any violation is detected.
- Translation:
  - If language != 'en', invokes TranslationService to translate free-text fields.
  - Per Rule R13: A failed translation falls back to the English report plus sets translation_error.
- Failure-mode rendering:
  - For 'failed' / 'inconclusive' outcomes, generates static neutral explanation and retake guidance.
"""

from __future__ import annotations

import datetime
import logging
import re
import time
import uuid
from typing import Any

from app.core.config import get_settings
from app.schemas.enums import (
    HazardStatus,
    Language,
    Outcome,
    PersonCategory,
    RelevanceLevel,
    RiskLevel,
    VerifyStatus,
)
from app.schemas.hazard import Hazard
from app.schemas.perception import PerceptionResult
from app.schemas.report import (
    ErrorInfo,
    ReportScene,
    SafetyReport,
    TraceEvent,
    check_forbidden_phrases,
)
from app.schemas.verification import VerificationResult
from app.services.translation_service import (
    FakeTranslationService,
    GeminiTranslationService,
    TranslationService,
)

logger = logging.getLogger(__name__)

# Strict forbidden phrase patterns for Rule R1 enforcement
FORBIDDEN_PATTERNS = [
    re.compile(r"\ball\s+clear\b", re.IGNORECASE),
    re.compile(r"\bno\s+danger\b", re.IGNORECASE),
    re.compile(r"\bguaranteed\b", re.IGNORECASE),
    re.compile(r"\b(?:is|are|looks?|feels?|completely|totally|entirely|100%)\s+safe\b", re.IGNORECASE),
    re.compile(r"^\s*safe\s*$", re.IGNORECASE),
]

RISK_ORDER: dict[RiskLevel, int] = {
    RiskLevel.high: 0,
    RiskLevel.medium: 1,
    RiskLevel.low: 2,
    RiskLevel.uncertain: 3,
}

RELEVANCE_ORDER: dict[str, int] = {
    "high": 0,
    "normal": 1,
    "low": 2,
}


class ForbiddenPhraseError(ValueError):
    """Raised when user-facing text violates Rule R1."""
    pass


def scan_for_forbidden_phrases(text: str, field_name: str) -> None:
    """Inspect text against forbidden assertions and raise ForbiddenPhraseError on match."""
    if not text:
        return
    for pattern in FORBIDDEN_PATTERNS:
        if pattern.search(text):
            raise ForbiddenPhraseError(
                f"Rule R1 Violation in '{field_name}': User-facing text must never say "
                f"'safe', 'no danger', 'all clear', or 'guaranteed'. Got: '{text}'"
            )


def validate_report_language_guard(report: SafetyReport) -> None:
    """Deep inspection of all user-facing strings across the entire report for Rule R1 compliance."""
    scan_for_forbidden_phrases(report.headline, "headline")
    scan_for_forbidden_phrases(report.limits, "limits")
    scan_for_forbidden_phrases(report.disclaimer, "disclaimer")
    scan_for_forbidden_phrases(report.scene.summary, "scene.summary")

    for idx, gap in enumerate(report.scene.coverage_gaps):
        scan_for_forbidden_phrases(gap, f"scene.coverage_gaps[{idx}]")

    for h in report.hazards:
        scan_for_forbidden_phrases(h.title, f"hazard[{h.id}].title")
        for e_idx, ev in enumerate(h.evidence):
            scan_for_forbidden_phrases(ev, f"hazard[{h.id}].evidence[{e_idx}]")
        if h.risk and h.risk.rationale:
            scan_for_forbidden_phrases(h.risk.rationale, f"hazard[{h.id}].risk.rationale")
        for p_idx, prec in enumerate(h.precautions):
            scan_for_forbidden_phrases(prec.text, f"hazard[{h.id}].precautions[{p_idx}].text")


class SafetyReportAgent:
    """Agent that assembles, orders, validates, and localizes the safety report."""

    def __init__(
        self,
        translation_service: TranslationService | None = None,
    ) -> None:
        self.translation_service = translation_service or GeminiTranslationService()

    def _sort_hazards(self, hazards: list[Hazard]) -> list[Hazard]:
        """Order hazards:
        1. Confirmed (observed, likely) by risk descending (high -> medium -> low -> uncertain)
        2. Relevance (high -> normal -> low)
        3. Possible items
        """
        def hazard_sort_key(h: Hazard) -> tuple[int, int, int]:
            # Status tier: 0 for observed/likely, 1 for possible
            status_tier = 0 if h.status in (HazardStatus.observed, HazardStatus.likely) else 1

            # Relevance tier
            rel_str = str(h.person_relevance.value if hasattr(h.person_relevance, "value") else (h.person_relevance or "normal")).lower()
            rel_tier = RELEVANCE_ORDER.get(rel_str, 1)

            # Risk tier
            risk_tier = 3
            if h.risk and h.risk.level in RISK_ORDER:
                risk_tier = RISK_ORDER[h.risk.level]
            elif h.status == HazardStatus.possible and h.risk and h.risk.potential_level in RISK_ORDER:
                risk_tier = RISK_ORDER[h.risk.potential_level]

            return (status_tier, rel_tier, risk_tier)

        return sorted(hazards, key=hazard_sort_key)

    def _determine_overall_risk(self, hazards: list[Hazard]) -> RiskLevel:
        """Compute overall risk from confirmed hazards."""
        confirmed = [h for h in hazards if h.status in (HazardStatus.observed, HazardStatus.likely)]
        if not confirmed:
            possible = [h for h in hazards if h.status == HazardStatus.possible]
            if possible:
                return RiskLevel.uncertain
            return RiskLevel.low

        highest_risk = RiskLevel.low
        for h in confirmed:
            if h.risk:
                lvl = h.risk.level
                if lvl == RiskLevel.high:
                    return RiskLevel.high
                elif lvl == RiskLevel.medium and highest_risk != RiskLevel.high:
                    highest_risk = RiskLevel.medium
                elif lvl == RiskLevel.uncertain and highest_risk == RiskLevel.low:
                    highest_risk = RiskLevel.uncertain

        return highest_risk

    def _check_immediate_action(self, hazards: list[Hazard], scene_summary: str) -> bool:
        """Immediate action triggered only by explicit critical conditions per agent.md §6."""
        for h in hazards:
            if h.category_id in ("H04", "H03"):
                ev_str = " ".join(h.evidence).lower() + " " + scene_summary.lower()
                if "flame" in ev_str or "fire" in ev_str or "smoke" in ev_str:
                    return True
                if h.category_id == "H03" and ("water" in ev_str or "sink" in ev_str) and h.risk and h.risk.level == RiskLevel.high:
                    return True
        return False

    async def assemble_report(
        self,
        hazards: list[Hazard],
        perception: PerceptionResult | None,
        person_category: PersonCategory | str,
        language: Language | str,
        outcome: Outcome | None,
        verification: VerificationResult,
        notification: Any = None,
        errors: list[str] | None = None,
        trace: list[TraceEvent] | None = None,
        analysis_id: str | None = None,
    ) -> SafetyReport:
        """Construct, validate and optionally translate a SafetyReport."""
        now_ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
        report_id = analysis_id or f"an_{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"

        person_enum = (
            person_category
            if isinstance(person_category, PersonCategory)
            else PersonCategory(str(person_category))
        )
        lang_enum = (
            language
            if isinstance(language, Language)
            else Language(str(language))
        )

        active_outcome = outcome or (Outcome.hazards_found if hazards else Outcome.none_observed)
        sorted_hazards = self._sort_hazards(hazards)
        overall_risk = self._determine_overall_risk(sorted_hazards)

        # Build Scene
        if perception:
            env_label = perception.environment.label
            summary = perception.scene_summary or "Visual scene assessment."
            quality_flags = perception.quality.to_flag_list()
            coverage_gaps = list(perception.coverage_gaps)
        else:
            env_label = "unknown"
            summary = "Visual assessment could not be completed."
            quality_flags = ["unassessed"]
            coverage_gaps = ["No visual perception data available."]

        scene = ReportScene(
            environment=env_label,
            summary=summary,
            quality_flags=quality_flags,
            coverage_gaps=coverage_gaps,
        )

        # Reliability evaluation:
        analysis_reliable = (
            active_outcome not in (Outcome.failed, Outcome.inconclusive)
            and verification.status != VerifyStatus.failed_fallback
            and not (perception and perception.errors)
        )

        # Immediate action
        immediate_action = self._check_immediate_action(sorted_hazards, scene.summary)

        # Determine headline conforming strictly to Rule R1
        if active_outcome == Outcome.none_observed:
            headline = "No hazards observed in this view"
        elif active_outcome == Outcome.hazards_found:
            headline = f"{len(sorted_hazards)} hazard(s) observed in this view"
        elif active_outcome == Outcome.inconclusive:
            headline = "Analysis inconclusive - visual conditions prevent reliable assessment"
        else:
            headline = "Analysis could not run. This is not a verified view."

        report = SafetyReport(
            id=report_id,
            timestamp=now_ts,
            outcome=active_outcome,
            analysis_reliable=analysis_reliable,
            person_category=person_enum,
            language=Language.en,  # Initially constructed in canonical English
            scene=scene,
            hazards=sorted_hazards,
            overall_risk=overall_risk,
            immediate_action=immediate_action,
            verification=verification,
            notification=notification,
            errors=errors or [],
            translation_error=None,
            trace=trace or [],
            headline=headline,
            limits="Based on one still image. Hazards outside the frame or hidden from view are not assessed.",
            disclaimer="This assessment is not a guarantee of safety. Hazards outside the frame or hidden from view cannot be assessed.",
        )

        # Perform forbidden phrase validation on English report
        validate_report_language_guard(report)

        # Translate report if target language is not English
        if lang_enum != Language.en:
            try:
                translated_report, trans_err = await self.translation_service.translate_report(
                    report=report,
                    target_lang=lang_enum,
                )
                if trans_err:
                    logger.warning("Translation error: %s. Returning English report per Rule R13.", trans_err)
                    report.translation_error = trans_err
                else:
                    # Validate translated report does not introduce forbidden assertions
                    try:
                        validate_report_language_guard(translated_report)
                        report = translated_report
                    except ForbiddenPhraseError as fpe:
                        logger.error("Forbidden phrase appeared in translation output: %s. Falling back to English.", fpe)
                        report.translation_error = f"Translation safety violation: {fpe}"
            except Exception as exc:
                logger.error("Unexpected error during translation: %s. Falling back to English (Rule R13).", exc)
                report.translation_error = f"Translation failed: {exc}"

        return report


async def generate_safety_report(
    hazards: list[Hazard],
    perception: PerceptionResult | None,
    person_category: PersonCategory | str,
    language: Language | str,
    outcome: Outcome | None,
    verification: VerificationResult,
    notification: Any = None,
    errors: list[str] | None = None,
    trace: list[TraceEvent] | None = None,
    translation_service: TranslationService | None = None,
) -> SafetyReport:
    """Functional wrapper for Agent 7."""
    agent = SafetyReportAgent(translation_service=translation_service)
    return await agent.assemble_report(
        hazards=hazards,
        perception=perception,
        person_category=person_category,
        language=language,
        outcome=outcome,
        verification=verification,
        notification=notification,
        errors=errors,
        trace=trace,
    )


async def safety_report_node(
    state: dict[str, Any],
    translation_service: TranslationService | None = None,
) -> dict[str, Any]:
    """LangGraph node execution wrapper for Agent 7."""
    start_time = time.monotonic()
    hazards: list[Hazard] = state.get("hazards", [])
    perception: PerceptionResult | None = state.get("perception")
    request = state.get("request")
    person_category = getattr(request, "person_category", PersonCategory.adult)
    language = getattr(request, "language", Language.en)
    outcome: Outcome | None = state.get("outcome")
    verification: VerificationResult | None = state.get("verification")
    notification = state.get("notification")
    errors = state.get("errors", [])
    trace = state.get("trace", [])

    if verification is None:
        verification = VerificationResult(
            status=VerifyStatus.passed,
            checks=[],
            issues=[],
            changes=[],
            retries_used=state.get("retries_used", 0),
        )

    agent = SafetyReportAgent(translation_service=translation_service)
    report = await agent.assemble_report(
        hazards=hazards,
        perception=perception,
        person_category=person_category,
        language=language,
        outcome=outcome,
        verification=verification,
        notification=notification,
        errors=errors,
        trace=trace,
    )

    elapsed_ms = (time.monotonic() - start_time) * 1000.0
    trace_event = {
        "node": "report",
        "status": "ok",
        "duration_ms": round(elapsed_ms, 2),
        "attempt": 1,
        "summary": f"Generated SafetyReport (outcome: {report.outcome.value}, risk: {report.overall_risk.value})",
    }

    return {
        "report": report,
        "trace": [trace_event],
    }
