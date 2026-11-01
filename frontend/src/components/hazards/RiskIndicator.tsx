import React from 'react';
import { RiskLevel } from '../../types/api';
import { useTranslation } from '../../i18n';

export interface RiskIndicatorProps {
  riskLevel?: RiskLevel;
  level?: RiskLevel;
  potentialLevel?: RiskLevel | null;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

interface RiskStyleConfig {
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  extraClass?: string;
}

const RISK_CONFIG: Record<RiskLevel, RiskStyleConfig> = {
  high: {
    label: 'High',
    textColor: 'text-[#FF6542]',
    bgColor: 'bg-[#FF6542]/10',
    borderColor: 'border-[#FF6543]/40',
  },
  medium: {
    label: 'Medium',
    textColor: 'text-[#F5A524]',
    bgColor: 'bg-[#F5A524]/10',
    borderColor: 'border-[#F5A524]/40',
  },
  low: {
    label: 'Low',
    textColor: 'text-[#7FA7D6]',
    bgColor: 'bg-[#7FA7D6]/10',
    borderColor: 'border-[#7FA7D6]/40',
  },
  uncertain: {
    label: 'Uncertain',
    textColor: 'text-[#898580]',
    bgColor: 'bg-[#898580]/10',
    borderColor: 'border-[#898580]/50 border-dashed',
    extraClass: 'border-hatch-uncertain',
  },
};

/**
 * Terminal Ember Crisp Monospace Code-Tag Risk Badge
 * Strictly complies with Rule R1: NEVER displays 'safe', 'no danger', or 'all clear'.
 */
export const RiskIndicator: React.FC<RiskIndicatorProps> = ({
  riskLevel,
  level,
  potentialLevel,
  size = 'md',
  showLabel = true,
  className = '',
}) => {
  const { getRiskLabel } = useTranslation();
  const effectiveRiskLevel: RiskLevel = riskLevel || level || 'uncertain';
  const config = RISK_CONFIG[effectiveRiskLevel] || RISK_CONFIG.uncertain;
  const labelText = getRiskLabel(effectiveRiskLevel) || config.label;

  const sizeClasses: Record<'sm' | 'md' | 'lg', { container: string; text: string }> = {
    sm: {
      container: 'px-1.5 py-0.5 gap-1 text-[11px]',
      text: 'text-[11px] font-mono leading-none tracking-tight',
    },
    md: {
      container: 'px-2 py-0.5 gap-1.5 text-xs',
      text: 'text-xs font-mono font-medium leading-none tracking-tight',
    },
    lg: {
      container: 'px-2.5 py-1 gap-2 text-sm',
      text: 'text-sm font-mono font-semibold leading-none tracking-tight',
    },
  };

  const currentSize = sizeClasses[size];

  const renderIndicatorSymbol = () => {
    switch (effectiveRiskLevel) {
      case 'high':
        return (
          <span
            className="inline-flex items-center justify-center shrink-0 text-[#FF6542] drop-shadow-[0_0_6px_#FF6542] animate-pulse select-none text-[10px] leading-none"
            aria-hidden="true"
          >
            ●
          </span>
        );
      case 'medium':
        return (
          <span
            className="inline-flex items-center justify-center shrink-0 text-[#F5A524] select-none text-[9px] leading-none"
            aria-hidden="true"
          >
            ▲
          </span>
        );
      case 'low':
        return (
          <span
            className="inline-flex items-center justify-center shrink-0 text-[#7FA7D6] select-none text-[9px] leading-none"
            aria-hidden="true"
          >
            ○
          </span>
        );
      case 'uncertain':
      default:
        return (
          <span
            className="inline-flex items-center justify-center shrink-0 text-[#898580] font-mono font-bold select-none text-[9px] leading-none"
            aria-hidden="true"
          >
            ?
          </span>
        );
    }
  };

  return (
    <div
      className={`inline-flex items-center font-mono rounded-[4px] border ${config.bgColor} ${config.borderColor} ${config.extraClass || ''} ${currentSize.container} ${className}`}
      aria-label={`Risk level: ${labelText}${potentialLevel ? `, potential: ${potentialLevel}` : ''}`}
    >
      {renderIndicatorSymbol()}
      {showLabel && (
        <span className={`${currentSize.text} ${config.textColor}`}>
          {labelText}
        </span>
      )}
      {potentialLevel && (
        <span className="text-[10px] text-[#898580] font-mono ml-0.5">
          (POT: {potentialLevel})
        </span>
      )}
    </div>
  );
};
