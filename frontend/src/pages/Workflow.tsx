import React, { useState, useEffect } from 'react';
import { AgentGraph } from '../components/pipeline/AgentGraph';
import { GraphDefinition, TraceEvent } from '../types/api';
import { getWorkflowGraph } from '../services/api';
import { RefreshCw, Terminal, ShieldCheck } from 'lucide-react';

interface WorkflowPageProps {
  lastTrace?: TraceEvent[];
  lastRunTimestamp?: string | null;
}

export const Workflow: React.FC<WorkflowPageProps> = ({
  lastTrace = [],
  lastRunTimestamp,
}) => {
  const [graphData, setGraphData] = useState<GraphDefinition | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isUsingLiveGraph, setIsUsingLiveGraph] = useState<boolean>(false);

  const loadGraph = async () => {
    setIsLoading(true);
    try {
      const data = await getWorkflowGraph();
      if (data && data.nodes && data.nodes.length > 0) {
        setGraphData(data);
        setIsUsingLiveGraph(true);
      }
    } catch {
      setIsUsingLiveGraph(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGraph();
  }, []);

  return (
    <div className="w-full h-full p-4 sm:p-6 overflow-y-auto flex flex-col space-y-4 max-w-6xl mx-auto font-mono text-[#FBFAF9]">
      {/* Top CLI Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#151513] pb-4 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#898580] uppercase tracking-[0.2em] mb-1">
            <Terminal className="w-3.5 h-3.5 text-[#FF6542]" />
            <span>SYS // COMPILED_LANGGRAPH_v2</span>
          </div>
          <h1 className="text-xl font-bold text-[#FBFAF9] font-display flex items-center gap-2">
            <span>Agent Workflow Architecture</span>
          </h1>
          <p className="text-xs text-[#898580] mt-1 max-w-2xl leading-relaxed">
            Compiled LangGraph execution pipeline: Ingest → Perception → Classification → Person Context → Risk → Guidelines → Verification → Report → Notify.
          </p>
        </div>

        {/* Toolbar & Status Chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {lastRunTimestamp && (
            <span className="text-xs px-2.5 py-1 rounded bg-[#252422] border border-[#151513] text-[#898580]">
              LAST_RUN: <strong className="text-[#FBFAF9]">{new Date(lastRunTimestamp).toLocaleTimeString()}</strong>
            </span>
          )}

          <span
            className={`text-xs px-2.5 py-1 rounded border font-semibold ${
              isUsingLiveGraph
                ? 'bg-[#252422] text-[#FF6542] border-[#FF6542]/40'
                : 'bg-[#252422] text-[#898580] border-[#151513]'
            }`}
          >
            SOURCE: {isUsingLiveGraph ? 'LIVE_BACKEND (/api/graph)' : 'COMPILED_CONTRACT'}
          </span>

          <button
            type="button"
            onClick={loadGraph}
            disabled={isLoading}
            className="btn-dark-solid bg-[#353431] hover:bg-[#151513] text-[#FBFAF9] rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5 border border-[#151513] cursor-pointer transition-colors"
            title="Refresh graph definition"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#FF6542] ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync Graph</span>
          </button>
        </div>
      </div>

      {/* Architecture Spec Chips Bar */}
      <div className="flex flex-wrap items-center gap-2 py-1 text-xs">
        <span className="text-[11px] text-[#898580] uppercase tracking-wider">Topology:</span>
        <span className="px-2 py-0.5 rounded bg-[#252422] border border-[#151513] text-[#FBFAF9]">
          01. INGEST [EXIF_STRIPPED]
        </span>
        <span className="text-[#898580]">→</span>
        <span className="px-2 py-0.5 rounded bg-[#252422] border border-[#151513] text-[#FBFAF9]">
          02. PERCEIVE [GEMINI_2.0]
        </span>
        <span className="text-[#898580]">→</span>
        <span className="px-2 py-0.5 rounded bg-[#252422] border border-[#151513] text-[#FBFAF9]">
          03. CLASSIFY [14_HAZARDS]
        </span>
        <span className="text-[#898580]">→</span>
        <span className="px-2 py-0.5 rounded bg-[#252422] border border-[#151513] text-[#FBFAF9]">
          04. CONTEXT [DEMOGRAPHIC]
        </span>
        <span className="text-[#898580]">→</span>
        <span className="px-2 py-0.5 rounded bg-[#252422] border border-[#151513] text-[#FBFAF9]">
          05. RISK_RULES [TABLE_EVAL]
        </span>
        <span className="text-[#898580]">→</span>
        <span className="px-2 py-0.5 rounded bg-[#252422] border border-[#151513] text-[#FBFAF9]">
          06. GUIDELINES [CITATIONS]
        </span>
        <span className="text-[#898580]">→</span>
        <span className="px-2 py-0.5 rounded bg-[#252422] border border-[#151513] text-[#FF6542] border-[#FF6542]/40 font-semibold">
          07. VERIFY [FAIL_CLOSED]
        </span>
        <span className="text-[#898580]">→</span>
        <span className="px-2 py-0.5 rounded bg-[#252422] border border-[#151513] text-[#FBFAF9]">
          08. REPORT &amp; NOTIFY
        </span>
      </div>

      {/* Main Graph Component Container */}
      <div className="flex-1 min-h-[420px] rounded-xl bg-[#252422] border border-[#151513] p-4 shadow-xl overflow-hidden flex flex-col">
        <AgentGraph
          graphData={graphData}
          trace={lastTrace}
          className="h-full bg-transparent border-0 p-0"
        />
      </div>

      {/* Fail-Closed Verification Principle Callout */}
      <div className="p-4 rounded-xl bg-[#252422] border border-[#151513] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#898580]">
        <div className="flex items-center gap-2 text-[#FBFAF9]">
          <ShieldCheck className="w-4 h-4 text-[#FF6542] shrink-0" />
          <span className="font-semibold">Verification Guarantee (Rules R1 - R14):</span>
          <span className="text-[#898580]">
            Any candidate hazard lacking an auditable rule ID or valid guideline citation is rejected before report composition.
          </span>
        </div>
        <div className="px-2.5 py-1 rounded bg-[#181818] border border-[#151513] text-[11px] text-[#898580] shrink-0">
          POLICY: FAIL_CLOSED
        </div>
      </div>
    </div>
  );
};
