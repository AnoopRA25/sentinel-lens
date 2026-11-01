"""Read-only safety guidelines and taxonomy endpoints (skills.md S-20).

Provides access to the complete curated hazard taxonomy (H01-H15) and
structured precaution database.
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from typing import Any
from fastapi import APIRouter, HTTPException, status

logger = logging.getLogger(__name__)

router = APIRouter(tags=["guidelines"])

TAXONOMY_PATH = "/home/blue/anup/data/taxonomy.json"
GUIDELINES_PATH = "/home/blue/anup/data/guidelines/safety_guidelines.json"


@lru_cache(maxsize=1)
def load_guidelines_database() -> dict[str, Any]:
    """Load and cache the complete safety guidelines database and hazard taxonomy."""
    result: dict[str, Any] = {
        "version": "2.0.0",
        "taxonomy": [],
        "guidelines": [],
        "category_generics": {},
        "universal_fallback": [],
    }

    if os.path.exists(TAXONOMY_PATH):
        try:
            with open(TAXONOMY_PATH, "r", encoding="utf-8") as f:
                tax_data = json.load(f)
                result["taxonomy"] = tax_data.get("categories", [])
        except Exception as e:
            logger.error("Failed to load taxonomy from %s: %s", TAXONOMY_PATH, e)

    if os.path.exists(GUIDELINES_PATH):
        try:
            with open(GUIDELINES_PATH, "r", encoding="utf-8") as f:
                guide_data = json.load(f)
                result["version"] = guide_data.get("version", "2.0.0")
                result["guidelines"] = guide_data.get("guidelines", [])
                result["category_generics"] = guide_data.get("category_generics", {})
                result["universal_fallback"] = guide_data.get("universal_fallback", [])
        except Exception as e:
            logger.error("Failed to load guidelines from %s: %s", GUIDELINES_PATH, e)

    return result


@router.get(
    "/api/guidelines",
    response_model=dict[str, Any],
    summary="Get full safety guidelines database and taxonomy",
)
@router.get(
    "/guidelines",
    response_model=dict[str, Any],
    summary="Get full safety guidelines database and taxonomy (alias)",
)
async def get_guidelines() -> dict[str, Any]:
    """Return complete read-only taxonomy (H01-H15) and safety precautions database."""
    try:
        return load_guidelines_database()
    except Exception as exc:
        logger.exception("Failed to serve guidelines database: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "database_error", "message": "Failed to read safety guidelines database."},
        )
