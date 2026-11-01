"""Asynchronous jobs and real-time SSE event streaming (skills.md S-28).

Endpoints:
- POST /api/jobs: Accepts media upload, validates parameters, queues background pipeline, returns 202 {job_id}.
- GET /api/jobs/{id}/events: Server-Sent Events (SSE) streaming real execution events (node_started, node_finished, preview, result, error).
- GET /api/jobs/{id}: Returns current JobStatus and result.

Adheres strictly to Rule R14: Real execution events only, no synthetic timers.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from sse_starlette.sse import EventSourceResponse

from app.core.config import get_settings
from app.pipeline.state import create_initial_state
from app.pipeline.workflow import get_workflow_graph, run_pipeline
from app.routes.analyze import report_to_analysis_result
from app.schemas.api import AnalysisRequest, AnalysisResult, JobStatus
from app.schemas.enums import JobStatusEnum, Language, Mode, PersonCategory, Source
from app.schemas.report import SafetyReport
from app.utils.image_ingest import (
    CorruptImageError,
    ImageDimensionError,
    ImageTooLargeError,
    InvalidImageFormatError,
    prepare_image,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["jobs"])


class JobRecord:
    """In-memory state and event dispatch for an asynchronous analysis job."""

    def __init__(self, job_id: str, request: AnalysisRequest, raw_bytes: bytes) -> None:
        self.job_id = job_id
        self.request = request
        self.raw_bytes = raw_bytes
        self.status = JobStatusEnum.pending
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.created_at
        self.result: Optional[AnalysisResult] = None
        self.error: Optional[str] = None
        self.events: list[dict[str, Any]] = []
        self.subscribers: list[asyncio.Queue] = []
        self.lock = asyncio.Lock()

    def add_event(self, event: dict[str, Any]) -> None:
        """Append event to replay buffer and notify active SSE listeners."""
        self.events.append(event)
        self.updated_at = datetime.now(timezone.utc).isoformat()
        for q in list(self.subscribers):
            try:
                q.put_nowait(event)
            except Exception:
                pass

    def mark_completed(self, result: AnalysisResult) -> None:
        """Mark job completed with final AnalysisResult and notify listeners."""
        self.status = JobStatusEnum.completed
        self.result = result
        self.updated_at = datetime.now(timezone.utc).isoformat()
        self.add_event({
            "type": "result",
            "node": "finalize",
            "ts": self.updated_at,
            "result": result.model_dump(),
        })
        # Sentinel to end streaming
        for q in list(self.subscribers):
            try:
                q.put_nowait(None)
            except Exception:
                pass

    def mark_failed(self, error_message: str) -> None:
        """Mark job failed with error message and notify listeners."""
        self.status = JobStatusEnum.failed
        self.error = error_message
        self.updated_at = datetime.now(timezone.utc).isoformat()
        self.add_event({
            "type": "error",
            "node": "pipeline",
            "ts": self.updated_at,
            "message": error_message,
        })
        for q in list(self.subscribers):
            try:
                q.put_nowait(None)
            except Exception:
                pass

    def to_status(self) -> JobStatus:
        """Convert to external JobStatus schema."""
        return JobStatus(
            job_id=self.job_id,
            status=self.status,
            created_at=self.created_at,
            updated_at=self.updated_at,
            result=self.result,
            error=self.error,
        )


# Global in-memory storage for jobs
_jobs_store: dict[str, JobRecord] = {}


async def _run_job_background(job: JobRecord) -> None:
    """Execute LangGraph pipeline in background, streaming authentic node events."""
    settings = get_settings()
    job.status = JobStatusEnum.processing
    job.updated_at = datetime.now(timezone.utc).isoformat()

    # Ingest event
    job.add_event({
        "type": "node_started",
        "node": "ingest",
        "attempt": 1,
        "ts": job.updated_at,
        "summary": "Preprocessing image and stripping EXIF",
    })

    try:
        prepared = prepare_image(
            job.raw_bytes,
            max_upload_mb=settings.MAX_UPLOAD_MB,
            max_side=settings.MAX_IMAGE_SIDE,
        )

        job.add_event({
            "type": "node_finished",
            "node": "ingest",
            "attempt": 1,
            "ts": datetime.now(timezone.utc).isoformat(),
            "summary": f"Image prepared ({prepared.width}x{prepared.height})",
        })

        graph = get_workflow_graph()
        initial_state = create_initial_state(job.request, prepared)

        final_report: Optional[SafetyReport] = None

        async for update in graph.astream(initial_state, stream_mode="updates"):
            now_iso = datetime.now(timezone.utc).isoformat()
            for node_name, node_output in update.items():
                if not isinstance(node_output, dict):
                    continue

                # Emit node completion
                job.add_event({
                    "type": "node_finished",
                    "node": node_name,
                    "attempt": 1,
                    "ts": now_iso,
                    "summary": f"Step '{node_name}' completed",
                })

                # Classification preview event
                if node_name == "classify":
                    hazards = node_output.get("hazards", [])
                    job.add_event({
                        "type": "preview",
                        "node": "classify",
                        "attempt": 1,
                        "ts": now_iso,
                        "unverified": True,
                        "hazards": [h.model_dump() for h in hazards if hasattr(h, "model_dump")],
                    })

                # Check if report was built
                if "report" in node_output and node_output["report"]:
                    final_report = node_output["report"]

        if final_report is None:
            # Fallback direct call if astream didn't extract final report
            final_report = await run_pipeline(job.request, prepared.data)

        analysis_result = report_to_analysis_result(final_report)
        job.mark_completed(analysis_result)

    except Exception as exc:
        logger.exception("Background execution of job %s failed: %s", job.job_id, exc)
        job.mark_failed(f"Pipeline error: {str(exc)}")


@router.post(
    "/api/jobs",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit asynchronous analysis job",
)
@router.post(
    "/jobs",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit asynchronous analysis job (alias)",
)
async def create_job(
    image: UploadFile = File(..., description="Image file to analyze"),
    person_category: str = Form(default="child", description="baby | child | adult | elderly"),
    language: str = Form(default="en", description="en | kn | hi"),
    mode: str = Form(default="quick", description="quick | deep"),
    source: str = Form(default="photo", description="photo | frame | video_frame"),
    session_id: Optional[str] = Form(default=None),
    frame_ts: Optional[float] = Form(default=None),
    view_index: Optional[int] = Form(default=None),
    deep_scan: Optional[bool] = Form(default=False),
) -> dict[str, Any]:
    """Queue asynchronous scene analysis and return job ID for SSE tracking."""
    settings = get_settings()

    # Validate parameters
    try:
        parsed_person = PersonCategory(person_category.lower())
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_parameters",
                "message": f"Invalid person_category '{person_category}'. Allowed values: {[e.value for e in PersonCategory]}.",
            },
        )

    try:
        parsed_lang = Language(language.lower())
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_parameters",
                "message": f"Invalid language '{language}'. Allowed values: {[e.value for e in Language]}.",
            },
        )

    try:
        parsed_mode = Mode(mode.lower())
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_parameters",
                "message": f"Invalid mode '{mode}'. Allowed values: {[e.value for e in Mode]}.",
            },
        )

    try:
        parsed_source = Source(source.lower())
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_parameters",
                "message": f"Invalid source '{source}'. Allowed values: {[e.value for e in Source]}.",
            },
        )

    # Ingest image
    try:
        raw_bytes = await image.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "read_error", "message": f"Failed to read upload payload: {str(e)}"},
        )

    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "empty_file", "message": "Uploaded image file is empty."},
        )

    # Fast validation before queueing
    try:
        _ = prepare_image(
            raw_bytes,
            max_upload_mb=settings.MAX_UPLOAD_MB,
            max_side=settings.MAX_IMAGE_SIDE,
        )
    except ImageTooLargeError as e:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "image_too_large", "message": str(e)},
        )
    except InvalidImageFormatError as e:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"code": "unsupported_media_type", "message": str(e)},
        )
    except (CorruptImageError, ImageDimensionError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "corrupt_image", "message": str(e)},
        )

    job_id = f"job_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"

    req = AnalysisRequest(
        person_category=parsed_person,
        language=parsed_lang,
        mode=parsed_mode,
        source=parsed_source,
        session_id=session_id,
        frame_ts=frame_ts,
        view_index=view_index,
        deep_scan=bool(deep_scan or parsed_mode == Mode.deep),
    )

    record = JobRecord(job_id=job_id, request=req, raw_bytes=raw_bytes)
    _jobs_store[job_id] = record

    # Spawn background worker
    asyncio.create_task(_run_job_background(record))

    return {
        "job_id": job_id,
        "status": "pending",
        "created_at": record.created_at,
    }


@router.get("/api/jobs/{job_id}/events", summary="Stream real-time job execution events (SSE)")
@router.get("/jobs/{job_id}/events", summary="Stream real-time job execution events (SSE alias)")
async def stream_job_events(job_id: str, request: Request) -> EventSourceResponse:
    """Stream execution trace events via Server-Sent Events (SSE).

    Emits node_started, node_finished, preview, result, and error events in real-time.
    """
    job = _jobs_store.get(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "job_not_found", "message": f"Job '{job_id}' not found."},
        )

    async def event_generator():
        # 1. Replay historical events already recorded
        for evt in list(job.events):
            yield {
                "event": evt.get("type", "message"),
                "data": json.dumps(evt),
            }

        # If already completed or failed, terminate stream
        if job.status in (JobStatusEnum.completed, JobStatusEnum.failed):
            return

        # 2. Subscribe to real-time events
        queue: asyncio.Queue = asyncio.Queue()
        job.subscribers.append(queue)
        try:
            while True:
                # Check for client disconnect
                if await request.is_disconnected():
                    break

                try:
                    evt = await asyncio.wait_for(queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    # Keep-alive heartbeat comment
                    yield {"comment": "ping"}
                    continue

                if evt is None:
                    # Sentinel received; job finished
                    break

                yield {
                    "event": evt.get("type", "message"),
                    "data": json.dumps(evt),
                }
        finally:
            if queue in job.subscribers:
                job.subscribers.remove(queue)

    return EventSourceResponse(event_generator())


@router.get("/api/jobs/{job_id}", response_model=JobStatus, summary="Get job status and result")
@router.get("/jobs/{job_id}", response_model=JobStatus, summary="Get job status and result (alias)")
async def get_job_status(job_id: str) -> JobStatus:
    """Retrieve job metadata, status, and final AnalysisResult once complete."""
    job = _jobs_store.get(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "job_not_found", "message": f"Job '{job_id}' not found."},
        )
    return job.to_status()
