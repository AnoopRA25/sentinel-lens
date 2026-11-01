import React, { createContext, useContext, useEffect, useMemo, useCallback } from 'react';
import { AnalysisResult, Hazard, Language, RiskLevel, HazardStatus, EvidenceStrength, PersonCategory, Outcome } from '../types/api';
import en from './locales/en.json';
import kn from './locales/kn.json';
import hi from './locales/hi.json';

export type LocaleData = typeof en;

export const LOCALES: Record<Language, any> = {
  en,
  kn,
  hi,
};

export const SUPPORTED_LANGUAGES: Language[] = ['en', 'kn', 'hi'];

// Active language tracker for standalone `t` calls outside React tree
let currentAppLanguage: Language = 'en';

export function setAppLanguage(lang: Language): void {
  if (SUPPORTED_LANGUAGES.includes(lang)) {
    currentAppLanguage = lang;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }
}

export function getAppLanguage(): Language {
  return currentAppLanguage;
}

/**
 * Resolves a dot-notated key string from an object.
 */
function getNestedValue(obj: any, path: string): any {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr == null || typeof curr !== 'object') return undefined;
    curr = curr[part];
  }
  return curr;
}

/**
 * Standalone translation function with parameter interpolation and fallback support.
 */
export function t(
  key: string,
  paramsOrFallback?: Record<string, string | number> | string,
  fallback?: string,
  lang?: Language
): string {
  const targetLang = lang || currentAppLanguage || 'en';
  const dict = LOCALES[targetLang] || LOCALES.en;

  let params: Record<string, string | number> | undefined;
  let defaultText: string | undefined = fallback;

  if (typeof paramsOrFallback === 'string') {
    defaultText = paramsOrFallback;
  } else if (typeof paramsOrFallback === 'object') {
    params = paramsOrFallback;
  }

  let text = getNestedValue(dict, key);

  // Fallback to English dictionary if not found in target language
  if (text === undefined && targetLang !== 'en') {
    text = getNestedValue(LOCALES.en, key);
  }

  // If still not found, use defaultText or the key itself
  if (text === undefined) {
    text = defaultText !== undefined ? defaultText : key;
  }

  // Interpolate parameters {param}
  if (typeof text === 'string' && params) {
    text = text.replace(/\{(\w+)\}/g, (_, placeholder) => {
      return params && placeholder in params ? String(params[placeholder]) : `{${placeholder}}`;
    });
  }

  return typeof text === 'string' ? text : String(text ?? key);
}

/**
 * Format category ID into a localized monospace taxonomy tag like:
 * [H03: ELECTRICAL] (en)
 * [H03: ವಿದ್ಯುತ್ ಅಪಾಯ] (kn)
 * [H03: विद्युत खतरा] (hi)
 */
export function formatTaxonomyTag(categoryId?: string | null, lang?: Language): string {
  if (!categoryId) return '[HAZARD]';
  const targetLang = lang || currentAppLanguage || 'en';
  const upper = categoryId.toUpperCase().trim();

  const dict = LOCALES[targetLang] || LOCALES.en;
  const cat = dict.categories?.[upper];

  if (targetLang === 'en') {
    // Canonical English short names matching legacy design system
    const EN_SHORT_NAMES: Record<string, string> = {
      H01: 'SLIP & WET',
      H02: 'TRIP & CLUTTER',
      H03: 'ELECTRICAL',
      H04: 'FIRE & HEAT',
      H05: 'SHARP & GLASS',
      H06: 'FALL FROM HEIGHT',
      H07: 'UNSTABLE OBJECT',
      H08: 'CHEMICAL & POISON',
      H09: 'CHOKING',
      H10: 'WATER & DROWNING',
      H11: 'STRANGULATION',
      H12: 'STRUCTURAL',
      H13: 'POOR VISIBILITY',
      H14: 'OUTDOOR TRAFFIC',
      H15: 'OTHER',
    };
    const name = EN_SHORT_NAMES[upper] || cat?.name?.toUpperCase() || cat?.title?.toUpperCase();
    return name ? `[${upper}: ${name}]` : `[${upper}]`;
  }

  // Kannada and Hindi localized category tags
  if (cat?.title) {
    return `[${upper}: ${cat.title}]`;
  }

  return `[${upper}]`;
}

export function getCategoryTitle(categoryId?: string | null, lang?: Language): string {
  if (!categoryId) return '';
  const targetLang = lang || currentAppLanguage || 'en';
  const dict = LOCALES[targetLang] || LOCALES.en;
  const upper = categoryId.toUpperCase().trim();
  return dict.categories?.[upper]?.title || LOCALES.en.categories?.[upper]?.title || upper;
}

export function getRiskLabel(riskLevel: RiskLevel, lang?: Language): string {
  const targetLang = lang || currentAppLanguage || 'en';
  const dict = LOCALES[targetLang] || LOCALES.en;
  return dict.risk_levels?.[riskLevel]?.label || LOCALES.en.risk_levels?.[riskLevel]?.label || riskLevel;
}

export function getStatusLabel(status: HazardStatus, lang?: Language): string {
  const targetLang = lang || currentAppLanguage || 'en';
  const dict = LOCALES[targetLang] || LOCALES.en;
  return dict.hazard_status?.[status] || LOCALES.en.hazard_status?.[status] || status;
}

export function getEvidenceLabel(strength: EvidenceStrength, lang?: Language): string {
  const targetLang = lang || currentAppLanguage || 'en';
  const dict = LOCALES[targetLang] || LOCALES.en;
  return dict.evidence_strength?.[strength] || LOCALES.en.evidence_strength?.[strength] || strength;
}

export function getPersonLabel(person: PersonCategory, lang?: Language): string {
  const targetLang = lang || currentAppLanguage || 'en';
  const dict = LOCALES[targetLang] || LOCALES.en;
  return dict.person_categories?.[person] || LOCALES.en.person_categories?.[person] || person;
}

export function getOutcomeLabel(outcome: Outcome, lang?: Language): string {
  const targetLang = lang || currentAppLanguage || 'en';
  const dict = LOCALES[targetLang] || LOCALES.en;
  return dict.outcomes?.[outcome] || LOCALES.en.outcomes?.[outcome] || outcome;
}

/**
 * Common standard precaution text mappings across languages
 */
const PRECAUTION_TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {},
  kn: {
    'Move strip away from water.': 'ವಿದ್ಯುತ್ ಪಟ್ಟಿಯನ್ನು ನೀರಿನಿಂದ ದೂರ ಸರಿಸಿ.',
    'Keep power strips and electrical cords away from wet surfaces.': 'ವಿದ್ಯುತ್ ಪಟ್ಟಿಗಳು ಮತ್ತು ಕೇಬಲ್‌ಗಳನ್ನು ತೇವವಾದ ನೆಲದಿಂದ ದೂರವಿಡಿ.',
    'Clear clutter from primary walking paths.': 'ಮುಖ್ಯ ನಡಿಗೆ ಹಾದಿಗಳಿಂದ ಅಸ್ತವ್ಯಸ್ತ ವಸ್ತುಗಳನ್ನು ತೆರವುಗೊಳಿಸಿ.',
    'Wipe spill immediately and place non-slip mats.': 'ಚೆಲ್ಲಿದ ದ್ರವವನ್ನು ತಕ್ಷಣ ಒರೆಸಿ ಮತ್ತು ಜಾರದ ಮ್ಯಾಟ್‌ಗಳನ್ನು ಇರಿಸಿ.',
    'Install safety gate at top and bottom of stairs.': 'ಮೆಟ್ಟಿಲುಗಳ ಮೇಲ್ಭಾಗ ಮತ್ತು ಕೆಳಭಾಗದಲ್ಲಿ ಸುರಕ್ಷತಾ ಗೇಟ್ ಅಳವಡಿಸಿ.',
  },
  hi: {
    'Move strip away from water.': 'पावर स्ट्रिप को पानी के स्रोत से दूर रखें।',
    'Keep power strips and electrical cords away from wet surfaces.': 'पावर स्ट्रिप्स और बिजली के तारों को गीली सतहों से दूर रखें।',
    'Clear clutter from primary walking paths.': 'मुख्य रास्तों से बिखरे सामान को हटाएं।',
    'Wipe spill immediately and place non-slip mats.': 'फैले तरल को तुरंत पोंछें और फिसलन-रोधी पायदान लगाएं।',
    'Install safety gate at top and bottom of stairs.': 'सीढ़ियों के ऊपर और नीचे सुरक्षा गेट लगाएं।',
  },
};

/**
 * Instant translation helper for Hazard objects.
 */
export function translateHazard(hazard: Hazard, lang: Language): Hazard {
  const targetLang = lang || 'en';
  const dict = LOCALES[targetLang] || LOCALES.en;
  const cat = dict.categories?.[hazard.category_id?.toUpperCase()];
  const enCat = LOCALES.en.categories?.[hazard.category_id?.toUpperCase()];

  // Translate title if it matches English category title, or provide localized category title
  let translatedTitle = hazard.title;
  if (enCat && (hazard.title === enCat.title || hazard.title === enCat.name || !hazard.title)) {
    translatedTitle = cat?.title || hazard.title;
  }

  // Translate standard precautions if available
  const translatedPrecautions = (hazard.precautions || []).map((prec) => {
    const textMap = PRECAUTION_TRANSLATIONS[targetLang];
    const translatedText = (textMap && textMap[prec.text]) ? textMap[prec.text] : prec.text;
    return {
      ...prec,
      text: translatedText,
    };
  });

  return {
    ...hazard,
    title: translatedTitle,
    precautions: translatedPrecautions,
  };
}

/**
 * Instant translation helper for AnalysisResult objects.
 */
export function translateResult(result: AnalysisResult, lang: Language): AnalysisResult {
  const targetLang = lang || 'en';
  const dict = LOCALES[targetLang] || LOCALES.en;

  const translatedHazards = (result.hazards || []).map((h) => translateHazard(h, targetLang));

  // Translate standard mandatory disclaimer limits
  let translatedLimits = result.limits;
  if (dict.ui_messages?.footer_limits) {
    translatedLimits = dict.ui_messages.footer_limits;
  }

  // Translate scene summary for standard outcome states
  let translatedSceneSummary = result.scene?.summary;
  if (result.outcome === 'none_observed' && dict.ui_messages?.none_observed_msg) {
    translatedSceneSummary = dict.ui_messages.none_observed_msg;
  } else if (result.outcome === 'failed' && dict.ui_messages?.failed_msg) {
    translatedSceneSummary = dict.ui_messages.failed_msg;
  }

  return {
    ...result,
    language: targetLang,
    hazards: translatedHazards,
    limits: translatedLimits,
    scene: result.scene
      ? {
          ...result.scene,
          summary: translatedSceneSummary || result.scene.summary,
        }
      : result.scene,
  };
}

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, paramsOrFallback?: Record<string, string | number> | string, fallback?: string) => string;
  translateResult: (result: AnalysisResult, lang?: Language) => AnalysisResult;
  translateHazard: (hazard: Hazard, lang?: Language) => Hazard;
  formatTaxonomyTag: (categoryId?: string | null, lang?: Language) => string;
  getCategoryTitle: (categoryId?: string | null, lang?: Language) => string;
  getRiskLabel: (riskLevel: RiskLevel, lang?: Language) => string;
  getStatusLabel: (status: HazardStatus, lang?: Language) => string;
  getEvidenceLabel: (strength: EvidenceStrength, lang?: Language) => string;
  getPersonLabel: (person: PersonCategory, lang?: Language) => string;
  getOutcomeLabel: (outcome: Outcome, lang?: Language) => string;
}

const defaultContextValue: LanguageContextType = {
  language: 'en',
  setLanguage: (lang: Language) => setAppLanguage(lang),
  t: (key, paramsOrFallback, fallback) => t(key, paramsOrFallback, fallback, 'en'),
  translateResult: (res, l) => translateResult(res, l || 'en'),
  translateHazard: (h, l) => translateHazard(h, l || 'en'),
  formatTaxonomyTag: (cat, l) => formatTaxonomyTag(cat, l || 'en'),
  getCategoryTitle: (cat, l) => getCategoryTitle(cat, l || 'en'),
  getRiskLabel: (r, l) => getRiskLabel(r, l || 'en'),
  getStatusLabel: (s, l) => getStatusLabel(s, l || 'en'),
  getEvidenceLabel: (e, l) => getEvidenceLabel(e, l || 'en'),
  getPersonLabel: (p, l) => getPersonLabel(p, l || 'en'),
  getOutcomeLabel: (o, l) => getOutcomeLabel(o, l || 'en'),
};

export const LanguageContext = createContext<LanguageContextType>(defaultContextValue);

export interface LanguageProviderProps {
  children: React.ReactNode;
  language?: Language;
  onLanguageChange?: (lang: Language) => void;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({
  children,
  language = 'en',
  onLanguageChange,
}) => {
  const currentLang = language || 'en';

  useEffect(() => {
    setAppLanguage(currentLang);
  }, [currentLang]);

  const handleSetLanguage = useCallback(
    (newLang: Language) => {
      setAppLanguage(newLang);
      if (onLanguageChange) {
        onLanguageChange(newLang);
      }
    },
    [onLanguageChange]
  );

  const contextValue = useMemo<LanguageContextType>(() => {
    return {
      language: currentLang,
      setLanguage: handleSetLanguage,
      t: (key, paramsOrFallback, fallback) => t(key, paramsOrFallback, fallback, currentLang),
      translateResult: (res, l) => translateResult(res, l || currentLang),
      translateHazard: (h, l) => translateHazard(h, l || currentLang),
      formatTaxonomyTag: (cat, l) => formatTaxonomyTag(cat, l || currentLang),
      getCategoryTitle: (cat, l) => getCategoryTitle(cat, l || currentLang),
      getRiskLabel: (r, l) => getRiskLabel(r, l || currentLang),
      getStatusLabel: (s, l) => getStatusLabel(s, l || currentLang),
      getEvidenceLabel: (e, l) => getEvidenceLabel(e, l || currentLang),
      getPersonLabel: (p, l) => getPersonLabel(p, l || currentLang),
      getOutcomeLabel: (o, l) => getOutcomeLabel(o, l || currentLang),
    };
  }, [currentLang, handleSetLanguage]);

  return React.createElement(LanguageContext.Provider, { value: contextValue }, children);
};

export function useTranslation(): LanguageContextType {
  const context = useContext(LanguageContext);
  return context || defaultContextValue;
}
