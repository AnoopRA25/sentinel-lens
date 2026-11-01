import React, { useState, useEffect } from 'react';
import { GraphDefinition, GraphNode, PipelineEvent, TraceEvent } from '../../types/api';

export interface AgentGraphProps {
  graphData?: GraphDefinition | null;
  activeNode?: string | null;
  completedNodes?: string[];
  failedNodes?: string[];
  retriedNodes?: string[];
  trace?: TraceEvent[];
  events?: PipelineEvent[];
  className?: string;
}

// Canonical fallback workflow nodes if /api/graph is loading or offline
const DEFAULT_NODES: GraphNode[] = [
  { id: 'ingest', label: 'Agent 01: Ingest & EXIF Sanitizer', description: 'Validates frame boundaries, decodes JPEG buffers, and strips EXIF/GPS telemetry for strict privacy.', stage: 'input' },
  { id: 'perceive', label: 'Agent 02: Multimodal Scene Perception', description: 'Evaluates illumination, motion blur sharpness, floor coverage arcs, and camera occlusions.', stage: 'agent' },
  { id: 'classify', label: 'Agent 03: Hazard Taxonomy Routing', description: 'Evaluates visual cues across 15 codified hazard categories against auditable criteria.', stage: 'agent' },
  { id: 'person_context', label: 'Agent 04: Demographic Reachability', description: 'Calculates physical reachability heights and vulnerability weighting for target demographic.', stage: 'agent' },
  { id: 'assess_risk', label: 'Agent 05: Deterministic Risk Prioritization', description: 'Applies codified clearance rules without generative hallucinations.', stage: 'agent' },
  { id: 'retrieve_guidelines', label: 'Agent 06: Guideline Provenance & Citations', description: 'Matches validated safety guidelines, provenance codes, and actionable mitigation steps.', stage: 'agent' },
  { id: 'verify', label: 'Agent 07: Verification & Guardrail', description: 'Audits findings against fail-closed contracts, eliminates hallucinations, and enforces Rule R1.', stage: 'agent' },
  { id: 'report', label: 'Agent 08: Safety Report Synthesis', description: 'Synthesizes formal diagnostic report with verified citations across English, Kannada, and Hindi.', stage: 'agent' },
  { id: 'notify', label: 'Agent 09: Caregiver Notification & Dispatch', description: 'Evaluates emergency thresholds and coordinates immediate caregiver dispatch notifications.', stage: 'output' },
];

export const AgentGraph: React.FC<AgentGraphProps> = ({
  graphData,
  activeNode,
  completedNodes = [],
  failedNodes = [],
  retriedNodes = [],
  trace = [],
  events = [],
  className = '',
}) => {
  const [nodes, setNodes] = useState<GraphNode[]>(DEFAULT_NODES);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    if (graphData && graphData.nodes && graphData.nodes.length > 0) {
      setNodes(graphData.nodes);
    } else {
      // Fetch /api/graph if available
      fetch('/api/graph')
        .then((res) => (res.ok ? res.json() : null))
        .then((data: GraphDefinition | null) => {
          if (data && data.nodes) {
            setNodes(data.nodes);
          }
        })
        .catch(() => {
          // Use default nodes
        });
    }
  }, [graphData]);

  const getNodeState = (nodeId: string): 'idle' | 'running' | 'done' | 'failed' | 'retried' => {
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

  const getTraceInfo = (nodeId: string) => {
    const fromTrace = trace.find((t) => t.node === nodeId);
    const fromEvents = events.find((e) => e.node === nodeId);
    return {
      duration_ms: fromTrace?.duration_ms ?? fromEvents?.duration_ms,
      attempt: fromTrace?.attempt ?? fromEvents?.attempt,
      summary: fromTrace?.summary ?? fromEvents?.summary,
      status: fromTrace?.status,
    };
  };

  const hasAnyRun =
    Boolean(activeNode) ||
    completedNodes.length > 0 ||
    failedNodes.length > 0 ||
    trace.length > 0;

  return (
    <div className={`p-4 rounded-xl bg-ink-900 border border-ink-700 space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-ink-700/80 pb-3">
        <div>
          <h3 className="text-base font-bold text-mist-100">
            Agent Workflow Pipeline
          </h3>
          <p className="text-xs text-mist-400 mt-0.5">
            Compiled LangGraph execution topology (real run states only)
          </p>
        </div>
        {!hasAnyRun && (
          <span className="text-xs text-mist-400 italic">
            Pipeline is idle. Start a scan to view live agent execution.
          </span>
        )}
      </div>

      {/* Graph Nodes Grid / Linear Flow */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {nodes.map((node, index) => {
          const state = getNodeState(node.id);
          const traceInfo = getTraceInfo(node.id);
          const isSelected = selectedNode?.id === node.id;

          let stateColor = 'bg-ink-800 border-ink-700 text-mist-400';
          let badgeColor = 'bg-ink-700 text-mist-400';

          if (state === 'running') {
            stateColor = 'bg-ink-800 border-signal-cyan ring-1 ring-signal-cyan text-mist-100 shadow-[0_0_12px_rgba(45,212,232,0.15)]';
            badgeColor = 'bg-signal-cyan/20 text-signal-cyan border border-signal-cyan/40 animate-pulse';
          } else if (state === 'done') {
            stateColor = 'bg-ink-800 border-ink-600 text-mist-100';
            badgeColor = 'bg-mist-100/10 text-mist-100 border border-mist-400/40';
          } else if (state === 'failed') {
            stateColor = 'bg-ink-800 border-risk-high text-mist-100';
            badgeColor = 'bg-risk-high/20 text-risk-high border border-risk-high/40';
          } else if (state === 'retried') {
            stateColor = 'bg-ink-800 border-risk-medium text-mist-100';
            badgeColor = 'bg-risk-medium/20 text-risk-medium border border-risk-medium/40';
          }

          return (
            <div
              key={node.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedNode(node)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedNode(node);
                }
              }}
              className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-signal-cyan flex flex-col justify-between ${stateColor} ${
                isSelected ? 'ring-2 ring-signal-cyan' : 'hover:border-mist-400/60'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-condensed text-[11px] text-mist-400">
                  Step {index + 1}
                </span>
                <span
                  className={`text-[10px] uppercase font-condensed font-semibold px-2 py-0.5 rounded ${badgeColor}`}
                >
                  {state}
                </span>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-mist-100">{node.label}</h4>
                <p className="text-xs text-mist-400 line-clamp-2 mt-1">
                  {node.description || 'Pipeline node'}
                </p>
              </div>

              {traceInfo.duration_ms !== undefined && (
                <div className="mt-3 pt-2 border-t border-ink-700/60 flex items-center justify-between text-[11px] text-mist-400 font-condensed">
                  <span>Duration:</span>
                  <span className="text-mist-100">{traceInfo.duration_ms} ms</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected Node Details Drawer */}
      {selectedNode && (
        <div className="p-4 rounded-lg bg-ink-800 border border-ink-600 text-mist-100 space-y-3">
          <div className="flex items-center justify-between border-b border-ink-700 pb-2">
            <div>
              <h4 className="text-sm font-bold">{selectedNode.label} Details</h4>
              <p className="text-xs text-mist-400">Node ID: {selectedNode.id}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedNode(null)}
              className="text-xs text-mist-400 hover:text-mist-100 px-2 py-1 rounded bg-ink-700"
            >
              Close
            </button>
          </div>

          <div className="space-y-1.5 text-xs text-mist-200">
            <p>
              <strong className="text-mist-400">Responsibility:</strong>{' '}
              {selectedNode.description}
            </p>
            {getTraceInfo(selectedNode.id).summary && (
              <p>
                <strong className="text-mist-400">Latest Run Summary:</strong>{' '}
                {getTraceInfo(selectedNode.id).summary}
              </p>
            )}
            {getTraceInfo(selectedNode.id).duration_ms !== undefined && (
              <p>
                <strong className="text-mist-400">Execution Latency:</strong>{' '}
                <span className="font-condensed text-mist-100">
                  {getTraceInfo(selectedNode.id).duration_ms} ms
                </span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
