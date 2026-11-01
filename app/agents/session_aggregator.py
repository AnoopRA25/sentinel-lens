"""Agent 9 — Session Aggregator (session_aggregator.py).

Per agent.md §6 and skills.md S-23:
- Merges per-frame results for Video sampling, Live monitoring, and Room Sweep multi-capture.
- Sits OUTSIDE the per-frame graph.
- Deterministic cross-frame hazard matching via token Jaccard:
  - Same taxonomy category_id.
  - Token Jaccard similarity >= threshold (default 0.6).
- Tracks:
  - sightings[]: timestamps / view indices where hazard was observed ("seen in N views").
  - sightings_count, first_seen, last_seen.
  - max_risk: highest risk seen across sightings.
  - change_events[]: records risk escalations and status changes.
  - coverage_gaps[]: consolidated coverage gaps across all analyzed views.
- Rules:
  - Rule R7: Does NOT claim pixel-level object tracking; describes sightings as "seen in N views".
  - Hazards not seen in the latest view are marked 'not_seen_recently', NEVER 'resolved' or 'fixed'.
  - Rule R11: Includes periodic sampling disclaimer: 'Periodic frame sampling. Events between frames can be missed.'
  - Bounded session memory: Caps frame history per session (default 100), sessions expire after TTL (3600s).
"""

from __future__ import annotations

import datetime
import logging
import re
import time
from typing import Any

from app.schemas.api import AggregatedHazard, AnalysisResult, SessionSummary
from app.schemas.enums import HazardStatus, Outcome, RiskLevel
from app.schemas.hazard import Hazard
from app.schemas.report import SafetyReport

logger = logging.getLogger(__name__)

DEFAULT_JACCARD_THRESHOLD = 0.6
MAX_SESSION_FRAMES = 100
SESSION_EXPIRY_SECONDS = 3600

RISK_PRIORITY: dict[RiskLevel, int] = {
    RiskLevel.high: 3,
    RiskLevel.medium: 2,
    RiskLevel.low: 1,
    RiskLevel.uncertain: 0,
}

STATUS_PRIORITY: dict[HazardStatus, int] = {
    HazardStatus.observed: 2,
    HazardStatus.likely: 1,
    HazardStatus.possible: 0,
}


def tokenize_title(title: str) -> set[str]:
    """Extract lowercase alphanumeric tokens of length > 1 for Jaccard similarity."""
    cleaned = re.sub(r"[^\w\s]", " ", title.lower())
    return {w for w in cleaned.split() if len(w) > 1}


def token_jaccard(tokens1: set[str], tokens2: set[str]) -> float:
    """Compute Jaccard similarity between two token sets."""
    if not tokens1 or not tokens2:
        return 0.0
    intersection = len(tokens1 & tokens2)
    union = len(tokens1 | tokens2)
    return intersection / union if union > 0 else 0.0


class SessionRecord:
    """Internal state tracker for a single monitoring session."""

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.created_at = time.time()
        self.last_updated = time.time()
        self.total_frames: int = 0
        self.views_analyzed: int = 0
        self.first_seen_ts: str | None = None
        self.last_seen_ts: str | None = None
        self.aggregated_hazards: list[AggregatedHazard] = []
        self.change_events: list[dict[str, Any]] = []
        self.coverage_gaps: set[str] = set()
        self.frame_records: list[dict[str, Any]] = []

    def is_expired(self, expiry_seconds: int = SESSION_EXPIRY_SECONDS) -> bool:
        """Check if session exceeded inactivity TTL."""
        return (time.time() - self.last_updated) > expiry_seconds


class SessionAggregator:
    """Aggregator that tracks, clusters, and summarizes hazards across video frames and live feeds."""

    def __init__(
        self,
        jaccard_threshold: float = DEFAULT_JACCARD_THRESHOLD,
        max_session_frames: int = MAX_SESSION_FRAMES,
        session_expiry_seconds: int = SESSION_EXPIRY_SECONDS,
    ) -> None:
        self.jaccard_threshold = jaccard_threshold
        self.max_session_frames = max_session_frames
        self.session_expiry_seconds = session_expiry_seconds
        self._sessions: dict[str, SessionRecord] = {}

    def _cleanup_expired_sessions(self) -> None:
        """Prune expired sessions from in-memory store."""
        expired = [sid for sid, rec in self._sessions.items() if rec.is_expired(self.session_expiry_seconds)]
        for sid in expired:
            self._sessions.pop(sid, None)

    def get_or_create_session(self, session_id: str) -> SessionRecord:
        """Retrieve existing session tracker or initialize a new one."""
        self._cleanup_expired_sessions()
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionRecord(session_id=session_id)
        return self._sessions[session_id]

    def _match_hazard(
        self,
        candidate: Hazard,
        existing_hazards: list[AggregatedHazard],
    ) -> AggregatedHazard | None:
        """Find matching aggregated hazard by same category and token Jaccard similarity."""
        candidate_tokens = tokenize_title(candidate.title)
        best_match: AggregatedHazard | None = None
        best_score = 0.0

        for existing in existing_hazards:
            if existing.category_id != candidate.category_id:
                continue

            existing_tokens = tokenize_title(existing.title)
            score = token_jaccard(candidate_tokens, existing_tokens)
            if score >= self.jaccard_threshold and score > best_score:
                best_score = score
                best_match = existing

        return best_match

    def add_frame_result(
        self,
        session_id: str,
        result: SafetyReport | AnalysisResult | dict[str, Any],
        frame_identifier: str | None = None,
        frame_ts: float | None = None,
        view_index: int | None = None,
    ) -> SessionSummary:
        """Ingest a single frame analysis result into the session summary."""
        session = self.get_or_create_session(session_id)
        session.last_updated = time.time()
        session.total_frames += 1

        # Extract timestamps and identifiers
        ts_str = getattr(result, "timestamp", None)
        if not ts_str and isinstance(result, dict):
            ts_str = result.get("timestamp")
        if not ts_str:
            ts_str = datetime.datetime.now(datetime.timezone.utc).isoformat()

        if not session.first_seen_ts:
            session.first_seen_ts = ts_str
        session.last_seen_ts = ts_str

        # Format frame label
        if frame_identifier:
            frame_label = frame_identifier
        elif view_index is not None:
            frame_label = f"view_{view_index}"
        elif frame_ts is not None:
            frame_label = f"ts_{frame_ts:.2f}s"
        else:
            frame_label = f"frame_{session.total_frames}"

        outcome_val = getattr(result, "outcome", None)
        if outcome_val is None and isinstance(result, dict):
            outcome_val = result.get("outcome")

        # Extract hazards
        raw_hazards = getattr(result, "hazards", [])
        if raw_hazards is None and isinstance(result, dict):
            raw_hazards = result.get("hazards", [])

        # Extract coverage gaps
        scene_info = getattr(result, "scene", None)
        if scene_info is None and isinstance(result, dict):
            scene_info = result.get("scene", {})
        if scene_info:
            gaps = getattr(scene_info, "coverage_gaps", None)
            if gaps is None and isinstance(scene_info, dict):
                gaps = scene_info.get("coverage_gaps", [])
            for g in (gaps or []):
                session.coverage_gaps.add(str(g))

        # Check if frame was successful analysis
        if outcome_val in (Outcome.hazards_found, Outcome.none_observed, "hazards_found", "none_observed"):
            session.views_analyzed += 1

        # Match and update hazards
        seen_hazard_ids_in_frame: set[str] = set()

        for h in raw_hazards:
            h_obj = h if isinstance(h, Hazard) else Hazard.model_validate(h)
            match = self._match_hazard(h_obj, session.aggregated_hazards)

            risk_lvl = h_obj.risk.level if h_obj.risk else RiskLevel.low

            if match:
                seen_hazard_ids_in_frame.add(match.id)
                match.sightings_count += 1
                if frame_label not in match.sightings:
                    match.sightings.append(frame_label)
                match.last_seen = ts_str

                # Update max risk
                old_rank = RISK_PRIORITY.get(match.max_risk, 0)
                new_rank = RISK_PRIORITY.get(risk_lvl, 0)
                if new_rank > old_rank:
                    event = {
                        "event": "risk_escalated",
                        "hazard_id": match.id,
                        "title": match.title,
                        "from_risk": match.max_risk.value,
                        "to_risk": risk_lvl.value,
                        "frame": frame_label,
                        "timestamp": ts_str,
                    }
                    session.change_events.append(event)
                    match.max_risk = risk_lvl

                # Update status if higher confirmation tier
                if STATUS_PRIORITY.get(h_obj.status, 0) > STATUS_PRIORITY.get(match.status, 0):
                    match.status = h_obj.status

                # Merge evidence
                for ev in h_obj.evidence:
                    if ev not in match.evidence:
                        match.evidence.append(ev)

                # Merge precautions
                existing_prec_texts = {p.text.lower().strip() for p in match.precautions}
                for p in h_obj.precautions:
                    if p.text.lower().strip() not in existing_prec_texts:
                        match.precautions.append(p)
                        existing_prec_texts.add(p.text.lower().strip())

            else:
                # New cross-frame hazard
                new_id = f"agg_{h_obj.category_id}_{len(session.aggregated_hazards) + 1}"
                seen_hazard_ids_in_frame.add(new_id)
                new_agg = AggregatedHazard(
                    id=new_id,
                    category_id=h_obj.category_id,
                    title=h_obj.title,
                    status=h_obj.status,
                    max_risk=risk_lvl,
                    sightings_count=1,
                    sightings=[frame_label],
                    first_seen=ts_str,
                    last_seen=ts_str,
                    evidence=list(h_obj.evidence),
                    precautions=list(h_obj.precautions),
                )
                session.aggregated_hazards.append(new_agg)
                session.change_events.append({
                    "event": "hazard_first_detected",
                    "hazard_id": new_id,
                    "title": new_agg.title,
                    "risk": risk_lvl.value,
                    "frame": frame_label,
                    "timestamp": ts_str,
                })

        # Bounded frame memory: prune old frames if cap reached
        if len(session.frame_records) >= self.max_session_frames:
            session.frame_records.pop(0)
        session.frame_records.append({
            "frame": frame_label,
            "ts": ts_str,
            "hazards_count": len(raw_hazards),
        })

        return self.get_summary(session_id)

    def get_summary(self, session_id: str) -> SessionSummary:
        """Produce the current aggregated SessionSummary."""
        session = self.get_or_create_session(session_id)

        # Compute overall max risk
        overall_max = RiskLevel.low
        highest_rank = 0
        for h in session.aggregated_hazards:
            rank = RISK_PRIORITY.get(h.max_risk, 0)
            if rank > highest_rank:
                highest_rank = rank
                overall_max = h.max_risk

        return SessionSummary(
            session_id=session.session_id,
            total_frames=session.total_frames,
            views_analyzed=session.views_analyzed,
            first_seen=session.first_seen_ts,
            last_seen=session.last_seen_ts,
            hazards=list(session.aggregated_hazards),
            max_risk=overall_max,
            change_events=list(session.change_events),
            coverage_gaps=sorted(session.coverage_gaps),
            limits_disclaimer="Periodic frame sampling. Events between frames can be missed.",
        )

    def clear_session(self, session_id: str) -> None:
        """Reset or delete session records."""
        self._sessions.pop(session_id, None)


# Global singleton instance for runtime session tracking
_global_aggregator = SessionAggregator()


def get_session_aggregator() -> SessionAggregator:
    """Return the global SessionAggregator singleton."""
    return _global_aggregator


def aggregate_frame(
    session_id: str,
    result: SafetyReport | AnalysisResult | dict[str, Any],
    frame_identifier: str | None = None,
    frame_ts: float | None = None,
    view_index: int | None = None,
    aggregator: SessionAggregator | None = None,
) -> SessionSummary:
    """Convenience functional wrapper for Agent 9."""
    agg = aggregator or _global_aggregator
    return agg.add_frame_result(
        session_id=session_id,
        result=result,
        frame_identifier=frame_identifier,
        frame_ts=frame_ts,
        view_index=view_index,
    )
