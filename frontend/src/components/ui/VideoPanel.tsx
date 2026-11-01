import React, { useState } from 'react';
import { useTranslation } from '../../i18n';

export interface VideoPanelProps {
  intervalSeconds: number;
  onIntervalChange: (sec: number | ((prev: number) => number)) => void;
  maxFrames: number;
  onMaxFramesChange: (max: number | ((prev: number) => number)) => void;
  isProcessing?: boolean;
  currentFrame?: number;
  progressCurrent?: number;
  totalFrames?: number;
  onStartAnalysis?: () => void;
  onCancel?: () => void;
  videoFileName?: string | null;
  onSelectVideo?: (file: File) => void;
  hasFileSelected?: boolean;
  summaryText?: string | null;
  className?: string;
}


export const VideoPanel: React.FC<VideoPanelProps> = ({
  intervalSeconds,
  onIntervalChange,
  maxFrames,
  onMaxFramesChange,
  isProcessing = false,
  currentFrame = 0,
  progressCurrent,
  totalFrames = 0,
  onStartAnalysis,
  onCancel,
  videoFileName,
  onSelectVideo,
  hasFileSelected = false,
  summaryText,
  className = '',
}) => {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      onSelectVideo?.(file);
    }
  };

  const activeFrame = progressCurrent !== undefined ? progressCurrent : currentFrame;

  const progressPercent =
    totalFrames > 0 ? Math.min(100, Math.round((activeFrame / totalFrames) * 100)) : 0;


  return (
    <div className={`p-4 rounded-xl bg-ink-900 border border-ink-700 text-mist-100 space-y-4 ${className}`}>
      {/* Header */}
      <div className="border-b border-ink-700/80 pb-2.5">
        <h3 className="text-base font-bold text-mist-100">Video Frame Sampling</h3>
        <p className="text-xs text-mist-400 mt-0.5">
          Extracts and evaluates still frames locally in the browser (video is never uploaded).
        </p>
      </div>

      {/* Video file picker */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-mist-400 uppercase tracking-wider block">
          Source Video
        </label>
        <div className="flex items-center space-x-2">
          <label className="px-3 py-2 rounded-btn bg-ink-800 hover:bg-ink-700 text-mist-100 border border-ink-600 text-xs font-medium cursor-pointer transition-colors">
            Choose Video File
            <input
              type="file"
              accept="video/*"
              disabled={isProcessing}
              onChange={handleFileChange}
              className="sr-only hidden"
            />
          </label>
          <span className="text-xs text-mist-400 truncate max-w-xs">
            {videoFileName || selectedFile?.name || 'No video selected'}
          </span>
        </div>
      </div>

      {/* Sliders: Interval & Max Frames */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <label htmlFor="sample-interval" className="text-mist-400">
              Sample Interval
            </label>
            <span className="font-condensed text-mist-100">{intervalSeconds} s</span>
          </div>
          <input
            id="sample-interval"
            type="range"
            min="1"
            max="10"
            step="1"
            disabled={isProcessing}
            value={intervalSeconds}
            onChange={(e) => onIntervalChange(Number(e.target.value))}
            className="w-full accent-signal-cyan bg-ink-800 rounded-lg cursor-pointer h-2"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <label htmlFor="max-frames" className="text-mist-400">
              Max Frames Cap
            </label>
            <span className="font-condensed text-mist-100">{maxFrames} frames</span>
          </div>
          <input
            id="max-frames"
            type="range"
            min="3"
            max="30"
            step="1"
            disabled={isProcessing}
            value={maxFrames}
            onChange={(e) => onMaxFramesChange(Number(e.target.value))}
            className="w-full accent-signal-cyan bg-ink-800 rounded-lg cursor-pointer h-2"
          />
        </div>
      </div>

      {/* Sampling Disclaimer (Rule R11) */}
      <div className="p-2.5 rounded-lg bg-ink-800/80 border border-ink-700 text-xs text-mist-400 flex items-start space-x-2">
        <svg className="w-4 h-4 text-risk-medium shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          {t('ui_messages.video_sampling_disclaimer', { seconds: intervalSeconds }, `Checks one frame every ${intervalSeconds} s. Events between frames can be missed.`)}
        </span>
      </div>

      {/* Progress Bar during active processing */}
      {isProcessing && (
        <div className="space-y-2 pt-1">
          <div className="flex justify-between text-xs">
            <span className="text-mist-400">Processing frames...</span>
            <span className="font-condensed text-signal-cyan font-bold">
              Frame {currentFrame} of {totalFrames} ({progressPercent}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-ink-800 overflow-hidden">
            <div
              className="h-full bg-signal-cyan transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Merged summary output if completed */}
      {summaryText && (
        <div className="p-3 rounded-lg bg-ink-800 border border-ink-600 text-xs text-mist-200">
          <h5 className="font-semibold text-mist-100 mb-1">Session Summary</h5>
          <p>{summaryText}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center space-x-2 pt-2">
        {isProcessing ? (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold rounded-btn bg-risk-high/20 hover:bg-risk-high/30 text-risk-high border border-risk-high/40 transition-colors"
          >
            Cancel Video Analysis
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartAnalysis}
            disabled={!selectedFile && !videoFileName && !hasFileSelected}
            className="px-4 py-2 text-xs font-semibold rounded-btn bg-signal-cyan text-ink-900 hover:bg-white disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >

            Analyze Video Frames
          </button>
        )}
      </div>
    </div>
  );
};
