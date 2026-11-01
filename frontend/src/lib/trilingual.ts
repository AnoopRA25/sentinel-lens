/**
 * Sentinel Lens v2 — Trilingual Localization & Reporting Engine
 * Implements full 3-language representations for English (EN), Kannada (KN), and Hindi (HI).
 * Conforms strictly to Rule R1 (no 'safe', 'no danger', 'all clear') and Rule R13.
 */

import {
  HazardStatus,
  Outcome,
  PersonCategory,
  Precaution,
  RiskLevel,
  VerifyStatus,
  EvidenceStrength,
  NotifyStatus,
} from '../types/api';

export interface TrilingualText {
  en: string;
  kn: string;
  hi: string;
}

export interface CategoryLocalization {
  code: string;
  name: string;
  title: TrilingualText;
  tag: string;
}

/**
 * All 15 Hazard Categories (H01 to H15) localized in EN, KN, and HI.
 */
export const CATEGORIES_TRILINGUAL: Record<string, CategoryLocalization> = {
  H01: {
    code: 'H01',
    name: 'slip_wet',
    title: {
      en: 'Slip & Wet Floor',
      kn: 'ಜಾರುವ / ಒದ್ದೆಯಾದ ನೆಲ',
      hi: 'फिसलन / गीला फर्श',
    },
    tag: '[H01: SLIP & WET / ಜಾರುವ ನೆಲ / फिसलन फर्श]',
  },
  H02: {
    code: 'H02',
    name: 'trip_clutter',
    title: {
      en: 'Trip & Walkway Clutter',
      kn: 'ಎಡವುವಿಕೆ / ಅಸ್ತವ್ಯಸ್ತ ವಸ್ತುಗಳು',
      hi: 'ठोकर / बिखरा हुआ सामान',
    },
    tag: '[H02: TRIP & CLUTTER / ಎಡವುವ ವಸ್ತುಗಳು / ठोकर व सामान]',
  },
  H03: {
    code: 'H03',
    name: 'electrical',
    title: {
      en: 'Electrical Hazard',
      kn: 'ವಿದ್ಯುತ್ ಅಪಾಯ',
      hi: 'बिजली का ख़तरा',
    },
    tag: '[H03: ELECTRICAL / ವಿದ್ಯುತ್ ಅಪಾಯ / बिजली का ख़तरा]',
  },
  H04: {
    code: 'H04',
    name: 'fire_heat',
    title: {
      en: 'Fire & Heat Hazard',
      kn: 'ಬೆಂಕಿ ಮತ್ತು ಶಾಖದ ಅಪಾಯ',
      hi: 'आग और ताप का ख़तरा',
    },
    tag: '[H04: FIRE & HEAT / ಬೆಂಕಿ ಅಪಾಯ / आग का ख़तरा]',
  },
  H05: {
    code: 'H05',
    name: 'sharp_glass',
    title: {
      en: 'Sharp Objects & Glass',
      kn: 'ಚೂಪಾದ ವಸ್ತುಗಳು ಮತ್ತು ಗಾಜು',
      hi: 'नुकीली वस्तुएं और कांच',
    },
    tag: '[H05: SHARP & GLASS / ಚೂಪಾದ ವಸ್ತುಗಳು / नुकीली वस्तुएं]',
  },
  H06: {
    code: 'H06',
    name: 'fall_height',
    title: {
      en: 'Fall from Height',
      kn: 'ಎತ್ತರದಿಂದ ಬೀಳುವಿಕೆ',
      hi: 'ऊंचाई से गिरना',
    },
    tag: '[H06: FALL FROM HEIGHT / ಎತ್ತರದಿಂದ ಬೀಳುವಿಕೆ / ऊंचाई से गिरना]',
  },
  H07: {
    code: 'H07',
    name: 'unstable_falling',
    title: {
      en: 'Unstable & Falling Objects',
      kn: 'ಅಸ್ಥಿರ ಮತ್ತು ಬೀಳುವ ವಸ್ತುಗಳು',
      hi: 'अस्थिर और गिरने वाली वस्तुएं',
    },
    tag: '[H07: UNSTABLE OBJECT / ಅಸ್ಥಿರ ವಸ್ತುಗಳು / अस्थिर वस्तुएं]',
  },
  H08: {
    code: 'H08',
    name: 'chemical_poison',
    title: {
      en: 'Chemical & Poison Hazard',
      kn: 'ರಾಸಾಯನಿಕ ಮತ್ತು ವಿಷಕಾರಿ ವಸ್ತುಗಳು',
      hi: 'रासायनिक और विषैले पदार्थ',
    },
    tag: '[H08: CHEMICAL & POISON / ರಾಸಾಯನಿಕ ವಸ್ತುಗಳು / रासायनिक पदार्थ]',
  },
  H09: {
    code: 'H09',
    name: 'choking_small_objects',
    title: {
      en: 'Choking & Small Objects',
      kn: 'ಗಂಟಲಲ್ಲಿ ಸಿಲುಕುವ ಸಣ್ಣ ವಸ್ತುಗಳು',
      hi: 'दम घोंटने वाली छोटी वस्तुएं',
    },
    tag: '[H09: CHOKING / ಗಂಟಲಲ್ಲಿ ಸಿಲುಕುವ ವಸ್ತುಗಳು / दम घोंटने वाली वस्तुएं]',
  },
  H10: {
    code: 'H10',
    name: 'water_drowning',
    title: {
      en: 'Water & Drowning Hazard',
      kn: 'ನೀರು ಮತ್ತು ಮುಳುಗುವಿಕೆ ಅಪಾಯ',
      hi: 'पानी और डूबने का ख़तरा',
    },
    tag: '[H10: WATER & DROWNING / ಮುಳುಗುವಿಕೆ ಅಪಾಯ / डूबने का ख़तरा]',
  },
  H11: {
    code: 'H11',
    name: 'strangulation_entrapment',
    title: {
      en: 'Strangulation & Entrapment',
      kn: 'ಕತ್ತು ಉಸಿರುಗಟ್ಟುವಿಕೆ ಮತ್ತು ಸಿಲುಕುವಿಕೆ',
      hi: 'गला घोंटना और फंसना',
    },
    tag: '[H11: STRANGULATION / ಕತ್ತು ಉಸಿರುಗಟ್ಟುವಿಕೆ / गला घोंटना व फंसना]',
  },
  H12: {
    code: 'H12',
    name: 'structural_damage',
    title: {
      en: 'Structural Damage',
      kn: 'ರಚನಾತ್ಮಕ ಹಾನಿ',
      hi: 'ढांचागत नुकसान',
    },
    tag: '[H12: STRUCTURAL / ರಚನಾತ್ಮಕ ಹಾನಿ / ढांचागत नुकसान]',
  },
  H13: {
    code: 'H13',
    name: 'poor_visibility',
    title: {
      en: 'Poor Visibility & Glare',
      kn: 'ಕಳಪೆ ಗೋಚರತೆ / ಬೆಳಕಿನ ಕೊರತೆ',
      hi: 'खराब दृश्यता / कम रोशनी',
    },
    tag: '[H13: POOR VISIBILITY / ಕಳಪೆ ಗೋಚರತೆ / खराब दृश्यता]',
  },
  H14: {
    code: 'H14',
    name: 'outdoor_traffic_terrain',
    title: {
      en: 'Outdoor Traffic & Terrain',
      kn: 'ಹೊರಾಂಗಣ ಸಂಚಾರ ಮತ್ತು ಅಸಮ ನೆಲ',
      hi: 'बाहरी यातायात और ऊबड़-खाबड़ ज़मीन',
    },
    tag: '[H14: OUTDOOR TRAFFIC / ಹೊರಾಂಗಣ ಸಂಚಾರ / बाहरी यातायात]',
  },
  H15: {
    code: 'H15',
    name: 'other_observable',
    title: {
      en: 'Other Observable Hazard',
      kn: 'ಇತರ ಗೋಚರ ಅಪಾಯ',
      hi: 'अन्य प्रत्यक्ष ख़तरा',
    },
    tag: '[H15: OTHER / ಇತರ ಗೋಚರ ಅಪಾಯ / अन्य प्रत्यक्ष ख़तरा]',
  },
};

/**
 * Demographic Profiles
 */
export const PERSON_CATEGORIES_TRILINGUAL: Record<PersonCategory, TrilingualText> = {
  baby: {
    en: 'Baby (0-12 months)',
    kn: 'ಶಿಶು (0-12 ತಿಂಗಳು)',
    hi: 'शिशु (0-12 महीने)',
  },
  child: {
    en: 'Child (1-12 years)',
    kn: 'ಮಗು (1-12 ವರ್ಷಗಳು)',
    hi: 'बच्चा (1-12 वर्ष)',
  },
  adult: {
    en: 'Adult',
    kn: 'ವಯಸ್ಕರು',
    hi: 'वयस्क',
  },
  elderly: {
    en: 'Elderly Relative',
    kn: 'ಹಿರಿಯ ಸಂಬಂಧಿ',
    hi: 'बुजुर्ग रिश्तेदार',
  },
};

/**
 * Risk Levels
 */
export const RISK_LEVELS_TRILINGUAL: Record<RiskLevel, TrilingualText> = {
  low: {
    en: 'Low Risk',
    kn: 'ಕಡಿಮೆ ಅಪಾಯ',
    hi: 'कम जोखिम',
  },
  medium: {
    en: 'Medium Risk',
    kn: 'ಮಧ್ಯಮ ಅಪಾಯ',
    hi: 'मध्यम जोखिम',
  },
  high: {
    en: 'High Risk (Urgent)',
    kn: 'ಹೆಚ್ಚು ಅಪಾಯ (ತುರ್ತು)',
    hi: 'उच्च जोखिम (तत्काल)',
  },
  uncertain: {
    en: 'Uncertain (Verify)',
    kn: 'ಪರಿಶೀಲಿಸಿ (ಸಂಭಾವ್ಯ)',
    hi: 'जांचें (संभावित)',
  },
};

/**
 * Hazard Status (Evidence Grade)
 */
export const HAZARD_STATUS_TRILINGUAL: Record<HazardStatus, TrilingualText> = {
  observed: {
    en: 'Directly Observed',
    kn: 'ನೇರವಾಗಿ ಕಂಡುಬಂದಿದೆ',
    hi: 'प्रत्यक्ष देखा गया',
  },
  likely: {
    en: 'Highly Likely',
    kn: 'ಬಹುತೇಕ ಸಾಧ್ಯತೆ',
    hi: 'अत्यधिक संभावित',
  },
  possible: {
    en: 'Possible (To Check)',
    kn: 'ಪರಿಶೀಲಿಸಿ (ಸಂಭಾವ್ಯ)',
    hi: 'जांचें (संभावित)',
  },
};

/**
 * Evidence Strength
 */
export const EVIDENCE_STRENGTH_TRILINGUAL: Record<EvidenceStrength, TrilingualText> = {
  clear: {
    en: 'Clear Evidence',
    kn: 'ಸ್ಪಷ್ಟ ಪುರಾವೆ',
    hi: 'स्पष्ट साक्ष्य',
  },
  partial: {
    en: 'Partial Evidence',
    kn: 'ಭಾಗಶಃ ಪುರಾವೆ',
    hi: 'आंशिक साक्ष्य',
  },
  weak: {
    en: 'Weak / Unconfirmed',
    kn: 'ದುರ್ಬಲ ಪುರಾವೆ',
    hi: 'कमज़ोर साक्ष्य',
  },
};

/**
 * Outcomes (Strictly adheres to Rule R1: Never say 'safe', 'no danger', 'all clear')
 */
export const OUTCOMES_TRILINGUAL: Record<Outcome, TrilingualText> = {
  hazards_found: {
    en: 'Hazards Identified',
    kn: 'ಅಪಾಯಗಳು ಕಂಡುಬಂದಿವೆ',
    hi: 'ख़तरे पाए गए',
  },
  none_observed: {
    en: 'No hazards observed in this view',
    kn: 'ಈ ವೀಕ್ಷಣೆಯಲ್ಲಿ ಯಾವುದೇ ಅಪಾಯಗಳು ಕಂಡುಬಂದಿಲ್ಲ',
    hi: 'इस दृश्य में कोई ख़तरा नहीं दिखा',
  },
  inconclusive: {
    en: 'Inconclusive Assessment (Fail-Closed)',
    kn: 'ಅನಿರ್ದಿಷ್ಟ ಮೌಲ್ಯಮಾಪನ (ಅಪೂರ್ಣ)',
    hi: 'अनिर्णायक मूल्यांकन (अपूर्ण)',
  },
  failed: {
    en: 'Analysis Did Not Complete (Unverified)',
    kn: 'ವಿಶ್ಲೇಷಣೆ ಪೂರ್ಣಗೊಂಡಿಲ್ಲ (ದೃಢೀಕರಿಸಲಾಗಿಲ್ಲ)',
    hi: 'विश्लेषण पूरा नहीं हुआ (अपुष्ट)',
  },
};

/**
 * Verification Status
 */
export const VERIFY_STATUS_TRILINGUAL: Record<VerifyStatus, TrilingualText> = {
  passed: {
    en: 'Passed Multi-Agent Verification',
    kn: 'ಪರಿಶೀಲನೆ ಯಶಸ್ವಿಯಾಗಿದೆ',
    hi: 'सत्यापन सफल रहा',
  },
  passed_with_changes: {
    en: 'Passed with Filtered Adjustments',
    kn: 'ಹೊಂದಾಣಿಕೆಗಳೊಂದಿಗೆ ಅಂಗೀಕರಿಸಲಾಗಿದೆ',
    hi: 'संशोधनों के साथ स्वीकृत',
  },
  failed_fallback: {
    en: 'Unverified Scan (Fallback Model)',
    kn: 'ಕಡಿಮೆಯಾದ ವಿಶ್ವಾಸಾರ್ಹತೆ (ಫಾಲ್‌ಬ್ಯಾಕ್)',
    hi: 'घटी हुई विश्वसनीयता (फ़ॉलबैक)',
  },
};

/**
 * Notification Status
 */
export const NOTIFY_STATUS_TRILINGUAL: Record<NotifyStatus, TrilingualText> = {
  sent: {
    en: 'Caregiver Alert Dispatched',
    kn: 'ಪಾಲಕರಿಗೆ ಎಚ್ಚರಿಕೆ ಕಳುಹಿಸಲಾಗಿದೆ',
    hi: 'देखभालकर्ता को अलर्ट भेजा गया',
  },
  skipped_cooldown: {
    en: 'Alert Skipped (Active Cooldown)',
    kn: 'ಎಚ್ಚರಿಕೆ ಬಿಟ್ಟುಬಿಡಲಾಗಿದೆ (ಕೂಲ್‌ಡೌನ್ ಸಕ್ರಿಯ)',
    hi: 'अलर्ट छोड़ा गया (कूलडाउन सक्रिय)',
  },
  skipped_policy: {
    en: 'Alert Skipped (Policy Threshold)',
    kn: 'ಎಚ್ಚರಿಕೆ ಬಿಟ್ಟುಬಿಡಲಾಗಿದೆ (ನೀತಿ ಮಿತಿ)',
    hi: 'अलर्ट छोड़ा गया (नीति सीमा)',
  },
  disabled: {
    en: 'Notifications Inactive',
    kn: 'ಎಚ್ಚರಿಕೆ ನಿಷ್ಕ್ರಿಯಗೊಳಿಸಲಾಗಿದೆ',
    hi: 'अलर्ट अक्षम है',
  },
  failed: {
    en: 'Notification Dispatch Failed',
    kn: 'ಎಚ್ಚರಿಕೆ ಕಳುಹಿಸಲು ವಿಫಲವಾಗಿದೆ',
    hi: 'अलर्ट भेजने में विफल रहा',
  },
};

/**
 * Mandatory Rule R1 Safety Disclaimers (design.md §11)
 */
export const MANDATORY_SAFETY_DISCLAIMERS: TrilingualText = {
  en: 'This report is based on the image(s) analyzed and does not guarantee safety. It cannot assess anything outside the frame.',
  kn: 'ಈ ವರದಿಯು ವಿಶ್ಲೇಷಿಸಿದ ಚಿತ್ರ(ಗಳ)ವನ್ನು ಆಧರಿಸಿದೆ ಮತ್ತು ಸುರಕ್ಷತೆಯನ್ನು ಖಾತರಿಪಡಿಸುವುದಿಲ್ಲ. ಇದು ಚೌಕಟ್ಟಿನ ಹೊರಗಿನ ಯಾವುದನ್ನೂ ನಿರ್ಣಯಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ.',
  hi: 'यह रिपोर्ट विश्लेषित छवि/छवियों पर आधारित है और सुरक्षा की गारंटी नहीं देती है। यह फ्रेम के बाहर किसी भी चीज़ का आकलन नहीं कर सकती है।',
};

/**
 * All 61 Standard Safety Guidelines mapped with complete trilingual translations.
 */
export const GUIDELINES_TRILINGUAL: Record<string, { category_id: string; text: TrilingualText }> = {
  'G-H01-001': {
    category_id: 'H01',
    text: {
      en: 'Wipe liquid spills and water puddles immediately using an absorbent cloth or dry mop.',
      kn: 'ದ್ರವ ಚೆಲ್ಲುವಿಕೆ ಮತ್ತು ನೀರಿನ ಗುಂಡಿಗಳನ್ನು ಹೀರಬಲ್ಲ ಬಟ್ಟೆ ಅಥವಾ ಒಣ ಮಾಪ್ ಬಳಸಿ ತಕ್ಷಣ ಒರೆಸಿ.',
      hi: 'फर्श पर फैले तरल और पानी को सोखने वाले कपड़े या सूखे पोछे से तुरंत पोंछें।',
    },
  },
  'G-H01-002': {
    category_id: 'H01',
    text: {
      en: 'Place non-skid rubber-backed mats at sink, bathtub, and exterior doorway transitions.',
      kn: 'ಸಿಂಕ್, ಬಾತ್‌ಟಬ್ ಮತ್ತು ಹೊರಗಿನ ಬಾಗಿಲುಗಳ ಬಳಿ ಜಾರದ ರಬ್ಬರ್ ಹಿಂಬದಿಯ ಮ್ಯಾಟ್‌ಗಳನ್ನು ಇರಿಸಿ.',
      hi: 'सिंक, बाथटब और बाहरी दरवाजों के पास बिना फिसलने वाले रबर-युक्त पायदान रखें।',
    },
  },
  'G-H01-003': {
    category_id: 'H01',
    text: {
      en: 'Apply anti-slip adhesive tread strips or slip-resistant treatments to polished stone and wet bathroom tiles.',
      kn: 'ಹೊಳಪುಳ್ಳ ಕಲ್ಲು ಮತ್ತು ಒದ್ದೆಯಾದ ಬಾತ್‌ರೂಮ್ ಟೈಲ್ಸ್‌ಗಳಿಗೆ ಜಾರುವಿಕೆ ತಡೆಗಟ್ಟುವ ಪಟ್ಟಿಗಳನ್ನು ಅಳವಡಿಸಿ.',
      hi: 'चमकदार पत्थर और गीली बाथरूम टाइलों पर फिसलन-रोधी स्ट्रिप्स लगाएं।',
    },
  },
  'G-H01-004': {
    category_id: 'H01',
    text: {
      en: 'Keep infants and elderly relatives away from wet or freshly mopped surfaces until thoroughly dried.',
      kn: 'ನೆಲ ಸಂಪೂರ್ಣ ಒಣಗುವವರೆಗೆ ಶಿಶುಗಳು ಮತ್ತು ಹಿರಿಯರನ್ನು ಒದ್ದೆ ನೆಲದಿಂದ ದೂರವಿಡಿ.',
      hi: 'फर्श पूरी तरह सूखने तक शिशुओं और बुजुर्गों को गीली सतहों से दूर रखें।',
    },
  },
  'G-H02-001': {
    category_id: 'H02',
    text: {
      en: 'Fasten trailing electrical cables along walls or baseboards using adhesive cord clips or protective raceways.',
      kn: 'ನೆಲದ ಮೇಲಿರುವ ವಿದ್ಯುತ್ ಕೇಬಲ್‌ಗಳನ್ನು ಕ್ಲಿಪ್‌ಗಳು ಅಥವಾ ಕವರ್‌ಗಳನ್ನು ಬಳಸಿ ಗೋಡೆಯ ಉದ್ದಕ್ಕೂ ಭದ್ರಪಡಿಸಿ.',
      hi: 'फर्श पर फैले बिजली के तारों को क्लिप या कवर का उपयोग करके दीवार के सहारे सुरक्षित करें।',
    },
  },
  'G-H02-002': {
    category_id: 'H02',
    text: {
      en: 'Clear walking corridors, hallways, and stairs of footwear, cardboard boxes, and loose clutter.',
      kn: 'ನಡೆಯುವ ಹಾದಿಗಳು, ಕಾರಿಡಾರ್‌ಗಳು ಮತ್ತು ಮೆಟ್ಟಿಲುಗಳಿಂದ ಪಾದರಕ್ಷೆಗಳು ಮತ್ತು ಅಸ್ತವ್ಯಸ್ತ ವಸ್ತುಗಳನ್ನು ತೆರವುಗೊಳಿಸಿ.',
      hi: 'रास्तों, गलियारों और सीढ़ियों से जूते-चप्पल और बिखरा हुआ सामान हटाकर साफ रखें।',
    },
  },
  'G-H02-003': {
    category_id: 'H02',
    text: {
      en: 'Secure area rug perimeters with double-sided rug tape or transition grips to eliminate raised curled edges.',
      kn: 'ಮ್ಯಾಟ್‌ಗಳ ಅಂಚುಗಳು ಮಡಚಿಕೊಳ್ಳುವುದನ್ನು ತಡೆಯಲು ಡಬಲ್-ಸೈಡೆಡ್ ಟೇಪ್ ಬಳಸಿ ಭದ್ರಪಡಿಸಿ.',
      hi: 'पायदानों के किनारों को मुड़ने से रोकने के लिए डबल-साइडेड टेप से सुरक्षित करें।',
    },
  },
  'G-H02-004': {
    category_id: 'H02',
    text: {
      en: "Store children's toys in low floor bins away from main walking lines immediately following play.",
      kn: 'ಮಕ್ಕಳ ಆಟಿಕೆಗಳನ್ನು ಆಟದ ನಂತರ ಮುಖ್ಯ ನಡಿಗೆ ಹಾದಿಯಿಂದ ದೂರವಿರುವ ಬುಟ್ಟಿಗಳಲ್ಲಿ ಸಂಗ್ರಹಿಸಿ.',
      hi: 'बच्चों के खिलौनों को खेल के तुरंत बाद चलने के मुख्य रास्ते से हटाकर बक्से में रखें।',
    },
  },
  'G-H03-001': {
    category_id: 'H03',
    text: {
      en: 'Disconnect and replace damaged, pinched, or frayed power cords without attempting temporary tape repairs.',
      kn: 'ಹಾನಿಗೊಳಗಾದ ಅಥವಾ ಸವೆದ ವಿದ್ಯುತ್ ತಂತಿಗಳನ್ನು ತಾತ್ಕಾಲಿಕ ಟೇಪ್ ಹಚ್ಚದೆ ತಕ್ಷಣ ಬದಲಾಯಿಸಿ.',
      hi: 'क्षतिग्रस्त या कटे-फटे बिजली के तारों पर टेप लगाने के बजाय उन्हें तुरंत बदलें।',
    },
  },
  'G-H03-002': {
    category_id: 'H03',
    text: {
      en: 'Relocate power strips, chargers, and extension cords away from sinks, basins, and moisture sources.',
      kn: 'ಪವರ್ ಸ್ಟ್ರಿಪ್‌ಗಳು ಮತ್ತು ಚಾರ್ಜರ್‌ಗಳನ್ನು ಸಿಂಕ್ ಮತ್ತು ನೀರಿನ ಮೂಲಗಳಿಂದ ದೂರವಿರಿಸಿ.',
      hi: 'पावर स्ट्रिप्स और चार्जर को सिंक और पानी के स्रोतों से दूर रखें।',
    },
  },
  'G-H03-003': {
    category_id: 'H03',
    text: {
      en: 'Insert protective plastic safety caps or sliding tamper-resistant covers into all unused low wall outlets.',
      kn: 'ಬಳಸದ ಕೆಳ ಗೋಡೆಯ ಸಾಕೆಟ್‌ಗಳಿಗೆ ಸುರಕ್ಷತಾ ಪ್ಲಾಸ್ಟಿಕ್ ಕ್ಯಾಪ್‌ಗಳನ್ನು ಅಳವಡಿಸಿ.',
      hi: 'उपयोग में न आने वाले निचले सॉकेट्स में सुरक्षात्मक प्लास्टिक कैप लगाएं।',
    },
  },
  'G-H03-004': {
    category_id: 'H03',
    text: {
      en: 'Avoid daisy-chaining multi-socket adapters; distribute high-draw heating or cooling appliances across separate branch circuits.',
      kn: 'ಒಂದೇ ಸಾಕೆಟ್‌ನಲ್ಲಿ ಅನೇಕ ಅಡಾಪ್ಟರ್‌ಗಳನ್ನು ಜೋಡಿಸಬೇಡಿ; ಪ್ರತ್ಯೇಕ ಸರ್ಕ್ಯೂಟ್‌ಗಳನ್ನು ಬಳಸಿ.',
      hi: 'एक ही सॉकेट पर कई एडेप्टर न लगाएं; भारी उपकरणों को अलग-अलग सॉकेट में लगाएं।',
    },
  },
  'G-H04-001': {
    category_id: 'H04',
    text: {
      en: 'Turn cookware and pan handles inward toward the rear of the stovetop to prevent accidental snagging or tipping.',
      kn: 'ಅಡುಗೆ ಪಾತ್ರೆಗಳ ಹ್ಯಾಂಡಲ್‌ಗಳನ್ನು ಒಲೆಯ ಒಳಮುಖವಾಗಿ ತಿರುಗಿಸಿಡಿ.',
      hi: 'रसोई के बर्तनों के हैंडल को अंदर की तरफ रखें ताकि वे टकराकर न गिरें।',
    },
  },
  'G-H04-002': {
    category_id: 'H04',
    text: {
      en: 'Maintain at least 1 metre (3 feet) of open clearance between portable space heaters and curtains, bedding, or upholstery.',
      kn: 'ಹೀಟರ್‌ಗಳು ಮತ್ತು ಪರದೆಗಳು ಅಥವಾ ಹಾಸಿಗೆಯ ನಡುವೆ ಕನಿಷ್ಠ 1 ಮೀಟರ್ (3 ಅಡಿ) ಅಂತರ ಕಾಯ್ದುಕೊಳ್ಳಿ.',
      hi: 'हीटर और पर्दों या बिस्तरों के बीच कम से कम 1 मीटर (3 फीट) की दूरी रखें।',
    },
  },
  'G-H04-003': {
    category_id: 'H04',
    text: {
      en: 'Store matches, utility lighters, and hot appliances out of reach of children in elevated, latched locations.',
      kn: 'ಬೆಂಕಿಪೊಟ್ಟಣ, ಲೈಟರ್ ಮತ್ತು ಬಿಸಿ ಉಪಕರಣಗಳನ್ನು ಮಕ್ಕಳಿಗೆ ಸಿಗದ ಎತ್ತರದ ಸ್ಥಳದಲ್ಲಿಡಿ.',
      hi: 'माचिस, लाइटर और गर्म उपकरणों को बच्चों की पहुंच से दूर ऊंचाई पर रखें।',
    },
  },
  'G-H04-004': {
    category_id: 'H04',
    text: {
      en: 'Turn off heating appliances, stoves, and irons immediately when stepping away from the area.',
      kn: 'ಸ್ಥಳದಿಂದ ಹೊರಹೋಗುವಾಗ ಹೀಟರ್, ಒಲೆ ಮತ್ತು ಇಸ್ತ್ರಿ ಪೆಟ್ಟಿಗೆಯನ್ನು ತಕ್ಷಣ ಆಫ್ ಮಾಡಿ.',
      hi: 'स्थान से हटते ही हीटर, स्टोव और इस्त्री तुरंत बंद कर दें।',
    },
  },
  'G-H04-005': {
    category_id: 'H04',
    text: {
      en: 'For grease or oil cooking pan flare-ups, slide a tight metal lid over the pan and switch off heat; never pour water.',
      kn: 'ಎಣ್ಣೆಯ ಬೆಂಕಿಗೆ ಲೋಹದ ಮುಚ್ಚಳ ಮುಚ್ಚಿ ಶಾಖ ಆಫ್ ಮಾಡಿ; ಎಂದಿಗೂ ನೀರು ಸುರಿಯಬೇಡಿ.',
      hi: 'तेल की आग पर धातु का ढक्कन ढकें और आंच बंद करें; कभी पानी न डालें।',
    },
  },
  'G-H04-006': {
    category_id: 'H04',
    text: {
      en: 'For small burning paper or textile fires, extinguish using plenty of water or a multipurpose extinguisher.',
      kn: 'ಕಾಗದ ಅಥವಾ ಬಟ್ಟೆಯ ಸಣ್ಣ ಬೆಂಕಿಯನ್ನು ನಂದಿಸಲು ಸಾಕಷ್ಟು ನೀರು ಅಥವಾ ಅಗ್ನಿಶಾಮಕ ಬಳಸಿ.',
      hi: 'कागज या कपड़े की छोटी आग को बुझाने के लिए पानी या अग्निशामक का प्रयोग करें।',
    },
  },
  'G-H05-001': {
    category_id: 'H05',
    text: {
      en: 'Store culinary knives, shears, and razor blades in a wall-mounted magnetic rack, knife block, or latched drawer.',
      kn: 'ಚಾಕುಗಳು, ಕತ್ತರಿಗಳು ಮತ್ತು ಬ್ಲೇಡ್‌ಗಳನ್ನು ಚಾಕು ಸ್ಟ್ಯಾಂಡ್ ಅಥವಾ ಲಾಕ್ ಮಾಡಿದ ಡ್ರಾಯರ್‌ನಲ್ಲಿ ಇರಿಸಿ.',
      hi: 'चाकू, कैंची और ब्लेड को सुरक्षित स्टैंड या बंद दराज में रखें।',
    },
  },
  'G-H05-002': {
    category_id: 'H05',
    text: {
      en: 'Collect broken glassware fragments using a broom and dustpan, followed by a damp paper towel to pick up micro-splinters.',
      kn: 'ಒಡೆದ ಗಾಜಿನ ಚೂರುಗಳನ್ನು ಪೊರಕೆಯಿಂದ ಗುಡಿಸಿ, ನಂತರ ಒದ್ದೆ ಕಾಗದದಿಂದ ಸೂಕ್ಷ್ಮ ಚೂರುಗಳನ್ನು ತೆಗೆಯಿರಿ.',
      hi: 'कांच के टुकड़ों को झाड़ू से समेटें और छोटे कणों को गीले कागज से उठाएं।',
    },
  },
  'G-H05-003': {
    category_id: 'H05',
    text: {
      en: 'Push food preparation cutting boards and sharp cutlery well back from countertop perimeters away from toddler reach.',
      kn: 'ಚೂಪಾದ ಕತ್ತರಿ ಮತ್ತು ಚಾಕುಗಳನ್ನು ಕೌಂಟರ್‌ನ ಅಂಚಿನಿಂದ ಮಕ್ಕಳಿಗೆ ಎಟುಕದಂತೆ ದೂರವಿಡಿ.',
      hi: 'धारदार औजारों को काउंटर के किनारे से दूर रखें ताकि बच्चे न छू सकें।',
    },
  },
  'G-H05-004': {
    category_id: 'H05',
    text: {
      en: 'Wrap spent razor blades or sharp glass shards in rigid cardboard before placing them in the disposal bin.',
      kn: 'ಹಳೆಯ ಬ್ಲೇಡ್‌ಗಳು ಅಥವಾ ಗಾಜಿನ ಚೂರುಗಳನ್ನು ಕಸದ ಬುಟ್ಟಿಗೆ ಹಾಕುವ ಮುನ್ನ ರಟ್ಟಿನಲ್ಲಿ ಸುತ್ತಿ.',
      hi: 'पुराने ब्लेड या नुकीले कांच को कचरे के डिब्बे में डालने से पहले गत्ते में लपेटें।',
    },
  },
  'G-H06-001': {
    category_id: 'H06',
    text: {
      en: 'Mount hardware-secured safety barrier gates at both the summit and base of interior staircases.',
      kn: 'ಮೆಟ್ಟಿಲುಗಳ ಮೇಲ್ಭಾಗ ಮತ್ತು ಕೆಳಭಾಗ ಎರಡರಲ್ಲೂ ಸುರಕ್ಷತಾ ಗೇಟ್‌ಗಳನ್ನು ಅಳವಡಿಸಿ.',
      hi: 'सीढ़ियों के ऊपर और नीचे दोनों तरफ सुरक्षात्मक गेट लगाएं।',
    },
  },
  'G-H06-002': {
    category_id: 'H06',
    text: {
      en: 'Engage window sash restrictors to ensure residential window openings cannot exceed 10 centimetres (4 inches).',
      kn: 'ಕಿಟಕಿಗಳು 10 ಸೆಂ.ಮೀ (4 ಇಂಚು) ಕ್ಕಿಂತ ಹೆಚ್ಚು ತೆರೆಯದಂತೆ ನಿರ್ಬಂಧಕಗಳನ್ನು ಅಳವಡಿಸಿ.',
      hi: 'खिड़कियों को 10 सेमी (4 इंच) से अधिक खुलने से रोकने के लिए लॉक लगाएं।',
    },
  },
  'G-H06-003': {
    category_id: 'H06',
    text: {
      en: 'Install continuous, solidly anchored handrails spanning the entire vertical run on both sides of stairways.',
      kn: 'ಮೆಟ್ಟಿಲುಗಳ ಎರಡೂ ಬದಿಗಳಲ್ಲಿ ಗಟ್ಟಿಯಾದ ಕೈಹಿಡಿಗಳನ್ನು ಅಳವಡಿಸಿ.',
      hi: 'सीढ़ियों के दोनों तरफ मजबूत रेलिंग सुनिश्चित करें।',
    },
  },
  'G-H06-004': {
    category_id: 'H06',
    text: {
      en: 'Move chairs, ottomans, and climbable furniture away from balcony perimeters and open windows.',
      kn: 'ಕುರ್ಚಿಗಳು ಮತ್ತು ಹತ್ತಬಹುದಾದ ಪೀಠೋಪಕರಣಗಳನ್ನು ಬಾಲ್ಕನಿ ಮತ್ತು ಕಿಟಕಿಗಳಿಂದ ದೂರ ಸರಿಸಿ.',
      hi: 'कुर्सियों और चढ़ने योग्य फर्नीचर को बालकनी और खिड़कियों से दूर रखें।',
    },
  },
  'G-H07-001': {
    category_id: 'H07',
    text: {
      en: 'Anchor tall bookcases, dressers, and storage wardrobes directly into wall studs using anti-tip bracket straps.',
      kn: 'ಎತ್ತರದ ಕಪಾಟುಗಳು ಮತ್ತು ವಾರ್ಡ್‌ರೋಬ್‌ಗಳನ್ನು ಗೋಡೆಗೆ ಪಟ್ಟಿಗಳಿಂದ ಭದ್ರಪಡಿಸಿ.',
      hi: 'ऊंची अलमारियों और वार्डरोब को गिरने से रोकने के लिए दीवार से बांधें।',
    },
  },
  'G-H07-002': {
    category_id: 'H07',
    text: {
      en: 'Mount flat-screen televisions securely to wall studs or secure them with anti-tip straps to broad, low media furniture.',
      kn: 'ಟೆಲಿವಿಷನ್‌ಗಳನ್ನು ಗೋಡೆಗೆ ಸುರಕ್ಷಿತವಾಗಿ ಜೋಡಿಸಿ ಅಥವಾ ಭದ್ರವಾದ ಪಟ್ಟಿಗಳಿಂದ ಕಟ್ಟಿ.',
      hi: 'टेलीविजन को दीवार पर सुरक्षित लगाएं या पट्टियों से बांधकर रखें।',
    },
  },
  'G-H07-003': {
    category_id: 'H07',
    text: {
      en: 'Arrange storage weight distribution so heavy books and boxes occupy the lowest shelves to preserve stability.',
      kn: 'ಸ್ಥಿರತೆಗಾಗಿ ಭಾರವಾದ ಪುಸ್ತಕಗಳು ಮತ್ತು ವಸ್ತುಗಳನ್ನು ಕೆಳಗಿನ ಕಪಾಟುಗಳಲ್ಲಿ ಇರಿಸಿ.',
      hi: 'स्थिरता के लिए भारी किताबों और डिब्बों को सबसे निचली अलमारियों पर रखें।',
    },
  },
  'G-H07-004': {
    category_id: 'H07',
    text: {
      en: 'Remove desirable toys, remote controls, or sweets from upper furniture tops to discourage climbing behavior.',
      kn: 'ಮಕ್ಕಳು ಹತ್ತುವುದನ್ನು ತಡೆಯಲು ಆಟಿಕೆಗಳು ಅಥವಾ ರಿಮೋಟ್‌ಗಳನ್ನು ಎತ್ತರದ ಜಾಗದಲ್ಲಿಡಬೇಡಿ.',
      hi: 'बच्चों को चढ़ने से रोकने के लिए खिलौने या रिमोट को ऊंची जगहों पर न रखें।',
    },
  },
  'G-H08-001': {
    category_id: 'H08',
    text: {
      en: 'Store domestic chemical cleaners, bleach, and detergents in elevated cabinets secured with child-resistant latches.',
      kn: 'ಸ್ವಚ್ಛಗೊಳಿಸುವ ರಾಸಾಯನಿಕಗಳು ಮತ್ತು ಬ್ಲೀಚ್ ಅನ್ನು ಬೀಗ ಹಾಕಿದ ಎತ್ತರದ ಕ್ಯಾಬಿನೆಟ್‌ಗಳಲ್ಲಿ ಇರಿಸಿ.',
      hi: 'घरेलू रसायनों और फिनाइल को बच्चों से दूर बंद अलमारी में रखें।',
    },
  },
  'G-H08-002': {
    category_id: 'H08',
    text: {
      en: 'Retain pharmaceuticals in their original labeled child-resistant containers within a locked medicine cabinet.',
      kn: 'ಔಷಧಿಗಳನ್ನು ಮೂಲ ಲೇಬಲ್ ಇರುವ ಬಾಟಲಿಗಳಲ್ಲಿ ಲಾಕ್ ಮಾಡಿದ ಬಾಕ್ಸ್‌ನಲ್ಲಿ ಇರಿಸಿ.',
      hi: 'दवाइयों को उनके मूल डिब्बों में बंद मेडिकल बॉक्स के अंदर रखें।',
    },
  },
  'G-H08-003': {
    category_id: 'H08',
    text: {
      en: 'Never decant chemical solvents, kerosene, or cleaning mixtures into unlabelled beverage bottles or drink containers.',
      kn: 'ರಾಸಾಯನಿಕಗಳು ಅಥವಾ ಸೀಮೆಎಣ್ಣೆಯನ್ನು ನೀರಿನ ಬಾಟಲಿ ಅಥವಾ ಪಾನೀಯ ಡಬ್ಬಿಗಳಲ್ಲಿ ಎಂದಿಗೂ ಹಾಕಬೇಡಿ.',
      hi: 'रसायनों या केरोसिन को कभी भी पीने की बोतलों में न डालें।',
    },
  },
  'G-H08-004': {
    category_id: 'H08',
    text: {
      en: 'Program regional poison information hotline numbers into mobile speed-dial and post conspicuously near exits.',
      kn: 'ತುರ್ತು ವಿಷ ಮಾಹಿತಿ ಸಹಾಯವಾಣಿ ಸಂಖ್ಯೆಯನ್ನು ಮೊಬೈಲ್‌ನಲ್ಲಿ ಉಳಿಸಿ ಮತ್ತು ಗೋಡೆಗೆ ಅಂಟಿಸಿ.',
      hi: 'आपातकालीन विष नियंत्रण हेल्पलाइन नंबर को फोन में सेव करें।',
    },
  },
  'G-H09-001': {
    category_id: 'H09',
    text: {
      en: 'Collect and store coins, button batteries, pins, and small objects under 3 cm well outside infant and toddler reach.',
      kn: 'ನಾಣ್ಯಗಳು, ಬಟನ್ ಬ್ಯಾಟರಿಗಳು ಮತ್ತು ಸಣ್ಣ ವಸ್ತುಗಳನ್ನು ಮಕ್ಕಳಿಗೆ ಸಿಗದಂತೆ ಸಂಗ್ರಹಿಸಿಡಿ.',
      hi: 'सिक्के, बटन बैटरी और छोटी वस्तुओं को बच्चों की पहुंच से दूर रखें।',
    },
  },
  'G-H09-002': {
    category_id: 'H09',
    text: {
      en: 'Ensure electronic gadgets and toy battery compartments are secured with screwed closures to prevent battery release.',
      kn: 'ಆಟಿಕೆಗಳ ಬ್ಯಾಟರಿ ವಿಭಾಗಗಳು ಸ್ಕ್ರೂಗಳಿಂದ ಭದ್ರವಾಗಿ ಮುಚ್ಚಲ್ಪಟ್ಟಿವೆ ಎಂಬುದನ್ನು ಖಚಿತಪಡಿಸಿಕೊಳ್ಳಿ.',
      hi: 'खिलौनों के बैटरी कम्पार्टमेंट में स्क्रू लगे होने की पुष्टि करें ताकि बैटरी न निकले।',
    },
  },
  'G-H09-003': {
    category_id: 'H09',
    text: {
      en: 'Inspect plush and plastic toys regularly for loose eyes, detached buttons, or split seams.',
      kn: 'ಆಟಿಕೆಗಳಲ್ಲಿ ಸಡಿಲ ಗುಂಡಿಗಳು ಅಥವಾ ಹರಿದ ಭಾಗಗಳಿವೆಯೇ ಎಂದು ನಿಯಮಿತವಾಗಿ ಪರಿಶೀಲಿಸಿ.',
      hi: 'खिलौनों में ढीले बटन या फटे हुए हिस्सों की नियमित जांच करें।',
    },
  },
  'G-H09-004': {
    category_id: 'H09',
    text: {
      en: 'Dispose of burst balloons and brittle broken plastic fragments immediately upon detection.',
      kn: 'ಒಡೆದ ಬಲೂನ್‌ಗಳು ಮತ್ತು ಪ್ಲಾಸ್ಟಿಕ್ ಚೂರುಗಳನ್ನು ಕಂಡ ತಕ್ಷಣ ಎಸೆಯಿರಿ.',
      hi: 'फूटे हुए गुब्बारे और प्लास्टिक के टुकड़ों को तुरंत कूड़ेदान में फेंकें।',
    },
  },
  'G-H10-001': {
    category_id: 'H10',
    text: {
      en: 'Empty standing water from washing buckets, plastic tubs, and utility basins immediately after finishing tasks.',
      kn: 'ಕೆಲಸ ಮುಗಿದ ತಕ್ಷಣ ಬಕೆಟ್‌ಗಳು ಮತ್ತು ಟಬ್‌ಗಳಲ್ಲಿರುವ ನೀರನ್ನು ಖಾಲಿ ಮಾಡಿ.',
      hi: 'काम खत्म होते ही बाल्टियों और टबों में भरा पानी तुरंत खाली कर दें।',
    },
  },
  'G-H10-002': {
    category_id: 'H10',
    text: {
      en: 'Maintain uninterrupted direct visual contact with infants and toddlers whenever they are near bathtubs or water receptacles.',
      kn: 'ಮಕ್ಕಳು ನೀರಿನ ತೊಟ್ಟಿ ಅಥವಾ ಬಾತ್‌ಟಬ್ ಬಳಿ ಇರುವಾಗ ಸತತವಾಗಿ ಕಣ್ಣಿಟ್ಟಿರಿ.',
      hi: 'पानी के बर्तनों या बाथटब के पास बच्चों पर लगातार सीधी नज़र रखें।',
    },
  },
  'G-H10-003': {
    category_id: 'H10',
    text: {
      en: 'Fasten rigid, weight-bearing, padlocked covers over underground sumps, storage wells, and rainwater harvesting cisterns.',
      kn: 'ನೀರಿನ ಸಂಪ್‌ಗಳು ಮತ್ತು ಬಾವಿಗಳ ಮೇಲೆ ಭಾರ ತಡೆಯುವ ಗಟ್ಟಿಯಾದ ಮುಚ್ಚಳಗಳನ್ನು ಬೀಗ ಹಾಕಿ ಭದ್ರಪಡಿಸಿ.',
      hi: 'पानी की टंकियों और भूमिगत गड्ढों पर मजबूत और ताला लगे ढक्कन लगाएं।',
    },
  },
  'G-H10-004': {
    category_id: 'H10',
    text: {
      en: 'Keep bathroom and laundry facility doors shut and fitted with child-resistant exterior latch closures.',
      kn: 'ಸ್ನಾನಗೃಹದ ಬಾಗಿಲುಗಳನ್ನು ಯಾವಾಗಲೂ ಮುಚ್ಚಿಡಿ ಮತ್ತು ಚಿಲಕ ಹಾಕಿ.',
      hi: 'बाथरूम के दरवाजे हमेशा बंद रखें और सुरक्षित कुंडी लगाकर रखें।',
    },
  },
  'G-H11-001': {
    category_id: 'H11',
    text: {
      en: 'Install safety cleats at least 1.5 metres above the floor to wrap and secure loose window blind pull cords.',
      kn: 'ಪರದೆಯ ಹಗ್ಗಗಳನ್ನು ನೆಲದಿಂದ ಕನಿಷ್ಠ 1.5 ಮೀಟರ್ ಎತ್ತರದಲ್ಲಿ ಸುತ್ತಿ ಭದ್ರಪಡಿಸಿ.',
      hi: 'पर्दों की डोरियों को फर्श से कम से कम 1.5 मीटर ऊपर बांधकर रखें।',
    },
  },
  'G-H11-002': {
    category_id: 'H11',
    text: {
      en: 'Position infant cribs, playpens, and toddler beds well away from window treatments, curtain cords, and appliance wires.',
      kn: 'ಶಿಶುವಿನ ತೊಟ್ಟಿಲು ಮತ್ತು ಹಾಸಿಗೆಗಳನ್ನು ಕಿಟಕಿ ಪರದೆಗಳು ಮತ್ತು ತಂತಿಗಳಿಂದ ದೂರವಿರಿಸಿ.',
      hi: 'शिशु के पालने और बिस्तरों को खिड़की के पर्दों और तारों से दूर रखें।',
    },
  },
  'G-H11-003': {
    category_id: 'H11',
    text: {
      en: 'Tie plastic packaging bags into tight knots and dispose of them promptly outside child reach.',
      kn: 'ಪ್ಲಾಸ್ಟಿಕ್ ಚೀಲಗಳನ್ನು ಗಂಟು ಹಾಕಿ ಮಕ್ಕಳಿಗೆ ಸಿಗದಂತೆ ವಿಲೇವಾರಿ ಮಾಡಿ.',
      hi: 'प्लास्टिक की थैलियों में गांठ बांधकर उन्हें तुरंत बच्चों की पहुंच से दूर फेंकें।',
    },
  },
  'G-H11-004': {
    category_id: 'H11',
    text: {
      en: 'Verify that crib vertical slats and stair rail balusters have gaps no wider than 6 centimetres (2.3 inches).',
      kn: 'ತೊಟ್ಟಿಲು ಮತ್ತು ಮೆಟ್ಟಿಲುಗಳ ಕಂಬಿಗಳ ನಡುವಿನ ಅಂತರ 6 ಸೆಂ.ಮೀ ಗಿಂತ ಹೆಚ್ಚಿಲ್ಲ ಎಂದು ಖಚಿತಪಡಿಸಿಕೊಳ್ಳಿ.',
      hi: 'पालने और सीढ़ियों की रेलिंग के बीच 6 सेमी से अधिक का अंतर न होने दें।',
    },
  },
  'G-H12-001': {
    category_id: 'H12',
    text: {
      en: 'Restrict access beneath areas of loose ceiling plaster, structural fractures, or unstable overhead elements.',
      kn: 'ಉದುರುತ್ತಿರುವ ಮೇಲ್ಛಾವಣಿ ಅಥವಾ ಬಿರುಕು ಬಿಟ್ಟ ಭಾಗಗಳ ಕೆಳಗೆ ಓಡಾಡುವುದನ್ನು ನಿರ್ಬಂಧಿಸಿ.',
      hi: 'उखड़ते प्लास्टर या दरार वाली छतों के नीचे आवाजाही रोकें।',
    },
  },
  'G-H12-002': {
    category_id: 'H12',
    text: {
      en: 'Arrange for a qualified structural engineer or licensed contractor to assess severe masonry wall or beam cracks.',
      kn: 'ಗೋಡೆ ಅಥವಾ ಕಿರಣಗಳಲ್ಲಿನ ಬಿರುಕುಗಳನ್ನು ಪರಿಶೀಲಿಸಲು ಎಂಜಿನಿಯರ್ ಅವರನ್ನು ಸಂಪರ್ಕಿಸಿ.',
      hi: 'दीवारों या बीम में गंभीर दरारों की जांच के लिए किसी योग्य इंजीनियर को बुलाएं।',
    },
  },
  'G-H12-003': {
    category_id: 'H12',
    text: {
      en: 'Repair pipe leakages and scrub active black mould growth using detergent solutions while wearing protective respirators.',
      kn: 'ಪೈಪ್ ಸೋರಿಕೆಯನ್ನು ಸರಿಪಡಿಸಿ ಮತ್ತು ಮಾಸ್ಕ್ ಧರಿಸಿ ಶಿಲೀಂಧ್ರ ಕಲೆಗಳನ್ನು ಸ್ವಚ್ಛಗೊಳಿಸಿ.',
      hi: 'पाइप लीकेज ठीक करें और मास्क पहनकर फफूंद को डिटर्जेंट से साफ करें।',
    },
  },
  'G-H12-004': {
    category_id: 'H12',
    text: {
      en: 'Fasten or replace loose banisters, rotting floorboards, or detached floor threshold transition strips.',
      kn: 'ಸಡಿಲವಾದ ರೇಲಿಂಗ್‌ಗಳು ಅಥವಾ ಮುರಿದ ನೆಲಹಾಸುಗಳನ್ನು ತಕ್ಷಣ ಸರಿಪಡಿಸಿ.',
      hi: 'ढीली रेलिंग या टूटी फर्श पट्टियों को तुरंत कसें या बदलें।',
    },
  },
  'G-H13-001': {
    category_id: 'H13',
    text: {
      en: 'Install bright, even, glare-free illumination along stairways, dark corridors, and entry thresholds.',
      kn: 'ಮೆಟ್ಟಿಲುಗಳು ಮತ್ತು ಕತ್ತಲೆಯ ಕಾರಿಡಾರ್‌ಗಳಲ್ಲಿ ಪ್ರಕಾಶಮಾನವಾದ ಬೆಳಕನ್ನು ಅಳವಡಿಸಿ.',
      hi: 'सीढ़ियों और अंधेरे गलियारों में पर्याप्त रोशनी का प्रबंध करें।',
    },
  },
  'G-H13-002': {
    category_id: 'H13',
    text: {
      en: 'Plug automatic motion-activated nightlights into wall sockets along bedroom-to-bathroom nocturnal walking routes.',
      kn: 'ರಾತ್ರಿ ಓಡಾಡುವ ಹಾದಿಯಲ್ಲಿ ಸ್ವಯಂಚಾಲಿತ ನೈಟ್‌ಲೈಟ್‌ಗಳನ್ನು ಅಳವಡಿಸಿ.',
      hi: 'रात में चलने के रास्ते में मोशन-सेंसर वाली नाइट लाइट लगाएं।',
    },
  },
  'G-H13-003': {
    category_id: 'H13',
    text: {
      en: 'Replace expired bulbs immediately and ensure two-way light switches are accessible at both stair top and landing.',
      kn: 'ಸುಟ್ಟುಹೋದ ಬಲ್ಬ್‌ಗಳನ್ನು ತಕ್ಷಣ ಬದಲಾಯಿಸಿ ಮತ್ತು ಮೆಟ್ಟಿಲುಗಳ ಎರಡೂ ಕಡೆ ಸ್ವಿಚ್ ಇರಿಸಿ.',
      hi: 'खराब बल्बों को तुरंत बदलें और सीढ़ियों के दोनों सिरों पर स्विच की सुविधा रखें।',
    },
  },
  'G-H13-004': {
    category_id: 'H13',
    text: {
      en: 'Apply high-contrast visual edge striping along stair tread edges to assist depth discernment in shadowed zones.',
      kn: 'ಮೆಟ್ಟಿಲುಗಳ ಅಂಚುಗಳನ್ನು ಗುರುತಿಸಲು ಪ್ರಕಾಶಮಾನ ಬಣ್ಣದ ಪಟ್ಟಿಗಳನ್ನು ಅಂಟಿಸಿ.',
      hi: 'सीढ़ियों के किनारों को स्पष्ट देखने के लिए हाई-कंट्रास्ट पट्टियां लगाएं।',
    },
  },
  'G-H14-001': {
    category_id: 'H14',
    text: {
      en: 'Keep residential perimeter gates and driveway barriers latched to prevent uncontrolled child access to roadways.',
      kn: 'ಮಕ್ಕಳು ರಸ್ತೆಗೆ ಹೋಗುವುದನ್ನು ತಡೆಯಲು ಮುಖ್ಯ ಗೇಟ್‌ಗಳನ್ನು ಯಾವಾಗಲೂ ಮುಚ್ಚಿ ಲಾಕ್ ಮಾಡಿ.',
      hi: 'बच्चों को सड़क पर जाने से रोकने के लिए मुख्य गेट को हमेशा बंद रखें।',
    },
  },
  'G-H14-002': {
    category_id: 'H14',
    text: {
      en: 'Level sunken paving slabs, fill potholes along walkways, and clearly mark irregular exterior steps.',
      kn: 'ನಡೆಯುವ ಜಾಗದಲ್ಲಿರುವ ಗುಂಡಿಗಳನ್ನು ಮುಚ್ಚಿ ಮತ್ತು ಅಸಮ ನೆಲವನ್ನು ಸರಿಪಡಿಸಿ.',
      hi: 'रास्तों के गड्ढों को भरें और असमान सीढ़ियों पर स्पष्ट निशान लगाएं।',
    },
  },
  'G-H14-003': {
    category_id: 'H14',
    text: {
      en: 'Report low-hanging, damaged, or sagging exterior utility cables to local authorities without attempting contact.',
      kn: 'ತೂಗಾಡುತ್ತಿರುವ ಅಪಾಯಕಾರಿ ವಿದ್ಯುತ್ ತಂತಿಗಳನ್ನು ಮುಟ್ಟದೆ ಅಧಿಕಾರಿಗಳಿಗೆ ವರದಿ ಮಾಡಿ.',
      hi: 'झूलते हुए बिजली के तारों को छुए बिना तुरंत संबंधित अधिकारियों को सूचित करें।',
    },
  },
  'G-H14-004': {
    category_id: 'H14',
    text: {
      en: 'Ensure children wear reflective apparel and maintain firm hand-holding with adults when walking near vehicle thoroughfares.',
      kn: 'ರಸ್ತೆಬದಿ ನಡೆಯುವಾಗ ಮಕ್ಕಳ ಕೈಯನ್ನು ಗಟ್ಟಿಯಾಗಿ ಹಿಡಿದುಕೊಳ್ಳಿ.',
      hi: 'सड़क के पास चलते समय बच्चों का हाथ मजबूती से पकड़ कर रखें।',
    },
  },
  'G-H15-001': {
    category_id: 'H15',
    text: {
      en: 'Isolate the observed unusual physical anomaly and restrict access by vulnerable occupants until assessed.',
      kn: 'ಕಂಡುಬಂದ ಅಸಾಮಾನ್ಯ ಅಪಾಯಕಾರಿ ವಸ್ತುವನ್ನು ಪ್ರತ್ಯೇಕಿಸಿ ಮತ್ತು ಮಕ್ಕಳನ್ನು ದೂರವಿಡಿ.',
      hi: 'देखी गई असामान्य वस्तु से बच्चों और कमजोर सदस्यों को दूर रखें।',
    },
  },
  'G-H15-002': {
    category_id: 'H15',
    text: {
      en: 'Inspect the item from a prudent physical distance to establish whether specialised technical evaluation is required.',
      kn: 'ಸುರಕ್ಷಿತ ಅಂತರದಿಂದ ಪರಿಶೀಲಿಸಿ ತಜ್ಞರ ಸಹಾಯದ ಅಗತ್ಯವಿದೆಯೇ ಎಂದು ತೀರ್ಮಾನಿಸಿ.',
      hi: 'सुरक्षित दूरी से निरीक्षण करें कि क्या विशेषज्ञ की मदद की आवश्यकता है।',
    },
  },
  'G-H15-003': {
    category_id: 'H15',
    text: {
      en: 'Consult manufacturer specifications or local safety codes if the unfamiliar equipment or hazard cannot be readily resolved.',
      kn: 'ಅಪಾಯ ನಿವಾರಣೆಗೆ ಸಲಕರಣೆಯ ಕೈಪಿಡಿ ಅಥವಾ ಸುರಕ್ಷತಾ ನಿಯಮಗಳನ್ನು ಸಂಪರ್ಕಿಸಿ.',
      hi: 'अपरिचित उपकरण के समाधान के लिए निर्माता के निर्देशों की जांच करें।',
    },
  },
};

/**
 * Common phrase translations for custom evidence or scene text.
 */
const COMMON_EVIDENCE_MAP: Record<string, TrilingualText> = {
  'behind the sofa not visible': {
    en: 'Behind the sofa not visible',
    kn: 'ಸೋಫಾದ ಹಿಂಭಾಗ ಗೋಚರಿಸಲಿಲ್ಲ',
    hi: 'सोफे के पीछे का हिस्सा दिखाई नहीं दे रहा था',
  },
  'parts of the room were not visible': {
    en: "Parts of the room weren't visible",
    kn: 'ಕೋಣೆಯ ಕೆಲವು ಭಾಗಗಳು ಗೋಚರಿಸಲಿಲ್ಲ',
    hi: 'कमरे के कुछ हिस्से दिखाई नहीं दे रहे थे',
  },
  'visible copper strand': {
    en: 'Visible copper strand or exposed electrical conductor',
    kn: 'ಕಾಣುವ ತಾಮ್ರದ ತಂತಿ ಅಥವಾ ತೆರೆದ ವಿದ್ಯುತ್ ವಾಹಕ',
    hi: 'दिखाई देने वाला तांबे का तार या खुला विद्युत चालक',
  },
  'liquid spill on floor': {
    en: 'Liquid spill or puddle on floor surface',
    kn: 'ನೆಲದ ಮೇಲೆ ದ್ರವ ಚೆಲ್ಲುವಿಕೆ ಅಥವಾ ನೀರಿನ ಗುಂಡಿ',
    hi: 'फर्श पर तरल या पानी का फैलाव',
  },
  'trip hazard in walkway': {
    en: 'Trailing cable or clutter blocking walking pathway',
    kn: 'ನಡೆಯುವ ಹಾದಿಯಲ್ಲಿ ಎಳೆಯಲ್ಪಟ್ಟ ಕೇಬಲ್ ಅಥವಾ ಅಸ್ತವ್ಯಸ್ತ ವಸ್ತುಗಳು',
    hi: 'रास्ते में फैला तार या बिखरा हुआ सामान',
  },
};

/**
 * Helper to get Category localization in all 3 languages.
 */
export function getCategoryTrilingual(categoryId?: string | null): CategoryLocalization {
  if (!categoryId) {
    return {
      code: 'H15',
      name: 'other_observable',
      title: {
        en: 'Hazard Assessment',
        kn: 'ಅಪಾಯದ ಮೌಲ್ಯಮಾಪನ',
        hi: 'जोखिम मूल्यांकन',
      },
      tag: '[HAZARD / ಅಪಾಯ / ख़तरा]',
    };
  }
  const code = categoryId.toUpperCase().trim();
  const found = CATEGORIES_TRILINGUAL[code];
  if (found) return found;

  return {
    code,
    name: 'custom',
    title: {
      en: `Hazard (${code})`,
      kn: `ಅಪಾಯ (${code})`,
      hi: `ख़तरा (${code})`,
    },
    tag: `[${code}]`,
  };
}

/**
 * Helper to resolve trilingual text for a Precaution.
 */
export function getPrecautionTrilingual(
  precaution: Precaution,
  categoryId?: string
): TrilingualText {
  // 1. If guideline_id is present, look up the exact verified guideline
  if (precaution.guideline_id && GUIDELINES_TRILINGUAL[precaution.guideline_id]) {
    return GUIDELINES_TRILINGUAL[precaution.guideline_id].text;
  }

  // 2. Check if precaution text matches any standard guideline text directly
  const normText = precaution.text.trim().toLowerCase();
  for (const entry of Object.values(GUIDELINES_TRILINGUAL)) {
    if (entry.text.en.toLowerCase() === normText) {
      return entry.text;
    }
  }

  // 3. Fallback to category primary guideline or bilingual echo
  if (categoryId) {
    const catCode = categoryId.toUpperCase().trim();
    // Find first guideline matching this category
    const matchingKey = Object.keys(GUIDELINES_TRILINGUAL).find(
      (k) => GUIDELINES_TRILINGUAL[k].category_id === catCode
    );
    if (matchingKey) {
      const g = GUIDELINES_TRILINGUAL[matchingKey];
      return {
        en: precaution.text,
        kn: `${g.text.kn} (${precaution.text})`,
        hi: `${g.text.hi} (${precaution.text})`,
      };
    }
  }

  // Default passthrough
  return {
    en: precaution.text,
    kn: precaution.text,
    hi: precaution.text,
  };
}

/**
 * Helper to resolve trilingual text for an evidence item.
 */
export function getEvidenceTrilingual(evidenceItem: string): TrilingualText {
  const norm = evidenceItem.trim().toLowerCase();
  for (const [key, val] of Object.entries(COMMON_EVIDENCE_MAP)) {
    if (norm.includes(key) || key.includes(norm)) {
      return val;
    }
  }
  return {
    en: evidenceItem,
    kn: evidenceItem,
    hi: evidenceItem,
  };
}

/**
 * Helper to resolve trilingual coverage gaps.
 */
export function getCoverageGapsTrilingual(gaps?: string[]): TrilingualText[] {
  if (!gaps || gaps.length === 0) {
    return [
      {
        en: 'No major visual blind spots reported in analyzed frame.',
        kn: 'ವಿಶ್ಲೇಷಿಸಿದ ಚೌಕಟ್ಟಿನಲ್ಲಿ ಯಾವುದೇ ಪ್ರಮುಖ ಕುರುಡು ತಾಣಗಳು ವರದಿಯಾಗಿಲ್ಲ.',
        hi: 'विश्लेषित फ्रेम में किसी बड़े अनदेखे क्षेत्र की सूचना नहीं है।',
      },
    ];
  }
  return gaps.map((gap) => getEvidenceTrilingual(gap));
}
