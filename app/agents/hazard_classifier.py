"""Agent 2 — Hazard Classification (hazard_classifier.py).

Per agent.md §6 and skills.md S-16, S-17:
- Turn raw candidates and checklist hits into normalised, de-duplicated hazards.
- Deterministic normalization: validate category_hint or keyword map from taxonomy.json, fallback H15.
- Merge duplicates: same category + token Jaccard >= 0.6 -> union evidence.
- Checklist hits with finding='present' converted to hazards.
- Status assignment:
  - clear evidence -> observed
  - partial -> likely
  - trigger-only -> possible
- Gating (Rule R2): possible WITHOUT a trigger is dropped and saved in audit dropped list.
- Cap possible items per image (default 8), ordered by category severity.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from app.schemas.enums import (
    ChecklistFindingStatus,
    EvidenceStrength,
    HazardStatus,
)
from app.schemas.hazard import (
    Hazard,
    HazardAudit,
    HazardClassificationResult,
)
from app.schemas.perception import (
    CandidateHazard,
    ChecklistFinding,
    PerceptionResult,
)

logger = logging.getLogger(__name__)

DEFAULT_TAXONOMY_PATH = Path("/home/blue/anup/data/taxonomy.json")
DEFAULT_POSSIBLE_CAP = 8
DEFAULT_JACCARD_THRESHOLD = 0.6


def _tokenize(text: str) -> set[str]:
    """Extract lowercase alphanumeric word tokens from text."""
    return set(re.findall(r"\b\w+\b", text.lower()))


def token_jaccard(s1: str, s2: str) -> float:
    """Compute token Jaccard similarity between two strings."""
    t1 = _tokenize(s1)
    t2 = _tokenize(s2)
    if not t1 or not t2:
        return 0.0
    return len(t1 & t2) / len(t1 | t2)


class HazardClassifierAgent:
    """Agent 2: Hazard Classifier.

    Normalizes categories, merges duplicate detections, validates evidence triggers,
    and converts checklist findings into verified Hazard objects.
    """

    def __init__(
        self,
        taxonomy_path: Path | str = DEFAULT_TAXONOMY_PATH,
        max_possible_items: int = DEFAULT_POSSIBLE_CAP,
        jaccard_threshold: float = DEFAULT_JACCARD_THRESHOLD,
    ) -> None:
        self.taxonomy_path = Path(taxonomy_path)
        self.max_possible_items = max_possible_items
        self.jaccard_threshold = jaccard_threshold
        self._taxonomy_cache: dict[str, Any] | None = None
        self._valid_categories: set[str] = set()
        self._keyword_map: dict[str, list[str]] = {}  # category_id -> list of keywords
        self._category_severity: dict[str, int] = {}  # category_id -> base_severity
        self._category_titles: dict[str, str] = {}    # category_id -> display title

    def _ensure_taxonomy_loaded(self) -> None:
        if self._taxonomy_cache is None:
            if self.taxonomy_path.exists():
                with open(self.taxonomy_path, "r", encoding="utf-8") as f:
                    self._taxonomy_cache = json.load(f)
            else:
                self._taxonomy_cache = {"categories": []}

            categories = self._taxonomy_cache.get("categories", [])
            self._valid_categories = {c["id"] for c in categories if "id" in c}

            for c in categories:
                cid = c.get("id")
                if not cid:
                    continue
                self._keyword_map[cid] = [kw.lower() for kw in c.get("keywords", [])]
                self._category_severity[cid] = c.get("base_severity", 2)
                self._category_titles[cid] = c.get("title") or c.get("name") or cid

    def normalize_category(self, candidate: CandidateHazard) -> str:
        """Deterministically validate category_hint or map via keywords, fallback H15."""
        self._ensure_taxonomy_loaded()

        # 1. Direct match on category_hint if valid
        if candidate.category_hint:
            clean_hint = candidate.category_hint.strip().upper()
            if clean_hint in self._valid_categories:
                return clean_hint

            # Check if name was used instead of ID (e.g. "slip_wet" -> "H01")
            for cat_id, keywords in self._keyword_map.items():
                if candidate.category_hint.lower() in [cat_id.lower()] or any(
                    kw in candidate.category_hint.lower() for kw in keywords
                ):
                    return cat_id

        # 2. Keyword mapping across raw_title, description, evidence, and trigger
        search_corpus = " ".join([
            candidate.raw_title,
            candidate.description,
            " ".join(candidate.evidence),
            candidate.trigger or "",
        ]).lower()

        best_category = "H15"
        max_matches = 0

        for cat_id, keywords in self._keyword_map.items():
            matches = sum(1 for kw in keywords if kw in search_corpus)
            if matches > max_matches:
                max_matches = matches
                best_category = cat_id

        if max_matches > 0:
            return best_category

        # Fallback to H15 (other_observable)
        return "H15"

    def determine_status_and_strength(
        self,
        candidate: CandidateHazard,
    ) -> tuple[HazardStatus, EvidenceStrength]:
        """Derive status and evidence_strength from visibility, title, and triggers.

        Per agent.md §6 Agent 2:
        - clear direct evidence -> observed
        - partial/contextual -> likely
        - trigger-only or weak -> possible
        """
        vis = candidate.visibility
        has_trigger = bool(candidate.trigger and candidate.trigger.strip())
        is_possible_wording = (
            candidate.raw_title.lower().startswith("possible ")
            or candidate.raw_title.lower().startswith("potential ")
        )

        if vis == EvidenceStrength.clear and not is_possible_wording:
            return HazardStatus.observed, EvidenceStrength.clear
        elif vis == EvidenceStrength.partial and not is_possible_wording:
            return HazardStatus.likely, EvidenceStrength.partial
        elif vis == EvidenceStrength.weak or has_trigger or is_possible_wording:
            return HazardStatus.possible, EvidenceStrength.weak

        # Default fallback based on evidence
        if len(candidate.evidence) >= 1:
            return HazardStatus.likely, EvidenceStrength.partial
        return HazardStatus.possible, EvidenceStrength.weak

    def _convert_checklist_findings(
        self,
        checklist: list[ChecklistFinding],
        existing_hazards: list[Hazard],
    ) -> list[Hazard]:
        """Convert checklist findings with finding='present' into hazards if not already present."""
        self._ensure_taxonomy_loaded()
        new_hazards: list[Hazard] = []

        for item in checklist:
            if item.finding != ChecklistFindingStatus.present and item.finding != "present":
                continue

            cid = item.category_id.strip().upper()
            if cid not in self._valid_categories:
                cid = "H15"

            evidence_text = (item.evidence or "").strip()
            if not evidence_text:
                evidence_text = f"Identified during structured checklist evaluation for {cid}."

            # Check if an existing hazard already covers this finding
            already_covered = False
            for h in existing_hazards:
                if h.category_id == cid:
                    # If strong token overlap with existing hazard evidence or title
                    if token_jaccard(evidence_text, h.title) >= 0.3 or any(
                        token_jaccard(evidence_text, ev) >= 0.4 for ev in h.evidence
                    ):
                        if evidence_text not in h.evidence:
                            h.evidence.append(evidence_text)
                        already_covered = True
                        break

            if not already_covered:
                cat_title = self._category_titles.get(cid, "Identified Hazard")
                h = Hazard(
                    id=f"hz_chk_{len(existing_hazards) + len(new_hazards) + 1}",
                    category_id=cid,
                    title=f"{cat_title}: {evidence_text[:60].rstrip('.')}",
                    status=HazardStatus.observed,
                    evidence_strength=EvidenceStrength.clear if len(evidence_text) > 15 else EvidenceStrength.partial,
                    evidence=[evidence_text],
                    trigger=None,
                    region=None,
                )
                new_hazards.append(h)

        return new_hazards

    def classify(self, perception: PerceptionResult) -> HazardClassificationResult:
        """Execute deterministic classification, gating, deduplication, and capping.

        Args:
            perception: PerceptionResult from Agent 1.

        Returns:
            HazardClassificationResult containing verified hazards and audit dropped list.
        """
        self._ensure_taxonomy_loaded()
        raw_candidates = perception.candidate_hazards
        dropped: list[HazardAudit] = []
        pre_hazards: list[Hazard] = []

        # 1. Initial pass: Category normalization, status/strength derivation, and trigger gating
        for idx, cand in enumerate(raw_candidates):
            cand_id = f"cand_{idx + 1}"
            category_id = self.normalize_category(cand)
            status, strength = self.determine_status_and_strength(cand)

            # Rule R2 Gating: Possible WITHOUT a trigger is dropped
            if status == HazardStatus.possible and (not cand.trigger or not cand.trigger.strip()):
                dropped.append(
                    HazardAudit(
                        id=cand_id,
                        raw_title=cand.raw_title,
                        category_id=category_id,
                        reason="possible_without_trigger",
                        evidence=cand.evidence,
                        trigger=cand.trigger,
                    )
                )
                continue

            # Ensure title is clean
            clean_title = cand.raw_title.strip() or self._category_titles.get(category_id, "Hazard")

            # Evidence collection: must have at least one statement (Rule R2)
            evidence_list = [ev.strip() for ev in cand.evidence if ev.strip()]
            if not evidence_list:
                if cand.description.strip():
                    evidence_list.append(cand.description.strip())
                elif cand.trigger:
                    evidence_list.append(f"Trigger object visible: {cand.trigger}")
                else:
                    evidence_list.append(f"Visible indicator of {clean_title}")

            hazard = Hazard(
                id=f"hz_temp_{idx + 1}",
                category_id=category_id,
                title=clean_title,
                status=status,
                evidence_strength=strength,
                evidence=evidence_list,
                trigger=cand.trigger if status == HazardStatus.possible else None,
                region=cand.approximate_box,
            )
            pre_hazards.append(hazard)

        # 2. Checklist sweep integration: convert checklist hits to hazards
        checklist_hazards = self._convert_checklist_findings(perception.checklist, pre_hazards)
        pre_hazards.extend(checklist_hazards)

        # 3. Duplicate merging: same category + token Jaccard >= 0.6
        merged_hazards: list[Hazard] = []
        for h in pre_hazards:
            merged = False
            for existing in merged_hazards:
                if existing.category_id == h.category_id:
                    sim = token_jaccard(existing.title, h.title)
                    if sim >= self.jaccard_threshold:
                        # Merge duplicate into existing
                        # Union evidence
                        for ev in h.evidence:
                            if ev not in existing.evidence:
                                existing.evidence.append(ev)

                        # Upgrade status if newcomer is higher tier: observed > likely > possible
                        status_priority = {
                            HazardStatus.observed: 3,
                            HazardStatus.likely: 2,
                            HazardStatus.possible: 1,
                        }
                        if status_priority.get(h.status, 0) > status_priority.get(existing.status, 0):
                            existing.status = h.status
                            existing.evidence_strength = h.evidence_strength

                        # Retain trigger if still possible
                        if existing.status == HazardStatus.possible and not existing.trigger:
                            existing.trigger = h.trigger

                        # Retain region if existing lacked one
                        if not existing.region and h.region:
                            existing.region = h.region

                        # Record dropped duplicate in audit trace
                        dropped.append(
                            HazardAudit(
                                id=h.id,
                                raw_title=h.title,
                                category_id=h.category_id,
                                reason=f"duplicate_merged_into_{existing.id}",
                                evidence=h.evidence,
                                trigger=h.trigger,
                            )
                        )
                        merged = True
                        break

            if not merged:
                merged_hazards.append(h)

        # 4. Cap possible items per image
        confirmed_hazards: list[Hazard] = []
        possible_hazards: list[Hazard] = []

        for h in merged_hazards:
            if h.status == HazardStatus.possible:
                possible_hazards.append(h)
            else:
                confirmed_hazards.append(h)

        # Sort possible hazards by category base_severity descending so highest impact items are kept
        possible_hazards.sort(
            key=lambda item: self._category_severity.get(item.category_id, 1),
            reverse=True,
        )

        retained_possible = possible_hazards[: self.max_possible_items]
        excess_possible = possible_hazards[self.max_possible_items :]

        for excess in excess_possible:
            dropped.append(
                HazardAudit(
                    id=excess.id,
                    raw_title=excess.title,
                    category_id=excess.category_id,
                    reason="possible_cap_exceeded",
                    evidence=excess.evidence,
                    trigger=excess.trigger,
                )
            )

        final_hazards = confirmed_hazards + retained_possible

        # 5. Assign final canonical IDs (hz_1, hz_2, ...)
        for idx, h in enumerate(final_hazards):
            h.id = f"hz_{idx + 1}"

        return HazardClassificationResult(hazards=final_hazards, dropped=dropped)


def classify_hazards(
    perception: PerceptionResult,
    taxonomy_path: Path | str = DEFAULT_TAXONOMY_PATH,
    max_possible_items: int = DEFAULT_POSSIBLE_CAP,
    jaccard_threshold: float = DEFAULT_JACCARD_THRESHOLD,
) -> HazardClassificationResult:
    """Convenience functional wrapper for Agent 2."""
    agent = HazardClassifierAgent(
        taxonomy_path=taxonomy_path,
        max_possible_items=max_possible_items,
        jaccard_threshold=jaccard_threshold,
    )
    return agent.classify(perception)
