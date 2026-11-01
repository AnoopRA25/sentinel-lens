import React from 'react';
import { NotificationRecord, NotifyStatus } from '../../types/api';

export interface NotifyChipProps {
  notification?: NotificationRecord | null;
  status?: NotifyStatus;
  reason?: string | null;
  className?: string;
}


const NOTIFY_CONFIG: Record<
  NotifyStatus,
  { label: string; bg: string; text: string; border: string; icon: string }
> = {
  sent: {
    label: 'Alert Sent',
    bg: 'bg-signal-cyan/15',
    text: 'text-signal-cyan',
    border: 'border-signal-cyan/40',
    icon: '✓',
  },
  skipped_cooldown: {
    label: 'Alert Cooldown',
    bg: 'bg-ink-800',
    text: 'text-mist-400',
    border: 'border-ink-700',
    icon: '⏳',
  },
  skipped_policy: {
    label: 'Policy Skipped',
    bg: 'bg-ink-800',
    text: 'text-mist-400',
    border: 'border-ink-700',
    icon: '–',
  },
  disabled: {
    label: 'Alerts Off',
    bg: 'bg-ink-800',
    text: 'text-mist-500',
    border: 'border-ink-700',
    icon: '○',
  },
  failed: {
    label: 'Alert Failed',
    bg: 'bg-risk-high/15',
    text: 'text-risk-high',
    border: 'border-risk-high/40',
    icon: '✕',
  },
};

export const NotifyChip: React.FC<NotifyChipProps> = ({
  notification,
  status,
  reason,
  className = '',
}) => {
  const effectiveStatus: NotifyStatus | undefined = status || notification?.status;
  const effectiveReason = reason ?? notification?.reason;

  if (!effectiveStatus) {
    return null;
  }

  const config = NOTIFY_CONFIG[effectiveStatus] || NOTIFY_CONFIG.disabled;

  return (
    <div
      className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-condensed border ${config.bg} ${config.text} ${config.border} ${className}`}
      title={effectiveReason || `Telegram notification status: ${effectiveStatus}`}
      aria-label={`Telegram notification status: ${config.label}${effectiveReason ? ` - ${effectiveReason}` : ''}`}
    >
      <span className="font-bold">{config.icon}</span>
      <span>{config.label}</span>
      {effectiveReason && (
        <span className="text-[10px] opacity-75 max-w-[120px] truncate">
          ({effectiveReason})
        </span>
      )}
    </div>
  );
};

