import React from 'react';
import { AnalysisResult, SafetyReport } from '../../types/api';
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
} from '../../lib/trilingual';

export interface TrilingualPrintReportProps {
  report: SafetyReport | AnalysisResult;
  className?: string;
  isPrintOnly?: boolean;
}

export const TrilingualPrintReport: React.FC<TrilingualPrintReportProps> = ({
  report,
  className = '',
  isPrintOnly = false,
}) => {
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

  const containerClasses = [
    'trilingual-report',
    isPrintOnly ? 'print-only' : '',
    'bg-white text-[#0C0B09] p-6 sm:p-8 max-w-4xl mx-auto space-y-6 font-sans',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={containerClasses}
      data-testid="trilingual-print-report"
      aria-label="Trilingual Safety Assessment Report"
    >
      {/* 1. Trilingual Header */}
      <header className="border-b-2 border-[#0C0B09] pb-4 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2 text-[10px] font-mono tracking-wider uppercase text-gray-600">
          <span className="px-2 py-0.5 rounded bg-gray-100 border border-gray-300 font-bold text-[#FF6542]">
            SENTINEL LENS v2 // TRILINGUAL AUDIT [EN · KN · HI]
          </span>
          <span>REPORT_ID: {report.id}</span>
        </div>

        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0C0B09]">
            Sentinel Lens Safety Assessment Report
          </h1>
          <h2 className="text-base sm:text-lg font-semibold text-gray-800">
            ಸೆಂಟಿನೆಲ್ ಲೆನ್ಸ್ ಸುರಕ್ಷತಾ ಮೌಲ್ಯಮಾಪನ ವರದಿ
          </h2>
          <h3 className="text-base sm:text-lg font-semibold text-gray-800">
            सेंटिनल लेंस सुरक्षा मूल्यांकन रिपोर्ट
          </h3>
        </div>

        <p className="text-xs text-gray-600 italic">
          Full diagnostic report with evidence citations, risk rule rationale, and verified precautions in English, Kannada, and Hindi.
        </p>
      </header>

      {/* 2. Scan Metadata Grid */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs border border-gray-200 rounded-lg p-3 bg-gray-50/70">
        <div>
          <span className="block text-[10px] font-mono uppercase text-gray-500">
            Report ID / ವರದಿ ಐಡಿ / आईडी
          </span>
          <span className="font-mono font-bold text-gray-900 break-all">{report.id}</span>
        </div>

        <div>
          <span className="block text-[10px] font-mono uppercase text-gray-500">
            Timestamp / ದಿನಾಂಕ / दिनांक
          </span>
          <span className="font-semibold text-gray-900">
            {new Date(report.timestamp).toLocaleString()}
          </span>
        </div>

        <div>
          <span className="block text-[10px] font-mono uppercase text-gray-500">
            Demographic / ಪ್ರೊಫೈಲ್ / प्रोफ़ाइल
          </span>
          <div className="space-y-0.5">
            <span className="font-bold text-gray-900 block">{person.en}</span>
            <span className="text-[11px] text-gray-600 block">{person.kn}</span>
            <span className="text-[11px] text-gray-600 block">{person.hi}</span>
          </div>
        </div>

        <div>
          <span className="block text-[10px] font-mono uppercase text-gray-500">
            Overall Risk / ಅಪಾಯ / जोखिम
          </span>
          <div className="space-y-0.5">
            <span
              className={`font-bold uppercase inline-block px-1.5 py-0.5 rounded text-[11px] ${
                report.overall_risk === 'high'
                  ? 'bg-red-100 text-red-800 border border-red-300'
                  : report.overall_risk === 'medium'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-blue-100 text-blue-800 border border-blue-300'
              }`}
            >
              {risk.en}
            </span>
            <span className="text-[11px] text-gray-700 block font-medium">
              {risk.kn} · {risk.hi}
            </span>
          </div>
        </div>
      </section>

      {/* 3. Outcome & Verification Summary */}
      <section className="p-3.5 rounded-lg border border-gray-200 bg-white space-y-2">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2 flex-wrap gap-2">
          <div className="text-xs">
            <span className="text-[10px] font-mono text-gray-500 uppercase block">
              Outcome Status / ಫಲಿತಾಂಶ / परिणाम:
            </span>
            <span className="font-bold text-gray-900">{outcome.en}</span>
            <span className="text-gray-600 ml-2">({outcome.kn} / {outcome.hi})</span>
          </div>

          {verification && (
            <div className="text-xs text-right">
              <span className="text-[10px] font-mono text-gray-500 uppercase block">
                Verification / ಪರಿಶೀಲನೆ / सत्यापन:
              </span>
              <span className="font-semibold text-emerald-700">{verification.en}</span>
            </div>
          )}
        </div>

        {/* Scene context summary */}
        {report.scene?.summary && (
          <div className="text-xs text-gray-700 space-y-1 pt-1">
            <span className="text-[10px] font-mono uppercase text-gray-500 font-bold block">
              SCENE_ENVIRONMENT / ಗಮನಿಸಿದ ಸನ್ನಿವೇಶ / देखा गया परिवेश:
            </span>
            <p className="leading-relaxed bg-gray-50 p-2 rounded border border-gray-200 font-mono text-[11px]">
              {report.scene.summary}
            </p>
          </div>
        )}
      </section>

      {/* 4. Identified Hazards Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b-2 border-[#0C0B09] pb-1.5">
          <h2 className="text-sm font-bold tracking-wider uppercase text-[#0C0B09]">
            Identified Hazards &amp; Prescribed Precautions ({report.hazards?.length || 0}) /
            ಗುರುತಿಸಲಾದ ಅಪಾಯಗಳು ಮತ್ತು ಮುನ್ನೆಚ್ಚರಿಕೆಗಳು /
            पहचाने गए ख़तरे व सावधानियां
          </h2>
          <span className="text-[10px] font-mono text-gray-500">
            AUDIT_EVIDENCE_THRESHOLD: &gt;= 0.70
          </span>
        </div>

        {(!report.hazards || report.hazards.length === 0) ? (
          <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-800 space-y-1">
            <p className="font-bold text-gray-900">
              No hazards observed in this view / ಈ ವೀಕ್ಷಣೆಯಲ್ಲಿ ಯಾವುದೇ ಅಪಾಯಗಳು ಕಂಡುಬಂದಿಲ್ಲ / इस दृश्य में कोई ख़तरा नहीं दिखा
            </p>
            <p className="text-gray-600">
              Based on camera observations, no hazards met the evidence threshold. Hidden spaces or areas outside the frame were not assessed.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {report.hazards.map((hazard, idx) => {
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

              return (
                <div
                  key={hazard.id || idx}
                  className="trilingual-hazard-card p-4 rounded-lg border border-gray-300 bg-white space-y-3 shadow-sm"
                >
                  {/* Hazard Header & Taxonomy Tag */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 pb-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-[#FF6542] block tracking-wide">
                        [{cat.code}: {cat.title.en.toUpperCase()} / {cat.title.kn} / {cat.title.hi}]
                      </span>
                      <h3 className="text-base font-bold text-gray-900 mt-0.5">
                        {hazard.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-100 border border-gray-300 text-gray-800">
                        {statusTri.en} ({hazard.evidence_strength})
                      </span>
                      <span
                        className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                          hazard.risk.level === 'high'
                            ? 'bg-red-600 text-white'
                            : hazard.risk.level === 'medium'
                            ? 'bg-amber-500 text-white'
                            : 'bg-blue-600 text-white'
                        }`}
                      >
                        {hazardRisk.en}
                      </span>
                    </div>
                  </div>

                  {/* Evidentiary Facts & Trigger Source */}
                  <div className="text-xs space-y-1.5 bg-gray-50/80 p-2.5 rounded border border-gray-200">
                    <div className="flex items-center justify-between flex-wrap gap-1 font-mono text-[10px] text-gray-500">
                      <span>EVIDENTIARY_FACTS / ಪುರಾವೆ / साक्ष्य</span>
                      {hazard.trigger && <span>TRIGGER: {hazard.trigger}</span>}
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-gray-800 pl-1 text-[11px]">
                      {hazard.evidence.map((ev, eIdx) => (
                        <li key={eIdx}>{ev}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Risk Rationale & Auditable Rule IDs */}
                  <div className="text-xs space-y-1 text-gray-800">
                    <div className="font-mono text-[10px] uppercase text-gray-500 font-bold">
                      RISK_RATIONALE / ಅಪಾಯದ ವಿವರಣೆ / जोखिम का कारण:
                    </div>
                    <p className="text-gray-700 leading-snug">{hazard.risk.rationale}</p>
                    {hazard.risk.rule_ids && hazard.risk.rule_ids.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-600 mt-1">
                        <span>AUDITABLE_RULES:</span>
                        {hazard.risk.rule_ids.map((r) => (
                          <span
                            key={r}
                            className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-300 font-semibold text-gray-900"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Prescribed Precautions in 3 Languages */}
                  {hazard.precautions && hazard.precautions.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-gray-200">
                      <div className="flex items-center justify-between text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                        <span>
                          Prescribed Precautions (EN / KN / HI) / ನಿರ್ದೇಶಿತ ಮುನ್ನೆಚ್ಚರಿಕೆಗಳು / अनुशंसित सावधानियां
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          PROVENANCE_REQUIRED (Rule R8)
                        </span>
                      </div>

                      <div className="space-y-2">
                        {hazard.precautions.map((prec, pIdx) => {
                          const precTri = getPrecautionTrilingual(prec, hazard.category_id);
                          return (
                            <div
                              key={pIdx}
                              className="p-2.5 rounded bg-amber-50/40 border border-amber-200/80 space-y-1.5 text-xs text-gray-900"
                            >
                              <div className="flex items-center justify-between gap-2 border-b border-amber-200/60 pb-1">
                                <span className="font-mono text-[10px] font-bold text-gray-600">
                                  PRECAUTION #{pIdx + 1}
                                </span>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white border border-gray-300 text-gray-700">
                                  {prec.provenance === 'guideline'
                                    ? `GUIDELINE: ${prec.guideline_id || 'VERIFIED'}`
                                    : 'GENERIC PRECAUTION'}
                                </span>
                              </div>

                              {/* English */}
                              <div className="flex items-start gap-2">
                                <span className="font-mono font-bold text-[10px] px-1 rounded bg-gray-200 text-gray-800 shrink-0 mt-0.5">
                                  EN
                                </span>
                                <p className="font-medium text-gray-900 leading-snug">
                                  {precTri.en}
                                </p>
                              </div>

                              {/* Kannada */}
                              <div className="flex items-start gap-2">
                                <span className="font-mono font-bold text-[10px] px-1 rounded bg-orange-100 text-orange-900 shrink-0 mt-0.5">
                                  KN
                                </span>
                                <p className="text-gray-800 leading-snug">
                                  {precTri.kn}
                                </p>
                              </div>

                              {/* Hindi */}
                              <div className="flex items-start gap-2">
                                <span className="font-mono font-bold text-[10px] px-1 rounded bg-blue-100 text-blue-900 shrink-0 mt-0.5">
                                  HI
                                </span>
                                <p className="text-gray-800 leading-snug">
                                  {precTri.hi}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Coverage Gaps & Limitations (3 Languages) */}
      <section className="p-3.5 rounded-lg border border-gray-200 bg-gray-50/80 space-y-2 text-xs">
        <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-gray-600">
          COVERAGE_GAPS &amp; LIMITS / ವ್ಯಾಪ್ತಿ ಕೊರತೆಗಳು ಮತ್ತು ಮಿತಿಗಳು / कवरेज कमियां और सीमाएं
        </h4>

        <div className="space-y-1.5">
          {coverageGaps.map((gap, gIdx) => (
            <div key={gIdx} className="space-y-0.5 text-gray-700 pl-1 border-l-2 border-gray-300">
              <p className="font-medium text-gray-800">• [EN] {gap.en}</p>
              <p className="text-[11px] text-gray-600">• [KN] {gap.kn}</p>
              <p className="text-[11px] text-gray-600">• [HI] {gap.hi}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 6. Mandatory Rule R1 Safety Precaution Disclaimers (design.md §11) */}
      <footer className="print-disclaimer border-t-2 border-gray-400 pt-3 space-y-1.5 text-center text-xs text-gray-700">
        <p className="font-semibold text-gray-900">
          [EN] {MANDATORY_SAFETY_DISCLAIMERS.en}
        </p>
        <p className="text-[11px] text-gray-700">
          [KN] {MANDATORY_SAFETY_DISCLAIMERS.kn}
        </p>
        <p className="text-[11px] text-gray-700">
          [HI] {MANDATORY_SAFETY_DISCLAIMERS.hi}
        </p>
        <div className="text-[10px] font-mono text-gray-500 pt-1">
          Sentinel Lens v2 · Multi-Agent Verification Architecture · Safety Audit Provenance
        </div>
      </footer>
    </article>
  );
};
