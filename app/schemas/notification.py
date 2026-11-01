"""Notification schemas for Agent 8 (Caregiver Notification).

Defines NotificationRecord per agent.md §6 and skills.md S-27.
Tracks delivery attempts, cooldown reasons, and Telegram IDs without leaking secrets.
"""

from pydantic import BaseModel, Field

from app.schemas.enums import NotifyStatus


class NotificationRecord(BaseModel):
    """Audit record of caregiver notification dispatch.
    Per Rule R9: Secrets (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) are NEVER
    present in this record or in API responses.
    """
    status: NotifyStatus = Field(
        ...,
        description="Delivery status: sent, skipped_cooldown, skipped_policy, disabled, failed"
    )
    reason: str = Field(
        ...,
        description="Reason for dispatch or skip decision"
    )
    attempts: int = Field(
        default=1,
        ge=0,
        description="Number of delivery attempts made"
    )
    telegram_message_id: int | str | None = Field(
        default=None,
        description="Message ID returned by Telegram API if sent successfully"
    )
    timestamp: str | None = Field(
        default=None,
        description="ISO 8601 timestamp of notification event"
    )
