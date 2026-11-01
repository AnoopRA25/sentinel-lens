"""Unit tests for GuidelineService (skills.md S-20).

Tests:
- Loading guidelines from data/guidelines/safety_guidelines.json
- Person category filtering (baby, child, adult, elderly)
- Priority order sorting (priority 1 first)
- Normalised text deduplication
- Conflict resolution via 'conflicts_with'
- Fallback tiers: Direct -> Category Generic -> Universal Fallback
- Non-empty guarantee across all taxonomy categories and person categories
- Non-empty guarantee when guidelines file is missing or corrupt
- Rule R1: Never produces 'safe', 'no danger', or 'all clear'
- Rule R8: Provenance required on every precaution
"""

import pytest

from app.schemas.enums import PersonCategory, PrecautionProvenance
from app.schemas.precaution import Precaution
from app.schemas.report import FORBIDDEN_ASSERTIONS
from app.services.guideline_service import (
    GuidelineService,
    UNIVERSAL_FALLBACK_PRECAUTION,
    normalize_precaution_text,
)


class TestGuidelineService:
    """Test precaution retrieval, filtering, ranking, and fallback guarantees."""

    @pytest.fixture
    def service(self) -> GuidelineService:
        return GuidelineService("/home/blue/anup/data/guidelines/safety_guidelines.json")

    def test_normalize_precaution_text(self):
        t1 = "Wipe up spills immediately, and dry the floor!"
        t2 = "wipe up spills immediately and dry the floor"
        assert normalize_precaution_text(t1) == normalize_precaution_text(t2)

    def test_direct_category_retrieval(self, service: GuidelineService):
        precautions = service.get_precautions_for_hazard("H03", PersonCategory.adult)
        assert len(precautions) >= 1
        assert all(isinstance(p, Precaution) for p in precautions)
        assert any(p.provenance == PrecautionProvenance.guideline for p in precautions)

    def test_person_filtering_baby_receives_childproof_precautions(self, service: GuidelineService):
        # In safety_guidelines.json, G-H03-003 applies to baby and child (safety caps/outlets), but not adult
        baby_precautions = service.get_precautions_for_hazard("H03", PersonCategory.baby)
        baby_cap_ids = [p.guideline_id for p in baby_precautions if p.guideline_id == "G-H03-003"]
        assert len(baby_cap_ids) == 1

        adult_precautions = service.get_precautions_for_hazard("H03", PersonCategory.adult)
        adult_cap_ids = [p.guideline_id for p in adult_precautions if p.guideline_id == "G-H03-003"]
        assert len(adult_cap_ids) == 0

    def test_priority_ranking(self, service: GuidelineService):
        precautions = service.get_precautions_for_hazard("H01", PersonCategory.elderly)
        priorities = [p.priority for p in precautions]
        # Should be monotonically non-decreasing
        assert priorities == sorted(priorities)

    def test_conflict_resolution(self, service: GuidelineService):
        # In safety_guidelines.json, G-H04-005 (priority 1) conflicts with G-H04-006 (priority 2)
        adult_precs = service.get_precautions_for_hazard("H04", PersonCategory.adult)
        ids = [p.guideline_id for p in adult_precs if p.guideline_id]

        assert "G-H04-005" in ids
        assert "G-H04-006" not in ids  # G-H04-006 must be eliminated due to conflict with higher-priority G-H04-005

    def test_text_deduplication(self, service: GuidelineService):
        precautions = service.get_precautions_for_hazard("H01", PersonCategory.adult)
        norm_texts = [normalize_precaution_text(p.text) for p in precautions]
        assert len(norm_texts) == len(set(norm_texts))

    def test_category_generic_fallback(self, service: GuidelineService):
        # In-memory test verifying fallback to category generics
        service_fallback = GuidelineService("/nonexistent/path.json")
        service_fallback._category_generics["H99"] = [
            {
                "id": "GEN-H99",
                "category_id": "H99",
                "text": "Generic precaution for H99 test hazard.",
                "provenance": "generic",
                "priority": 10,
                "applies_to": [],
            }
        ]
        precs = service_fallback.get_precautions_for_hazard("H99", PersonCategory.adult)
        assert len(precs) >= 1
        assert precs[0].guideline_id == "GEN-H99"
        assert precs[0].provenance == PrecautionProvenance.generic

    def test_universal_fallback_unknown_category(self, service: GuidelineService):
        # Querying an unlisted category falls back to universal fallback
        unknown_precs = service.get_precautions_for_hazard("H99_UNKNOWN", PersonCategory.adult)
        assert len(unknown_precs) >= 1
        assert unknown_precs[0].guideline_id == "UNIV-001"
        assert unknown_precs[0].provenance == PrecautionProvenance.generic

    def test_never_empty_guarantee_matrix(self, service: GuidelineService):
        # S-20 Guarantee: Never returns an empty list for any category / person pair
        categories = [
            "H01", "H02", "H03", "H04", "H05", "H06", "H07",
            "H08", "H09", "H10", "H11", "H12", "H13", "H14", "H15"
        ]
        persons = [PersonCategory.baby, PersonCategory.child, PersonCategory.adult, PersonCategory.elderly]

        for cat in categories:
            for p in persons:
                res = service.get_precautions_for_hazard(cat, p)
                assert len(res) >= 1, f"Empty precautions for category={cat}, person={p}"

    def test_missing_file_fallback_guarantee(self):
        missing_service = GuidelineService("/invalid/path/that/does/not/exist.json")
        res = missing_service.get_precautions_for_hazard("H01", PersonCategory.adult)
        assert len(res) == 1
        assert res[0].guideline_id == UNIVERSAL_FALLBACK_PRECAUTION.guideline_id
        assert res[0].provenance == PrecautionProvenance.generic

    def test_rule_r1_compliance_no_forbidden_phrases(self, service: GuidelineService):
        # Per Rule R1: Precautions must never assert 'safe', 'no danger', or 'all clear'
        categories = [f"H{i:02d}" for i in range(1, 16)]
        for cat in categories:
            for person in (PersonCategory.baby, PersonCategory.child, PersonCategory.adult, PersonCategory.elderly):
                precs = service.get_precautions_for_hazard(cat, person)
                for prec in precs:
                    lower_text = prec.text.lower()
                    for pattern in FORBIDDEN_ASSERTIONS:
                        import re
                        assert not re.search(pattern, lower_text), (
                            f"Rule R1 violation in precaution text: '{prec.text}' matches '{pattern}'"
                        )

    def test_rule_r8_compliance_provenance_present(self, service: GuidelineService):
        # Per Rule R8: Every precaution carries its provenance ('guideline' or 'generic')
        for cat in [f"H{i:02d}" for i in range(1, 16)]:
            precs = service.get_precautions_for_hazard(cat, PersonCategory.adult)
            for p in precs:
                assert p.provenance in (PrecautionProvenance.guideline, PrecautionProvenance.generic)
                assert p.text.strip() != ""
