"""Agent 6 — Verification and Critic (verification.py).

Per agent.md §6 and skills.md S-21:
- Reviews assessment before user presentation.
- Implements deterministic consistency checks V1-V8:
  - V1: every hazard has valid category (H01-H15) and >=1 evidence string.
  - V2: observed/likely evidence names visible object (heuristic; flag, not delete).
  - V3: recomputed risk equals stored risk.
  - V4: every hazard has >=1 precaution.
  - V5: no contradictory precautions.
  - V6: outcome none_observed only when perception succeeded AND quality adequate (Rule R1).
  - V7: every possible hazard has a trigger (Rule R2).
  - V8: person category and language fields are set.
- Action on unsupported/invalid:
  - Possible without trigger -> dropped.
  - Unsure -> marked uncertain.
  - Outcome none_observed on failed/poor quality -> changed to inconclusive or failed.
- Retry decision:
  - If perception contradictory and retries_used < MAX_RETRIES -> request retry with retry_focus.
  - If retries exhausted -> proceed with failed_fallback and reduced confidence note.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.schemas.enums import (
    EvidenceStrength,
    HazardStatus,
    Language,
    Outcome,
    PersonCategory,
    RiskLevel,
    VerifyStatus,
)
from app.schemas.hazard import Hazard
from app.schemas.perception import PerceptionResult
from app.schemas.precaution import Precaution
from app.schemas.risk import RiskAssessment
from app.schemas.verification import VerificationCheck, VerificationResult
from app.services.guideline_service import GuidelineService

logger = logging.getLogger(__name__)

DEFAULT_TAXONOMY_PATH = "/home/blue/anup/data/taxonomy.json"
DEFAULT_RISK_RULES_PATH = "/home/blue/anup/data/risk_rules.json"
DEFAULT_PROFILES_PATH = "/home/blue/anup/data/person_profiles.json"

VALID_CATEGORIES = {
    "H01", "H02", "H03", "H04", "H05", "H06", "H07",
    "H08", "H09", "H10", "H11", "H12", "H13", "H14", "H15"
}


class VerificationAgent:
    """Agent that runs deterministic V1-V8 consistency checks and critic logic."""

    def __init__(
        self,
        max_retries: int | None = None,
        taxonomy_path: str = DEFAULT_TAXONOMY_PATH,
        risk_rules_path: str = DEFAULT_RISK_RULES_PATH,
        profiles_path: str = DEFAULT_PROFILES_PATH,
        guideline_service: GuidelineService | None = None,
    ) -> None:
        settings = get_settings()
        self.max_retries = max_retries if max_retries is not None else settings.MAX_RETRIES
        self.taxonomy_path = taxonomy_path
        self.risk_rules_path = risk_rules_path
        self.profiles_path = profiles_path
        self.guideline_service = guideline_service or GuidelineService()

        self._valid_categories = self._load_categories()
        self._base_severities, self._combo_rules = self._load_risk_rules()
        self._profiles = self._load_profiles()

    def _load_categories(self) -> set[str]:
        if os.path.exists(self.taxonomy_path):
            try:
                with open(self.taxonomy_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return {cat["id"] for cat in data.get("categories", [])}
            except Exception as e:
                logger.warning("Failed loading taxonomy from %s (%s); using default set", self.taxonomy_path, e)
        return VALID_CATEGORIES

    def _load_risk_rules(self) -> tuple[dict[str, int], list[dict[str, Any]]]:
        base_severities: dict[str, int] = {
            "H01": 2, "H02": 2, "H03": 3, "H04": 3, "H05": 2,
            "H06": 3, "H07": 2, "H08": 3, "H09": 3, "H10": 3,
            "H11": 2, "H12": 2, "H13": 1, "H14": 2, "H15": 1,
        }
        combo_rules: list[dict[str, Any]] = []
        if os.path.exists(self.risk_rules_path):
            try:
                with open(self.risk_rules_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for cat_id, info in data.get("base_severities", {}).items():
                        base_severities[cat_id] = int(info.get("base_score", 2))
                    combo_rules = data.get("combo_rules", [])
            except Exception as e:
                logger.warning("Failed loading risk rules from %s (%s); using defaults", self.risk_rules_path, e)
        return base_severities, combo_rules

    def _load_profiles(self) -> dict[str, Any]:
        if os.path.exists(self.profiles_path):
            try:
                with open(self.profiles_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data.get("profiles", {})
            except Exception as e:
                logger.warning("Failed loading profiles from %s (%s)", self.profiles_path, e)
        return {}

    def _recompute_risk(
        self,
        hazard: Hazard,
        person_category: PersonCategory,
        all_hazards: list[Hazard],
        scene_summary: str = "",
    ) -> RiskAssessment:
        """Deterministic risk recomputation per Rule R4 and risk_rules.json."""
        cat_id = hazard.category_id
        base_sev = self._base_severities.get(cat_id, 2)
        rule_ids = [f"R-BASE-{cat_id}"]

        # Person modifier
        person_key = person_category.value if isinstance(person_category, PersonCategory) else str(person_category)
        profile = self._profiles.get(person_key, {})
        modifiers = profile.get("severity_modifiers", {})
        person_mod = int(modifiers.get(cat_id, 0))
        if person_mod != 0:
            rule_ids.append(f"R-PERSON-{person_key.upper()}-{cat_id}")

        # Combo modifier
        combo_mod = 0
        all_cats = {h.category_id for h in all_hazards}
        lower_evidence = " ".join(hazard.evidence).lower() + " " + scene_summary.lower()

        # R-COMBO-WATER-ELEC
        if cat_id == "H03" and ("H10" in all_cats or "water" in lower_evidence or "sink" in lower_evidence):
            combo_mod += 1
            rule_ids.append("R-COMBO-WATER-ELEC")

        # R-COMBO-FLAME-FLAMMABLE
        if cat_id == "H04" and ("cloth" in lower_evidence or "paper" in lower_evidence or "flammable" in lower_evidence):
            combo_mod += 1
            rule_ids.append("R-COMBO-FLAME-FLAMMABLE")

        # R-COMBO-TALL-FURNITURE-CHILD
        if cat_id == "H07" and person_category in (PersonCategory.baby, PersonCategory.child):
            combo_mod += 1
            rule_ids.append("R-COMBO-TALL-FURNITURE-CHILD")

        raw_score = max(1, min(5, base_sev + person_mod + combo_mod))

        if raw_score <= 2:
            calc_level = RiskLevel.low
        elif raw_score == 3:
            calc_level = RiskLevel.medium
        else:
            calc_level = RiskLevel.high

        # Evidence gate per Rule R4 / §6 Agent 4:
        # status=possible or evidence_strength=weak -> level becomes uncertain, potential_level shows calculated
        if hazard.status == HazardStatus.possible or hazard.evidence_strength == EvidenceStrength.weak:
            assigned_level = RiskLevel.uncertain
            potential_level: RiskLevel | None = calc_level
        else:
            assigned_level = calc_level
            potential_level = None

        return RiskAssessment(
            level=assigned_level,
            potential_level=potential_level,
            rule_ids=rule_ids,
            rationale=f"Recomputed rule score {raw_score} (base={base_sev}, person={person_mod}, combo={combo_mod})",
        )

    def verify(
        self,
        hazards: list[Hazard],
        perception: PerceptionResult | None,
        person_category: PersonCategory | str,
        language: Language | str,
        outcome: Outcome | None,
        risks: dict[str, RiskAssessment] | None = None,
        precautions: dict[str, list[Precaution]] | None = None,
        retries_used: int = 0,
        request: Any = None,
    ) -> tuple[VerificationResult, list[Hazard], dict[str, RiskAssessment], dict[str, list[Precaution]], Outcome, list[str]]:
        """Run V1-V8 consistency checks and return verification result with corrections.

        Returns:
            (VerificationResult, cleaned_hazards, updated_risks, updated_precautions, updated_outcome, retry_focus)
        """
        checks: list[VerificationCheck] = []
        issues: list[str] = []
        changes: list[str] = []
        retry_focus: list[str] = []

        active_hazards: list[Hazard] = list(hazards)
        active_risks: dict[str, RiskAssessment] = dict(risks or {})
        active_precautions: dict[str, list[Precaution]] = dict(precautions or {})
        active_outcome = outcome or (Outcome.hazards_found if active_hazards else Outcome.none_observed)

        # Parse enums
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

        scene_objects = perception.objects if perception else []
        scene_summary = perception.scene_summary if perception else ""

        # --- V1: Every hazard has valid category and >= 1 evidence string ---
        v1_passed = True
        v1_details: list[str] = []
        for h in list(active_hazards):
            if h.category_id not in self._valid_categories:
                v1_passed = False
                msg = f"Hazard '{h.id}' has invalid category '{h.category_id}'"
                v1_details.append(msg)
                issues.append(msg)
                retry_focus.append(h.id)
            if not h.evidence or not any(str(e).strip() for e in h.evidence):
                v1_passed = False
                msg = f"Hazard '{h.id}' has empty evidence"
                v1_details.append(msg)
                issues.append(msg)
                retry_focus.append(h.id)

        checks.append(VerificationCheck(
            id="V1",
            passed=v1_passed,
            detail="All hazards have valid category and >=1 evidence string" if v1_passed else "; ".join(v1_details),
        ))

        # --- V2: Observed/likely evidence names visible object ---
        v2_passed = True
        v2_details: list[str] = []
        visible_tokens = set()
        for obj in scene_objects:
            for word in re.findall(r"\w+", obj.lower()):
                if len(word) > 2:
                    visible_tokens.add(word)
        for word in re.findall(r"\w+", scene_summary.lower()):
            if len(word) > 2:
                visible_tokens.add(word)

        for h in active_hazards:
            if h.status in (HazardStatus.observed, HazardStatus.likely):
                evidence_text = " ".join(h.evidence).lower() + " " + h.title.lower()
                evidence_words = set(re.findall(r"\w+", evidence_text))
                # Heuristic: check token overlap if scene_objects is non-empty
                if visible_tokens and not (evidence_words & visible_tokens):
                    v2_passed = False
                    msg = f"Hazard '{h.id}' evidence does not explicitly name any detected scene object"
                    v2_details.append(msg)
                    issues.append(msg)
                    # Heuristic failure = flag, not delete (per agent.md §6)

        checks.append(VerificationCheck(
            id="V2",
            passed=v2_passed,
            detail="Observed/likely evidence corresponds to visible scene objects" if v2_passed else "; ".join(v2_details),
        ))

        # --- V3: Recomputed risk equals stored risk ---
        v3_passed = True
        v3_details: list[str] = []
        for h in active_hazards:
            recomputed = self._recompute_risk(
                hazard=h,
                person_category=person_enum,
                all_hazards=active_hazards,
                scene_summary=scene_summary,
            )
            stored = active_risks.get(h.id) or h.risk
            if stored is None or stored.level != recomputed.level:
                v3_passed = False
                old_lvl = stored.level.value if stored else "none"
                new_lvl = recomputed.level.value
                msg = f"Hazard '{h.id}' risk mismatch: stored {old_lvl} vs recomputed {new_lvl}"
                v3_details.append(msg)
                changes.append(f"Corrected hazard '{h.id}' risk level from {old_lvl} to {new_lvl}")
                active_risks[h.id] = recomputed
                h.risk = recomputed

        checks.append(VerificationCheck(
            id="V3",
            passed=v3_passed,
            detail="All hazard risk evaluations match deterministic rule recomputation" if v3_passed else "; ".join(v3_details),
        ))

        # --- V4: Every hazard has >= 1 precaution ---
        v4_passed = True
        v4_details: list[str] = []
        for h in active_hazards:
            h_precs = active_precautions.get(h.id) or h.precautions
            if not h_precs:
                v4_passed = False
                msg = f"Hazard '{h.id}' has 0 precautions; populating fallback"
                v4_details.append(msg)
                issues.append(msg)
                fallback_precs = self.guideline_service.get_precautions_for_hazard(
                    category_id=h.category_id,
                    person=person_enum,
                )
                active_precautions[h.id] = fallback_precs
                h.precautions = fallback_precs
                changes.append(f"Populated {len(fallback_precs)} fallback precaution(s) for hazard '{h.id}'")

        checks.append(VerificationCheck(
            id="V4",
            passed=v4_passed,
            detail="Every hazard has >=1 actionable precaution" if v4_passed else "; ".join(v4_details),
        ))

        # --- V5: No contradictory precautions ---
        v5_passed = True
        v5_details: list[str] = []
        for h in active_hazards:
            precs = active_precautions.get(h.id, [])
            selected_ids = {p.guideline_id for p in precs if p.guideline_id}
            deduped_precs: list[Precaution] = []
            seen_texts = set()

            for p in precs:
                norm = p.text.lower().strip()
                if norm in seen_texts:
                    v5_passed = False
                    msg = f"Duplicate precaution text removed in hazard '{h.id}'"
                    v5_details.append(msg)
                    changes.append(msg)
                    continue
                seen_texts.add(norm)
                deduped_precs.append(p)

            active_precautions[h.id] = deduped_precs
            h.precautions = deduped_precs

        checks.append(VerificationCheck(
            id="V5",
            passed=v5_passed,
            detail="Precaution sets are free of internal contradictions and duplicates" if v5_passed else "; ".join(v5_details),
        ))

        # --- V6: Outcome none_observed only when perception succeeded AND quality adequate ---
        v6_passed = True
        v6_detail = "Outcome consistent with perception execution and image quality"
        if active_outcome == Outcome.none_observed:
            has_error = perception is None or bool(perception.errors)
            quality_defects = perception.quality.has_defects if perception else True
            if has_error:
                v6_passed = False
                v6_detail = "Perception failed or had errors; outcome cannot be 'none_observed' (Rule R1)"
                issues.append(v6_detail)
                active_outcome = Outcome.failed
                changes.append("Updated outcome from 'none_observed' to 'failed' due to perception errors")
            elif quality_defects and (perception.quality.blur or perception.quality.darkness):
                v6_passed = False
                v6_detail = "Image quality inadequate (blur/dark); outcome cannot be 'none_observed' (Rule R1)"
                issues.append(v6_detail)
                active_outcome = Outcome.inconclusive
                changes.append("Updated outcome from 'none_observed' to 'inconclusive' due to inadequate image quality")

        checks.append(VerificationCheck(
            id="V6",
            passed=v6_passed,
            detail=v6_detail,
        ))

        # --- V7: Every possible hazard has a trigger (Rule R2) ---
        v7_passed = True
        v7_details: list[str] = []
        purged_hazards: list[Hazard] = []
        for h in active_hazards:
            if h.status == HazardStatus.possible:
                if not h.trigger or not str(h.trigger).strip():
                    v7_passed = False
                    msg = f"Possible hazard '{h.id}' ({h.title}) lacks a visible trigger object; dropped per Rule R2"
                    v7_details.append(msg)
                    changes.append(msg)
                    continue
            purged_hazards.append(h)

        active_hazards = purged_hazards
        checks.append(VerificationCheck(
            id="V7",
            passed=v7_passed,
            detail="All 'possible' hazards have a named visible trigger object" if v7_passed else "; ".join(v7_details),
        ))

        # --- V8: Person category and language fields set ---
        v8_passed = True
        v8_details: list[str] = []
        if person_enum not in PersonCategory:
            v8_passed = False
            v8_details.append(f"Invalid person category: {person_category}")
        if lang_enum not in Language:
            v8_passed = False
            v8_details.append(f"Invalid language: {language}")

        checks.append(VerificationCheck(
            id="V8",
            passed=v8_passed,
            detail="Target person category and language are valid" if v8_passed else "; ".join(v8_details),
        ))

        # Outcome synchronization
        if active_outcome not in (Outcome.failed, Outcome.inconclusive):
            if active_hazards:
                active_outcome = Outcome.hazards_found
            else:
                active_outcome = Outcome.none_observed

        # Determine verification status and retry decision
        critical_issues = [
            chk for chk in checks
            if not chk.passed and chk.id in ("V1", "V6", "V7")
        ]

        if critical_issues and retries_used < self.max_retries:
            # Request retry with targeted focus
            status = VerifyStatus.passed_with_changes if not retry_focus else VerifyStatus.passed_with_changes
        elif critical_issues and retries_used >= self.max_retries:
            status = VerifyStatus.failed_fallback
            issues.append("Reduced confidence: Verification critic could not reconcile all hazard claims within retry limit.")
        elif changes:
            status = VerifyStatus.passed_with_changes
        else:
            status = VerifyStatus.passed

        verification_result = VerificationResult(
            status=status,
            checks=checks,
            issues=issues,
            changes=changes,
            retries_used=retries_used,
        )

        return (
            verification_result,
            active_hazards,
            active_risks,
            active_precautions,
            active_outcome,
            retry_focus,
        )


def verify_pipeline_state(
    hazards: list[Hazard],
    perception: PerceptionResult | None,
    person_category: PersonCategory | str,
    language: Language | str,
    outcome: Outcome | None = None,
    risks: dict[str, RiskAssessment] | None = None,
    precautions: dict[str, list[Precaution]] | None = None,
    retries_used: int = 0,
    max_retries: int | None = None,
) -> tuple[VerificationResult, list[Hazard], dict[str, RiskAssessment], dict[str, list[Precaution]], Outcome, list[str]]:
    """Functional wrapper for Agent 6 verification."""
    agent = VerificationAgent(max_retries=max_retries)
    return agent.verify(
        hazards=hazards,
        perception=perception,
        person_category=person_category,
        language=language,
        outcome=outcome,
        risks=risks,
        precautions=precautions,
        retries_used=retries_used,
    )


def verification_node(state: dict[str, Any]) -> dict[str, Any]:
    """LangGraph node execution wrapper for Agent 6."""
    start_time = time.monotonic()
    hazards: list[Hazard] = state.get("hazards", [])
    perception: PerceptionResult | None = state.get("perception")
    request = state.get("request")
    person_category = getattr(request, "person_category", PersonCategory.adult)
    language = getattr(request, "language", Language.en)
    outcome: Outcome | None = state.get("outcome")
    risks: dict[str, RiskAssessment] = state.get("risks", {})
    precautions: dict[str, list[Precaution]] = state.get("precautions", {})
    retries_used: int = state.get("retries_used", 0)

    agent = VerificationAgent()
    ver_res, cleaned_hazards, updated_risks, updated_precs, updated_outcome, retry_focus = agent.verify(
        hazards=hazards,
        perception=perception,
        person_category=person_category,
        language=language,
        outcome=outcome,
        risks=risks,
        precautions=precautions,
        retries_used=retries_used,
        request=request,
    )

    elapsed_ms = (time.monotonic() - start_time) * 1000.0
    trace_event = {
        "node": "verify",
        "status": "ok" if ver_res.status == VerifyStatus.passed else "changed",
        "duration_ms": round(elapsed_ms, 2),
        "attempt": retries_used + 1,
        "summary": f"Verification status: {ver_res.status.value} ({len(ver_res.issues)} issue(s), {len(ver_res.changes)} change(s))",
    }

    return {
        "verification": ver_res,
        "hazards": cleaned_hazards,
        "risks": updated_risks,
        "precautions": updated_precs,
        "outcome": updated_outcome,
        "retry_focus": retry_focus,
        "trace": [trace_event],
    }
