import React, { useState, useMemo } from 'react';
import { PipelineEvent, PipelineEventType } from '../../types/api';

export interface EventStreamProps {
  events: PipelineEvent[];
  maxVisible?: number;
  className?: string;
}

const EVENT_TYPE_LABELS: Record<PipelineEventType | 'all', string> = {
  all: 'All Events',
  node_started: 'Started',
  node_finished: 'Finished',
  node_failed: 'Failed',
  retry: 'Retry',
  preview: 'Preview',
  result: 'Result',
  error: 'Error',
  heartbeat: 'Heartbeat',
};


export const EventStream: React.FC<EventStreamProps> = ({
  events = [],
  maxVisible = 200,
  className = '',
}) => {
  const [filterType, setFilterType] = useState<PipelineEventType | 'all'>('all');

  const filteredEvents = useMemo(() => {
    let list = events;
    if (filterType !== 'all') {
      list = list.filter((e) => e.type === filterType);
    }
    return list.slice(0, maxVisible);
  }, [events, filterType, maxVisible]);

  const getBadgeStyle = (type: PipelineEventType) => {
    switch (type) {
      case 'node_started':
        return 'bg-signal-cyan/15 text-signal-cyan border-signal-cyan/40';
      case 'node_finished':
        return 'bg-mist-100/10 text-mist-100 border-mist-400/30';
      case 'node_failed':
      case 'error':
        return 'bg-risk-high/15 text-risk-high border-risk-high/40';
      case 'retry':
        return 'bg-risk-medium/15 text-risk-medium border-risk-medium/40';
      case 'preview':
        return 'bg-ink-700 text-signal-cyan border-ink-600';
      case 'result':
        return 'bg-mist-100 text-ink-900 border-mist-100 font-bold';
      default:
        return 'bg-ink-700 text-mist-400 border-ink-600';
    }
  };

  return (
    <div className={`p-4 rounded-xl bg-ink-900 border border-ink-700 text-mist-100 space-y-3 ${className}`}>
      {/* Header & Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-ink-700/80 pb-2.5">
        <div>
          <h3 className="text-sm font-bold text-mist-100">Live Execution Event Stream</h3>
          <p className="text-xs text-mist-400">Streamed from pipeline SSE endpoint (newest first)</p>
        </div>

        {/* Filter pills */}
        <div className="flex items-center space-x-1 overflow-x-auto py-1">
          {(['all', 'node_started', 'node_finished', 'retry', 'preview', 'error'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilterType(type)}
              className={`px-2 py-0.5 rounded text-[11px] font-condensed font-medium border transition-colors ${
                filterType === type
                  ? 'bg-signal-cyan/20 border-signal-cyan text-signal-cyan'
                  : 'bg-ink-800 border-ink-700 text-mist-400 hover:text-mist-200'
              }`}
            >
              {EVENT_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Events List */}
      <div className="max-h-72 overflow-y-auto space-y-2 pr-1" role="log" aria-live="polite">
        {filteredEvents.length === 0 ? (
          <div className="py-8 text-center text-xs text-mist-400 italic">
            No events recorded yet.
          </div>
        ) : (
          filteredEvents.map((evt, idx) => (
            <div
              key={`${evt.ts}-${idx}`}
              className="p-2.5 rounded-lg bg-ink-800/80 border border-ink-700/60 flex items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span
                    className={`font-condensed text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${getBadgeStyle(
                      evt.type
                    )}`}
                  >
                    {evt.type}
                  </span>
                  {evt.node && (
                    <span className="font-semibold text-mist-100">
                      {evt.node}
                    </span>
                  )}
                  {evt.attempt && evt.attempt > 1 && (
                    <span className="font-condensed text-[10px] text-risk-medium">
                      Attempt {evt.attempt}
                    </span>
                  )}
                </div>

                {evt.summary && (
                  <p className="text-mist-300 text-[11px] line-clamp-2">
                    {evt.summary}
                  </p>
                )}

                {evt.error && (
                  <p className="text-risk-high text-[11px]">
                    Error: {evt.error.message}
                  </p>
                )}
              </div>

              {/* Time & Duration readouts */}
              <div className="shrink-0 text-right font-condensed text-[10px] text-mist-400 space-y-0.5">
                <div>
                  {evt.ts
                    ? new Date(evt.ts).toLocaleTimeString([], {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : ''}
                </div>
                {evt.duration_ms !== undefined && (
                  <div className="text-mist-200">{evt.duration_ms} ms</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
