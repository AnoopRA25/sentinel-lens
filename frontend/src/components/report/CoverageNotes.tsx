import React from 'react';
import { useTranslation } from '../../i18n';

export interface CoverageNotesProps {
  coverageGaps?: string[];
  limits?: string;
  limitsText?: string;
  samplingIntervalSeconds?: number;
  isSampledMode?: boolean;
  className?: string;
}

export const CoverageNotes: React.FC<CoverageNotesProps> = ({
  coverageGaps = [],
  limits,
  limitsText,
  samplingIntervalSeconds,
  isSampledMode = false,
  className = '',
}) => {
  const { t } = useTranslation();
  const effectiveLimits = limits || limitsText;

  return (
    <div
      className={`p-4 rounded-hazard bg-ink-800/80 border border-ink-700 text-xs text-mist-400 space-y-2.5 ${className}`}
      data-testid="coverage-notes"
    >
      <div className="flex items-center space-x-2 text-mist-200">
        <svg className="w-4 h-4 text-risk-medium shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="font-semibold uppercase tracking-wider text-[11px] text-mist-100">
          {t('ui_messages.coverage_and_limits', 'Coverage Gaps & Analysis Limits')}
        </span>
      </div>

      {/* Frame Sampling Disclaimer (Rule R11) */}
      {(samplingIntervalSeconds !== undefined || isSampledMode) && (
        <div className="p-2 rounded bg-ink-900/60 border border-ink-700 text-mist-300">
          {samplingIntervalSeconds !== undefined
            ? t(
                'ui_messages.video_sampling_disclaimer',
                { seconds: samplingIntervalSeconds },
                `Checks one frame every ${samplingIntervalSeconds} s. Events between frames can be missed.`
              )
            : 'Periodic frame sampling is active. Events between frames can be missed.'}
        </div>
      )}

      {/* Coverage gaps list */}
      {coverageGaps.length > 0 ? (
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-mist-300">
            Areas not assessed in this view:
          </span>
          <ul className="list-disc list-inside space-y-0.5 text-mist-300 pl-1">
            {coverageGaps.map((gap, idx) => (
              <li key={idx} className="leading-snug">
                {gap}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-mist-400">
          No specific blind spots reported by perception sweep, but hazards outside the visible camera frame cannot be assessed.
        </p>
      )}

      {/* Overall limits text */}
      {effectiveLimits && (
        <p className="text-mist-400 pt-1 border-t border-ink-700/60 leading-relaxed italic">
          {effectiveLimits}
        </p>
      )}
    </div>
  );
};
