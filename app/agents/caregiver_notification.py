"""Agent 8 — Caregiver Notification (caregiver_notification.py).

Per agent.md §6 and skills.md S-27:
- Evaluates notification policy:
  - Notifications enabled in settings
  - outcome == 'hazards_found'
  - analysis_reliable is True
  - At least one hazard is 'observed' or 'likely' with evidence >= 'partial'
  - overall_risk >= NOTIFY_MIN_LEVEL (default 'high'; 'medium' also qualifies for baby/child)
- Cooldown & Deduplication:
  - Computes sha1(f"{category_id}:{normalized_title}:{session_id}")
  - Cooldown: default 900s (NOTIFY_COOLDOWN_SECONDS)
  - Escalation bypass: Re-notifies if risk level escalates for the same fingerprint
- Dispatches alert via NotificationService (e.g. Telegram) within 5s hard timeout cap.
- Adheres to Rule R9: Secrets (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) are NEVER logged
  or placed into NotificationRecord.
"""

from __future__ import annotations

import datetime
import hashlib
import logging
import re
import time
from typing import Any

from app.core.config import Settings, get_settings
from app.schemas.enums import (
    EvidenceStrength,
    HazardStatus,
    NotifyStatus,
    Outcome,
    PersonCategory,
    RiskLevel,
)
from app.schemas.hazard import Hazard
from app.schemas.notification import NotificationRecord
from app.schemas.report import SafetyReport
from app.services.notification_service import (
    CooldownStore,
    FakeNotificationService,
    NotificationService,
    TelegramNotificationService,
)

logger = logging.getLogger(__name__)

RISK_RANKS: dict[RiskLevel, int] = {
    RiskLevel.high: 3,
    RiskLevel.medium: 2,
    RiskLevel.low: 1,
    RiskLevel.uncertain: 0,
}

# Shared in-memory cooldown store and escalation tracker
_global_cooldown_store = CooldownStore()
_global_last_risks: dict[str, RiskLevel] = {}


def compute_hazard_fingerprint(category_id: str, title: str, session_id: str = "") -> str:
    """Compute sha1 hex digest of normalized hazard fingerprint."""
    cleaned_title = " ".join(re.sub(r"[^\w\s]", "", title.lower()).split())
    raw = f"{category_id}:{cleaned_title}:{session_id}".encode("utf-8")
    return hashlib.sha1(raw).hexdigest()


class CaregiverNotificationAgent:
    """Agent that evaluates caregiver dispatch policy, checks cooldown, and sends alerts."""

    def __init__(
        self,
        settings: Settings | None = None,
        notification_service: NotificationService | None = None,
        cooldown_store: CooldownStore | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.cooldown_store = cooldown_store or _global_cooldown_store
        self.notification_service = notification_service or (
            TelegramNotificationService(cooldown_store=self.cooldown_store)
            if self.settings.telegram_configured
            else FakeNotificationService()
        )

    def _qualifying_hazards(self, hazards: list[Hazard]) -> list[Hazard]:
        """Filter hazards to observed/likely items with clear or partial evidence."""
        qualifying = []
        for h in hazards:
            if h.status in (HazardStatus.observed, HazardStatus.likely):
                if h.evidence_strength in (EvidenceStrength.clear, EvidenceStrength.partial):
                    qualifying.append(h)
        return qualifying

    def _risk_meets_threshold(self, overall_risk: RiskLevel, person_category: PersonCategory) -> bool:
        """Check if overall risk meets NOTIFY_MIN_LEVEL."""
        min_level_str = (self.settings.NOTIFY_MIN_LEVEL or "high").lower()
        min_level = RiskLevel.medium if min_level_str == "medium" else RiskLevel.high

        # High risk always meets threshold
        if overall_risk == RiskLevel.high:
            return True

        # Medium risk qualifies if min_level is medium, or if person is baby/child
        if overall_risk == RiskLevel.medium:
            if min_level == RiskLevel.medium:
                return True
            if person_category in (PersonCategory.baby, PersonCategory.child):
                return True

        return False

    def _format_alert_message(self, report: SafetyReport, qualifying: list[Hazard]) -> str:
        """Construct caregiver message with top hazards and precautions (no secrets)."""
        person_str = report.person_category.value.capitalize()
        lines = [
            f"🚨 *Safety Alert: {report.overall_risk.value.upper()} Risk Detected*",
            f"👤 *Person at Risk:* {person_str}",
            f"🕒 *Time:* {report.timestamp[:19].replace('T', ' ')} UTC",
            "",
            "*Top Observed Hazards:*",
        ]

        for idx, h in enumerate(qualifying[:3], 1):
            risk_tag = f"[{h.risk.level.value.upper()}]" if h.risk else ""
            lines.append(f"{idx}. {risk_tag} *{h.title}*")
            if h.precautions:
                top_prec = h.precautions[0].text
                lines.append(f"   👉 _Action:_ {top_prec}")

        lines.extend([
            "",
            "ℹ️ _Assess scene directly before taking action. Periodic sampling caveat applies._",
        ])
        return "\n".join(lines)

    async def evaluate_and_notify(
        self,
        report: SafetyReport,
        session_id: str = "",
    ) -> NotificationRecord:
        """Evaluate policy, cooldown, and dispatch notification."""
        now_ts = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # Policy Gate 1: Check master notifications switch
        if not self.settings.NOTIFICATIONS_ENABLED:
            return NotificationRecord(
                status=NotifyStatus.disabled,
                reason="Caregiver notifications are disabled in settings (NOTIFICATIONS_ENABLED=false)",
                attempts=0,
                timestamp=now_ts,
            )

        # Policy Gate 2: Outcome must be hazards_found
        if report.outcome != Outcome.hazards_found:
            return NotificationRecord(
                status=NotifyStatus.skipped_policy,
                reason=f"Notification skipped: outcome is '{report.outcome.value}' (requires 'hazards_found')",
                attempts=0,
                timestamp=now_ts,
            )

        # Policy Gate 3: Analysis must be reliable
        if not report.analysis_reliable:
            return NotificationRecord(
                status=NotifyStatus.skipped_policy,
                reason="Notification skipped: analysis reliability criteria not met",
                attempts=0,
                timestamp=now_ts,
            )

        # Policy Gate 4: At least one observed/likely hazard with >= partial evidence
        qualifying = self._qualifying_hazards(report.hazards)
        if not qualifying:
            return NotificationRecord(
                status=NotifyStatus.skipped_policy,
                reason="Notification skipped: no observed/likely hazards with clear or partial evidence",
                attempts=0,
                timestamp=now_ts,
            )

        # Policy Gate 5: Overall risk threshold
        if not self._risk_meets_threshold(report.overall_risk, report.person_category):
            return NotificationRecord(
                status=NotifyStatus.skipped_policy,
                reason=f"Notification skipped: overall risk '{report.overall_risk.value}' below notification threshold '{self.settings.NOTIFY_MIN_LEVEL}'",
                attempts=0,
                timestamp=now_ts,
            )

        # Cooldown & Escalation Check
        top_hazard = qualifying[0]
        fingerprint = compute_hazard_fingerprint(
            category_id=top_hazard.category_id,
            title=top_hazard.title,
            session_id=session_id,
        )

        cooldown_secs = self.settings.NOTIFY_COOLDOWN_SECONDS
        is_cooldown = self.cooldown_store.is_on_cooldown(fingerprint, cooldown_seconds=cooldown_secs)

        last_risk = _global_last_risks.get(fingerprint)
        current_rank = RISK_RANKS.get(report.overall_risk, 0)
        last_rank = RISK_RANKS.get(last_risk, 0) if last_risk else 0
        risk_escalated = current_rank > last_rank

        if is_cooldown and not risk_escalated:
            return NotificationRecord(
                status=NotifyStatus.skipped_cooldown,
                reason=f"Notification skipped: active {cooldown_secs}s cooldown for hazard fingerprint {fingerprint[:8]}",
                attempts=0,
                timestamp=now_ts,
            )

        # Dispatch alert
        message = self._format_alert_message(report=report, qualifying=qualifying)
        attempts = 1

        try:
            sent_ok = await self.notification_service.send_telegram_alert(message=message)
            if sent_ok:
                self.cooldown_store.record(fingerprint)
                _global_last_risks[fingerprint] = report.overall_risk
                return NotificationRecord(
                    status=NotifyStatus.sent,
                    reason=f"Alert dispatched for {report.overall_risk.value} risk ({len(qualifying)} qualifying hazard(s))",
                    attempts=attempts,
                    telegram_message_id=str(int(time.time())),
                    timestamp=now_ts,
                )
            else:
                return NotificationRecord(
                    status=NotifyStatus.failed,
                    reason="Notification dispatch service failed or returned non-success",
                    attempts=attempts,
                    timestamp=now_ts,
                )
        except Exception as exc:
            logger.error("Caregiver notification failed with error: %s", exc)
            return NotificationRecord(
                status=NotifyStatus.failed,
                reason=f"Notification dispatch failed: {exc}",
                attempts=attempts,
                timestamp=now_ts,
            )


async def notify_caregiver(
    report: SafetyReport,
    settings: Settings | None = None,
    notification_service: NotificationService | None = None,
    session_id: str = "",
) -> NotificationRecord:
    """Functional wrapper for Agent 8."""
    agent = CaregiverNotificationAgent(
        settings=settings,
        notification_service=notification_service,
    )
    return await agent.evaluate_and_notify(report=report, session_id=session_id)


async def caregiver_notification_node(state: dict[str, Any]) -> dict[str, Any]:
    """LangGraph node execution wrapper for Agent 8."""
    start_time = time.monotonic()
    report: SafetyReport | None = state.get("report")
    request = state.get("request")
    session_id = getattr(request, "session_id", "") or ""

    if report is None:
        return {
            "notification": None,
            "trace": [{
                "node": "notify",
                "status": "skipped",
                "duration_ms": 0.0,
                "attempt": 1,
                "summary": "Notification skipped: report is None",
            }],
        }

    agent = CaregiverNotificationAgent()
    record = await agent.evaluate_and_notify(report=report, session_id=session_id)
    report.notification = record

    elapsed_ms = (time.monotonic() - start_time) * 1000.0
    trace_event = {
        "node": "notify",
        "status": "ok" if record.status in (NotifyStatus.sent, NotifyStatus.skipped_cooldown, NotifyStatus.skipped_policy, NotifyStatus.disabled) else "error",
        "duration_ms": round(elapsed_ms, 2),
        "attempt": record.attempts or 1,
        "summary": f"Notification status: {record.status.value} ({record.reason})",
    }

    return {
        "notification": record,
        "report": report,
        "trace": [trace_event],
    }
