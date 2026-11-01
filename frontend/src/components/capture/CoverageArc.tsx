import React, { useState } from 'react';
import { CoverageSegment } from '../../types/ui';
import { Camera, RefreshCw } from 'lucide-react';

interface CoverageArcProps {
  segments: CoverageSegment[];
  isScanning?: boolean;
  onCapture: () => void;
  onFinishSweep?: () => void;
  disabled?: boolean;
}

export const CoverageArc: React.FC<CoverageArcProps> = ({
  segments,
  isScanning = false,
  onCapture,
  onFinishSweep,
  disabled = false,
}) => {
  const [pressTimer, setPressTimer] = useState<number | null>(null);
  const size = 96;
  const strokeWidth = 5;
  const radius = (size - strokeWidth * 2) / 2;
  const center = size / 2;

  const totalSegments = segments.length || 8;
  const gapAngle = 4; // degrees between segments
  const sweepAngle = 360 / totalSegments - gapAngle;

  const polarToCartesian = (centerX: number, centerY: number, r: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + r * Math.cos(angleInRadians),
      y: centerY + r * Math.sin(angleInRadians),
    };
  };

  const describeArc = (x: number, y: number, r: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(x, y, r, endAngle);
    const end = polarToCartesian(x, y, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ');
  };

  const getSegmentColor = (seg: CoverageSegment) => {
    if (seg.state === 'empty') return '#353431'; // dark subtle border
    if (seg.state === 'inconclusive') return '#898580'; // muted gray
    if (!seg.maxRisk) return '#FBFAF9'; // cream completed highlight
    switch (seg.maxRisk) {
      case 'high':
        return '#FF6542'; // ember coral
      case 'medium':
        return '#F5A524'; // amber
      case 'low':
        return '#7FA7D6'; // steel blue (Rule R1)
      case 'uncertain':
      default:
        return '#898580';
    }
  };

  const handleTouchStart = () => {
    const timer = window.setTimeout(() => {
      if (onFinishSweep) {
        onFinishSweep();
      }
    }, 900);
    setPressTimer(timer);
  };

  const handleTouchEnd = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
    }
  };

  const completedCount = segments.filter((s) => s.state === 'done' || s.state === 'inconclusive').length;

  return (
    <div className="relative flex flex-col items-center justify-center select-none font-mono">
      <div className="relative w-24 h-24 flex items-center justify-center">
        {/* Segmented Ring SVG */}
        <svg
          width={size}
          height={size}
          className="absolute inset-0 transform -rotate-90 pointer-events-none"
        >
          {segments.map((seg, idx) => {
            const startAngle = idx * (360 / totalSegments) + gapAngle / 2;
            const endAngle = startAngle + sweepAngle;
            const pathData = describeArc(center, center, radius, startAngle, endAngle);
            const color = getSegmentColor(seg);

            return (
              <path
                key={seg.index ?? idx}
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                className="transition-colors duration-300"
              />
            );
          })}
        </svg>

        {/* Center Shutter Button with Terminal Ember aesthetics */}
        <button
          type="button"
          onClick={onCapture}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseUp={handleTouchEnd}
          disabled={disabled || isScanning}
          aria-label="Capture view for hazard analysis"
          title={
            completedCount > 0
              ? `Capture view (${completedCount}/${totalSegments} scanned). Long press to finish sweep.`
              : 'Tap to capture view'
          }
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#FF6542] focus:ring-offset-2 focus:ring-offset-[#181818] ring-2 ring-[#151513] shadow-[0_0_24px_-4px_rgba(255,101,66,0.25)] touch-manipulation cursor-pointer ${
            isScanning
              ? 'bg-[#252422] border-2 border-[#FF6542] text-[#FF6542] animate-pulse'
              : 'bg-[#FBFAF9] hover:bg-white text-[#0C0B09] border-2 border-[#252422] hover:border-[#FF6542]'
          }`}
        >
          {isScanning ? (
            <RefreshCw className="w-6 h-6 animate-spin text-[#FF6542]" />
          ) : (
            <Camera className="w-6 h-6 text-[#0C0B09]" />
          )}
        </button>
      </div>

      {/* Monospace sweep status indicator */}
      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono tracking-wider text-[#898580] uppercase">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FF6542] shadow-[0_0_6px_#FF6542]" />
        <span>Sweep: {completedCount}/{totalSegments}</span>
        {completedCount > 0 && onFinishSweep && (
          <button
            type="button"
            onClick={onFinishSweep}
            className="text-[#FF6542] hover:text-[#FBFAF9] hover:underline ml-1 font-mono font-semibold uppercase tracking-wider py-1 px-1.5 touch-manipulation active:scale-95 cursor-pointer"
          >
            [Finish]
          </button>
        )}
      </div>
    </div>
  );
};
