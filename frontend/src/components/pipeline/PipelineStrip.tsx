import React, { useState } from 'react';
import { PipelineEvent } from '../../types/api';
import { getAgentByNode, AgentInfo } from '../../types/agents';

export interface PipelineStripProps {
  activeNode?: string | null;
  completedNodes?: string[];
  failedNodes?: string[];
  retriedNodes?: string[];
  events?: PipelineEvent[];
  className?: string;
  showDetails?: boolean;
}

interface NodeMeta {
  id: string;
  label: string;
  shortLabel: string;
  stepNum: string;
}

const CANONICAL_NODES: NodeMeta[] = [
  { id: 'ingest', label: 'Ingest', shortLabel: 'ING', stepNum: '01' },
  { id: 'perceive', label: 'Perceive', shortLabel: 'PER', stepNum: '02' },
  { id: 'classify', label: 'Classify', shortLabel: 'CLA', stepNum: '03' },
  { id: 'person_context', label: 'Person', shortLabel: 'PRS', stepNum: '04' },
  { id: 'assess_risk', label: 'Risk', shortLabel: 'RSK', stepNum: '05' },
  { id: 'retrieve_guidelines', label: 'Guidelines', shortLabel: 'GDL', stepNum: '06' },
  { id: 'verify', label: 'Verify', shortLabel: 'VRF', stepNum: '07' },
  { id: 'report', label: 'Report', shortLabel: 'RPT', stepNum: '08' },
  { id: 'notify', label: 'Notify', shortLabel: 'NTF', stepNum: '09' },
];

export const PipelineStrip: React.FC<PipelineStripProps> = ({
  activeNode,
  completedNodes = [],
  failedNodes = [],
  retriedNodes = [],
  events = [],
  className = '',
  showDetails = true,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const activeAgent: AgentInfo | undefined = getAgentByNode(activeNode);

  const getNodeState = (nodeId: string): 'idle' | 'running' | 'done' | 'failed' | 'retried' => {
    // Normalise potential alias matching (e.g., person vs person_context)
    const matches = (id: string) =>
      id === nodeId ||
      (nodeId === 'person_context' && id === 'person') ||
      (nodeId === 'assess_risk' && id === 'risk') ||
      (nodeId === 'retrieve_guidelines' && id === 'guidelines');

    if (activeNode && matches(activeNode)) return 'running';
    if (failedNodes.some(matches)) return 'failed';
    if (retriedNodes.some(matches)) return 'retried';
    if (completedNodes.some(matches)) return 'done';
    return 'idle';
  };

  const getRecentEvent = (nodeId: string): PipelineEvent | undefined => {
    return events.find(
      (e) =>
        e.node === nodeId ||
        (nodeId === 'person_context' && e.node === 'person') ||
        (nodeId === 'assess_risk' && e.node === 'risk') ||
        (nodeId === 'retrieve_guidelines' && e.node === 'guidelines')
    );
  };

  return (
    <div className={`flex flex-col space-y-2 w-full font-mono ${className}`}>
      {/* 1. Prominent Active Agent Indicator Card */}
      {showDetails && (
        <div
          className={`px-3 py-2 rounded-xl border transition-all duration-300 ${
            activeAgent
              ? 'bg-[#181818]/95 border-[#FF6542]/60 shadow-[0_0_16px_rgba(255,101,66,0.2)]'
              : 'bg-[#181818]/70 border-[#252422]'
          }`}
          role="status"
          aria-live="polite"
        >
          {activeAgent ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF6542] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF6542]" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-[#FF6542] tracking-wider uppercase">
                      {activeAgent.badge}
                    </span>
                    <span className="text-[9px] text-[#A6A29D]">|</span>
                    <span className="text-[10px] text-[#FBFAF9] font-semibold truncate">
                      {activeAgent.title}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#A6A29D] truncate mt-0.5">
                    {activeAgent.description}
                  </p>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#FF6542]/15 border border-[#FF6542]/40 text-[#FF6542] text-[10px] font-bold uppercase tracking-wider animate-pulse">
                <span>ACTIVE</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[11px] text-[#898580]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#353431]" />
                <span className="tracking-wider uppercase">PIPELINE READY // 9 SPECIALIZED AGENTS ONLINE</span>
              </div>
              <span className="text-[10px] text-[#615E59]">IDLE</span>
            </div>
          )}
        </div>
      )}

      {/* 2. Pipeline 9-Agent Stepper Dots */}
      <div
        className="relative flex items-center justify-between py-2 px-3 rounded-full bg-[#10100E]/90 backdrop-blur border border-[#252422]"
        role="region"
        aria-label="Agent pipeline status"
      >
        {CANONICAL_NODES.map((node) => {
          const state = getNodeState(node.id);
          const recentEvent = getRecentEvent(node.id);
          const isSelected = selectedNodeId === node.id;
          const nodeAgent = getAgentByNode(node.id);

          let dotColor = 'bg-[#252422] border-[#353431] text-[#898580]';
          let ariaDesc = `${node.label}: idle`;

          if (state === 'running') {
            dotColor = 'bg-[#FF6542] border-[#FF6542] text-white ring-4 ring-[#FF6542]/25 shadow-[0_0_10px_#FF6542] animate-pulse';
            ariaDesc = `${node.label}: currently running`;
          } else if (state === 'done') {
            dotColor = 'bg-[#353431] border-[#898580] text-[#FBFAF9]';
            ariaDesc = `${node.label}: completed`;
          } else if (state === 'failed') {
            dotColor = 'bg-[#FF6542] border-[#FF6542] text-white';
            ariaDesc = `${node.label}: failed`;
          } else if (state === 'retried') {
            dotColor = 'bg-[#F5A524] border-[#F5A524] text-white';
            ariaDesc = `${node.label}: retried`;
          }

          return (
            <div key={node.id} className="relative flex flex-col items-center">
              <button
                type="button"
                onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                aria-label={ariaDesc}
                title={`${nodeAgent?.badge || node.label}: ${nodeAgent?.title || node.label}`}
                className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border text-[8px] sm:text-[9px] font-bold flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#FF6542] cursor-pointer ${dotColor}`}
              >
                {node.stepNum}
              </button>

              {/* Node Popover for Agent Inspection */}
              {isSelected && (
                <div
                  role="tooltip"
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 min-w-[220px] max-w-[280px] p-2.5 rounded-lg bg-[#181818] border border-[#353431] shadow-2xl text-left text-xs text-[#FBFAF9] animate-fadeIn font-mono"
                >
                  <div className="flex items-center justify-between border-b border-[#252422] pb-1 mb-1.5">
                    <span className="font-bold text-[#FF6542] text-[11px]">
                      {nodeAgent?.badge || `STEP ${node.stepNum}`}
                    </span>
                    <span
                      className={`text-[9px] uppercase font-semibold px-1.5 py-0.2 rounded ${
                        state === 'done'
                          ? 'text-[#FBFAF9] bg-[#252422]'
                          : state === 'running'
                          ? 'text-[#FF6542] bg-[#FF6542]/20 border border-[#FF6542]/40'
                          : state === 'failed'
                          ? 'text-[#FF6542] bg-[#FF6542]/20'
                          : 'text-[#898580] bg-[#10100E]'
                      }`}
                    >
                      {state}
                    </span>
                  </div>

                  <p className="font-semibold text-xs text-[#FBFAF9] mb-1">
                    {nodeAgent?.title || node.label}
                  </p>
                  <p className="text-[10px] text-[#A6A29D] leading-relaxed mb-1.5">
                    {nodeAgent?.description || 'Active pipeline node component.'}
                  </p>

                  {recentEvent ? (
                    <div className="space-y-0.5 text-[10px] text-[#898580] border-t border-[#252422] pt-1">
                      {recentEvent.duration_ms !== undefined && (
                        <p>Duration: <span className="text-[#FBFAF9]">{recentEvent.duration_ms} ms</span></p>
                      )}
                      {recentEvent.attempt && (
                        <p>Attempt: <span className="text-[#FBFAF9]">{recentEvent.attempt}</span></p>
                      )}
                      {recentEvent.summary && (
                        <p className="line-clamp-2 text-[#A6A29D]">{recentEvent.summary}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-[#615E59] border-t border-[#252422] pt-1">
                      Awaiting execution in pipeline.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
