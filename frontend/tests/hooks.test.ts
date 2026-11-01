import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCamera } from '../src/hooks/useCamera';
import { useFrameSampler } from '../src/hooks/useFrameSampler';
import { useWakeLock } from '../src/hooks/useWakeLock';
import { useSession } from '../src/hooks/useSession';
import { useHistory } from '../src/hooks/useHistory';
import { HistoryStore } from '../src/lib/historyStore';
import { AnalysisResult } from '../src/types/api';

describe('useCamera hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('detects insecure context and sets state to insecure (S-02)', async () => {
    // Force isSecureContext = false
    Object.defineProperty(window, 'isSecureContext', {
      value: false,
      configurable: true,
    });

    const { result } = renderHook(() => useCamera());
    expect(result.current.state).toBe('idle');

    await act(async () => {
      const stream = await result.current.startCamera();
      expect(stream).toBeNull();
    });

    expect(result.current.state).toBe('insecure');
    expect(result.current.error).toContain('Live mode needs a secure (HTTPS) connection');
  });

  it('stops all tracks on stopCamera and unmount', async () => {
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });

    const stopMock = vi.fn();
    const mockTrack = { stop: stopMock, kind: 'video', enabled: true } as unknown as MediaStreamTrack;
    const mockStream = {
      getTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
    });

    const { result, unmount } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.state).toBe('active');
    expect(result.current.isLive).toBe(true);

    act(() => {
      result.current.stopCamera();
    });

    expect(result.current.state).toBe('idle');
    expect(stopMock).toHaveBeenCalled();

    unmount();
  });
});

describe('useFrameSampler hook (S-05)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('strictly skips tick if previous in-flight request is pending (no queueing)', async () => {
    let resolveInFlight: (() => void) | null = null;
    const sampleMock = vi.fn().mockImplementation(() => {
      return new Promise<void>((resolve) => {
        resolveInFlight = resolve;
      });
    });

    const { result } = renderHook(() =>
      useFrameSampler({
        intervalMs: 1000,
        onSample: sampleMock,
        enabled: true,
      })
    );

    // Initial state
    expect(result.current.isRunning).toBe(true);
    expect(result.current.inFlight).toBe(false);

    // Advance timer to trigger first tick
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(sampleMock).toHaveBeenCalledTimes(1);
    expect(result.current.inFlight).toBe(true);

    // Advance timer again while first request is still in-flight
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Sample should NOT have been called a second time (skip count increments)
    expect(sampleMock).toHaveBeenCalledTimes(1);
    expect(result.current.skipCount).toBe(1);

    // Now resolve the in-flight request
    await act(async () => {
      resolveInFlight?.();
    });

    expect(result.current.inFlight).toBe(false);

    // Advance timer for next tick
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(sampleMock).toHaveBeenCalledTimes(2);
  });

  it('skips uploads while paused and increments skip counter', async () => {
    const sampleMock = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useFrameSampler({
        intervalMs: 1000,
        onSample: sampleMock,
        enabled: true,
      })
    );

    act(() => {
      result.current.pause();
    });

    expect(result.current.isPaused).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(sampleMock).not.toHaveBeenCalled();
    expect(result.current.skipCount).toBe(1);

    act(() => {
      result.current.resume();
    });

    expect(result.current.isPaused).toBe(false);
  });
});

describe('useWakeLock hook (S-07)', () => {
  it('handles wake lock request and release cleanly', async () => {
    const releaseMock = vi.fn();
    const sentinelMock = {
      release: releaseMock,
      addEventListener: vi.fn(),
      released: false,
    };

    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: vi.fn().mockResolvedValue(sentinelMock),
      },
      configurable: true,
    });

    const { result } = renderHook(() => useWakeLock());
    expect(result.current.isSupported).toBe(true);

    await act(async () => {
      const locked = await result.current.requestWakeLock();
      expect(locked).toBe(true);
    });

    expect(result.current.isLocked).toBe(true);

    await act(async () => {
      await result.current.releaseWakeLock();
    });

    expect(releaseMock).toHaveBeenCalled();
    expect(result.current.isLocked).toBe(false);
  });
});

describe('useSession hook', () => {
  it('manages room sweep lifecycle and segment progression', () => {
    const { result } = renderHook(() => useSession());

    act(() => {
      result.current.startSweep();
    });

    expect(result.current.isSweepActive).toBe(true);
    expect(result.current.segments.length).toBeGreaterThan(0);
    expect(result.current.segments[0].state).toBe('empty');

    const fakeResult: AnalysisResult = {
      id: 'test_result_1',
      timestamp: new Date().toISOString(),
      outcome: 'hazards_found',
      analysis_reliable: true,
      person_category: 'child',
      language: 'en',
      scene: { environment: 'kitchen', summary: 'Sink area', quality_flags: [], coverage_gaps: [] },
      hazards: [
        {
          id: 'hz_1',
          category_id: 'H03',
          title: 'Exposed wire',
          status: 'observed',
          evidence_strength: 'clear',
          evidence: ['Wire bare'],
          risk: { level: 'high', potential_level: null, rule_ids: ['R1'], rationale: 'High danger' },
          precautions: [{ text: 'Cover wire', provenance: 'guideline', guideline_id: 'G1', priority: 1 }],
        },
      ],
      overall_risk: 'high',
      immediate_action: true,
      limits: 'Single frame',
      verification: { status: 'passed', issues: [], changes: [], retries_used: 0 },
      notification: { status: 'disabled' },
      errors: [],
      trace: [],
    };

    act(() => {
      result.current.recordScan(fakeResult);
    });

    expect(result.current.sessionResults.length).toBe(1);
    expect(result.current.segments[0].state).toBe('done');
    expect(result.current.segments[0].maxRisk).toBe('high');

    act(() => {
      result.current.finishSweep();
    });

    expect(result.current.isSweepActive).toBe(false);
  });
});

describe('useHistory hook & HistoryStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds results and exports CSV with spreadsheet injection protection (S-26)', () => {
    expect(HistoryStore).toBeDefined();
    const { result } = renderHook(() => useHistory());

    const fakeResult: AnalysisResult = {
      id: '=cmd|calc!A1', // Formula injection attempt
      timestamp: '2026-11-01T12:00:00Z',
      outcome: 'none_observed',
      analysis_reliable: true,
      person_category: 'baby',
      language: 'en',
      scene: { environment: 'nursery', summary: 'Crib', quality_flags: [], coverage_gaps: ['Floor hidden'] },
      hazards: [],
      overall_risk: 'low',
      immediate_action: false,
      limits: 'None',
      verification: { status: 'passed', issues: [], changes: [], retries_used: 0 },
      notification: { status: 'disabled' },
      errors: [],
      trace: [],
    };

    act(() => {
      result.current.addResult(fakeResult);
    });

    expect(result.current.savedEntries.length).toBe(1);

    const csv = result.current.exportCsv();
    // Rule S-26: cells starting with = + - @ must be prefixed with single quote
    expect(csv).toContain("'=cmd|calc!A1");

  });
});
