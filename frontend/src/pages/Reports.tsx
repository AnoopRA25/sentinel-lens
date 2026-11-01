import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { AnalysisResult, Language } from '../types/api';
import { RiskIndicator } from '../components/hazards/RiskIndicator';
import { CoverageNotes } from '../components/report/CoverageNotes';
import { NotifyChip } from '../components/report/NotifyChip';
import { TrilingualPrintReport } from '../components/report/TrilingualPrintReport';
import {
  exportToCSV,
  exportToJSON,
  downloadTrilingualHTMLReport,
  triggerPrint,
} from '../lib/exporters';
import { useHistory } from '../hooks/useHistory';
import {
  FileText,
  Printer,
  Download,
  BookOpen,
  Calendar,
  User,
  HelpCircle,
  Terminal,
  Languages,
} from 'lucide-react';
import { useTranslation } from '../i18n';

interface ReportsPageProps {
  currentLanguage: Language;
  onLanguageChange: (lang: Language) => void;
}

export const Reports: React.FC<ReportsPageProps> = ({
  currentLanguage,
  onLanguageChange,
}) => {
  const {
    t,
    translateResult,
    formatTaxonomyTag,
    getStatusLabel,
    getPersonLabel,
    getEvidenceLabel,
  } = useTranslation();
  const location = useLocation();
  const { history } = useHistory();

  // Pick report passed via route state, or default to newest history item
  const passedReport = location.state?.report as AnalysisResult | undefined;
  const [selectedReportId, setSelectedReportId] = useState<string>(
    passedReport?.id || (history.length > 0 ? history[0].id : '')
  );
  const [viewMode, setViewMode] = useState<'standard' | 'trilingual'>('standard');

  const activeReport =
    passedReport && passedReport.id === selectedReportId
      ? passedReport
      : history.find((h) => h.id === selectedReportId) || passedReport || history[0];

  const localizedReport = useMemo(() => {
    return activeReport ? translateResult(activeReport, currentLanguage) : null;
  }, [activeReport, currentLanguage, translateResult]);

  const displayReport: AnalysisResult = (localizedReport || activeReport) as AnalysisResult;

  const handlePrint = () => {
    triggerPrint();
  };

  const handleDownloadTrilingual = () => {
    if (activeReport) {
      downloadTrilingualHTMLReport(activeReport);
    }
  };

  const handleExportCsv = () => {
    if (activeReport) {
      exportToCSV(activeReport, `hazard-report-${activeReport.id}.csv`);
    }
  };

  const handleExportJson = () => {
    if (activeReport) {
      exportToJSON(activeReport);
    }
  };

  return (
    <div className="w-full h-full p-4 sm:p-6 overflow-y-auto space-y-6 max-w-4xl mx-auto report-page font-mono text-[#FBFAF9]">
      {/* CLI Action Bar (hidden on print) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#151513] pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#898580] uppercase tracking-[0.2em] mb-1">
            <Terminal className="w-3.5 h-3.5 text-[#FF6542]" />
            <span>AUDIT_DISPATCH // COMPLIANCE_REPORT</span>
          </div>
          <h1 className="text-xl font-bold text-[#FBFAF9] font-display flex items-center gap-2">
            <span>{t('ui_messages.report_title', 'Precaution & Risk Assessment Report')}</span>
          </h1>
          <p className="text-xs text-[#898580] mt-1">
            Full diagnostic report with evidence citations, risk rule rationale, and verified precautions.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle: Standard vs Trilingual */}
          <div className="flex items-center bg-[#252422] border border-[#151513] rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('standard')}
              className={`px-2 py-1 rounded-md transition-colors ${
                viewMode === 'standard'
                  ? 'bg-[#353431] text-[#FBFAF9] font-bold'
                  : 'text-[#898580] hover:text-[#FBFAF9]'
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setViewMode('trilingual')}
              className={`px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                viewMode === 'trilingual'
                  ? 'bg-[#FF6542] text-white font-bold'
                  : 'text-[#898580] hover:text-[#FBFAF9]'
              }`}
              title="View full report across English, Kannada, and Hindi"
            >
              <Languages className="w-3 h-3" />
              <span>Trilingual (3 Languages)</span>
            </button>
          </div>

          {/* Language Selector */}
          <select
            value={currentLanguage}
            onChange={(e) => onLanguageChange(e.target.value as Language)}
            className="bg-[#252422] border border-[#151513] rounded-lg px-2.5 py-1.5 text-xs text-[#FBFAF9] font-mono focus:outline-none focus:border-[#FF6542] cursor-pointer"
          >
            <option value="en">English (EN)</option>
            <option value="kn">ಕನ್ನಡ (Kannada)</option>
            <option value="hi">हिन्दी (Hindi)</option>
          </select>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!activeReport}
            className="btn-dark-solid bg-[#353431] hover:bg-[#151513] text-[#FBFAF9] rounded-lg px-2.5 py-1.5 text-xs border border-[#151513] flex items-center gap-1 cursor-pointer disabled:opacity-40"
            title="Download report as CSV"
          >
            <Download className="w-3.5 h-3.5 text-[#898580]" />
            <span>CSV</span>
          </button>

          {/* Export JSON Button */}
          <button
            type="button"
            onClick={handleExportJson}
            disabled={!activeReport}
            className="btn-dark-solid bg-[#353431] hover:bg-[#151513] text-[#FBFAF9] rounded-lg px-2.5 py-1.5 text-xs border border-[#151513] flex items-center gap-1 cursor-pointer disabled:opacity-40"
            title="Download report as JSON"
          >
            <Download className="w-3.5 h-3.5 text-[#898580]" />
            <span>JSON</span>
          </button>

          {/* Download Full Report (3 Languages) Button */}
          <button
            type="button"
            onClick={handleDownloadTrilingual}
            disabled={!activeReport}
            className="btn-dark-solid bg-[#353431] hover:bg-[#151513] text-[#FBFAF9] rounded-lg px-3 py-1.5 text-xs border border-[#151513] flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            title="Download Full Report in 3 Languages (HTML / Standalone PDF printable)"
          >
            <Download className="w-3.5 h-3.5 text-[#FF6542]" />
            <span>Download Full Report (3 Languages)</span>
          </button>

          {/* Print Trilingual PDF Button */}
          <button
            type="button"
            onClick={handlePrint}
            disabled={!activeReport}
            className="btn-hero-primary bg-[#FBFAF9] text-[#353431] hover:bg-[#FBF9F9] rounded-lg px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 shadow-sm"
            title="Print Trilingual PDF across standard A4 pages"
          >
            <Printer className="w-3.5 h-3.5 text-[#FF6542]" />
            <span>Print Trilingual PDF</span>
          </button>
        </div>
      </div>

      {/* Language Fallback Notice (Rule R13) */}
      {(currentLanguage === 'kn' || currentLanguage === 'hi') && (
        <div className="no-print p-3 rounded-xl bg-[#252422] border border-[#151513] text-xs text-[#898580] flex items-start gap-2.5">
          <HelpCircle className="w-4 h-4 text-[#FF6542] flex-shrink-0 mt-0.5" />
          <p>
            Language set to {currentLanguage === 'kn' ? 'Kannada (ಕನ್ನಡ)' : 'Hindi (हिन्दी)'}.
            If translation of custom scene perception is unavailable, verified English text is preserved.
          </p>
        </div>
      )}

      {/* Report Selector if multiple exist in history */}
      {history.length > 1 && (
        <div className="no-print flex items-center gap-2 text-xs">
          <span className="text-[#898580]">Select Scan:</span>
          <select
            value={selectedReportId}
            onChange={(e) => setSelectedReportId(e.target.value)}
            className="bg-[#252422] border border-[#151513] rounded-lg px-2.5 py-1 text-[#FBFAF9] text-xs font-mono"
          >
            {history.map((scan) => (
              <option key={scan.id} value={scan.id}>
                {new Date(scan.timestamp).toLocaleString()} - {scan.person_category} ({scan.overall_risk})
              </option>
            ))}
          </select>
        </div>
      )}

      {activeReport ? (
        <>
          {/* Trilingual Report: rendered when in trilingual mode on-screen */}
          {viewMode === 'trilingual' ? (
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-300">
              <TrilingualPrintReport report={activeReport} />
            </div>
          ) : (
            /* Standard Screen View: hidden when printing so trilingual report prints cleanly */
            <article className="no-print card-print rounded-2xl bg-[#252422] border border-[#151513] p-6 space-y-6 text-[#FBFAF9] shadow-2xl">
              {/* Report Header Metadata */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#151513] pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-mono tracking-wider text-[#898580]">
                      REPORT_ID: {displayReport.id}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#181818] border border-[#151513] text-[10px] text-[#FF6542]">
                      VERIFIED_LOG
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-[#FBFAF9] font-display mt-1">
                    {t('ui_messages.safety_hazard_report', 'Safety Hazard Assessment Report')}
                  </h2>
                  <div className="flex items-center gap-4 text-xs text-[#898580] mt-2">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#898580]" />
                      {new Date(displayReport.timestamp).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-[#898580]" />
                      {t('ui_messages.person_target', 'Demographic')}: <strong className="text-[#FBFAF9] capitalize">{getPersonLabel(displayReport.person_category, currentLanguage)}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  <RiskIndicator riskLevel={displayReport.overall_risk} size="lg" />
                  {displayReport.notification && (
                    <NotifyChip
                      status={displayReport.notification.status}
                      reason={displayReport.notification.reason || undefined}
                    />
                  )}
                </div>
              </div>

              {/* Scene Summary */}
              {displayReport.scene && (
                <div className="p-3.5 rounded-xl bg-[#181818] border border-[#151513] text-xs space-y-1">
                  <span className="text-[#898580] font-semibold block text-[11px] uppercase tracking-wider">
                    {t('ui_messages.observed_scene_environment', 'Observed Scene Environment')}:
                  </span>
                  <p className="text-[#FBFAF9] leading-relaxed">{displayReport.scene.summary}</p>
                </div>
              )}

              {/* Outcome Status Banners (Rule R1: never safe/no danger/all clear) */}
              {displayReport.outcome === 'none_observed' && (
                <div className="p-4 rounded-xl bg-[#181818] border border-[#151513] text-xs space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#7FA7D6]" />
                    <h3 className="font-bold text-[#FBFAF9]">{t('outcomes.none_observed', 'No hazards observed in this view')}</h3>
                  </div>
                  <p className="text-[#898580]">
                    {t('ui_messages.none_observed_msg', "Based on what the camera saw, no hazards meeting the evidence threshold were found. Parts of the room or objects concealed from view were not assessed.")}
                  </p>
                </div>
              )}

              {activeReport.outcome === 'failed' && (
                <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/40 text-xs text-[#FBFAF9] space-y-1.5">
                  <h3 className="font-bold text-red-400">{t('outcomes.failed', 'Analysis Did Not Complete (Unverified)')}</h3>
                  <p className="text-[#898580]">
                    {t('ui_messages.failed_msg', 'This scan failed before full verification. No safety inference should be made from this result.')}
                  </p>
                </div>
              )}

              {/* Hazards Section */}
              {displayReport.hazards && displayReport.hazards.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-[#151513] pb-2">
                    <h3 className="text-sm font-bold text-[#FBFAF9]">
                      {t('ui_messages.identified_hazards_heading', 'Identified Hazards')} ({displayReport.hazards.length})
                    </h3>
                    <span className="text-[11px] text-[#898580]">
                      EVIDENCE_THRESHOLD: &gt;= 0.70
                    </span>
                  </div>

                  <div className="space-y-4">
                    {displayReport.hazards.map((h, idx) => (
                      <div
                        key={h.id || idx}
                        className="p-4 rounded-xl bg-[#181818] border border-[#151513] space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[10px] text-[#FF6542] font-mono uppercase tracking-wider block">
                              {formatTaxonomyTag(h.category_id, currentLanguage)}
                            </span>
                            <h4 className="text-sm font-bold text-[#FBFAF9] mt-0.5">{h.title}</h4>
                          </div>
                          <RiskIndicator riskLevel={h.risk.level} potentialLevel={h.risk.potential_level} size="sm" />
                        </div>

                        {/* Status & Evidence (Rule R2) */}
                        <div className="text-xs space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[#898580]">{t('ui_messages.evidence', 'Evidence Status')}:</span>
                            <span className="capitalize px-2 py-0.5 rounded bg-[#252422] border border-[#151513] text-[#FBFAF9]">
                              {getStatusLabel(h.status, currentLanguage)} ({getEvidenceLabel(h.evidence_strength, currentLanguage)})
                            </span>
                            {h.trigger && (
                              <span className="text-[#898580]">
                                • Trigger: <strong className="text-[#FBFAF9]">{h.trigger}</strong>
                              </span>
                            )}
                          </div>
                          <ul className="list-disc list-inside text-[#898580] pl-1 space-y-0.5">
                            {h.evidence.map((ev, i) => (
                              <li key={i}>{ev}</li>
                            ))}
                          </ul>
                        </div>

                        {/* Risk Rationale & Rule IDs (Rule R4, R5) */}
                        <div className="p-3 rounded-lg bg-[#252422] border border-[#151513] text-xs">
                          <p className="text-[#FBFAF9]">{h.risk.rationale}</p>
                          {h.risk.rule_ids && (
                            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[#898580] flex-wrap">
                              <span>{t('ui_messages.rules_applied', 'Auditable Rules:')}</span>
                              {h.risk.rule_ids.map((r) => (
                                <span
                                  key={r}
                                  className="px-2 py-0.5 rounded bg-[#181818] border border-[#151513] text-[#FF6542] font-semibold"
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Precautions (Rule R8: Provenance required) */}
                        <div className="text-xs space-y-1.5">
                          <span className="text-[#898580] font-semibold flex items-center gap-1 text-[11px] uppercase tracking-wider">
                            <BookOpen className="w-3.5 h-3.5 text-[#FF6542]" />
                            <span>{t('ui_messages.precautions_heading', 'Prescribed Precautions')}:</span>
                          </span>
                          <div className="space-y-1.5">
                            {h.precautions.map((p, pIdx) => (
                              <div
                                key={pIdx}
                                className="p-2.5 rounded-lg bg-[#252422] border border-[#151513] flex items-start justify-between gap-2"
                              >
                                <span className="text-[#FBFAF9]">{p.text}</span>
                                <span className="text-[10px] text-[#FF6542] px-1.5 py-0.5 rounded bg-[#181818] border border-[#151513] uppercase tracking-wider flex-shrink-0">
                                  [{p.provenance === 'guideline' ? `${t('ui_messages.provenance_guideline', 'Guideline')}${p.guideline_id ? ` · ${p.guideline_id}` : ''}` : t('ui_messages.provenance_generic', 'Generic')}]
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Coverage Gaps & Limits */}
              <CoverageNotes
                coverageGaps={displayReport.scene?.coverage_gaps}
                limits={displayReport.limits}
              />

              {/* Mandatory Safety Precaution Disclaimer Footer (design.md §11 & Rule R1) */}
              <footer className="pt-4 border-t border-[#151513] text-center text-[11px] text-[#898580] italic">
                {t('ui_messages.footer_limits', 'This report is based on the image(s) analyzed and does not guarantee safety. It cannot assess anything outside the frame.')}
              </footer>
            </article>
          )}

          {/* Dedicated print-only Trilingual Report container: rendered whenever user invokes Print */}
          {viewMode === 'standard' && (
            <TrilingualPrintReport isPrintOnly report={activeReport} />
          )}
        </>
      ) : (
        <div className="p-8 rounded-2xl bg-[#252422] border border-[#151513] text-center text-xs text-[#898580] space-y-2">
          <FileText className="w-8 h-8 text-[#353431] mx-auto" />
          <p className="font-semibold text-[#FBFAF9]">No report available</p>
          <p>Perform a scan in Photo, Video, or Live mode to view detailed reports here.</p>
        </div>
      )}
    </div>
  );
};
