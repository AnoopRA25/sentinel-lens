"""Tests for safe logging and secret redaction (skills.md S-29, Rule R9)."""

import io
import logging
import pytest

from app.utils.safe_logging import (
    SafeFormatter,
    SecretRedactionFilter,
    get_logger,
    get_request_id,
    redact_secrets,
    set_request_id,
)


def test_redact_secrets_telegram_bot_token():
    url = "https://api.telegram.org/bot123456789:ABCdefGhI_jkLmnOpQRstUvw-xyz12345/sendMessage"
    redacted = redact_secrets(url)
    assert "123456789:ABCdefGhI_jkLmnOpQRstUvw-xyz12345" not in redacted
    assert "bot[REDACTED_BOT_TOKEN]" in redacted


def test_redact_secrets_gemini_api_key():
    url = "https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyD-fakeKey1234567890abcdefghijkl"
    redacted = redact_secrets(url)
    assert "AIzaSyD-fakeKey1234567890abcdefghijkl" not in redacted
    assert "[REDACTED_KEY]" in redacted or "[REDACTED_GEMINI_KEY]" in redacted


def test_redact_secrets_bearer_token():
    header = "Authorization: Bearer my-secret-jwt-token-value-here"
    redacted = redact_secrets(header)
    assert "my-secret-jwt-token-value-here" not in redacted
    assert "Bearer [REDACTED_TOKEN]" in redacted


def test_safe_formatter_includes_request_id():
    set_request_id("req_xyz_789")
    try:
        record = logging.LogRecord(
            name="test_logger",
            level=logging.INFO,
            pathname=__file__,
            lineno=10,
            msg="User requested analysis with bot12345:ABCDE token",
            args=(),
            exc_info=None,
        )
        formatter = SafeFormatter(fmt="[%(request_id)s] %(message)s")
        formatted = formatter.format(record)

        assert "[req_xyz_789]" in formatted
        assert "bot12345:ABCDE" not in formatted
        assert "bot[REDACTED_BOT_TOKEN]" in formatted
    finally:
        set_request_id("")
