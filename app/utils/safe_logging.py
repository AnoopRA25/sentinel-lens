"""Safe structured logging utility (skills.md S-29).

Enforces Rule R9 by suppressing verbose HTTP loggers (which log Telegram tokens in URLs),
redacting sensitive API tokens and keys from log messages, and attaching request IDs.
"""

import contextvars
import logging
import re
from typing import Any

from app.core.config import get_settings

# Context variable for tracing request IDs across async boundaries
_request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="")


def set_request_id(req_id: str) -> None:
    """Set the active request ID for current context."""
    _request_id_ctx.set(req_id)


def get_request_id() -> str:
    """Retrieve the current request ID."""
    return _request_id_ctx.get()


# Regex patterns for sensitive tokens
REDACTION_PATTERNS = [
    # Telegram bot tokens in URLs or text (e.g. /bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/)
    (re.compile(r"bot\d+:[A-Za-z0-9_-]+", re.IGNORECASE), "bot[REDACTED_BOT_TOKEN]"),
    # URL query param keys: ?key=AIza... or &api_key=...
    (re.compile(r"([?&](?:key|api_key|x-goog-api-key)=)[A-Za-z0-9_\-]+", re.IGNORECASE), r"\1[REDACTED_KEY]"),
    # Standard Google API key pattern
    (re.compile(r"AIza[0-9A-Za-z\-_]{35}"), "[REDACTED_GEMINI_KEY]"),
    # Telegram chat_id parameter
    (re.compile(r"(chat_id=)\d+", re.IGNORECASE), r"\1[REDACTED_CHAT_ID]"),
    # Bearer authorization headers
    (re.compile(r"(Bearer\s+)[A-Za-z0-9._\-]+", re.IGNORECASE), r"\1[REDACTED_TOKEN]"),
]


def redact_secrets(text: str) -> str:
    """Redact known secret patterns and configured environment secrets from text."""
    if not isinstance(text, str) or not text:
        return text

    redacted = text

    # Redact dynamic patterns
    for pattern, replacement in REDACTION_PATTERNS:
        redacted = pattern.sub(replacement, redacted)

    # Redact configured secrets if non-empty
    try:
        settings = get_settings()
        if settings.GEMINI_API_KEY and len(settings.GEMINI_API_KEY) > 4:
            redacted = redacted.replace(settings.GEMINI_API_KEY, "[REDACTED_GEMINI_KEY]")
        if settings.TELEGRAM_BOT_TOKEN and len(settings.TELEGRAM_BOT_TOKEN) > 4:
            redacted = redacted.replace(settings.TELEGRAM_BOT_TOKEN, "[REDACTED_BOT_TOKEN]")
        if settings.ACCESS_TOKEN and len(settings.ACCESS_TOKEN) > 3:
            redacted = redacted.replace(settings.ACCESS_TOKEN, "[REDACTED_ACCESS_TOKEN]")
    except Exception:
        # Avoid crashing logger if config isn't ready
        pass

    return redacted


class SafeFormatter(logging.Formatter):
    """Custom logging formatter that injects request ID and redacts secrets."""

    def format(self, record: logging.LogRecord) -> str:
        # Inject request_id if available
        req_id = get_request_id()
        record.request_id = req_id if req_id else "-"

        # Format message
        formatted = super().format(record)

        # Redact secrets
        return redact_secrets(formatted)


class SecretRedactionFilter(logging.Filter):
    """Filter that sanitizes record args and messages before output."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_secrets(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: redact_secrets(v) if isinstance(v, str) else v for k, v in record.args.items()}
            elif isinstance(record.args, tuple):
                record.args = tuple(redact_secrets(arg) if isinstance(arg, str) else arg for arg in record.args)
        return True


def suppress_verbose_loggers() -> None:
    """Set verbose 3rd-party library loggers to WARNING to avoid leaking tokens in URLs."""
    for logger_name in (
        "httpx",
        "httpcore",
        "httpcore2",
        "httpx2",
        "urllib3",
        "google_genai",
        "google",
        "google.auth",
    ):
        logging.getLogger(logger_name).setLevel(logging.WARNING)


def setup_logging(level: int = logging.INFO) -> None:
    """Configure root logger with SafeFormatter and suppress noisy network loggers."""
    suppress_verbose_loggers()

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Avoid duplicate handlers if setup_logging is called multiple times
    if not root_logger.handlers:
        handler = logging.StreamHandler()
        formatter = SafeFormatter(
            fmt="%(asctime)s [%(levelname)s] [req:%(request_id)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        handler.addFilter(SecretRedactionFilter())
        root_logger.addHandler(handler)
    else:
        for handler in root_logger.handlers:
            handler.addFilter(SecretRedactionFilter())


def get_logger(name: str) -> logging.Logger:
    """Return a logger with safe redaction defaults."""
    suppress_verbose_loggers()
    logger = logging.getLogger(name)
    logger.addFilter(SecretRedactionFilter())
    return logger
