"""Synchronous hazard analysis route (skills.md S-11, S-28).

Accepts multipart form uploads, performs content validation and EXIF stripping,
executes the LangGraph analysis pipeline, and returns strongly typed AnalysisResult.
Adheres strictly to Rule R1 (no false safe assertions) and Rule R9 (no secrets).
"""

from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.pipeline.workflow import run_pipeline
from app.schemas.api import AnalysisRequest, AnalysisResult
from app.schemas.enums import Language, Mode, PersonCategory, Source
from app.schemas.report import SafetyReport
from app.utils.image_ingest import (
    CorruptImageError,
    ImageDimensionError,
    ImageTooLargeError,
    InvalidImageFormatError,
    prepare_image,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analyze"])


def report_to_analysis_result(report: SafetyReport) -> AnalysisResult:
    """Transform internal SafetyReport into user-facing AnalysisResult schema."""
    return AnalysisResult(
        id=report.id,
        timestamp=report.timestamp,
        outcome=report.outcome,
        analysis_reliable=report.analysis_reliable,
        person_category=report.person_category,
        language=report.language,
        scene=report.scene,
        hazards=report.hazards,
        overall_risk=report.overall_risk,
        immediate_action=report.immediate_action,
        verification=report.verification,
        notification=report.notification,
        errors=report.errors,
        translation_error=report.translation_error,
        trace=report.trace,
        limits=report.limits,
    )


async def handle_analyze(
    image: UploadFile,
    person_category: str,
    language: str,
    mode: str,
    source: str,
    session_id: Optional[str] = None,
    frame_ts: Optional[float] = None,
    view_index: Optional[int] = None,
    deep_scan: Optional[bool] = False,
) -> AnalysisResult:
    """Core analysis logic shared across /analyze and /api/analyze."""
    settings = get_settings()

    # 1. Validate enumeration parameters
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

    # 2. Ingest and validate image payload
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

    try:
        prepared = prepare_image(
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
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "image_processing_error", "message": f"Failed to process image: {str(e)}"},
        )

    # 3. Construct AnalysisRequest
    request = AnalysisRequest(
        person_category=parsed_person,
        language=parsed_lang,
        mode=parsed_mode,
        source=parsed_source,
        session_id=session_id,
        frame_ts=frame_ts,
        view_index=view_index,
        deep_scan=bool(deep_scan or parsed_mode == Mode.deep),
    )

    # 4. Execute pipeline
    try:
        report = await run_pipeline(
            request=request,
            image_bytes=prepared.data,
        )
        return report_to_analysis_result(report)
    except Exception as exc:
        logger.exception("Pipeline execution failed unexpectedly: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "pipeline_execution_error",
                "message": f"An error occurred while analyzing the scene: {str(exc)}",
            },
        )


@router.post("/analyze", response_model=AnalysisResult, summary="Synchronous scene analysis")
async def analyze_endpoint(
    image: UploadFile = File(..., description="Image file to analyze"),
    person_category: str = Form(default="child", description="baby | child | adult | elderly"),
    language: str = Form(default="en", description="en | kn | hi"),
    mode: str = Form(default="quick", description="quick | deep"),
    source: str = Form(default="photo", description="photo | frame | video_frame"),
    session_id: Optional[str] = Form(default=None),
    frame_ts: Optional[float] = Form(default=None),
    view_index: Optional[int] = Form(default=None),
    deep_scan: Optional[bool] = Form(default=False),
) -> AnalysisResult:
    """Analyze image and return complete AnalysisResult."""
    return await handle_analyze(
        image=image,
        person_category=person_category,
        language=language,
        mode=mode,
        source=source,
        session_id=session_id,
        frame_ts=frame_ts,
        view_index=view_index,
        deep_scan=deep_scan,
    )


@router.post("/api/analyze", response_model=AnalysisResult, summary="Synchronous scene analysis (/api alias)")
async def analyze_api_endpoint(
    image: UploadFile = File(..., description="Image file to analyze"),
    person_category: str = Form(default="child", description="baby | child | adult | elderly"),
    language: str = Form(default="en", description="en | kn | hi"),
    mode: str = Form(default="quick", description="quick | deep"),
    source: str = Form(default="photo", description="photo | frame | video_frame"),
    session_id: Optional[str] = Form(default=None),
    frame_ts: Optional[float] = Form(default=None),
    view_index: Optional[int] = Form(default=None),
    deep_scan: Optional[bool] = Form(default=False),
) -> AnalysisResult:
    """Analyze image and return complete AnalysisResult (API alias)."""
    return await handle_analyze(
        image=image,
        person_category=person_category,
        language=language,
        mode=mode,
        source=source,
        session_id=session_id,
        frame_ts=frame_ts,
        view_index=view_index,
        deep_scan=deep_scan,
    )
