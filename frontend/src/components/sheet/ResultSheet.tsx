import React, { useState, useRef, useEffect } from 'react';
import { AnalysisResult, Hazard } from '../../types/api';
import { HazardRow } from '../hazards/HazardRow';
import { HazardDetail } from '../hazards/HazardDetail';
import { RiskIndicator } from '../hazards/RiskIndicator';
import { formatTaxonomyTag } from '../hazards/taxonomy';
import { CoverageNotes } from '../report/CoverageNotes';
import { NotifyChip } from '../report/NotifyChip';
import { useTranslation } from '../../i18n';

import {
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Bookmark,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Languages,
} from 'lucide-react';
import { downloadTrilingualHTMLReport } from '../../lib/exporters';

import { useNavigate } from 'react-router-dom';

export type SnapPoint = 'peek' | 'half' | 'full';

interface ResultSheetProps {
  result: AnalysisResult | null;
  onRescan: () => void;
  onSave?: (result: AnalysisResult) => void;
  isDesktop?: boolean;
  onSnapChange?: (snap: SnapPoint) => void;
  initialSnap?: SnapPoint;
}

/**
 * Terminal Ember 3-Snap-Point Result Bottom Sheet
 * Implements dark #252422 surface, hairline #151513 borders, monospace counter,
 * handwritten Kalam annotation, Cream Note Card paper island (§133),
 * full fail-closed safety messaging (Rule R1), and touch-friendly mobile gestures.
 */
export const ResultSheet: React.FC<ResultSheetProps> = ({
  result,
  onRescan,
  onSave,
  isDesktop = false,
  onSnapChange,
  initialSnap = 'half',
}) => {
  const [snap, setSnap] = useState<SnapPoint>(initialSnap);
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const navigate = useNavigate();
  const { t, language } = useTranslation();

  // Notify parent on snap changes
  const updateSnap = (newSnap: SnapPoint) => {
    setSnap(newSnap);
    onSnapChange?.(newSnap);
  };

  useEffect(() => {
    onSnapChange?.(snap);
  }, []);

  if (!result) return null;

  const totalHazards = result.hazards?.length || 0;
  const confirmedCount = (result.hazards || []).filter(
    (h) => h.status === 'observed'
  ).length;
  const toCheckCount = (result.hazards || []).filter(
    (h) => h.status === 'possible' || h.status === 'likely'
  ).length;

  const handleToggleSnap = () => {
    if (snap === 'peek') updateSnap('half');
    else if (snap === 'half') updateSnap('full');
    else updateSnap('half');
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    // Swipe up (> 40px)
    if (deltaY < -40) {
      if (snap === 'peek') updateSnap('half');
      else if (snap === 'half') updateSnap('full');
    } else if (deltaY > 40) {
      // Swipe down (> 40px)
      if (snap === 'full') updateSnap('half');
      else if (snap === 'half') updateSnap('peek');
    }
  };

  const handleSave = () => {
    if (onSave && result) {
      onSave(result);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    }
  };

  // Mobile height classes for 3 snap points
  const getSnapHeightClass = () => {
    if (isDesktop) return 'h-full';
    switch (snap) {
      case 'peek':
        return 'h-14 sm:h-16';
      case 'half':
        return 'h-[58dvh] sm:h-[56vh]';
      case 'full':
        return 'h-[92dvh] sm:h-[92vh]';
    }
  };

  const isHighRisk = result.overall_risk === 'high';

  // Determine whether to display the signature Editorial Cream Note Card (§133)
  const showCreamCard =
    (result.outcome === 'hazards_found' && (totalHazards > 0 || result.verification?.status === 'passed')) ||
    result.immediate_action ||
    (result.outcome === 'none_observed' && result.verification?.status === 'passed');

  return (
    <section
      aria-label="Analysis Results"
      aria-live="polite"
      role={isHighRisk ? 'alert' : 'region'}
      className={`w-full bg-[#252422] border-t border-[#151513] sm:border sm:border-[#151513] rounded-t-3xl sm:rounded-2xl shadow-2xl transition-all duration-300 flex flex-col font-mono ${
        isDesktop
          ? 'z-20 relative'
          : snap === 'peek'
          ? 'fixed inset-x-0 bottom-[60px] sm:relative sm:bottom-auto z-30 rounded-t-2xl sm:rounded-2xl border border-[#151513] bg-[#252422]/95 backdrop-blur-md'
          : 'fixed inset-x-0 bottom-0 z-40 sm:relative sm:inset-auto sm:z-20'
      } ${getSnapHeightClass()}`}
    >
      {/* 1. Grab handle bar for 3-snap-point mobile interaction */}
      {!isDesktop && (
        <button
          type="button"
          onClick={handleToggleSnap}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          aria-label={`Toggle result sheet height. Current: ${snap}`}
          className="w-full pt-2.5 pb-1 flex flex-col items-center justify-center focus:outline-none focus:ring-1 focus:ring-[#FF6542] rounded-t-3xl cursor-pointer select-none touch-manipulation active:opacity-75"
        >
          <div className="w-12 h-1.5 rounded-full bg-[#353431] hover:bg-[#898580] transition-colors" />
        </button>
      )}

      {/* 2. Header bar: Monospace headline and findings counter */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={snap === 'peek' ? handleToggleSnap : undefined}
        className={`px-4 py-2 sm:py-2.5 border-b border-[#151513] flex items-center justify-between gap-3 shrink-0 ${
          snap === 'peek' ? 'cursor-pointer select-none' : ''
        }`}
      >
        <div className="flex-1 min-w-0">
          {result.outcome === 'failed' ? (
            <div className="flex items-center gap-2 text-[#FF6542]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p className="font-mono text-xs font-bold tracking-tight">
                {t('ui_messages.analysis_failed', '[ANALYSIS FAILED // FAIL-CLOSED]')}
              </p>
            </div>
          ) : result.outcome === 'inconclusive' ? (
            <div className="flex items-center gap-2 text-[#F5A524]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p className="font-mono text-xs font-bold tracking-tight">
                {t('ui_messages.analysis_inconclusive', '[ANALYSIS INCONCLUSIVE // FAIL-CLOSED]')}
              </p>
            </div>
          ) : result.outcome === 'none_observed' ? (
            <div className="flex items-center gap-2 text-[#7FA7D6]">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#7FA7D6]" />
              <p className="font-mono text-xs font-semibold text-[#FBFAF9]">
                {t('ui_messages.no_hazards_observed_title', '[NO HAZARDS OBSERVED IN THIS VIEW]')}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-mono text-xs font-bold text-[#FBFAF9] tracking-tight">
                {language === 'en'
                  ? `[${totalHazards} ${totalHazards === 1 ? 'HAZARD' : 'HAZARDS'} DETECTED]`
                  : `[${totalHazards} ${t(totalHazards === 1 ? 'ui_messages.hazard_singular' : 'ui_messages.hazard_plural', 'HAZARDS')} ${language === 'kn' ? 'ಪತ್ತೆಯಾಗಿದೆ' : 'पाए गए'}]`}
              </p>
              <span className="font-mono text-[11px] text-[#898580]">
                ({t('ui_messages.confirmed_hazards', { count: confirmedCount }, `${confirmedCount} confirmed`)} · {t('ui_messages.hazards_to_check', { count: toCheckCount }, `${toCheckCount} to check`)})
              </span>
              {result.notification && (
                <NotifyChip
                  status={result.notification.status}
                  reason={result.notification.reason || undefined}
                />
              )}
            </div>
          )}
        </div>

        {/* Risk badge and snap chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <RiskIndicator level={result.overall_risk} size="sm" />
          {!isDesktop && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleSnap();
              }}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded text-[#898580] hover:text-[#FBFAF9] hover:bg-[#353431] transition-colors touch-manipulation cursor-pointer"
              title={snap === 'full' ? 'Collapse sheet' : 'Expand sheet'}
              aria-label={snap === 'full' ? 'Collapse sheet' : 'Expand sheet'}
            >
              {snap === 'full' ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* 3. Sheet Content (scrollable in half/full modes, hidden in peek mode) */}
      {snap !== 'peek' && (
        <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4">
          {/* Outcome: Failed notice (Fail-closed safety messaging per Rule R1) */}
          {result.outcome === 'failed' && (
            <div className="p-4 rounded-xl bg-[#FF6542]/10 border border-[#FF6543]/40 text-xs text-[#FBFAF9] space-y-2.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#FF6542] shrink-0" />
                <p className="font-mono font-bold text-[#FF6542] uppercase tracking-wide">
                  {t('ui_messages.fail_closed_protocol', '[FAIL-CLOSED SAFETY PROTOCOL]')}
                </p>
              </div>
              <p className="font-medium text-[#FBFAF9]">
                Analysis did not complete (Not verified). This is not a safe result.
              </p>
              <p className="text-[#898580] leading-relaxed">
                {result.scene?.summary ||
                  'Check your network connection and credentials, then try scanning again. Never assume unverified areas are safe.'}
              </p>
              {result.errors &&
                result.errors.some((e) => String(e).includes('missing_api_key')) && (
                  <button
                    type="button"
                    onClick={() => navigate('/settings')}
                    className="mt-2 flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg bg-[#FF6542] hover:bg-[#FF6542]/90 text-white font-mono font-bold text-xs transition-colors touch-manipulation active:scale-95"
                  >
                    <span>Configure Gemini API Key in Settings →</span>
                  </button>
                )}
              <button
                type="button"
                onClick={onRescan}
                className="mt-2 flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg bg-[#353431] hover:bg-[#151513] text-[#FBFAF9] font-mono text-xs transition-colors border border-[#151513] touch-manipulation active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#FF6542]" />
                <span>{t('ui_messages.try_again', 'Try again')}</span>
              </button>
            </div>
          )}

          {/* Outcome: Inconclusive notice (Fail-closed safety messaging per Rule R1) */}
          {result.outcome === 'inconclusive' && (
            <div className="p-4 rounded-xl bg-[#F5A524]/10 border border-[#F5A524]/40 text-xs text-[#FBFAF9] space-y-2.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#F5A524] shrink-0" />
                <p className="font-mono font-bold text-[#F5A524] uppercase tracking-wide">
                  {t('ui_messages.inconclusive_assessment', '[INCONCLUSIVE ASSESSMENT // FAIL-CLOSED]')}
                </p>
              </div>
              <p className="font-medium text-[#FBFAF9]">
                Scene quality or camera coverage was insufficient for verified analysis.
              </p>
              <p className="text-[#898580] leading-relaxed">
                Potential hazards may remain unobserved due to lighting, glare, or motion blur. Per Rule R1, this is not an all-clear. Sweep the area again with steady framing.
              </p>
              <button
                type="button"
                onClick={onRescan}
                className="mt-2 flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg bg-[#353431] hover:bg-[#151513] text-[#FBFAF9] font-mono text-xs transition-colors border border-[#151513] touch-manipulation active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#F5A524]" />
                <span>{t('ui_messages.re_scan', 'Rescan scene')}</span>
              </button>
            </div>
          )}

          {/* Outcome: None observed notice (Rule R1: never safe/no danger/all clear) */}
          {result.outcome === 'none_observed' && (
            <div className="p-4 rounded-xl bg-[#181818] border border-[#151513] text-xs text-[#FBFAF9] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[#7FA7D6]">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#7FA7D6]" />
                  <p className="font-semibold text-[#FBFAF9]">
                    {t('outcomes.none_observed', 'No hazards observed in this view')}
                  </p>
                </div>
                {/* Handwritten annotation callout in Kalam font */}
                <span className="font-script italic text-[#FF6542] text-xs select-none">
                  {t('ui_messages.verified_scene_scan', '// verified scene scan')}
                </span>
              </div>
              <p className="text-[#898580] leading-relaxed">
                {t('ui_messages.none_observed_msg', "No hazards observed in this view. Parts of the room weren't visible.")}
              </p>
              <p className="text-xs text-[#898580]/80 italic">
                Scan from another angle or sweep the rest of the room.
              </p>
            </div>
          )}

          {/* Translation failure warning (Rule R13) */}
          {result.translation_error && (
            <div className="p-3 rounded-lg bg-[#181818] border border-[#F5A524]/40 text-[11px] text-[#FBFAF9] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#F5A524] flex-shrink-0" />
              <span>Couldn't translate this report. Showing English.</span>
            </div>
          )}

          {/* 4. Editorial Cream Note Card (Paper Island §133) */}
          {showCreamCard && (
            <div className="relative my-2 select-text">
              {/* Background stack layer simulating stacked paper island */}
              <div className="absolute inset-0 bg-[#FBFAF9]/20 rounded-2xl transform translate-x-1 translate-y-1 pointer-events-none" />

              <div className="relative bg-[#FBFAF9] text-[#0C0B09] rounded-2xl p-4 sm:p-5 shadow-cream-stack border border-[#0C0B09]/10">
                {/* Eyebrow & Handwritten Callout */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#0C0B09]/70 px-1.5 py-0.5 rounded bg-[#0C0B09]/5 border border-[#0C0B09]/10">
                      {t('ui_messages.verified_findings_audit', '[VERIFIED FINDINGS AUDIT]')}
                    </span>
                    {result.immediate_action && (
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#FF6542] bg-[#FF6542]/10 px-1.5 py-0.5 rounded border border-[#FF6543]/20">
                        {t('ui_messages.immediate_action', '[IMMEDIATE ACTION]')}
                      </span>
                    )}
                  </div>

                  {/* Handwritten annotation in Kalam font */}
                  <span className="font-script italic text-[#FF6542] text-xs shrink-0 select-none">
                    {t('ui_messages.verified_scene_scan', '// verified scene scan')}
                  </span>
                </div>

                {/* Headline */}
                <h3 className="text-base sm:text-lg font-bold text-[#0C0B09] tracking-tight leading-snug">
                  {result.immediate_action
                    ? 'Urgent Precaution Advisory'
                    : result.outcome === 'none_observed'
                    ? 'Scene Verification Summary'
                    : result.hazards?.[0]?.title
                    ? `Primary Finding: ${result.hazards[0].title}`
                    : 'Safety Assessment Summary'}
                </h3>

                {/* Body copy in crisp dark ink */}
                <p className="text-xs sm:text-sm text-[#0C0B09]/85 mt-2 leading-relaxed">
                  {result.scene?.summary ||
                    result.hazards?.[0]?.risk.rationale ||
                    'Verified scene observations completed.'}
                </p>

                {/* Monospace taxonomy tags row */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded bg-[#0C0B09]/5 text-[#0C0B09] border border-[#0C0B09]/15">
                    [{t('ui_messages.target', 'TARGET')}: {t(`person_categories.${result.person_category}`, result.person_category).toUpperCase()}]
                  </span>
                  {result.hazards?.[0]?.category_id && (
                    <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded bg-[#0C0B09]/5 text-[#0C0B09] border border-[#0C0B09]/15">
                      {formatTaxonomyTag(result.hazards[0].category_id, language)}
                    </span>
                  )}
                  {result.verification?.status && (
                    <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded bg-[#0C0B09]/5 text-[#0C0B09] border border-[#0C0B09]/15">
                      [{t('ui_messages.verify', 'VERIFY')}: {t(`verify_status.${result.verification.status}`, result.verification.status).toUpperCase()}]
                    </span>
                  )}
                </div>

                {/* Featured key precaution snippet if available */}
                {result.hazards?.[0]?.precautions?.[0] && (
                  <div className="mt-3.5 pt-3 border-t border-[#0C0B09]/15 flex items-start gap-2">
                    <span className="font-mono text-[10px] uppercase font-bold text-[#FF6542] shrink-0 mt-0.5">
                      {t('ui_messages.key_action', 'KEY ACTION:')}
                    </span>
                    <p className="text-xs text-[#0C0B09] font-medium leading-snug">
                      {result.hazards[0].precautions[0].text}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. Selected Hazard Drawer */}
          {selectedHazard ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setSelectedHazard(null)}
                className="text-xs text-[#FF6542] hover:underline flex items-center gap-1 font-mono font-medium min-h-[44px] touch-manipulation cursor-pointer"
              >
                ← {t('ui_messages.back_to_hazards', 'Back to all hazards')}
              </button>
              <HazardDetail
                hazard={selectedHazard}
                personCategory={result.person_category}
                onClose={() => setSelectedHazard(null)}
              />
            </div>
          ) : (
            /* Hazards List */
            <div className="space-y-2.5">
              {result.hazards && result.hazards.length > 0 ? (
                result.hazards.map((h) => (
                  <HazardRow
                    key={h.id}
                    hazard={h}
                    isSelected={false}
                    onSelect={(hazard) => {
                      setSelectedHazard(hazard);
                    }}
                  />
                ))
              ) : result.outcome === 'hazards_found' ? (
                <p className="text-xs text-[#898580] italic">No specific items listed.</p>
              ) : null}
            </div>
          )}

          {/* 6. Coverage Gaps & Limits */}
          <CoverageNotes
            coverageGaps={result.scene?.coverage_gaps}
            limitsText={result.limits}
            isSampledMode={result.source === 'frame' || result.source === 'video_frame'}
          />
        </div>
      )}

      {/* 4. Pinned Thumb-Friendly Action Buttons at bottom (visible in half and full modes) */}
      {snap !== 'peek' && (
        <div className="shrink-0 px-4 py-3 pb-safe bg-[#252422] border-t border-[#151513] flex items-center gap-2 z-20 shadow-lg">
          <button
            type="button"
            onClick={handleSave}
            className={`flex-1 min-h-[48px] flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl text-xs font-mono font-bold transition-all border touch-manipulation active:scale-95 shadow-sm cursor-pointer ${
              savedSuccess
                ? 'bg-[#FF6542] text-white border-[#FF6543]'
                : 'bg-[#353431] hover:bg-[#151513] text-[#FBFAF9] border-[#151513]'
            }`}
          >
            <Bookmark className="w-4 h-4 shrink-0" />
            <span>{savedSuccess ? t('ui_messages.saved_to_history', 'Saved to history') : t('ui_messages.save_scan', 'Save scan')}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/reports', { state: { report: result } })}
            className="flex-1 min-h-[48px] flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-[#353431] hover:bg-[#151513] text-[#FBFAF9] text-xs font-mono font-bold transition-all border border-[#151513] touch-manipulation active:scale-95 shadow-sm cursor-pointer"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>{t('ui_messages.full_report', 'Full report')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (result) {
                downloadTrilingualHTMLReport(result);
              }
            }}
            className="flex-1 min-h-[48px] flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-[#353431] hover:bg-[#151513] text-[#FBFAF9] text-xs font-mono font-bold transition-all border border-[#151513] touch-manipulation active:scale-95 shadow-sm cursor-pointer"
            title="Download full Trilingual Report (English, Kannada, Hindi)"
          >
            <Languages className="w-4 h-4 text-[#FF6542] shrink-0" />
            <span>Trilingual PDF</span>
          </button>

          <button
            type="button"
            onClick={onRescan}
            className="min-h-[48px] min-w-[48px] p-3 rounded-xl bg-[#353431] hover:bg-[#151513] text-[#FBFAF9] transition-all border border-[#151513] flex items-center justify-center touch-manipulation active:scale-95 shadow-sm cursor-pointer"
            title={t('ui_messages.re_scan', 'Scan again')}
            aria-label={t('ui_messages.re_scan', 'Scan again')}
          >
            <RotateCcw className="w-4 h-4 text-[#FF6542]" />
          </button>
        </div>
      )}
    </section>
  );
};
