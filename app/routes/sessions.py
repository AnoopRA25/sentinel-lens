"""Session management and multi-frame hazard aggregation routes (skills.md S-23).

Supports video, live monitoring, and room sweep sessions (Agent 9).
Enforces single in-flight frame per session (returns 429 if busy per Rule R10).
Merges cross-frame hazards deterministically via token Jaccard similarity.
Adheres strictly to Rule R11: Periodic sampling disclaimer included.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.pipeline.workflow import run_pipeline
from app.routes.analyze import report_to_analysis_result
from app.schemas.api import AggregatedHazard, AnalysisRequest, AnalysisResult, SessionSummary
from app.schemas.enums import HazardStatus, Language, Mode, PersonCategory, RiskLevel, Source
from app.schemas.report import SafetyReport
from app.utils.image_ingest import (
    CorruptImageError,
    ImageDimensionError,
    ImageTooLargeError,
    InvalidImageFormatError,
    prepare_image,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sessions"])

# Token Jaccard threshold for cross-frame hazard matching per agent.md §6 (Agent 9)
JACCARD_SIMILARITY_THRESHOLD = 0.6


def token_jaccard_similarity(text1: str, text2: str) -> float:
    """Calculate token Jaccard similarity between two strings."""
    t1 = set(text1.lower().split())
    t2 = set(text2.lower().split())
    if not t1 or not t2:
        return 0.0
    intersection = len(t1.intersection(t2))
    union = len(t1.union(t2))
    return float(intersection) / float(union) if union > 0 else 0.0


RISK_ORDINAL = {
    RiskLevel.low: 1,
    RiskLevel.medium: 2,
    RiskLevel.high: 3,
    RiskLevel.uncertain: 0,
}


def higher_risk(r1: RiskLevel, r2: RiskLevel) -> RiskLevel:
    """Return the higher ordinal risk level between two levels."""
    return r2 if RISK_ORDINAL.get(r2, 0) > RISK_ORDINAL.get(r1, 0) else r1


class CreateSessionRequest(BaseModel):
    """Payload to initialize a monitoring or sweep session."""
    mode: str = Field(default="live", description="Session mode: live | video | room_sweep")
    person_category: PersonCategory = Field(default=PersonCategory.child, description="Target person category")
    language: Language = Field(default=Language.en, description="Target language")


class SessionState:
    """State tracking and aggregator for a multi-frame monitoring session."""

    def __init__(
        self,
        session_id: str,
        mode: str,
        person_category: PersonCategory,
        language: Language,
    ) -> None:
        self.session_id = session_id
        self.mode = mode
        self.person_category = person_category
        self.language = language
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.first_seen: Optional[str] = None
        self.last_seen: Optional[str] = None
        self.total_frames: int = 0
        self.views_analyzed: int = 0
        self.in_flight: bool = False
        self.lock = asyncio.Lock()
        self.hazards: list[AggregatedHazard] = []
        self.change_events: list[dict[str, Any]] = []
        self.coverage_gaps: set[str] = set()
        self.max_risk: RiskLevel = RiskLevel.low

    def update_with_frame_result(self, result: AnalysisResult) -> None:
        """Merge a single frame's analysis result into the aggregated session summary."""
        self.views_analyzed += 1
        now_ts = result.timestamp

        if self.first_seen is None:
            self.first_seen = now_ts
        self.last_seen = now_ts

        # 1. Merge coverage gaps
        for gap in result.scene.coverage_gaps:
            self.coverage_gaps.add(gap)

        # 2. Merge cross-frame hazards
        for frame_hz in result.hazards:
            match_found = False
            for agg_hz in self.hazards:
                if agg_hz.category_id == frame_hz.category_id:
                    similarity = token_jaccard_similarity(agg_hz.title, frame_hz.title)
                    if similarity >= JACCARD_SIMILARITY_THRESHOLD or agg_hz.title.lower() == frame_hz.title.lower():
                        match_found = True
                        agg_hz.sightings_count += 1
                        agg_hz.sightings.append(f"view_{self.views_analyzed}")
                        agg_hz.last_seen = now_ts

                        # Union evidence strings
                        for ev in frame_hz.evidence:
                            if ev not in agg_hz.evidence:
                                agg_hz.evidence.append(ev)

                        # Union precautions without duplication
                        existing_prec_texts = {p.text for p in agg_hz.precautions}
                        for prec in frame_hz.precautions:
                            if prec.text not in existing_prec_texts:
                                agg_hz.precautions.append(prec)
                                existing_prec_texts.add(prec.text)

                        # Evaluate risk escalation
                        new_level = frame_hz.risk.level if frame_hz.risk else RiskLevel.low
                        if RISK_ORDINAL.get(new_level, 0) > RISK_ORDINAL.get(agg_hz.max_risk, 0):
                            self.change_events.append({
                                "type": "risk_escalation",
                                "hazard_id": agg_hz.id,
                                "from_level": agg_hz.max_risk.value,
                                "to_level": new_level.value,
                                "view": self.views_analyzed,
                                "ts": now_ts,
                            })
                            agg_hz.max_risk = new_level
                        break

            if not match_found:
                new_agg_id = f"agg_hz_{len(self.hazards) + 1}"
                new_level = frame_hz.risk.level if frame_hz.risk else RiskLevel.low
                new_agg = AggregatedHazard(
                    id=new_agg_id,
                    category_id=frame_hz.category_id,
                    title=frame_hz.title,
                    status=frame_hz.status,
                    max_risk=new_level,
                    sightings_count=1,
                    sightings=[f"view_{self.views_analyzed}"],
                    first_seen=now_ts,
                    last_seen=now_ts,
                    evidence=list(frame_hz.evidence),
                    precautions=list(frame_hz.precautions),
                )
                self.hazards.append(new_agg)
                self.change_events.append({
                    "type": "hazard_first_observed",
                    "hazard_id": new_agg_id,
                    "category_id": frame_hz.category_id,
                    "title": frame_hz.title,
                    "view": self.views_analyzed,
                    "ts": now_ts,
                })

        # 3. Update session-wide max risk
        overall = RiskLevel.low
        for h in self.hazards:
            overall = higher_risk(overall, h.max_risk)
        self.max_risk = overall

    def get_summary(self) -> SessionSummary:
        """Produce canonical SessionSummary schema."""
        return SessionSummary(
            session_id=self.session_id,
            total_frames=self.total_frames,
            views_analyzed=self.views_analyzed,
            first_seen=self.first_seen,
            last_seen=self.last_seen,
            hazards=list(self.hazards),
            max_risk=self.max_risk,
            change_events=list(self.change_events),
            coverage_gaps=sorted(list(self.coverage_gaps)),
            limits_disclaimer="Periodic frame sampling. Events between frames can be missed.",
        )


# Global in-memory storage for active sessions
_sessions_store: dict[str, SessionState] = {}


@router.post("/api/sessions", status_code=status.HTTP_201_CREATED, summary="Create multi-frame session")
@router.post("/sessions", status_code=status.HTTP_201_CREATED, summary="Create multi-frame session (alias)")
async def create_session(payload: Optional[CreateSessionRequest] = None) -> dict[str, Any]:
    """Initialize a video, live camera, or room sweep session."""
    mode = payload.mode if payload else "live"
    person = payload.person_category if payload else PersonCategory.child
    lang = payload.language if payload else Language.en

    session_id = f"sess_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    state = SessionState(session_id=session_id, mode=mode, person_category=person, language=lang)
    _sessions_store[session_id] = state

    return {
        "session_id": session_id,
        "mode": mode,
        "status": "active",
        "created_at": state.created_at,
    }


@router.post("/api/sessions/{session_id}/frames", summary="Submit frame for session analysis")
@router.post("/sessions/{session_id}/frames", summary="Submit frame for session analysis (alias)")
async def add_session_frame(
    session_id: str,
    image: UploadFile = File(..., description="Sampled frame image"),
    frame_ts: Optional[float] = Form(default=None, description="Video offset timestamp in seconds"),
    view_index: Optional[int] = Form(default=None, description="Sequential frame index"),
    person_category: Optional[str] = Form(default=None),
    language: Optional[str] = Form(default=None),
) -> dict[str, Any]:
    """Analyze a frame and update the session aggregator.

    Enforces single in-flight frame per session (returns 429 if busy per Rule R10).
    """
    settings = get_settings()

    session = _sessions_store.get(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "session_not_found", "message": f"Session '{session_id}' not found."},
        )

    # Enforce single in-flight frame (Rule R10)
    if session.in_flight:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "session_busy",
                "message": f"A frame is already in flight for session '{session_id}'. Dropping overlapping frame.",
            },
        )

    session.in_flight = True
    session.total_frames += 1

    try:
        raw_bytes = await image.read()
        if not raw_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "empty_file", "message": "Uploaded frame payload is empty."},
            )

        prepared = prepare_image(
            raw_bytes,
            max_upload_mb=settings.MAX_UPLOAD_MB,
            max_side=settings.MAX_IMAGE_SIDE,
        )

        # Resolve person category and language
        target_person = session.person_category
        if person_category:
            try:
                target_person = PersonCategory(person_category.lower())
            except ValueError:
                pass

        target_lang = session.language
        if language:
            try:
                target_lang = Language(language.lower())
            except ValueError:
                pass

        req = AnalysisRequest(
            person_category=target_person,
            language=target_lang,
            mode=Mode.quick,
            source=Source.video_frame if session.mode == "video" else Source.frame,
            session_id=session_id,
            frame_ts=frame_ts,
            view_index=view_index or (session.views_analyzed + 1),
            deep_scan=False,
        )

        report = await run_pipeline(request=req, image_bytes=prepared.data)
        analysis_res = report_to_analysis_result(report)

        # Aggregate frame result into session
        session.update_with_frame_result(analysis_res)

        return {
            "session_id": session_id,
            "view_index": session.views_analyzed,
            "frame_result": analysis_res.model_dump(),
            "session_summary": session.get_summary().model_dump(),
        }

    except HTTPException:
        raise
    except (ImageTooLargeError, InvalidImageFormatError, CorruptImageError, ImageDimensionError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_frame", "message": str(e)},
        )
    except Exception as exc:
        logger.exception("Error processing frame for session %s: %s", session_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "pipeline_error", "message": f"Frame analysis failed: {str(exc)}"},
        )
    finally:
        session.in_flight = False


@router.get(
    "/api/sessions/{session_id}/summary",
    response_model=SessionSummary,
    summary="Get aggregated session summary",
)
@router.get(
    "/sessions/{session_id}/summary",
    response_model=SessionSummary,
    summary="Get aggregated session summary (alias)",
)
async def get_session_summary(session_id: str) -> SessionSummary:
    """Return aggregated cross-frame SessionSummary with merged hazards and coverage gaps."""
    session = _sessions_store.get(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "session_not_found", "message": f"Session '{session_id}' not found."},
        )
    return session.get_summary()
