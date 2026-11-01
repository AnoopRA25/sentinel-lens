import React from 'react';
import { Hazard, PersonCategory } from '../../types/api';
import { RiskIndicator } from './RiskIndicator';
import { useTranslation } from '../../i18n';

export interface HazardDetailProps {
  hazard: Hazard;
  personCategory?: PersonCategory;
  onClose?: () => void;
  className?: string;
}

/**
 * Terminal Ember Detailed Hazard Inspector
 * Renders auditable rule IDs, guideline provenance badges, and crisp precaution cards.
 */
export const HazardDetail: React.FC<HazardDetailProps> = ({
  hazard,
  personCategory = 'adult',
  onClose,
  className = '',
}) => {
  const {
    t,
    language,
    formatTaxonomyTag,
    getStatusLabel,
    getEvidenceLabel,
    getPersonLabel,
    getCategoryTitle,
    translateHazard,
  } = useTranslation();

  const localizedHazard = translateHazard(hazard, language);
  const canonicalCatTitle = getCategoryTitle(hazard.category_id, 'en');
  const displayTitle =
    localizedHazard.title === canonicalCatTitle
      ? getCategoryTitle(hazard.category_id, language)
      : localizedHazard.title;

  return (
    <div
      className={`p-5 rounded-2xl bg-[#252422] border border-[#151513] hover:border-[#FF6543]/50 transition-colors text-[#FBFAF9] space-y-4 shadow-ember-panel ${className}`}
      data-testid="hazard-detail"
    >
      {/* 1. Header with Taxonomy tag & status pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#151513] pb-3.5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#181818] text-[#898580] border border-[#151513] tracking-tight">
              {formatTaxonomyTag(hazard.category_id, language)}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#353431] text-[#FBFAF9] border border-[#151513]">
              {t('ui_messages.status', 'Status')}: {getStatusLabel(hazard.status, language)}
            </span>
          </div>
          <h3 className="text-base sm:text-lg font-bold text-[#FBFAF9] mt-1.5 tracking-tight">
            {displayTitle}
          </h3>
        </div>

        {/* Risk Badge and Close button */}
        <div className="flex items-center space-x-2 shrink-0">
          <RiskIndicator
            riskLevel={hazard.risk.level}
            potentialLevel={hazard.risk.potential_level}
            size="md"
          />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close hazard details"
              className="p-1 rounded text-[#898580] hover:text-[#FBFAF9] hover:bg-[#353431] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 2. Rationale & Auditable Rule IDs (Rule R4 / R5) */}
      <div className="space-y-1.5 text-xs sm:text-sm">
        <h5 className="font-mono text-[11px] uppercase tracking-wider text-[#898580]">
          {t('ui_messages.risk_rationale', 'Assessment Rationale & Rule Engine Audit')}
        </h5>
        <p className="text-[#FBFAF9] leading-relaxed text-xs sm:text-sm">
          {hazard.risk.rationale}
        </p>
        {hazard.risk.rule_ids && hazard.risk.rule_ids.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="font-mono text-xs text-[#898580]">{t('ui_messages.rules_applied', 'Rules applied:')}</span>
            {hazard.risk.rule_ids.map((ruleId) => (
              <span
                key={ruleId}
                className="font-mono text-[11px] px-2 py-0.5 rounded-control bg-[#181818] text-[#FF6542] border border-[#FF6543]/40 tracking-tight"
              >
                {ruleId}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 3. Evidence statements (Rule R2 & R3: observed facts separated) */}
      <div className="space-y-1.5 text-xs sm:text-sm">
        <h5 className="font-mono text-[11px] uppercase tracking-wider text-[#898580]">
          {t('ui_messages.visible_evidence', 'Visible Evidence')} ({getEvidenceLabel(hazard.evidence_strength, language)})
        </h5>

        {hazard.evidence && hazard.evidence.length > 0 ? (
          <ul className="list-disc list-inside space-y-1 text-xs text-[#FBFAF9] bg-[#181818] p-3 rounded-xl border border-[#151513]">
            {hazard.evidence.map((stmt, idx) => (
              <li key={idx} className="leading-relaxed">
                {stmt}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[#898580] italic">No direct observation statement recorded.</p>
        )}

        {/* Visible trigger object if possible hazard */}
        {hazard.trigger && (
          <div className="mt-2 text-xs bg-[#181818] p-2.5 rounded-xl border border-[#151513] text-[#FBFAF9]">
            <span className="font-mono font-medium text-[#898580]">Trigger object: </span>
            {hazard.trigger}
          </div>
        )}
      </div>

      {/* 4. Target Person Context */}
      <div className="text-xs space-y-1 bg-[#181818] p-3 rounded-xl border border-[#151513]">
        <span className="font-mono uppercase tracking-wider text-[10px] text-[#898580]">
          {t('ui_messages.target_context', 'Target Context')}: {getPersonLabel(personCategory, language)}
        </span>
        <p className="text-xs text-[#FBFAF9]">
          Relevance is{' '}
          <strong className="uppercase text-[#FF6542] font-semibold">
            {hazard.person_relevance || 'normal'}
          </strong>{' '}
          based on vulnerability profile.
        </p>
      </div>

      {/* 5. Precautions with Provenance (Rule R8) and Priority Chips */}
      <div className="space-y-2">
        <h5 className="font-mono text-[11px] uppercase tracking-wider text-[#898580]">
          {t('ui_messages.precautions_heading', 'Recommended Precautions')}
        </h5>

        {localizedHazard.precautions && localizedHazard.precautions.length > 0 ? (
          <div className="space-y-2.5">
            {localizedHazard.precautions.map((prec, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-[#181818] border border-[#151513] hover:border-[#FF6543]/40 transition-colors flex flex-col space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[#FBFAF9]">
                      {t('ui_messages.step', 'Step')} {idx + 1}
                    </span>
                    {/* Priority chip */}
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-control bg-[#353431] text-[#FBFAF9] border border-[#151513]">
                      {t('ui_messages.priority', 'Priority')} {prec.priority ?? idx + 1}
                    </span>
                  </div>

                  {/* Provenance Badge (Rule R8) */}
                  <span
                    className={`font-mono text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${
                      prec.provenance === 'guideline'
                        ? 'bg-[#FF6542]/10 text-[#FF6542] border-[#FF6543]/40'
                        : 'bg-[#353431] text-[#898580] border-[#151513]'
                    }`}
                  >
                    {prec.provenance === 'guideline'
                      ? `${t('ui_messages.provenance_guideline', 'Guideline')} ${prec.guideline_id || ''}`.trim()
                      : t('ui_messages.provenance_generic', 'Generic Safety')}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#FBFAF9] leading-relaxed">
                  {prec.text}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#898580] italic">No precautions documented for this hazard.</p>
        )}
      </div>

      {/* 6. Region notice (Rule R7) */}
      {hazard.region && (
        <div className="text-[11px] text-[#898580] flex items-center space-x-1.5 pt-1">
          <svg className="w-3.5 h-3.5 text-[#FF6542]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Approximate region highlighted in camera viewport.</span>
        </div>
      )}
    </div>
  );
};
