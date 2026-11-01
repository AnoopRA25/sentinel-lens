import { useState, useCallback } from 'react';
import { CoverageSegment } from '../types/ui';
import { AnalysisResult } from '../types/api';

const DEFAULT_SEGMENTS_COUNT = 8;

export function useSession() {
  const [sessionId, setSessionId] = useState<string>(() => `sweep_${Date.now()}`);
  const [segments, setSegments] = useState<CoverageSegment[]>(() => {
    return Array.from({ length: DEFAULT_SEGMENTS_COUNT }, (_, i) => ({
      id: `seg_${i}`,
      index: i,
      state: 'empty' as const,
    }));
  });
  const [sessionResults, setSessionResults] = useState<AnalysisResult[]>([]);
  const [isSweepActive, setIsSweepActive] = useState<boolean>(false);

  const startSweep = useCallback(() => {
    const newId = `sweep_${Date.now()}`;
    setSessionId(newId);
    setSegments(
      Array.from({ length: DEFAULT_SEGMENTS_COUNT }, (_, i) => ({
        id: `seg_${i}`,
        index: i,
        state: 'empty' as const,
      }))
    );
    setSessionResults([]);
    setIsSweepActive(true);
  }, []);

  const recordScan = useCallback((result: AnalysisResult, _thumbnail?: string) => {
    setSessionResults((prev) => [...prev, result]);
    setSegments((prev) => {
      // Find first empty segment or replace oldest
      const emptyIdx = prev.findIndex((s) => s.state === 'empty');
      const targetIdx = emptyIdx !== -1 ? emptyIdx : prev.length - 1;

      const updated = [...prev];
      const state: 'done' | 'inconclusive' =
        result.outcome === 'inconclusive' ? 'inconclusive' : 'done';

      updated[targetIdx] = {
        id: `seg_${targetIdx}`,
        index: targetIdx,
        state,
        maxRisk: result.overall_risk,
        capturedAt: result.timestamp,
        hazardCount: result.hazards ? result.hazards.length : 0,
      };
      return updated;
    });
  }, []);

  const finishSweep = useCallback(() => {
    setIsSweepActive(false);
  }, []);

  const resetSweep = useCallback(() => {
    setSessionId(`sweep_${Date.now()}`);
    setSegments(
      Array.from({ length: DEFAULT_SEGMENTS_COUNT }, (_, i) => ({
        id: `seg_${i}`,
        index: i,
        state: 'empty' as const,
      }))
    );
    setSessionResults([]);
    setIsSweepActive(false);
  }, []);

  return {
    sessionId,
    segments,
    sessionResults,
    isSweepActive,
    startSweep,
    recordScan,
    finishSweep,
    resetSweep,
    // Aliases for compatibility
    addCapture: recordScan,
    cancelSweep: resetSweep,
    results: sessionResults,
  };
}
