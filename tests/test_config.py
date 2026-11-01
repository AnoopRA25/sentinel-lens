"""Tests for application settings and configuration (skills.md S-30, Rule R9)."""

import pytest

from app.core.config import Settings, get_settings


def test_settings_defaults():
    settings = Settings()
    assert settings.GEMINI_MODEL in ("gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-flash-latest")
    assert settings.PIPELINE_VERSION == "v2"
    assert settings.MAX_UPLOAD_MB == 10
    assert settings.MAX_IMAGE_SIDE == 1600
    assert settings.GEMINI_TIMEOUT_SECONDS == 30
    assert settings.MAX_RETRIES == 1
    assert settings.NOTIFICATIONS_ENABLED is False
    assert settings.NOTIFY_MIN_LEVEL == "high"


def test_status_dict_shields_secrets():
    settings = Settings(
        GEMINI_API_KEY="super-secret-gemini-key",
        TELEGRAM_BOT_TOKEN="123456:secret-telegram-token",
        TELEGRAM_CHAT_ID="987654321",
        ACCESS_TOKEN="secret-bearer-token",
    )
    status = settings.status_dict()

    # Booleans reflect presence of credentials
    assert status["gemini_configured"] is True
    # telegram_configured is false because NOTIFICATIONS_ENABLED is false
    assert status["telegram_configured"] is False
    assert status["auth_required"] is True

    # Rule R9: Secrets must NEVER appear in status dict
    status_str = str(status)
    assert "super-secret-gemini-key" not in status_str
    assert "secret-telegram-token" not in status_str
    assert "987654321" not in status_str
    assert "secret-bearer-token" not in status_str
    assert "GEMINI_API_KEY" not in status
    assert "TELEGRAM_BOT_TOKEN" not in status
    assert "TELEGRAM_CHAT_ID" not in status
    assert "ACCESS_TOKEN" not in status


def test_telegram_configured_requires_enabled():
    s1 = Settings(
        TELEGRAM_BOT_TOKEN="token",
        TELEGRAM_CHAT_ID="chat",
        NOTIFICATIONS_ENABLED=False,
    )
    assert s1.telegram_configured is False

    s2 = Settings(
        TELEGRAM_BOT_TOKEN="token",
        TELEGRAM_CHAT_ID="chat",
        NOTIFICATIONS_ENABLED=True,
    )
    assert s2.telegram_configured is True


def test_allowed_origins_parsing():
    s = Settings(ALLOWED_ORIGINS="http://localhost:5173, http://192.168.1.50:5173")
    origins = s.allowed_origins_list
    assert len(origins) == 2
    assert "http://localhost:5173" in origins
    assert "http://192.168.1.50:5173" in origins
