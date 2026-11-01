/**
 * S-26: Data Exporters, Trilingual Report Generator & Print Trigger
 * Conforms to skills.md S-26, design.md §12, and spreadsheet security guidelines.
 *
 * Responsibilities:
 * 1. Safe CSV export with formula injection prevention (prefix =, +, -, @).
 * 2. Pretty-printed JSON export.
 * 3. Trilingual standalone printable HTML/PDF generator with zero viewport truncation.
 * 4. Browser print trigger with unconstrained print flow.
 */

import { AnalysisResult, SafetyReport } from '../types/api';
import {
  HAZARD_STATUS_TRILINGUAL,
  MANDATORY_SAFETY_DISCLAIMERS,
  OUTCOMES_TRILINGUAL,
  PERSON_CATEGORIES_TRILINGUAL,
  RISK_LEVELS_TRILINGUAL,
  VERIFY_STATUS_TRILINGUAL,
  getCategoryTrilingual,
  getCoverageGapsTrilingual,
  getPrecautionTrilingual,
} from './trilingual';

/**
 * Characters that trigger formula execution in spreadsheet software (Excel, Calc, Sheets).
 */
const FORMULA_INJECTION_CHARS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Sanitizes a cell value to prevent CSV Formula Injection.
 * Prefixes risky characters with a single quote (').
 */
export function sanitizeCSVCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // If first character is a formula trigger, neutralize with leading apostrophe
  if (str.length > 0 && FORMULA_INJECTION_CHARS.includes(str[0])) {
    str = `'${str}`;
  }

  // RFC 4180 escaping: wrap in quotes if contains comma, quote, or newline
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Generates an RFC 4180 compliant CSV string from an array of safety reports.
 */
export function generateReportsCSV(reports: SafetyReport[]): string {
  const headers = [
    'Timestamp',
    'Report ID',
    'Person Category',
    'Overall Risk',
    'Outcome',
    'Immediate Action',
    'Hazard ID',
    'Category ID',
    'Hazard Title',
    'Status',
    'Evidence Strength',
    'Evidence',
    'Precautions',
    'Rule IDs',
    'Verification Status',
    'Notification Status',
    'Coverage Gaps',
    'Limits',
  ];

  const rows: string[] = [headers.map(sanitizeCSVCell).join(',')];

  for (const report of reports) {
    const baseMeta = [
      report.timestamp,
      report.id,
      report.person_category,
      report.overall_risk,
      report.outcome,
      report.immediate_action ? 'true' : 'false',
    ];

    const verification = report.verification?.status ?? '';
    const notification = report.notification?.status ?? '';
    const gaps = (report.scene?.coverage_gaps || []).join('; ');
    const limits = report.limits || '';

    if (!report.hazards || report.hazards.length === 0) {
      // Row with empty hazard details
      const row = [
        ...baseMeta,
        '', // Hazard ID
        '', // Category ID
        'No hazards observed in this view', // Rule R1 compliant
        '', // Status
        '', // Evidence Strength
        '', // Evidence
        '', // Precautions
        '', // Rule IDs
        verification,
        notification,
        gaps,
        limits,
      ];
      rows.push(row.map(sanitizeCSVCell).join(','));
    } else {
      for (const hazard of report.hazards) {
        const evidenceStr = (hazard.evidence || []).join('; ');
        const precautionsStr = (hazard.precautions || [])
          .map((p) => p.text)
          .join('; ');
        const ruleIdsStr = (hazard.risk?.rule_ids || []).join('; ');

        const row = [
          ...baseMeta,
          hazard.id,
          hazard.category_id,
          hazard.title,
          hazard.status,
          hazard.evidence_strength,
          evidenceStr,
          precautionsStr,
          ruleIdsStr,
          verification,
          notification,
          gaps,
          limits,
        ];
        rows.push(row.map(sanitizeCSVCell).join(','));
      }
    }
  }

  return rows.join('\r\n');
}

/**
 * Triggers a file download in the browser.
 */
export function downloadFile(content: BlobPart, filename: string, mimeType: string): void {
  if (typeof document === 'undefined') return;
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(blob)
      : `data:${mimeType},${encodeURIComponent(typeof content === 'string' ? content : '')}`;
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

/**
 * Exports one or more SafetyReports to a CSV file.
 */
export function exportToCSV(
  reports: SafetyReport | SafetyReport[],
  filename?: string
): void {
  const list = Array.isArray(reports) ? reports : [reports];
  const csvContent = generateReportsCSV(list);
  const name = filename || `hazard-report-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadFile(csvContent, name, 'text/csv;charset=utf-8;');
}

/**
 * Exports safety report(s) or data payload to a formatted JSON file.
 */
export function exportToJSON(
  data: unknown,
  filename?: string
): void {
  const jsonContent = JSON.stringify(data, null, 2);
  const name = filename || `hazard-report-${new Date().toISOString().slice(0, 10)}.json`;
  downloadFile(jsonContent, name, 'application/json;charset=utf-8;');
}

export const exportResultsToCsv = exportToCSV;
export const exportResultToJson = exportToJSON;
export const exportHistoryToCSV = exportToCSV;

/**
 * Generates a self-contained, standalone HTML report with baked-in styles,
 * print media query, and Google Fonts links for Kannada, Devanagari, and English.
 */
export function generateTrilingualHTML(report: SafetyReport | AnalysisResult): string {
  const person = PERSON_CATEGORIES_TRILINGUAL[report.person_category] || {
    en: report.person_category,
    kn: report.person_category,
    hi: report.person_category,
  };

  const risk = RISK_LEVELS_TRILINGUAL[report.overall_risk] || {
    en: report.overall_risk,
    kn: report.overall_risk,
    hi: report.overall_risk,
  };

  const outcome = OUTCOMES_TRILINGUAL[report.outcome] || {
    en: report.outcome,
    kn: report.outcome,
    hi: report.outcome,
  };

  const verification = report.verification
    ? VERIFY_STATUS_TRILINGUAL[report.verification.status] || {
        en: report.verification.status,
        kn: report.verification.status,
        hi: report.verification.status,
      }
    : null;

  const coverageGaps = getCoverageGapsTrilingual(report.scene?.coverage_gaps);

  const hazardsListHtml =
    !report.hazards || report.hazards.length === 0
      ? `
      <div class="empty-hazards">
        <h3>No hazards observed in this view / ಈ ವೀಕ್ಷಣೆಯಲ್ಲಿ ಯಾವುದೇ ಅಪಾಯಗಳು ಕಂಡುಬಂದಿಲ್ಲ / इस दृश्य में कोई ख़तरा नहीं दिखा</h3>
        <p>Based on what the camera saw, no hazards meeting the evidence threshold were found. Concealed spaces or objects outside the frame were not assessed.</p>
      </div>
      `
      : report.hazards
          .map((hazard) => {
            const cat = getCategoryTrilingual(hazard.category_id);
            const statusTri = HAZARD_STATUS_TRILINGUAL[hazard.status] || {
              en: hazard.status,
              kn: hazard.status,
              hi: hazard.status,
            };
            const hazardRisk = RISK_LEVELS_TRILINGUAL[hazard.risk.level] || {
              en: hazard.risk.level,
              kn: hazard.risk.level,
              hi: hazard.risk.level,
            };

            const evidenceHtml = (hazard.evidence || [])
              .map((ev) => `<li>${escapeHtml(ev)}</li>`)
              .join('');

            const rulesHtml = (hazard.risk?.rule_ids || [])
              .map((r) => `<span class="rule-badge">${escapeHtml(r)}</span>`)
              .join(' ');

            const precautionsHtml = (hazard.precautions || [])
              .map((p, pIdx) => {
                const precTri = getPrecautionTrilingual(p, hazard.category_id);
                const prov =
                  p.provenance === 'guideline'
                    ? `GUIDELINE: ${p.guideline_id || 'VERIFIED'}`
                    : 'GENERIC PRECAUTION';
                return `
                <div class="precaution-item">
                  <div class="precaution-header">
                    <strong>PRECAUTION #${pIdx + 1}</strong>
                    <span class="provenance-tag">[${escapeHtml(prov)}]</span>
                  </div>
                  <div class="prec-line"><span class="lang-tag en-tag">EN</span> ${escapeHtml(precTri.en)}</div>
                  <div class="prec-line"><span class="lang-tag kn-tag">KN</span> ${escapeHtml(precTri.kn)}</div>
                  <div class="prec-line"><span class="lang-tag hi-tag">HI</span> ${escapeHtml(precTri.hi)}</div>
                </div>
              `;
              })
              .join('');

            return `
            <div class="hazard-card">
              <div class="hazard-header">
                <div>
                  <span class="hazard-cat-tag">[${escapeHtml(cat.code)}: ${escapeHtml(cat.title.en.toUpperCase())} / ${escapeHtml(cat.title.kn)} / ${escapeHtml(cat.title.hi)}]</span>
                  <h3 class="hazard-title">${escapeHtml(hazard.title)}</h3>
                </div>
                <div class="hazard-badges">
                  <span class="status-badge">${escapeHtml(statusTri.en)} (${escapeHtml(hazard.evidence_strength)})</span>
                  <span class="risk-badge risk-${hazard.risk.level}">${escapeHtml(hazardRisk.en)}</span>
                </div>
              </div>

              <div class="evidence-box">
                <div class="section-subhead">EVIDENTIARY_FACTS / ಪುರಾವೆ / साक्ष्य ${hazard.trigger ? `· TRIGGER: ${escapeHtml(hazard.trigger)}` : ''}</div>
                <ul class="evidence-list">${evidenceHtml}</ul>
              </div>

              <div class="rationale-box">
                <div class="section-subhead">RISK_RATIONALE / ಅಪಾಯದ ವಿವರಣೆ / जोखिम का कारण:</div>
                <p>${escapeHtml(hazard.risk.rationale)}</p>
                ${rulesHtml ? `<div class="rules-row">AUDITABLE_RULES: ${rulesHtml}</div>` : ''}
              </div>

              ${precautionsHtml ? `
              <div class="precautions-section">
                <div class="section-subhead">PRESCRIBED PRECAUTIONS (EN / KN / HI) / ನಿರ್ದೇಶಿತ ಮುನ್ನೆಚ್ಚರಿಕೆಗಳು / अनुशंसित सावधानियां</div>
                ${precautionsHtml}
              </div>` : ''}
            </div>
            `;
          })
          .join('\n');

  const gapsHtml = coverageGaps
    .map(
      (gap) => `
      <div class="gap-item">
        <div>• <strong>[EN]</strong> ${escapeHtml(gap.en)}</div>
        <div>• <strong>[KN]</strong> ${escapeHtml(gap.kn)}</div>
        <div>• <strong>[HI]</strong> ${escapeHtml(gap.hi)}</div>
      </div>
    `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sentinel Lens - Trilingual Safety Report - ${escapeHtml(report.id)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans+Kannada:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink: #0c0b09;
      --bg: #ffffff;
      --border: #d1d5db;
      --accent: #FF6542;
      --subtext: #4b5563;
      --card-bg: #f9fafb;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: #f3f4f6;
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Kannada", "Noto Sans Devanagari", sans-serif;
      font-size: 10pt;
      line-height: 1.45;
      padding: 24px;
    }

    .report-wrapper {
      max-width: 860px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    }

    header {
      border-bottom: 2px solid var(--ink);
      padding-bottom: 16px;
      margin-bottom: 20px;
    }

    .top-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'Geist Mono', monospace;
      font-size: 8.5pt;
      text-transform: uppercase;
      color: var(--subtext);
      margin-bottom: 8px;
    }

    .audit-tag {
      background: #fef2f2;
      color: var(--accent);
      border: 1px solid #fecaca;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 700;
    }

    h1.title-en {
      font-size: 16pt;
      font-weight: 800;
      color: var(--ink);
      margin-bottom: 4px;
    }

    h2.title-kn, h3.title-hi {
      font-size: 12pt;
      font-weight: 600;
      color: #374151;
      margin-bottom: 2px;
    }

    .subtitle {
      font-size: 8.5pt;
      color: var(--subtext);
      font-style: italic;
      margin-top: 6px;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 20px;
      font-size: 8.5pt;
    }

    .meta-cell label {
      display: block;
      font-family: 'Geist Mono', monospace;
      font-size: 7.5pt;
      text-transform: uppercase;
      color: var(--subtext);
      margin-bottom: 2px;
    }

    .meta-cell strong {
      font-size: 9.5pt;
      color: var(--ink);
    }

    .status-section {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 20px;
      font-size: 9pt;
    }

    .status-row {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }

    .scene-box {
      font-family: 'Geist Mono', monospace;
      font-size: 8pt;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      padding: 8px;
      border-radius: 6px;
      margin-top: 6px;
    }

    .section-title {
      font-size: 10.5pt;
      font-weight: 800;
      text-transform: uppercase;
      border-bottom: 2px solid var(--ink);
      padding-bottom: 6px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
    }

    .hazard-card {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      background: #ffffff;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .hazard-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }

    .hazard-cat-tag {
      font-family: 'Geist Mono', monospace;
      font-size: 8pt;
      font-weight: 700;
      color: var(--accent);
      display: block;
    }

    .hazard-title {
      font-size: 11pt;
      font-weight: 700;
      color: var(--ink);
      margin-top: 2px;
    }

    .hazard-badges {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .status-badge {
      font-family: 'Geist Mono', monospace;
      font-size: 8pt;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .risk-badge {
      font-family: 'Geist Mono', monospace;
      font-size: 8pt;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      color: #ffffff;
      text-transform: uppercase;
    }

    .risk-high { background: #dc2626; }
    .risk-medium { background: #d97706; }
    .risk-low { background: #2563eb; }
    .risk-uncertain { background: #6b7280; }

    .section-subhead {
      font-family: 'Geist Mono', monospace;
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--subtext);
      margin-bottom: 4px;
    }

    .evidence-box {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 10px;
      font-size: 8.5pt;
    }

    .evidence-list {
      padding-left: 16px;
      color: #1f2937;
    }

    .rationale-box {
      font-size: 9pt;
      margin-bottom: 10px;
    }

    .rules-row {
      font-family: 'Geist Mono', monospace;
      font-size: 7.5pt;
      color: var(--subtext);
      margin-top: 4px;
    }

    .rule-badge {
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      padding: 1px 4px;
      border-radius: 3px;
      font-weight: 600;
      color: var(--ink);
    }

    .precautions-section {
      border-top: 1px solid #e5e7eb;
      padding-top: 10px;
      margin-top: 10px;
    }

    .precaution-item {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 8px;
      font-size: 8.5pt;
    }

    .precaution-header {
      display: flex;
      justify-content: space-between;
      font-family: 'Geist Mono', monospace;
      font-size: 7.5pt;
      color: #78350f;
      border-bottom: 1px solid #fef3c7;
      padding-bottom: 4px;
      margin-bottom: 6px;
    }

    .provenance-tag {
      background: #ffffff;
      border: 1px solid #fde68a;
      padding: 1px 4px;
      border-radius: 3px;
    }

    .prec-line {
      margin-bottom: 4px;
      line-height: 1.35;
      color: #1c1917;
    }

    .lang-tag {
      display: inline-block;
      font-family: 'Geist Mono', monospace;
      font-size: 7pt;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      margin-right: 4px;
    }

    .en-tag { background: #e5e7eb; color: #1f2937; }
    .kn-tag { background: #ffedd5; color: #9a3412; }
    .hi-tag { background: #dbeafe; color: #1e40af; }

    .gaps-box {
      background: #f9fafb;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 20px;
      font-size: 8.5pt;
    }

    .gap-item {
      border-left: 2px solid #9ca3af;
      padding-left: 8px;
      margin-bottom: 6px;
    }

    footer.print-footer {
      border-top: 2px solid var(--border);
      padding-top: 12px;
      margin-top: 20px;
      text-align: center;
      font-size: 8pt;
      color: var(--subtext);
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .disclaimer-line {
      margin-bottom: 4px;
    }

    .disclaimer-en { font-weight: 600; color: var(--ink); }

    .floating-print-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--ink);
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 9pt;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      z-index: 100;
      font-family: 'Geist Mono', monospace;
    }

    .floating-print-btn:hover {
      background: #252422;
    }

    @media print {
      @page {
        size: A4 portrait;
        margin: 10mm 10mm 12mm 10mm;
      }

      body {
        background: #ffffff !important;
        padding: 0 !important;
      }

      .report-wrapper {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
      }

      .floating-print-btn {
        display: none !important;
      }

      .hazard-card {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>
  <button type="button" class="floating-print-btn" onclick="window.print()">
    🖨️ Print Trilingual PDF (ಮುದ್ರಿಸಿ / प्रिंट)
  </button>

  <div class="report-wrapper">
    <header>
      <div class="top-meta">
        <span class="audit-tag">SENTINEL LENS v2 // TRILINGUAL AUDIT [EN · KN · HI]</span>
        <span>REPORT_ID: ${escapeHtml(report.id)}</span>
      </div>
      <h1 class="title-en">Sentinel Lens Safety Assessment Report</h1>
      <h2 class="title-kn">ಸೆಂಟಿನೆಲ್ ಲೆನ್ಸ್ ಸುರಕ್ಷತಾ ಮೌಲ್ಯಮಾಪನ ವರದಿ</h2>
      <h3 class="title-hi">सेंटिनल लेंस सुरक्षा मूल्यांकन रिपोर्ट</h3>
      <p class="subtitle">Full diagnostic report with evidence citations, risk rule rationale, and verified precautions in English, Kannada, and Hindi.</p>
    </header>

    <section class="meta-grid">
      <div class="meta-cell">
        <label>Report ID / ಐಡಿ / आईडी</label>
        <strong>${escapeHtml(report.id)}</strong>
      </div>
      <div class="meta-cell">
        <label>Timestamp / ದಿನಾಂಕ / दिनांक</label>
        <strong>${escapeHtml(new Date(report.timestamp).toLocaleString())}</strong>
      </div>
      <div class="meta-cell">
        <label>Demographic / ಪ್ರೊಫೈಲ್ / प्रोफ़ाइल</label>
        <strong>${escapeHtml(person.en)}</strong>
        <div style="font-size: 7.5pt; color: #4b5563;">${escapeHtml(person.kn)} · ${escapeHtml(person.hi)}</div>
      </div>
      <div class="meta-cell">
        <label>Overall Risk / ಅಪಾಯ / जोखिम</label>
        <strong>${escapeHtml(risk.en)}</strong>
        <div style="font-size: 7.5pt; color: #4b5563;">${escapeHtml(risk.kn)} · ${escapeHtml(risk.hi)}</div>
      </div>
    </section>

    <section class="status-section">
      <div class="status-row">
        <div>
          <span style="font-size: 7.5pt; text-transform: uppercase; color: var(--subtext); display: block;">Outcome Status / ಫಲಿತಾಂಶ / परिणाम:</span>
          <strong>${escapeHtml(outcome.en)}</strong>
          <span style="color: var(--subtext);">(${escapeHtml(outcome.kn)} / ${escapeHtml(outcome.hi)})</span>
        </div>
        ${verification ? `
        <div style="text-align: right;">
          <span style="font-size: 7.5pt; text-transform: uppercase; color: var(--subtext); display: block;">Verification / ಪರಿಶೀಲನೆ / सत्यापन:</span>
          <strong style="color: #059669;">${escapeHtml(verification.en)}</strong>
        </div>` : ''}
      </div>

      ${report.scene?.summary ? `
      <div class="scene-box">
        <strong>SCENE_ENVIRONMENT / ಗಮನಿಸಿದ ಸನ್ನಿವೇಶ / देखा गया परिवेश:</strong>
        <p>${escapeHtml(report.scene.summary)}</p>
      </div>` : ''}
    </section>

    <section>
      <div class="section-title">
        <span>Identified Hazards &amp; Prescribed Precautions (${report.hazards?.length || 0}) / ಗುರುತಿಸಲಾದ ಅಪಾಯಗಳು / पहचाने गए ख़तरे</span>
        <span style="font-size: 7.5pt; font-family: 'Geist Mono', monospace; font-weight: normal;">EVIDENCE_THRESHOLD: &gt;= 0.70</span>
      </div>

      ${hazardsListHtml}
    </section>

    <section class="gaps-box">
      <div class="section-subhead">COVERAGE_GAPS &amp; LIMITS / ವ್ಯಾಪ್ತಿ ಕೊರತೆಗಳು ಮತ್ತು ಮಿತಿಗಳು / कवरेज कमियां और सीमाएं</div>
      ${gapsHtml}
    </section>

    <footer class="print-footer">
      <div class="disclaimer-line disclaimer-en">[EN] ${escapeHtml(MANDATORY_SAFETY_DISCLAIMERS.en)}</div>
      <div class="disclaimer-line">[KN] ${escapeHtml(MANDATORY_SAFETY_DISCLAIMERS.kn)}</div>
      <div class="disclaimer-line">[HI] ${escapeHtml(MANDATORY_SAFETY_DISCLAIMERS.hi)}</div>
      <div style="margin-top: 8px; font-family: 'Geist Mono', monospace; font-size: 7pt;">
        Sentinel Lens v2 · Deterministic Multi-Agent Verification Architecture · Safety Audit Provenance
      </div>
    </footer>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Downloads a complete standalone Trilingual HTML/PDF Report file.
 */
export function downloadTrilingualHTMLReport(
  report: SafetyReport | AnalysisResult,
  filename?: string
): void {
  const htmlContent = generateTrilingualHTML(report);
  const name =
    filename ||
    `sentinel-lens-trilingual-report-${report.id || new Date().toISOString().slice(0, 10)}.html`;
  downloadFile(htmlContent, name, 'text/html;charset=utf-8;');
}

/**
 * Triggers the browser print dialog cleanly for A4 rendering,
 * ensuring unconstrained layout flow across multiple pages.
 */
export function triggerPrint(): void {
  if (typeof window !== 'undefined' && window.print) {
    try {
      if (typeof document !== 'undefined') {
        document.documentElement.classList.add('printing-active');
      }
      window.print();
    } finally {
      if (typeof document !== 'undefined') {
        setTimeout(() => {
          document.documentElement.classList.remove('printing-active');
        }, 1200);
      }
    }
  }
}
