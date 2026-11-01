"""Notification service interface and implementations (skills.md S-27).

Provides:
- NotificationService: Abstract base class for caregiver alerts.
- FakeNotificationService: Mock in-memory service for testing.
- CooldownStore: In-memory TTL tracking of sha1 fingerprints.
- TelegramNotificationService: Production Telegram Bot API integration with:
  - 5-second hard timeout cap
  - Bounded retries with exponential backoff
  - Cooldown deduplication
  - httpx/httpcore loggers set to WARNING to prevent bot token leakage in URLs (Rule R9)
  - Token redaction in all exception traces and log messages.
"""

from __future__ import annotations

import abc
import asyncio
import hashlib
import logging
import time
from typing import Any

import httpx

from app.core.config import get_settings

# Configure httpx and httpcore loggers to WARNING to ensure URL query/path tokens are never logged
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)


class NotificationService(abc.ABC):
    """Abstract interface for caregiver alert dispatch."""

    @abc.abstractmethod
    async def send_telegram_alert(self, message: str) -> bool:
        """Send an urgent safety notification to the caregiver.

        Args:
            message: Formatted text alert.

        Returns:
            True if sent successfully, False otherwise.
        """
        raise NotImplementedError


class CooldownStore:
    """In-memory TTL cache tracking sha1 alert fingerprints."""

    def __init__(self) -> None:
        self._sent_at: dict[str, float] = {}

    @staticmethod
    def compute_fingerprint(text: str) -> str:
        """Compute sha1 hex digest of normalized alert text or hazard signature."""
        normalized = text.strip().encode("utf-8")
        return hashlib.sha1(normalized).hexdigest()

    def is_on_cooldown(self, fingerprint: str, cooldown_seconds: int = 900) -> bool:
        """Check if the fingerprint was notified within the cooldown window."""
        now = time.time()
        last_sent = self._sent_at.get(fingerprint)
        if last_sent is None:
            return False
        if now - last_sent < cooldown_seconds:
            return True
        return False

    def record(self, fingerprint: str, timestamp: float | None = None) -> None:
        """Record notification dispatch timestamp for a fingerprint."""
        self._sent_at[fingerprint] = timestamp or time.time()

    def clear(self) -> None:
        """Clear all recorded fingerprints."""
        self._sent_at.clear()

    def cleanup(self, max_age_seconds: int = 86400) -> None:
        """Prune records older than max_age_seconds."""
        now = time.time()
        expired = [fp for fp, ts in self._sent_at.items() if now - ts > max_age_seconds]
        for fp in expired:
            self._sent_at.pop(fp, None)


class FakeNotificationService(NotificationService):
    """Mock notification service recording sent alerts in memory."""

    def __init__(self, should_succeed: bool = True) -> None:
        self.should_succeed = should_succeed
        self.sent_messages: list[str] = []
        self.call_count: int = 0

    def configure(self, should_succeed: bool = True) -> None:
        self.should_succeed = should_succeed

    def clear(self) -> None:
        self.sent_messages.clear()
        self.call_count = 0

    async def send_telegram_alert(self, message: str) -> bool:
        self.call_count += 1
        if self.should_succeed:
            self.sent_messages.append(message)
            return True
        return False


class TelegramNotificationService(NotificationService):
    """Production Telegram Bot API integration for caregiver notifications."""

    TELEGRAM_API_BASE = "https://api.telegram.org"

    def __init__(
        self,
        bot_token: str | None = None,
        chat_id: str | None = None,
        cooldown_seconds: int | None = None,
        timeout: float = 5.0,
        max_retries: int = 1,
        client: httpx.AsyncClient | None = None,
        cooldown_store: CooldownStore | None = None,
    ) -> None:
        settings = get_settings()
        self.bot_token = bot_token if bot_token is not None else settings.TELEGRAM_BOT_TOKEN
        self.chat_id = chat_id if chat_id is not None else settings.TELEGRAM_CHAT_ID
        self.cooldown_seconds = (
            cooldown_seconds if cooldown_seconds is not None else settings.NOTIFY_COOLDOWN_SECONDS
        )
        self.timeout = min(timeout, 5.0)  # Hard cap at 5s per Rule R10
        self.max_retries = max_retries
        self._custom_client = client
        self.cooldown_store = cooldown_store or CooldownStore()

    def _redact_token(self, text: str) -> str:
        """Ensure bot token never leaks into error strings or logs (Rule R9)."""
        if self.bot_token and self.bot_token in text:
            return text.replace(self.bot_token, "[REDACTED_TELEGRAM_TOKEN]")
        return text

    @property
    def is_configured(self) -> bool:
        """Check if required credentials are present."""
        return bool(self.bot_token and self.bot_token.strip() and self.chat_id and self.chat_id.strip())

    async def send_telegram_alert(
        self,
        message: str,
        fingerprint: str | None = None,
        bypass_cooldown: bool = False,
    ) -> bool:
        """Dispatch a Telegram message under a 5s cap with deduplication and bounded retry."""
        if not self.is_configured:
            logger.warning("Telegram notification skipped: Bot token or chat ID is not configured.")
            return False

        # Fingerprint calculation and cooldown check
        fp = fingerprint or CooldownStore.compute_fingerprint(message)
        if not bypass_cooldown and self.cooldown_store.is_on_cooldown(fp, self.cooldown_seconds):
            logger.info("Telegram notification skipped: active cooldown for fingerprint %s", fp[:8])
            return False

        url = f"{self.TELEGRAM_API_BASE}/bot{self.bot_token}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": message,
            "parse_mode": "Markdown",
        }

        # Bounded execution within 5s total budget
        start_time = time.monotonic()
        attempts = 0
        max_attempts = 1 + self.max_retries

        while attempts < max_attempts:
            attempts += 1
            elapsed = time.monotonic() - start_time
            remaining_time = max(0.5, self.timeout - elapsed)

            if elapsed >= self.timeout:
                logger.error("Telegram notification timeout budget exceeded (5.0s cap)")
                return False

            try:
                if self._custom_client:
                    resp = await self._custom_client.post(
                        url,
                        json=payload,
                        timeout=remaining_time,
                    )
                else:
                    async with httpx.AsyncClient(timeout=remaining_time) as client:
                        resp = await client.post(url, json=payload)

                if resp.status_code == 200:
                    self.cooldown_store.record(fp)
                    logger.info("Telegram notification sent successfully (attempt %d)", attempts)
                    return True

                logger.warning(
                    "Telegram API returned status %d on attempt %d: %s",
                    resp.status_code,
                    attempts,
                    self._redact_token(resp.text[:200]),
                )

            except Exception as exc:
                safe_err = self._redact_token(str(exc))
                logger.warning("Telegram notification attempt %d failed: %s", attempts, safe_err)

            # Exponential backoff if retry remaining and time permits
            if attempts < max_attempts:
                backoff = 0.5 * (2 ** (attempts - 1))
                if (time.monotonic() - start_time) + backoff < self.timeout:
                    await asyncio.sleep(backoff)
                else:
                    break

        return False
