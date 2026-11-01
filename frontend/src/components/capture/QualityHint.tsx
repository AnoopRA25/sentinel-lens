import React from 'react';
import { QualityAssessment } from '../../types/ui';

export interface QualityHintProps {
  assessment?: QualityAssessment | null;
  onRetake: () => void;
  onAnalyzeAnyway: () => void;
  className?: string;
}

const ISSUE_MESSAGES: Record<string, string> = {
  dark: 'Too dark to check reliably. Turn on a light or move closer to a window.',
  blurry: 'Image is blurry. Hold the phone steady and tap to focus.',
  glare: 'Strong glare detected. Adjust the angle away from reflections.',
  framing: 'The area seems tightly cropped. Step back to show more context.',
};

export const QualityHint: React.FC<QualityHintProps> = ({
  assessment,
  onRetake,
  onAnalyzeAnyway,
  className = '',
}) => {
  if (!assessment || assessment.isAcceptable) {
    return null;
  }

  const issueKey = assessment.issue || 'dark';
  const message = assessment.message || ISSUE_MESSAGES[issueKey] || 'Quality check suggests retaking this view for better accuracy.';

  return (
    <div
      role="alert"
      className={`relative z-20 flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-hazard bg-ink-800/95 backdrop-blur border border-risk-medium/50 text-mist-100 shadow-lg ${className}`}
    >
      <div className="flex items-center space-x-2.5 text-left">
        <svg
          className="w-5 h-5 text-risk-medium shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p className="text-xs sm:text-sm font-medium leading-snug">
          {message}
        </p>
      </div>

      <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
        <button
          type="button"
          onClick={onRetake}
          className="px-3 py-1.5 text-xs font-semibold rounded-btn bg-ink-700 hover:bg-ink-600 text-mist-100 border border-ink-600 focus:outline-none focus:ring-2 focus:ring-signal-cyan transition-colors"
        >
          Retake
        </button>
        <button
          type="button"
          onClick={onAnalyzeAnyway}
          className="px-3 py-1.5 text-xs font-semibold rounded-btn bg-ink-800 hover:bg-ink-700 text-mist-400 hover:text-mist-100 border border-ink-700 focus:outline-none focus:ring-2 focus:ring-signal-cyan transition-colors"
        >
          Analyze anyway
        </button>
      </div>
    </div>
  );
};
