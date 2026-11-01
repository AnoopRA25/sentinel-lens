"""Agent 4 — Risk Assessment (risk_assessor.py).

Per agent.md §6 and skills.md S-19:
- Assign Low / Medium / High / Uncertain with an auditable rule rationale.
- Deterministic rule engine:
  score = clamp(base_severity(category) + person_modifier + combo_modifier, 1, 5)
  score <= 2 -> low, 3 -> medium, >= 4 -> high.
- Combo rules are explicit and IDed (e.g. R-COMBO-WATER-ELEC, R-COMBO-FLAME-FLAMMABLE).
- Evidence gate: status=possible or evidence_strength=weak -> level=uncertain, potential_level set.
- Computes overall_risk and immediate_action.
- Recompute is strictly idempotent (Verification Agent re-runs it).
- Rule R4: Auditable rule IDs, ordinal labels, no probabilities.
- Rule R5: Described as a rule engine, never predictive or trained.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from app.schemas.enums import EvidenceStrength, HazardStatus, RiskLevel
from app.schemas.hazard import Hazard
from app.schemas.perception import PerceptionResult
from app.schemas.person_context import PersonContext
from app.schemas.risk import RiskAssessment, RiskResult

logger = logging.getLogger(__name__)

DEFAULT_RULES_PATH = Path("/home/blue/anup/data/risk_rules.json")

RISK_LEVEL_ORDER = {
    RiskLevel.uncertain: 0,
    RiskLevel.low: 1,
    RiskLevel.medium: 2,
    RiskLevel.high: 3,
}


def _matches_any_term(text: str, terms: list[str]) -> bool:
    """Check if any term in the list appears in the text."""
    lower_text = text.lower()
    for t in terms:
        clean_t = t.lower().replace("_", " ")
        if clean_t in lower_text:
            return True
        # Also check with underscore
        if t.lower() in lower_text:
            return True
    return False


class RiskAssessorAgent:
    """Agent 4: Deterministic Risk Assessor.

    Applies transparent, auditable rules from data/risk_rules.json.
    """

    def __init__(self, rules_path: Path | str = DEFAULT_RULES_PATH) -> None:
        self.rules_path = Path(rules_path)
        self._rules_cache: dict[str, Any] | None = None

    def _ensure_rules_loaded(self) -> dict[str, Any]:
        if self._rules_cache is None:
            if self.rules_path.exists():
                with open(self.rules_path, "r", encoding="utf-8") as f:
                    self._rules_cache = json.load(f)
            else:
                logger.warning("Risk rules file not found at %s. Using default baseline rules.", self.rules_path)
                self._rules_cache = {
                    "base_severities": {},
                    "combination_rules": [],
                    "immediate_action_rules": [],
                }
        return self._rules_cache

    def _score_to_level(self, score: int) -> RiskLevel:
        """Map clamped score (1-5) to ordinal RiskLevel."""
        if score <= 2:
            return RiskLevel.low
        elif score == 3:
            return RiskLevel.medium
        else:
            return RiskLevel.high

    def _evaluate_combo_rules(
        self,
        hazard: Hazard,
        all_hazards: list[Hazard],
        person_category: str | None,
        perception: PerceptionResult | None,
    ) -> tuple[int, list[str], list[str]]:
        """Evaluate combination rules for a hazard.

        Returns:
            tuple of (total_combo_modifier, triggered_rule_ids, rationales)
        """
        rules_data = self._ensure_rules_loaded()
        combo_rules = rules_data.get("combination_rules", [])

        total_mod = 0
        triggered_ids: list[str] = []
        rationales: list[str] = []

        # Build corpus of secondary factor context
        hazard_corpus = " ".join([
            hazard.title,
            " ".join(hazard.evidence),
            hazard.trigger or "",
        ]).lower()

        scene_corpus = ""
        if perception:
            scene_corpus = " ".join([
                perception.scene_summary,
                " ".join(perception.objects),
                perception.environment.label,
            ]).lower()

        full_corpus = f"{hazard_corpus} {scene_corpus}"

        # Co-occurring category IDs in the same image
        co_occurring_cats = {h.category_id for h in all_hazards if h.id != hazard.id}

        for rule in combo_rules:
            rule_id = rule.get("rule_id", "")
            primary_cat = rule.get("primary_category", "")

            # 1. Primary category must match
            if primary_cat != hazard.category_id:
                continue

            cond = rule.get("condition", {})

            # 2. Person category check (if rule is person-specific)
            req_persons = cond.get("person_categories")
            if req_persons and person_category and person_category.lower() not in [p.lower() for p in req_persons]:
                continue

            # 3. Environment check (if rule specifies environment)
            req_envs = cond.get("environment")
            if req_envs and perception and perception.environment.label.lower() not in [e.lower() for e in req_envs]:
                continue

            # 4. Secondary factors check
            sec_factors = cond.get("secondary_factors", [])
            matched_factor = False

            for factor in sec_factors:
                factor_lower = factor.lower()
                # Check for co-occurring category directive (e.g. "co_occurring_H01")
                if factor_lower.startswith("co_occurring_"):
                    target_cat = factor_lower.replace("co_occurring_", "").upper()
                    if target_cat in co_occurring_cats:
                        matched_factor = True
                        break
                else:
                    clean_kw = factor_lower.replace("_", " ")
                    if clean_kw in full_corpus or factor_lower in full_corpus:
                        matched_factor = True
                        break

            if matched_factor:
                mod = rule.get("modifier", 1)
                total_mod += mod
                triggered_ids.append(rule_id)
                rationales.append(rule.get("rationale") or f"Combination factor triggered {rule_id}")

        return total_mod, triggered_ids, rationales

    def assess_single_hazard(
        self,
        hazard: Hazard,
        person_context: PersonContext | None,
        all_hazards: list[Hazard],
        person_category: str | None = None,
        perception: PerceptionResult | None = None,
    ) -> RiskAssessment:
        """Deterministically assess risk for one hazard."""
        rules_data = self._ensure_rules_loaded()
        base_severities = rules_data.get("base_severities", {})

        cat_id = hazard.category_id
        base_info = base_severities.get(cat_id, {})
        base_score = base_info.get("base_score", 2)
        base_rule_id = base_info.get("rule_id", f"R-BASE-{cat_id}")
        base_rationale = base_info.get("rationale", f"Baseline severity for {cat_id}")

        rule_ids = [base_rule_id]
        rationale_parts = [base_rationale]

        # 1. Person modifier
        person_mod = 0
        if person_context:
            person_mod = person_context.severity_modifier
            if person_mod != 0:
                person_rule_id = f"R-PERSON-MOD-{'+' if person_mod > 0 else ''}{person_mod}"
                rule_ids.append(person_rule_id)
                if person_context.note:
                    rationale_parts.append(f"Person vulnerability adjustment ({person_mod:+d}): {person_context.note}")

        # 2. Combination modifier
        combo_mod, combo_rule_ids, combo_rationales = self._evaluate_combo_rules(
            hazard=hazard,
            all_hazards=all_hazards,
            person_category=person_category,
            perception=perception,
        )
        rule_ids.extend(combo_rule_ids)
        rationale_parts.extend(combo_rationales)

        # 3. Compute clamped score: 1 to 5
        raw_score = base_score + person_mod + combo_mod
        clamped_score = max(1, min(5, raw_score))
        potential_level = self._score_to_level(clamped_score)

        # 4. Evidence Gate (Rule R4):
        # status == possible OR evidence_strength == weak -> level=uncertain, potential_level set
        is_possible = hazard.status == HazardStatus.possible
        is_weak = hazard.evidence_strength == EvidenceStrength.weak

        if is_possible or is_weak:
            assigned_level = RiskLevel.uncertain
            rule_ids.append("R-GATE-EVIDENCE")
            reason_str = "status is possible" if is_possible else "evidence strength is weak"
            rationale_parts.append(
                f"[Evidence Gate]: Level is uncertain because {reason_str}. "
                f"Potential severity if confirmed: {potential_level.value.capitalize()} (score {clamped_score})."
            )
            recommend_reanalysis = is_weak
            recommend_human_check = True
            stored_potential_level = potential_level
        else:
            assigned_level = potential_level
            stored_potential_level = None
            recommend_reanalysis = False
            recommend_human_check = assigned_level == RiskLevel.high

        combined_rationale = " ".join(rationale_parts)

        return RiskAssessment(
            level=assigned_level,
            potential_level=stored_potential_level,
            rule_ids=rule_ids,
            rationale=combined_rationale,
            recommend_reanalysis=recommend_reanalysis,
            recommend_human_check=recommend_human_check,
        )

    def _check_immediate_action(
        self,
        hazards: list[Hazard],
        perception: PerceptionResult | None = None,
    ) -> tuple[bool, str]:
        """Check explicit immediate safety action rules.

        Immediate action is set ONLY by explicit dangerous patterns:
        - Visible active fire/smoke (R-ACTION-FIRE)
        - Visible exposed conductor touching water (R-ACTION-LIVE-WIRE-WATER)
        Never claims anyone is in danger.
        """
        fire_terms = ["active fire", "open flame", "heavy smoke", "uncontrolled combustion", "burning"]
        wire_water_terms = [
            "wire in water",
            "cable in water",
            "cord in water",
            "socket in water",
            "submerged cord",
            "plug in puddle",
            "conductor in water",
        ]

        for h in hazards:
            # Only confirmed hazards can trigger immediate action
            if h.status not in [HazardStatus.observed, HazardStatus.likely]:
                continue

            h_text = " ".join([h.title, " ".join(h.evidence)]).lower()

            # 1. Fire / Smoke check
            if h.category_id == "H04" or any(term in h_text for term in ["fire", "smoke", "flame"]):
                for term in fire_terms:
                    if term in h_text:
                        return True, "Active fire or heavy smoke observed. Evacuate people immediately and contact emergency services."

            # 2. Live conductor in water check
            if h.category_id in ["H03", "H01"]:
                for term in wire_water_terms:
                    if term in h_text:
                        return True, "Exposed electrical conductor in pooled water observed. Keep everyone away and shut off main power."
                if ("wire" in h_text or "cord" in h_text or "socket" in h_text) and (
                    "submerged" in h_text or "in water" in h_text or "in puddle" in h_text
                ):
                    return True, "Electrical item in standing water observed. Disconnect main power."

        return False, ""

    def assess(
        self,
        hazards: list[Hazard],
        person_context: dict[str, PersonContext],
        person_category: str | None = None,
        perception: PerceptionResult | None = None,
    ) -> RiskResult:
        """Execute deterministic risk assessment for all hazards.

        Args:
            hazards: List of classified hazards.
            person_context: Map of hazard.id to PersonContext.
            person_category: Selected person category string.
            perception: Optional PerceptionResult for contextual factors.

        Returns:
            RiskResult with risks map, overall_risk, immediate_action, and rationale.
            Guaranteed to be 100% idempotent.
        """
        risks_map: dict[str, RiskAssessment] = {}

        for h in hazards:
            ctx = person_context.get(h.id)
            assessment = self.assess_single_hazard(
                hazard=h,
                person_context=ctx,
                all_hazards=hazards,
                person_category=person_category,
                perception=perception,
            )
            risks_map[h.id] = assessment
            # Attach risk assessment to the hazard object
            h.risk = assessment

        # Determine overall_risk: highest level among observed/likely hazards
        confirmed_levels = [
            assessment.level
            for h, assessment in zip(hazards, risks_map.values())
            if h.status in [HazardStatus.observed, HazardStatus.likely]
        ]

        if confirmed_levels:
            # Find maximum ordinal level
            highest_level = max(confirmed_levels, key=lambda lvl: RISK_LEVEL_ORDER.get(lvl, 0))
            overall_risk = highest_level
        elif any(h.status == HazardStatus.possible for h in hazards):
            # Only possible items exist -> overall_risk is uncertain
            overall_risk = RiskLevel.uncertain
        else:
            # No hazards observed
            overall_risk = RiskLevel.low

        immediate_action, immediate_banner = self._check_immediate_action(hazards, perception)

        summary_rationale = (
            f"Overall scene risk evaluated as {overall_risk.value.upper()} based on "
            f"{len(confirmed_levels)} confirmed hazard(s) and {len(hazards) - len(confirmed_levels)} potential hazard(s)."
        )
        if immediate_action:
            summary_rationale = f"CRITICAL: {immediate_banner} | {summary_rationale}"

        return RiskResult(
            risks=risks_map,
            overall_risk=overall_risk,
            immediate_action=immediate_action,
            rationale=summary_rationale,
        )


def assess_hazards_risk(
    hazards: list[Hazard],
    person_context: dict[str, PersonContext],
    person_category: str | None = None,
    perception: PerceptionResult | None = None,
    rules_path: Path | str = DEFAULT_RULES_PATH,
) -> RiskResult:
    """Convenience functional wrapper for Agent 4."""
    agent = RiskAssessorAgent(rules_path=rules_path)
    return agent.assess(
        hazards=hazards,
        person_context=person_context,
        person_category=person_category,
        perception=perception,
    )
