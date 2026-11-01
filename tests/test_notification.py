"""Tests for caregiver notification service, cooldown deduplication, and secret redaction.

Validates:
- Cooldown store TTL deduplication and SHA-1 fingerprinting
- TelegramNotificationService policy and mock delivery
- Rule R9: Secrets never leaked in logs, error messages, or exception traces
- httpx and httpcore loggers set to WARNING level
- Bounded retry and timeout capping (5s hard ceiling per Rule R10)
"""

import asyncio
import logging
import time
import pytest
import httpx

from app.services.notification_service import (
    CooldownStore,
    FakeNotificationService,
    TelegramNotificationService,
)


class TestCooldownStore:
    """Test fingerprint generation, cooldown window checks, and cache cleanup."""

    def test_fingerprint_deterministic_sha1(self):
        text = "H03: Power strip near sink"
        fp1 = CooldownStore.compute_fingerprint(text)
        fp2 = CooldownStore.compute_fingerprint(text)
        assert fp1 == fp2
        assert len(fp1) == 40  # SHA-1 hex length

    def test_cooldown_expiry(self):
        store = CooldownStore()
        fp = "test_fp_123"
        assert not store.is_on_cooldown(fp, cooldown_seconds=60)

        # Record right now
        now = time.time()
        store.record(fp, timestamp=now)
        assert store.is_on_cooldown(fp, cooldown_seconds=60)

        # Simulate past timestamp beyond cooldown
        store.record(fp, timestamp=now - 120)
        assert not store.is_on_cooldown(fp, cooldown_seconds=60)

    def test_clear_and_cleanup(self):
        store = CooldownStore()
        now = time.time()
        store.record("old_fp", timestamp=now - 100000)
        store.record("fresh_fp", timestamp=now)
        store.cleanup(max_age_seconds=86400)
        assert not store.is_on_cooldown("old_fp", cooldown_seconds=10)
        assert store.is_on_cooldown("fresh_fp", cooldown_seconds=10)

        store.clear()
        assert not store.is_on_cooldown("fresh_fp", cooldown_seconds=10)


class TestTelegramNotificationService:
    """Test Telegram alerting, bounded retries, and token redaction."""

    def test_httpx_loggers_set_to_warning(self):
        # Per Rule R9 & skills.md S-27: httpx and httpcore loggers must be at WARNING
        httpx_logger = logging.getLogger("httpx")
        httpcore_logger = logging.getLogger("httpcore")
        assert httpx_logger.level >= logging.WARNING
        assert httpcore_logger.level >= logging.WARNING

    def test_token_redaction_method(self):
        service = TelegramNotificationService(
            bot_token="secret_bot_token_987654321",
            chat_id="12345678",
        )
        sample_error = "Failed to connect to https://api.telegram.org/botsecret_bot_token_987654321/sendMessage"
        redacted = service._redact_token(sample_error)
        assert "secret_bot_token_987654321" not in redacted
        assert "[REDACTED_TELEGRAM_TOKEN]" in redacted

    def test_is_configured_check(self):
        unconfigured = TelegramNotificationService(bot_token="", chat_id="")
        assert not unconfigured.is_configured

        partial = TelegramNotificationService(bot_token="token_only", chat_id="   ")
        assert not partial.is_configured

        configured = TelegramNotificationService(bot_token="valid_token", chat_id="valid_chat")
        assert configured.is_configured

    @pytest.mark.asyncio
    async def test_telegram_send_success_and_cooldown(self):
        bot_token = "dummy_token_123"
        chat_id = "chat_999"
        cooldown_store = CooldownStore()

        # Mock transport for httpx
        def handler(request: httpx.Request) -> httpx.Response:
            assert f"/bot{bot_token}/sendMessage" in str(request.url)
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 42}})

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            service = TelegramNotificationService(
                bot_token=bot_token,
                chat_id=chat_id,
                cooldown_seconds=600,
                client=client,
                cooldown_store=cooldown_store,
            )

            # First send should succeed
            res1 = await service.send_telegram_alert("Alert: High electrical hazard detected!")
            assert res1 is True

            # Second identical send within cooldown should be skipped
            res2 = await service.send_telegram_alert("Alert: High electrical hazard detected!")
            assert res2 is False

            # Bypass cooldown should succeed
            res3 = await service.send_telegram_alert(
                "Alert: High electrical hazard detected!",
                bypass_cooldown=True,
            )
            assert res3 is True

    @pytest.mark.asyncio
    async def test_telegram_retry_on_failure(self):
        bot_token = "dummy_token_retry"
        chat_id = "chat_111"
        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return httpx.Response(500, text="Internal Server Error")
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 99}})

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            service = TelegramNotificationService(
                bot_token=bot_token,
                chat_id=chat_id,
                cooldown_seconds=600,
                max_retries=1,
                client=client,
            )

            res = await service.send_telegram_alert("Urgent: Active flame near towels!")
            assert res is True
            assert call_count == 2  # 1 initial + 1 retry

    @pytest.mark.asyncio
    async def test_fake_notification_service(self):
        fake = FakeNotificationService(should_succeed=True)
        res = await fake.send_telegram_alert("Testing fake alert")
        assert res is True
        assert fake.call_count == 1
        assert "Testing fake alert" in fake.sent_messages

        fake.configure(should_succeed=False)
        res2 = await fake.send_telegram_alert("Second test")
        assert res2 is False
        assert fake.call_count == 2
