import React from 'react';
import { AnalysisResult } from '../../types/api';
import { RiskIndicator } from '../hazards/RiskIndicator';
import { NotifyChip } from './NotifyChip';
import { CoverageNotes } from './CoverageNotes';
import { downloadTrilingualHTMLReport, triggerPrint } from '../../lib/exporters';
import { TrilingualPrintReport } from './TrilingualPrintReport';
import { useTranslation } from '../../i18n';

export interface ReportViewProps {
  result: AnalysisResult;
  onPrint?: () => void;
  className?: string;
}

export const ReportView: React.FC<ReportViewProps> = ({
  result,
  onPrint = () => triggerPrint(),
  className = '',
}) => {
  const {
    t,
    language,
    formatTaxonomyTag,
    getStatusLabel,
    getPersonLabel,
    getOutcomeLabel,
    translateResult,
  } = useTranslation();

  const activeResult = translateResult(result, language);

  return (
    <div
      className={`p-6 sm:p-8 rounded-xl bg-ink-900 border border-ink-700 text-mist-100 max-w-4xl mx-auto space-y-6 ${className}`}
      lang={activeResult.language}
      data-testid="report-view"
    >
      {/* 1. Print controls header (screen only) */}
      <div className="no-print flex items-center justify-between border-b border-ink-700 pb-4">
        <div>
          <h2 className="text-lg font-bold text-mist-100">{t('ui_messages.safety_hazard_report', 'Safety Hazard Assessment Report')}</h2>
          <p className="text-xs text-mist-400">Ready for export, review, or A4 printing (Trilingual EN / KN / HI)</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => downloadTrilingualHTMLReport(activeResult)}
            className="px-3 py-2 rounded-btn bg-ink-800 border border-ink-700 text-mist-100 font-semibold text-xs hover:bg-ink-700 transition-colors flex items-center space-x-1.5 shadow-sm"
            title="Download full Trilingual Report (English, Kannada, Hindi)"
          >
            <span>Trilingual PDF</span>
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="px-4 py-2 rounded-btn bg-signal-cyan text-ink-900 font-semibold text-xs hover:bg-white transition-colors flex items-center space-x-1.5 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>{t('ui_messages.print_save_pdf', 'Print / Save PDF')}</span>
          </button>
        </div>
      </div>

      {/* 2. Formal Report Header */}
      <div className="report-section space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-ink-700/80 pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-mist-100">
              {t('ui_messages.hazard_precaution_advisor_assessment', 'Hazard Precaution Advisor Assessment')}
            </h1>
            <p className="font-condensed text-xs text-mist-400 mt-0.5">
              ID: {activeResult.id} · Timestamp: {new Date(activeResult.timestamp).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <RiskIndicator riskLevel={activeResult.overall_risk} size="lg" />
            {activeResult.notification && (
              <NotifyChip notification={activeResult.notification} />
            )}
          </div>
        </div>

        {/* Target Profile Metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2 rounded bg-ink-800 border border-ink-700">
            <span className="text-mist-400 block font-condensed uppercase text-[10px]">{t('ui_messages.person_target', 'Person Target')}</span>
            <span className="font-bold capitalize text-mist-100">{getPersonLabel(activeResult.person_category, language)}</span>
          </div>
          <div className="p-2 rounded bg-ink-800 border border-ink-700">
            <span className="text-mist-400 block font-condensed uppercase text-[10px]">{t('ui_messages.language_label', 'Language')}</span>
            <span className="font-bold uppercase text-mist-100">{activeResult.language}</span>
          </div>
          <div className="p-2 rounded bg-ink-800 border border-ink-700">
            <span className="text-mist-400 block font-condensed uppercase text-[10px]">{t('ui_messages.outcome_status', 'Outcome Status')}</span>
            <span className="font-bold capitalize text-mist-100">{getOutcomeLabel(activeResult.outcome, language)}</span>
          </div>
          <div className="p-2 rounded bg-ink-800 border border-ink-700">
            <span className="text-mist-400 block font-condensed uppercase text-[10px]">{t('ui_messages.hazards_count', 'Hazards Count')}</span>
            <span className="font-bold text-mist-100 font-condensed">{activeResult.hazards?.length || 0}</span>
          </div>
        </div>
      </div>

      {/* 3. Scene Summary */}
      {activeResult.scene && (
        <div className="report-section p-4 rounded-lg bg-ink-800/80 border border-ink-700 space-y-1.5 text-xs sm:text-sm">
          <h4 className="font-semibold text-mist-400 uppercase tracking-wider text-[11px]">
            {t('ui_messages.observed_scene_environment', 'Observed Scene Environment')}
          </h4>
          <p className="text-mist-100 leading-relaxed">
            {activeResult.scene.summary || 'Scene assessed from captured image frame.'}
          </p>
          {activeResult.scene.environment && (
            <span className="inline-block mt-1 font-condensed text-[11px] px-2 py-0.5 rounded bg-ink-700 text-mist-300">
              Setting: {activeResult.scene.environment}
            </span>
          )}
        </div>
      )}

      {/* 4. Hazards and Precautions Listing */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-mist-400">
          {t('ui_messages.identified_hazards_heading', 'Identified Hazards & Precautions')} ({activeResult.hazards?.length || 0})
        </h3>

        {(!activeResult.hazards || activeResult.hazards.length === 0) ? (
          <div className="p-4 rounded-lg bg-ink-800 border border-ink-700 text-sm text-mist-300">
            {t('ui_messages.none_observed_msg', "No hazards observed in this view. Parts of the room weren't visible.")}
          </div>
        ) : (
          <div className="space-y-4">
            {activeResult.hazards.map((h) => (
              <div
                key={h.id}
                className="hazard-card p-4 rounded-lg bg-ink-800 border border-ink-700 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-ink-700/60 pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-condensed text-xs px-2 py-0.5 rounded bg-ink-900 text-mist-400 border border-ink-700">
                      {formatTaxonomyTag(h.category_id, language)}
                    </span>
                    <h4 className="text-base font-bold text-mist-100">{h.title}</h4>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs uppercase text-mist-400 font-condensed">
                      {t('ui_messages.status', 'Status')}: {getStatusLabel(h.status, language)}
                    </span>
                    <RiskIndicator riskLevel={h.risk.level} size="sm" />
                  </div>
                </div>

                {/* Evidence & Rationale */}
                <div className="space-y-1 text-xs">
                  <div className="text-mist-200">
                    <strong className="text-mist-400">{t('ui_messages.evidence', 'Evidence')}: </strong>
                    {h.evidence?.join('; ') || 'Visible in scene'}
                  </div>
                  <div className="text-mist-300">
                    <strong className="text-mist-400">{t('ui_messages.risk_rationale', 'Risk Rationale')}: </strong>
                    {h.risk.rationale}
                  </div>
                  {h.risk.rule_ids && (
                    <div className="text-mist-400 font-condensed text-[11px]">
                      {t('ui_messages.rules_applied', 'Rules:')} {h.risk.rule_ids.join(', ')}
                    </div>
                  )}
                </div>

                {/* Precautions with Provenance */}
                {h.precautions && h.precautions.length > 0 && (
                  <div className="pt-2 border-t border-ink-700/60 space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-mist-400">
                      {t('ui_messages.precautions_heading', 'Precautions')}:
                    </span>
                    <ul className="space-y-1">
                      {h.precautions.map((p, pIdx) => (
                        <li
                          key={pIdx}
                          className="text-xs text-mist-100 flex items-start justify-between gap-2 bg-ink-900/60 p-2 rounded"
                        >
                          <span className="leading-snug">{p.text}</span>
                          <span className="shrink-0 font-condensed text-[10px] text-mist-400 px-1.5 py-0.5 rounded bg-ink-800 border border-ink-700">
                            {p.provenance === 'guideline'
                              ? `${t('ui_messages.provenance_guideline', 'Guideline')} ${p.guideline_id || ''}`.trim()
                              : t('ui_messages.provenance_generic', 'Generic')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Coverage Notes & Limits */}
      <CoverageNotes
        coverageGaps={activeResult.scene?.coverage_gaps}
        limits={activeResult.limits}
      />

      {/* 6. Mandatory Static Disclaimer Footer (Rule R1 / design.md §11) */}
      <div className="report-footer pt-4 border-t border-ink-700 text-center text-xs text-mist-400 space-y-1">
        <p className="font-medium text-mist-300">
          {t('ui_messages.footer_limits', 'This report is based on the image(s) analyzed and does not guarantee safety. It cannot assess anything outside the frame.')}
        </p>
        <p className="font-condensed text-[11px]">
          Sentinel Lens v2 · Deterministic Rule Engine & Multi-Agent Verification Architecture
        </p>
      </div>

      {/* Trilingual multi-page print container */}
      <TrilingualPrintReport isPrintOnly report={activeResult} />
    </div>
  );
};
