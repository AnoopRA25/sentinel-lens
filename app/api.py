"""Main FastAPI application entry point for Hazard Precaution Advisor v2.

Adheres strictly to:
- Rule R1: Never claims 'safe', 'no danger', or 'all clear'.
- Rule R9: Secrets (API keys, bot tokens) never leaked in responses or logs.
- Rule R10: Bounded retries, single in-flight frame per session, timeout ceiling.
- Rule R14: Real execution events only.
- skills.md S-28, S-29, S-30, S-31: Job events, safe logging, config guard, access control.
"""

from __future__ import annotations

import logging
import os
import sys
import uuid
from typing import Any
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.routes.analyze import router as analyze_router
from app.routes.graph import router as graph_router
from app.routes.guidelines import router as guidelines_router
from app.routes.health import router as health_router
from app.routes.jobs import router as jobs_router
from app.routes.sessions import router as sessions_router
from app.utils.image_ingest import (
    CorruptImageError,
    ImageDimensionError,
    ImageIngestError,
    ImageTooLargeError,
    InvalidImageFormatError,
)
from app.utils.safe_logging import set_request_id, setup_logging

# Initialize safe logging with token redaction filter
setup_logging()
logger = logging.getLogger("app.api")

settings = get_settings()

app = FastAPI(
    title="Hazard Precaution Advisor v2",
    description="Mobile-first, all-hazard visual scanning and precautionary advisory system.",
    version="2.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

# 1. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 2. Request ID & Tracing Middleware
@app.middleware("http")
async def request_id_and_tracing_middleware(request: Request, call_next) -> Response:
    """Attach unique request ID for structured logging and response headers."""
    req_id = request.headers.get("X-Request-ID") or f"req_{uuid.uuid4().hex[:12]}"
    set_request_id(req_id)
    response = await call_next(request)
    response.headers["X-Request-ID"] = req_id
    return response


# 3. Optional Access Token Verification Middleware (skills.md S-31)
@app.middleware("http")
async def access_token_middleware(request: Request, call_next) -> Response:
    """Validate ACCESS_TOKEN if configured when accessing protected API endpoints."""
    if settings.auth_required:
        path = request.url.path
        # Exclude public probes, status, and documentation endpoints
        public_paths = {
            "/",
            "/health",
            "/api/health",
            "/status",
            "/api/status",
            "/api/docs",
            "/api/openapi.json",
        }
        if path in public_paths or not path.startswith(("/api", "/analyze", "/jobs", "/sessions")):
            return await call_next(request)

        # Check Authorization Bearer or X-Access-Token header
        auth_header = request.headers.get("Authorization", "")
        token_header = request.headers.get("X-Access-Token", "")

        token = ""
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        elif token_header:
            token = token_header.strip()

        if token != settings.ACCESS_TOKEN:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "error": {
                        "code": "unauthorized",
                        "message": "Valid access token required to access this endpoint.",
                    }
                },
                headers={"WWW-Authenticate": "Bearer"},
            )

    return await call_next(request)


# ---------------------------------------------------------------------------
# Global Exception Handlers (Never 500 without typed error body)
# ---------------------------------------------------------------------------

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Transform HTTPExceptions into standard {error: {code, message}} JSON envelope."""
    if isinstance(exc.detail, dict):
        code = exc.detail.get("code", f"http_{exc.status_code}")
        message = exc.detail.get("message", str(exc.detail))
    else:
        code = f"http_{exc.status_code}"
        message = str(exc.detail)

    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": code, "message": message}},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Transform schema validation errors into standard typed error format."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "validation_error",
                "message": "Request parameter validation failed.",
                "details": exc.errors(),
            }
        },
    )


@app.exception_handler(ImageTooLargeError)
async def image_too_large_handler(request: Request, exc: ImageTooLargeError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        content={"error": {"code": "image_too_large", "message": str(exc)}},
    )


@app.exception_handler(InvalidImageFormatError)
async def invalid_image_format_handler(request: Request, exc: InvalidImageFormatError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        content={"error": {"code": "unsupported_media_type", "message": str(exc)}},
    )


@app.exception_handler(CorruptImageError)
@app.exception_handler(ImageDimensionError)
@app.exception_handler(ImageIngestError)
async def corrupt_image_handler(request: Request, exc: ImageIngestError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"error": {"code": "corrupt_image", "message": str(exc)}},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all unhandled exceptions: returns 500 without leaking secrets or raw traces."""
    logger.exception("Unhandled server exception on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "internal_error",
                "message": "An unexpected error occurred during processing.",
            }
        },
    )


# ---------------------------------------------------------------------------
# Router Registration
# ---------------------------------------------------------------------------

app.include_router(health_router)
app.include_router(analyze_router)
app.include_router(jobs_router)
app.include_router(sessions_router)
app.include_router(guidelines_router)
app.include_router(graph_router)

# ---------------------------------------------------------------------------
# Static Files & SPA Fallback (frontend/dist)
# ---------------------------------------------------------------------------

_MEIPASS = getattr(sys, '_MEIPASS', None)
if _MEIPASS:
    FRONTEND_DIST_DIR = os.path.join(_MEIPASS, "frontend", "dist")
else:
    FRONTEND_DIST_DIR = os.environ.get("FRONTEND_DIST_DIR") or os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
    )

if os.path.isdir(FRONTEND_DIST_DIR):
    logger.info("Mounting frontend build artifacts from %s", FRONTEND_DIST_DIR)
    assets_dir = os.path.join(FRONTEND_DIST_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa_frontend(full_path: str):
        file_path = os.path.join(FRONTEND_DIST_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        index_file = os.path.join(FRONTEND_DIST_DIR, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page not found")
else:
    logger.info("Frontend dist directory %s not found. API mode active.", FRONTEND_DIST_DIR)
