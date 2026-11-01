import React from 'react';
import { Hazard } from '../../types/api';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from '../../i18n';

interface HazardRowProps {
  hazard: Hazard;
  isSelected?: boolean;
  onSelect: (hazard: Hazard) => void;
}

export const HazardRow: React.FC<HazardRowProps> = ({
  hazard,
  isSelected = false,
  onSelect,
}) => {
  const { t, language, formatTaxonomyTag, getStatusLabel, getCategoryTitle } = useTranslation();

  const getRiskEdgeClass = () => {
    switch (hazard.risk?.level) {
      case 'high':
        return 'border-l-4 border-l-[#FF6542]';
      case 'medium':
        return 'border-l-4 border-l-[#F5A524]';
      case 'low':
        return 'border-l-2 border-l-[#7FA7D6]';
      case 'uncertain':
      default:
        return 'border-l-4 border-l-[#898580] hatch-pattern';
    }
  };

  const getStatusBadge = () => {
    const statusText = getStatusLabel(hazard.status, language);
    switch (hazard.status) {
      case 'observed':
        return (
          <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FF6542]/10 text-[#FF6542] border border-[#FF6543]/40 shrink-0">
            {statusText}
          </span>
        );
      case 'likely':
        return (
          <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#F5A524]/10 text-[#F5A524] border border-[#F5A524]/40 shrink-0">
            {statusText}
          </span>
        );
      case 'possible':
      default:
        return (
          <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#898580]/15 text-[#898580] border border-[#898580]/30 shrink-0">
            {statusText}
          </span>
        );
    }
  };

  const canonicalCatTitle = getCategoryTitle(hazard.category_id, 'en');
  const displayTitle = (hazard.title === canonicalCatTitle)
    ? getCategoryTitle(hazard.category_id, language)
    : hazard.title;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(hazard)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(hazard);
        }
      }}
      className={`group w-full p-3.5 sm:p-4 rounded-xl bg-[#252422] hover:bg-[#252422]/90 border border-[#151513] hover:border-[#FF6543]/50 transition-all duration-150 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#FF6542] touch-manipulation active:scale-[0.99] sm:active:scale-100 ${getRiskEdgeClass()} ${
        isSelected ? 'border-[#FF6543] ring-1 ring-[#FF6543] shadow-ember-panel' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Top metadata row: Monospace taxonomy tag + Status badge */}
          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
            <span className="font-mono text-[11px] font-medium text-[#898580] tracking-tight">
              {formatTaxonomyTag(hazard.category_id, language)}
            </span>
            {getStatusBadge()}
          </div>

          {/* Title */}
          <h4 className="text-sm font-semibold text-[#FBFAF9] group-hover:text-[#FF6542] transition-colors truncate">
            {displayTitle}
          </h4>

          {/* Rationale or Evidence statement */}
          <p className="text-xs text-[#898580] mt-1 line-clamp-1 leading-relaxed">
            {hazard.risk?.rationale || hazard.evidence[0]}
          </p>

          {/* Monospace bottom tag trail if precautions or rules exist */}
          {((hazard.precautions && hazard.precautions.length > 0) || (hazard.risk?.rule_ids && hazard.risk.rule_ids.length > 0)) && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {hazard.precautions && hazard.precautions.length > 0 && (
                <span className="font-mono text-[10px] text-[#898580] bg-[#181818] px-1.5 py-0.5 rounded border border-[#151513]">
                  {hazard.precautions.length} {hazard.precautions.length === 1 ? t('ui_messages.precaution', 'precaution') : t('ui_messages.precautions', 'precautions')}
                </span>
              )}
              {hazard.risk?.rule_ids?.[0] && (
                <span className="font-mono text-[10px] text-[#FF6542]/80 bg-[#FF6542]/5 px-1.5 py-0.5 rounded border border-[#FF6543]/20">
                  {hazard.risk.rule_ids[0]}
                </span>
              )}
            </div>
          )}
        </div>

        <ChevronRight className="w-4 h-4 text-[#898580] group-hover:text-[#FF6542] transition-all group-hover:translate-x-0.5 shrink-0 mt-2" />
      </div>
    </div>
  );
};
