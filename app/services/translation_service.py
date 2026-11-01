"""Translation service interface and implementations (skills.md S-25).

Provides:
- TranslationService: Abstract base class for safety report localization.
- FakeTranslationService: Configurable mock translator for unit/integration tests.
- GeminiTranslationService: Production LLM-driven translator for free-text fields.

Adheres strictly to:
- Rule R1: Translated text must never introduce 'safe', 'no danger', or 'all clear'.
- Rule R9: Secrets are never exposed in logs or payloads.
- Rule R13: A failed translation returns the original English report plus translation_error.
  Never fabricates translations.
"""

from __future__ import annotations

import abc
import asyncio
import json
import logging
from typing import Any

from app.core.config import get_settings
from app.schemas.enums import Language
from app.schemas.report import SafetyReport, check_forbidden_phrases

logger = logging.getLogger(__name__)

LANGUAGE_NAMES = {
    Language.en: "English",
    Language.kn: "Kannada (ಕನ್ನಡ)",
    Language.hi: "Hindi (हिन्दी)",
}


class TranslationService(abc.ABC):
    """Abstract interface for safety report localization."""

    @abc.abstractmethod
    async def translate_report(
        self,
        report: SafetyReport,
        target_lang: Language,
    ) -> tuple[SafetyReport, str | None]:
        """Translate free-text fields of a SafetyReport into target_lang.

        Free-text fields translated:
        - scene.summary
        - scene.coverage_gaps
        - hazard.title
        - hazard.risk.rationale (if risk present)

        Structured fields (IDs, categories, enums, counts, dates) remain untouched.

        Returns:
            (translated_report, None) on success.
            (english_report, error_message) on failure (Rule R13).
        """
        raise NotImplementedError


class FakeTranslationService(TranslationService):
    """Configurable mock TranslationService for offline testing."""

    def __init__(
        self,
        prefix_template: str = "[{lang}] ",
        lookup: dict[tuple[str, str], str] | None = None,
        simulate_failure: bool = False,
        failure_error: str = "Simulated translation failure",
    ) -> None:
        self.prefix_template = prefix_template
        self.lookup = lookup or {}
        self.simulate_failure = simulate_failure
        self.failure_error = failure_error
        self.call_count: int = 0

    def configure(
        self,
        lookup: dict[tuple[str, str], str] | None = None,
        simulate_failure: bool = False,
        failure_error: str = "Simulated translation failure",
    ) -> None:
        """Update test parameters dynamically."""
        if lookup is not None:
            self.lookup = lookup
        self.simulate_failure = simulate_failure
        self.failure_error = failure_error

    def _mock_translate_text(self, text: str, target_lang: Language) -> str:
        """Translate a single string using lookup or prefix."""
        if not text:
            return ""
        lang_str = target_lang.value if isinstance(target_lang, Language) else str(target_lang)
        if (text, lang_str) in self.lookup:
            return self.lookup[(text, lang_str)]
        prefix = self.prefix_template.format(lang=lang_str)
        return f"{prefix}{text}"

    async def translate_report(
        self,
        report: SafetyReport,
        target_lang: Language,
    ) -> tuple[SafetyReport, str | None]:
        self.call_count += 1

        # English requires no translation
        if target_lang == Language.en:
            return report, None

        # Simulate translation failure (Rule R13)
        if self.simulate_failure:
            rep_copy = report.model_copy(deep=True)
            rep_copy.translation_error = self.failure_error
            return rep_copy, self.failure_error

        # Deep-copy report to preserve original English data
        translated = report.model_copy(deep=True)
        translated.language = target_lang

        # Translate scene summary & coverage gaps
        if translated.scene.summary:
            translated.scene.summary = self._mock_translate_text(translated.scene.summary, target_lang)

        translated.scene.coverage_gaps = [
            self._mock_translate_text(gap, target_lang) for gap in translated.scene.coverage_gaps
        ]

        # Translate hazard titles and risk rationales
        for h in translated.hazards:
            h.title = self._mock_translate_text(h.title, target_lang)
            if h.risk and h.risk.rationale:
                h.risk.rationale = self._mock_translate_text(h.risk.rationale, target_lang)

        translated.translation_error = None
        return translated, None


class GeminiTranslationService(TranslationService):
    """Production translation service using Gemini to translate free-text fields.

    Maintains:
    - Rule R1: Translated text is scrutinized for forbidden phrases.
    - Rule R9: Secrets are never exposed.
    - Rule R13: Validates non-empty strings and exact item count.
      On ANY error or validation mismatch, returns canonical English report
      plus translation_error.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model_name: str | None = None,
        timeout_seconds: float = 15.0,
    ) -> None:
        settings = get_settings()
        self.api_key = api_key if api_key is not None else settings.GEMINI_API_KEY
        self.model_name = model_name if model_name is not None else settings.GEMINI_MODEL
        self.timeout_seconds = timeout_seconds

    def _get_genai_client(self) -> Any:
        if not self.api_key:
            return None
        try:
            from google import genai
            return genai.Client(api_key=self.api_key)
        except Exception as exc:
            logger.error("Failed to initialize google-genai Client for translation: %s", exc)
            return None

    def _build_translation_prompt(
        self,
        report: SafetyReport,
        target_lang: Language,
    ) -> str:
        lang_name = LANGUAGE_NAMES.get(target_lang, target_lang.value)
        hazards_payload = [
            {
                "id": h.id,
                "title": h.title,
                "rationale": h.risk.rationale if h.risk else "",
            }
            for h in report.hazards
        ]

        source_data = {
            "scene_summary": report.scene.summary,
            "coverage_gaps": report.scene.coverage_gaps,
            "hazards": hazards_payload,
        }

        prompt = f"""You are a professional safety translator. Translate the following free-text fields into {lang_name} ({target_lang.value}).

Input data in JSON:
{json.dumps(source_data, ensure_ascii=False, indent=2)}

Strict Translation Rules:
1. Preserve technical and safety meaning accurately.
2. Rule R1: Never use words meaning 'safe', 'no danger', or 'all clear'. Use objective, factual safety phrasing.
3. Keep all hazard 'id' values EXACTLY identical.
4. Return an identical number of hazards in the exact same order.
5. Translate every string into meaningful, non-empty {lang_name} text.
6. Return ONLY valid JSON with this exact schema:
{{
  "scene_summary": "translated summary",
  "coverage_gaps": ["translated gap 1", ...],
  "hazards": [
    {{"id": "hz_1", "title": "translated title", "rationale": "translated rationale"}},
    ...
  ]
}}
"""
        return prompt

    def _clean_json_text(self, text: str) -> str:
        cleaned = text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        return cleaned.strip()

    def _validate_translated_payload(
        self,
        data: dict[str, Any],
        expected_hazard_count: int,
    ) -> str | None:
        """Validate structure, item counts, and non-empty strings.
        Returns None if valid, or error description string if invalid.
        """
        if not isinstance(data, dict):
            return "Root translation payload is not a JSON object"

        summary = data.get("scene_summary")
        if not isinstance(summary, str) or not summary.strip():
            return "Translation returned empty or invalid scene_summary"

        # Scrutinize for Rule R1 violations in translated text
        try:
            check_forbidden_phrases(summary, "translated scene_summary")
        except ValueError as exc:
            return f"Rule R1 violation in translation: {exc}"

        hazards_list = data.get("hazards")
        if not isinstance(hazards_list, list):
            return "Translation payload 'hazards' is not a list"

        if len(hazards_list) != expected_hazard_count:
            return f"Hazard count mismatch: expected {expected_hazard_count}, received {len(hazards_list)}"

        for i, h in enumerate(hazards_list):
            if not isinstance(h, dict):
                return f"Hazard item {i} in translation is not a dict"
            title = h.get("title")
            if not isinstance(title, str) or not title.strip():
                return f"Hazard item {i} in translation has an empty title"
            try:
                check_forbidden_phrases(title, f"translated hazard {i} title")
            except ValueError as exc:
                return f"Rule R1 violation in translation: {exc}"

        return None

    async def translate_report(
        self,
        report: SafetyReport,
        target_lang: Language,
    ) -> tuple[SafetyReport, str | None]:
        """Translate free-text fields with fallback to English on any failure (Rule R13)."""
        # English is canonical; no translation required
        if target_lang == Language.en:
            return report, None

        # Check API key availability
        if not self.api_key:
            err = "Translation failed: GEMINI_API_KEY is not configured"
            logger.warning(err)
            rep_copy = report.model_copy(deep=True)
            rep_copy.translation_error = err
            return rep_copy, err

        client = self._get_genai_client()
        if client is None:
            err = "Translation failed: Unable to initialize Gemini client"
            rep_copy = report.model_copy(deep=True)
            rep_copy.translation_error = err
            return rep_copy, err

        prompt = self._build_translation_prompt(report, target_lang)

        try:
            from google.genai import types

            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            )

            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=self.model_name,
                    contents=prompt,
                    config=config,
                ),
                timeout=self.timeout_seconds,
            )

            raw_text = response.text or ""
            cleaned = self._clean_json_text(raw_text)
            parsed_data = json.loads(cleaned)

            # Validate translated data item counts and non-empty strings
            val_error = self._validate_translated_payload(
                data=parsed_data,
                expected_hazard_count=len(report.hazards),
            )
            if val_error:
                logger.warning("Translation validation error: %s", val_error)
                rep_copy = report.model_copy(deep=True)
                rep_copy.translation_error = val_error
                return rep_copy, val_error

            # Build translated report copy
            translated_report = report.model_copy(deep=True)
            translated_report.language = target_lang
            translated_report.scene.summary = parsed_data["scene_summary"]

            # Translate coverage gaps if present
            trans_gaps = parsed_data.get("coverage_gaps", [])
            if isinstance(trans_gaps, list) and len(trans_gaps) == len(report.scene.coverage_gaps):
                translated_report.scene.coverage_gaps = [str(g) for g in trans_gaps]

            # Map translated hazard titles and rationales
            trans_hazards_by_id = {
                h["id"]: h for h in parsed_data["hazards"] if isinstance(h, dict) and "id" in h
            }
            for hazard in translated_report.hazards:
                if hazard.id in trans_hazards_by_id:
                    th = trans_hazards_by_id[hazard.id]
                    hazard.title = th.get("title", hazard.title)
                    if hazard.risk and "rationale" in th and th["rationale"]:
                        hazard.risk.rationale = th["rationale"]

            translated_report.translation_error = None
            return translated_report, None

        except asyncio.TimeoutError:
            err = f"Translation timed out after {self.timeout_seconds}s"
            logger.warning(err)
            rep_copy = report.model_copy(deep=True)
            rep_copy.translation_error = err
            return rep_copy, err
        except Exception as exc:
            err = f"Translation failed: {exc}"
            logger.warning(err)
            rep_copy = report.model_copy(deep=True)
            rep_copy.translation_error = err
            return rep_copy, err
