"""Application configuration and environment settings (skills.md S-30).

Uses pydantic-settings to load variables from .env with type safety and defaults.
Adheres strictly to Rule R9: Secrets are NEVER exposed in status dicts, logs, or responses.
"""

from functools import lru_cache
from typing import Any
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables and .env file."""
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Secrets (Must NEVER be returned in API status or logs - Rule R9)
    GEMINI_API_KEY: str = Field(default="", description="Google Gemini API key")
    TELEGRAM_BOT_TOKEN: str = Field(default="", description="Telegram Bot token")
    TELEGRAM_CHAT_ID: str = Field(default="", description="Telegram target Chat ID")

    # Core Pipeline Config
    GEMINI_MODEL: str = Field(default="gemini-3.5-flash-lite", description="Gemini vision & reasoning model name")
    PIPELINE_VERSION: str = Field(default="v2", description="Active pipeline version: v2 or legacy")
    MAX_UPLOAD_MB: int = Field(default=10, ge=1, le=50, description="Max uploaded image size in megabytes")
    MAX_IMAGE_SIDE: int = Field(default=1600, ge=256, le=4096, description="Max image pixel dimension on longest side")
    GEMINI_TIMEOUT_SECONDS: int = Field(default=30, ge=5, le=120, description="Gemini API request timeout")
    MAX_RETRIES: int = Field(default=1, ge=0, le=3, description="Targeted perception retry bound")
    DEEP_SCAN_MAX_CALLS: int = Field(default=4, ge=1, le=8, description="Max tile vision calls in deep scan mode")
    VERIFIER_USE_LLM: bool = Field(default=False, description="Whether critic agent invokes secondary LLM call")
    ALLOW_AI_GENERAL_PRECAUTIONS: bool = Field(default=False, description="Whether to allow AI-generated precautions")

    # Caregiver Notifications
    NOTIFICATIONS_ENABLED: bool = Field(default=False, description="Master switch for caregiver notifications")
    NOTIFY_MIN_LEVEL: str = Field(default="high", description="Minimum risk level to trigger notifications (high | medium)")
    NOTIFY_COOLDOWN_SECONDS: int = Field(default=900, ge=0, description="Fingerprint notification cooldown period")

    # Access and Security
    ALLOWED_ORIGINS: str = Field(default="*", description="Comma-separated CORS origins or '*'")
    ACCESS_TOKEN: str = Field(default="", description="Optional bearer token for LAN/tunnel access (S-31)")
    EMERGENCY_NUMBER: str = Field(default="", description="Local emergency services phone number for quick-call")

    @property
    def gemini_configured(self) -> bool:
        """True if GEMINI_API_KEY is non-empty."""
        return bool(self.GEMINI_API_KEY and self.GEMINI_API_KEY.strip())

    @property
    def telegram_configured(self) -> bool:
        """True if Telegram token, chat ID are present and notifications are enabled."""
        return bool(
            self.NOTIFICATIONS_ENABLED
            and self.TELEGRAM_BOT_TOKEN
            and self.TELEGRAM_BOT_TOKEN.strip()
            and self.TELEGRAM_CHAT_ID
            and self.TELEGRAM_CHAT_ID.strip()
        )

    @property
    def auth_required(self) -> bool:
        """True if access token protection is enabled."""
        return bool(self.ACCESS_TOKEN and self.ACCESS_TOKEN.strip())

    @property
    def allowed_origins_list(self) -> list[str]:
        """Parsed list of allowed CORS origins."""
        if not self.ALLOWED_ORIGINS or self.ALLOWED_ORIGINS.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    def status_dict(self) -> dict[str, Any]:
        """Safe status payload containing only booleans and public settings.
        Per Rule R9: Secrets are NEVER included.
        """
        return {
            "gemini_configured": self.gemini_configured,
            "telegram_configured": self.telegram_configured,
            "gemini_model": self.GEMINI_MODEL,
            "pipeline_version": self.PIPELINE_VERSION,
            "max_upload_mb": self.MAX_UPLOAD_MB,
            "max_image_side": self.MAX_IMAGE_SIDE,
            "gemini_timeout_seconds": self.GEMINI_TIMEOUT_SECONDS,
            "max_retries": self.MAX_RETRIES,
            "deep_scan_max_calls": self.DEEP_SCAN_MAX_CALLS,
            "verifier_use_llm": self.VERIFIER_USE_LLM,
            "allow_ai_general_precautions": self.ALLOW_AI_GENERAL_PRECAUTIONS,
            "notifications_enabled": self.NOTIFICATIONS_ENABLED,
            "notify_min_level": self.NOTIFY_MIN_LEVEL,
            "notify_cooldown_seconds": self.NOTIFY_COOLDOWN_SECONDS,
            "auth_required": self.auth_required,
            "emergency_number": self.EMERGENCY_NUMBER,
        }


@lru_cache()
def get_settings() -> Settings:
    """Return cached Settings singleton instance."""
    return Settings()
