import React from 'react';
import { RiskLevel, RegionBox } from '../../types/api';
import { useTranslation } from '../../i18n';
import { getAgentByNode, AgentInfo } from '../../types/agents';

export interface SceneViewportProps {
  videoRef?: React.RefObject<HTMLVideoElement>;
  imageSrc?: string | null;
  overallRisk?: RiskLevel | null;
  hasResult?: boolean;
  isInFlight?: boolean;
  activeNode?: string | null;
  isCameraActive?: boolean;
  regions?: Array<{
    id: string;
    box: RegionBox;
    riskLevel?: RiskLevel;
    label?: string;
  }>;
  emptyMessage?: string;
  className?: string;
  children?: React.ReactNode;
}

const RISK_HALO_COLORS: Record<RiskLevel, string> = {
  high: '#FF6542',    // Terminal Ember accent
  medium: '#F5A524',
  low: '#7FA7D6',     // Steel blue, never green (Rule R1)
  uncertain: '#898580',
};

export const SceneViewport: React.FC<SceneViewportProps> = ({
  videoRef,
  imageSrc,
  overallRisk,
  hasResult = false,
  isInFlight = false,
  activeNode,
  isCameraActive = false,
  regions = [],
  emptyMessage,
  className = '',
  children,
}) => {
  const { t } = useTranslation();
  const haloColor = overallRisk ? RISK_HALO_COLORS[overallRisk] : undefined;
  const displayEmptyMessage = emptyMessage || t('ui_messages.empty_state_msg', 'No scan yet. Take a photo of the area you want to check.');
  const activeAgent: AgentInfo | undefined = getAgentByNode(activeNode || (isInFlight ? 'perceive' : undefined));

  return (
    <div
      className={`relative overflow-hidden bg-[#030302] border border-[#151513] sm:rounded-xl flex items-center justify-center select-none font-mono ${className}`}
      style={{
        minHeight: '280px',
        boxShadow: hasResult && haloColor ? `inset 0 0 0 2px ${haloColor}, 0 0 28px -4px ${haloColor}40` : undefined,
        transition: 'box-shadow 300ms ease-in-out',
      }}
      role="region"
      aria-label="Hazard camera viewport"
    >
      {/* 1. Video stream element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover ${
          isCameraActive && !imageSrc ? 'block' : 'hidden'
        }`}
      />

      {/* 2. Still photo / captured frame element */}
      {imageSrc && (
        <img
          src={imageSrc}
          alt="Scene capture for hazard assessment"
          className="w-full h-full object-contain max-h-[75dvh] max-h-[75vh]"
        />
      )}

      {/* 3. Empty placeholder when neither video nor image */}
      {!isCameraActive && !imageSrc && (
        <div className="flex flex-col items-center justify-center p-6 text-center text-[#898580]">
          <svg
            className="w-12 h-12 mb-3 text-[#353431]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <p className="text-sm max-w-xs font-mono">{displayEmptyMessage}</p>
        </div>
      )}

      {/* Hairline viewfinder framing (4 corners) */}
      <div className="absolute inset-2 sm:inset-3 pointer-events-none z-10">
        <div className="absolute top-0 left-0 w-3 h-3 sm:w-3.5 sm:h-3.5 border-t border-l border-[#898580]/50" />
        <div className="absolute top-0 right-0 w-3 h-3 sm:w-3.5 sm:h-3.5 border-t border-r border-[#898580]/50" />
        <div className="absolute bottom-0 left-0 w-3 h-3 sm:w-3.5 sm:h-3.5 border-b border-l border-[#898580]/50" />
        <div className="absolute bottom-0 right-0 w-3 h-3 sm:w-3.5 sm:h-3.5 border-b border-r border-[#898580]/50" />
      </div>

      {/* Reticle center crosshair */}
      {(isCameraActive || imageSrc) && (
        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center opacity-30">
          <div className="w-5 h-5 border border-[#898580]/60 rounded-full flex items-center justify-center">
            <div className="w-1 h-1 bg-[#FF6542] rounded-full" />
          </div>
        </div>
      )}

      {/* 4. Camera Active indicator (S-02 / design.md §10) */}
      {isCameraActive && (
        <div className="absolute top-2 sm:top-3 left-2 sm:left-3 z-20 flex items-center space-x-1.5 bg-[#030302]/85 backdrop-blur-sm px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border border-[#151513] text-[10px] sm:text-xs font-mono text-[#FBFAF9]">
          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#FF6542] animate-pulse" />
          <span>Camera on</span>
        </div>
      )}

      {/* Monospace camera HUD overlay (ISO 400 | REC | 24FPS) */}
      <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 z-20 flex items-center gap-1.5 sm:gap-2 font-mono text-[9px] sm:text-[11px] text-[#898580] bg-[#030302]/85 backdrop-blur-sm px-2 sm:px-2.5 py-0.5 sm:py-1 rounded border border-[#151513] pointer-events-none select-none">
        <span>ISO 400</span>
        <span className="text-[#353431]">|</span>
        {isCameraActive ? (
          <span className="flex items-center gap-1 sm:gap-1.5 text-[#FF6542] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF6542] animate-pulse" />
            REC
          </span>
        ) : imageSrc ? (
          <span className="text-[#FBFAF9]">STILL</span>
        ) : (
          <span className="text-[#898580]">STANDBY</span>
        )}
        <span className="text-[#353431]">|</span>
        <span>24FPS</span>
      </div>

      {/* 5. Scan sweep line & Active Agent Telemetry Card during in-flight analysis */}
      {isInFlight && (
        <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
          <div
            className="w-full h-0.5 bg-[#FF6542] shadow-[0_0_14px_#FF6542] animate-[scan_2.5s_linear_infinite]"
            style={{
              position: 'absolute',
              top: 0,
            }}
          />

          {/* Active Agent Telemetry Overlay Card */}
          <div className="absolute top-3 right-3 max-w-[280px] bg-[#0A0908]/95 backdrop-blur-md p-2.5 rounded-lg border border-[#FF6542]/60 shadow-[0_0_20px_rgba(255,101,66,0.25)] text-left font-mono">
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF6542] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF6542]" />
              </span>
              <span className="text-[10px] font-bold text-[#FF6542] tracking-wider uppercase">
                {activeAgent ? activeAgent.badge : 'PIPELINE ACTIVE'}
              </span>
              <span className="text-[9px] px-1.5 py-0.2 bg-[#FF6542]/20 text-[#FF6542] rounded ml-auto font-bold animate-pulse">
                PROCESSING
              </span>
            </div>
            <div className="text-xs font-semibold text-[#FBFAF9] truncate leading-tight">
              {activeAgent ? activeAgent.title : 'Evaluating Scene...'}
            </div>
            <div className="text-[10px] text-[#A6A29D] mt-0.5 line-clamp-2 leading-snug">
              {activeAgent ? activeAgent.description : 'Processing environmental hazards through specialized safety models.'}
            </div>
          </div>
        </div>
      )}

      {/* 6. Approximate region boxes (Rule R7 / S-15) */}
      {regions.map((reg) => {
        const ymin = reg.box.ymin ?? (reg.box.box_2d ? reg.box.box_2d[0] : 0);
        const xmin = reg.box.xmin ?? (reg.box.box_2d ? reg.box.box_2d[1] : 0);
        const ymax = reg.box.ymax ?? (reg.box.box_2d ? reg.box.box_2d[2] : 1);
        const xmax = reg.box.xmax ?? (reg.box.box_2d ? reg.box.box_2d[3] : 1);
        const top = `${ymin * 100}%`;
        const left = `${xmin * 100}%`;
        const width = `${Math.max(0, (xmax - xmin) * 100)}%`;
        const height = `${Math.max(0, (ymax - ymin) * 100)}%`;
        const boxRiskColor = reg.riskLevel ? RISK_HALO_COLORS[reg.riskLevel] : '#FF6542';

        return (
          <div
            key={reg.id}
            className="absolute z-20 pointer-events-none transition-all duration-300"
            style={{
              top,
              left,
              width,
              height,
              border: `1.5px dashed ${boxRiskColor}`,
              backgroundColor: `${boxRiskColor}15`,
            }}
          >
            <span
              className="absolute -top-5 left-0 text-[10px] uppercase font-mono font-medium tracking-wider px-1.5 py-0.5 rounded bg-[#030302]/90 text-[#FBFAF9] border border-[#151513] shadow-sm"
              style={{ color: boxRiskColor }}
            >
              Approximate {reg.label ? `· ${reg.label}` : ''}
            </span>
          </div>
        );
      })}

      {/* Custom children overlay if passed */}
      {children}
    </div>
  );
};
