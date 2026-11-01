"""Services package for Hazard Precaution Advisor v2.

Central export of external service interfaces and implementations.
"""

from app.services.guideline_service import (
    GuidelineService,
    UNIVERSAL_FALLBACK_PRECAUTION,
    normalize_precaution_text,
)
from app.services.notification_service import (
    CooldownStore,
    FakeNotificationService,
    NotificationService,
    TelegramNotificationService,
)
from app.services.translation_service import (
    FakeTranslationService,
    GeminiTranslationService,
    TranslationService,
)
from app.services.vision_service import (
    FakeVisionService,
    GeminiVisionService,
    VisionService,
    strip_exif,
)

__all__ = [
    # Vision Service
    "VisionService",
    "FakeVisionService",
    "GeminiVisionService",
    "strip_exif",
    # Guideline Service
    "GuidelineService",
    "UNIVERSAL_FALLBACK_PRECAUTION",
    "normalize_precaution_text",
    # Translation Service
    "TranslationService",
    "FakeTranslationService",
    "GeminiTranslationService",
    # Notification Service
    "NotificationService",
    "FakeNotificationService",
    "TelegramNotificationService",
    "CooldownStore",
]
