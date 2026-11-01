"""Health check and system status routes for Hazard Precaution Advisor v2.

Adheres strictly to Rule R9: Secrets (API keys, bot tokens, chat IDs) are NEVER returned.
"""

import os
from typing import Any
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.core.config import get_settings

router = APIRouter(tags=["health"])


class GeminiKeyPayload(BaseModel):
    api_key: str = Field(..., min_length=1)


@router.post("/api/settings/gemini-key", summary="Save Gemini API key to .env and activate vision model")
async def save_gemini_key(payload: GeminiKeyPayload) -> dict[str, Any]:
    key = payload.api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="API key cannot be empty")

    env_path = "/home/blue/anup/.env"
    lines = []
    found = False
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("GEMINI_API_KEY="):
                    lines.append(f"GEMINI_API_KEY={key}\n")
                    found = True
                else:
                    lines.append(line)
    if not found:
        lines.append(f"GEMINI_API_KEY={key}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(lines)

    os.environ["GEMINI_API_KEY"] = key
    get_settings.cache_clear()

    return {"status": "ok", "message": "Gemini API key saved successfully.", "gemini_configured": True}


@router.get("/", summary="Service liveness health check or SPA frontend")
@router.get("/health", response_model=dict[str, Any], summary="Service liveness health check")
async def health_check(request: Request) -> Any:
    """Liveness probe returning server health and version, or SPA frontend for web browsers."""
    accept = request.headers.get("accept", "")
    if "text/html" in accept and request.url.path == "/":
        dist_dir = os.environ.get("FRONTEND_DIST_DIR") or os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
        )
        index_file = os.path.join(dist_dir, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
    return {"status": "ok", "version": "2.0.0"}


@router.get("/status", response_model=dict[str, Any], summary="System configuration status")
@router.get("/api/status", response_model=dict[str, Any], summary="System configuration status")
async def system_status() -> dict[str, Any]:
    """Return non-secret system configuration status.

    Rule R9: No API keys, bot tokens, or private credentials are ever returned.
    """
    settings = get_settings()
    return {
        "status": "ok",
        "version": "2.0.0",
        "gemini_configured": settings.gemini_configured,
        "telegram_configured": settings.telegram_configured,
        "pipeline_version": settings.PIPELINE_VERSION,
        "max_upload_mb": settings.MAX_UPLOAD_MB,
        "max_image_side": settings.MAX_IMAGE_SIDE,
        "allowed_origins": settings.allowed_origins_list,
        "auth_required": settings.auth_required,
        "notifications_enabled": settings.NOTIFICATIONS_ENABLED,
        "verifier_use_llm": settings.VERIFIER_USE_LLM,
        "allow_ai_general_precautions": settings.ALLOW_AI_GENERAL_PRECAUTIONS,
        "emergency_number": settings.EMERGENCY_NUMBER,
    }
