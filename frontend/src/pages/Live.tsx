import React, { useState, useCallback } from 'react';
import { useCamera } from '../hooks/useCamera';
import { useFrameSampler } from '../hooks/useFrameSampler';
import { useWakeLock } from '../hooks/useWakeLock';
import { SceneViewport } from '../components/capture/SceneViewport';
import { EventStream } from '../components/pipeline/EventStream';
import { HazardRow } from '../components/hazards/HazardRow';
import { HazardDetail } from '../components/hazards/HazardDetail';
import { RiskIndicator } from '../components/hazards/RiskIndicator';
import { CoverageNotes } from '../components/report/CoverageNotes';
import { AnalysisResult, PersonCategory, Language, Hazard, PipelineEvent } from '../types/api';
import { analyzeImage } from '../services/api';
import { useHistory } from '../hooks/useHistory';
import {
  Play,
  Pause,
  Square,
  Radio,
  ShieldAlert,
  AlertTriangle,
  Camera,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';

interface LivePageProps {
  personCategory: PersonCategory;
  language: Language;
}

export const Live: React.FC<LivePageProps> = ({ personCategory, language }) => {
  const { t } = useTranslation();
  const [intervalSeconds, setIntervalSeconds] = useState<number>(5);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [latestResult, setLatestResult] = useState<AnalysisResult | null>(null);
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [activeLiveNode, setActiveLiveNode] = useState<string | null>(null);

  const { status, videoRef, startCamera, stopCamera } = useCamera();
  const { saveResult } = useHistory();

  const isLiveActive = status === 'active';
  useWakeLock(isLiveActive && !isPaused);

  const handleFrameCaptured = useCallback(
    async (blob: Blob) => {
      try {
        setActiveLiveNode('perceive');
        const frameTs = new Date().toISOString();
        const res = await analyzeImage(
          blob,
          personCategory,
          language,
          'quick',
          'frame',
          undefined,
          frameTs
        );

        setLatestResult(res);

        const newEvents: PipelineEvent[] = (res.trace || []).map((t) => ({
          type: t.status === 'ok' ? 'node_finished' : 'node_failed',
          node: t.node,
          duration_ms: t.duration_ms,
          summary: t.summary,
          ts: t.ts || new Date().toISOString(),
        }));

        if (newEvents.length > 0) {
          setEvents((prev) => [...newEvents, ...prev].slice(0, 100));
        }

        // Save findings to local history if hazards detected
        if (res.outcome === 'hazards_found') {
          saveResult(res);
        }
      } catch (err: any) {
        console.warn('Live frame analysis failed:', err);
        setEvents((prev) => [
          {
            type: 'error',
            node: 'live_sampler',
            duration_ms: 0,
            summary: err.message || 'Frame processing error',
            ts: new Date().toISOString(),
          },
          ...prev,
        ]);
      } finally {
        setActiveLiveNode(null);
      }
    },
    [personCategory, language, saveResult]
  );

  const { inFlight, framesSampled, framesSkipped, triggerManualSample } = useFrameSampler({
    intervalSeconds,
    isActive: isLiveActive,
    isPaused,
    videoRef,
    onFrame: handleFrameCaptured,
  });

  const handleStart = () => {
    setIsPaused(false);
    startCamera();
  };

  const handleStop = () => {
    stopCamera();
    setIsPaused(false);
  };

  const handleTogglePause = () => {
    setIsPaused((prev) => !prev);
  };

  return (
    <div className="relative w-full h-full flex flex-col lg:flex-row overflow-hidden bg-ink-950">
      {/* Left/Top: Camera Viewport */}
      <div className="relative flex-1 h-[45dvh] sm:h-[50vh] lg:h-full flex flex-col items-center justify-center bg-black overflow-hidden">
        <SceneViewport
          videoRef={videoRef}
          isInFlight={inFlight}
          activeNode={inFlight ? (activeLiveNode || 'perceive') : null}
          overallRisk={latestResult?.overall_risk}
          hasResult={Boolean(latestResult)}
          isCameraActive={isLiveActive}
          className="w-full h-full"
        >
          {/* Persistent "Camera on" indicator (design.md §16) */}
          {isLiveActive && (
            <div className="absolute top-3 left-3 z-20 flex items-center gap-2 px-2.5 py-1 rounded-full bg-ink-950/80 backdrop-blur-md border border-ink-700 text-xs font-condensed">
              <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-risk-medium' : 'bg-signal-cyan animate-pulse'}`} />
              <span className="text-mist-200">
                {isPaused ? 'Paused' : `Camera on · frames sent every ${intervalSeconds} s`}
              </span>
            </div>
          )}

          {/* Secure-context / Fallback / Insecure State */}
          {status === 'insecure' && (
            <div className="p-6 max-w-md mx-auto text-center space-y-3 z-20 bg-ink-900/90 rounded-2xl border border-risk-medium/50 backdrop-blur-md">
              <AlertTriangle className="w-10 h-10 text-risk-medium mx-auto" />
              <h3 className="font-bold text-sm text-mist-100">Secure Context (HTTPS) Required</h3>
              <p className="text-xs text-mist-300 leading-relaxed">
                Live mode requires a secure connection (HTTPS or localhost) to access the camera hardware directly.
                Photo and Video modes still work seamlessly over local HTTP!
              </p>
              <div className="pt-2 flex items-center justify-center gap-3">
                <Link
                  to="/photo"
                  className="px-3 py-1.5 rounded-lg bg-signal-cyan text-ink-900 text-xs font-bold"
                >
                  Use Photo Mode
                </Link>
                <Link
                  to="/settings"
                  className="px-3 py-1.5 rounded-lg bg-ink-800 text-mist-200 text-xs hover:bg-ink-700 border border-ink-700"
                >
                  Phone Access Guide
                </Link>
              </div>
            </div>
          )}

          {/* Permission Denied State */}
          {status === 'denied' && (
            <div className="p-6 max-w-md mx-auto text-center space-y-3 z-20 bg-ink-900/90 rounded-2xl border border-risk-high/50 backdrop-blur-md">
              <ShieldAlert className="w-10 h-10 text-risk-high mx-auto" />
              <h3 className="font-bold text-sm text-mist-100">Camera Permission Blocked</h3>
              <p className="text-xs text-mist-300 leading-relaxed">
                Camera access was blocked by the browser. Please allow camera permissions in site settings or use Photo mode.
              </p>
              <button
                type="button"
                onClick={handleStart}
                className="px-4 py-1.5 rounded-lg bg-ink-700 hover:bg-ink-600 text-mist-100 text-xs font-semibold"
              >
                Retry Permission
              </button>
            </div>
          )}

          {/* Idle State Prompt */}
          {status === 'idle' && (
            <div className="p-6 max-w-sm mx-auto text-center space-y-3 z-10">
              <div className="w-16 h-16 rounded-2xl bg-ink-800/80 border border-ink-700 flex items-center justify-center mx-auto text-signal-cyan">
                <Radio className="w-8 h-8" />
              </div>
              <h2 className="text-base font-bold text-mist-100">{t('ui_messages.live_monitoring', 'Live Camera Monitoring')}</h2>
              <p className="text-xs text-mist-300 leading-relaxed">
                Monitors the rear camera periodically and flags hazards in real-time. Camera tracks are automatically released on exit or pause.
              </p>
              <button
                type="button"
                onClick={handleStart}
                className="px-6 py-3 rounded-xl bg-signal-cyan hover:bg-signal-cyan/90 text-ink-900 font-bold text-xs flex items-center gap-2 mx-auto shadow-lg transition-transform active:scale-95 min-h-[48px] touch-manipulation cursor-pointer"
              >
                <Play className="w-4 h-4 fill-ink-900" />
                <span>{t('ui_messages.start_camera', 'Start Camera')}</span>
              </button>
            </div>
          )}

          {/* Camera Controls Bar (while active) */}
          {isLiveActive && (
            <div className="absolute bottom-4 inset-x-3 sm:inset-x-4 z-20 flex items-center justify-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleTogglePause}
                className="px-3.5 sm:px-4 py-2.5 rounded-xl bg-ink-900/95 hover:bg-ink-800 text-mist-100 border border-ink-700 text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md min-h-[44px] touch-manipulation active:scale-95 cursor-pointer"
              >
                {isPaused ? <Play className="w-4 h-4 text-signal-cyan" /> : <Pause className="w-4 h-4" />}
                <span>{isPaused ? t('ui_messages.resume', 'Resume') : t('ui_messages.pause', 'Pause')}</span>
              </button>

              <button
                type="button"
                onClick={triggerManualSample}
                disabled={isPaused || inFlight}
                className="px-4 sm:px-5 py-2.5 rounded-xl bg-signal-cyan/90 hover:bg-signal-cyan text-ink-900 text-xs font-bold flex items-center gap-1.5 shadow-lg disabled:opacity-50 min-h-[44px] touch-manipulation active:scale-95 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>{t('ui_messages.scan_now', 'Scan Now')}</span>
              </button>

              <button
                type="button"
                onClick={handleStop}
                className="px-3.5 sm:px-4 py-2.5 rounded-xl bg-risk-high/90 hover:bg-risk-high text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg min-h-[44px] touch-manipulation active:scale-95 cursor-pointer"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>{t('ui_messages.stop', 'Stop')}</span>
              </button>
            </div>
          )}
        </SceneViewport>
      </div>

      {/* Right/Bottom: Monitoring Panel, Findings & Event Stream */}
      <div className="w-full lg:w-96 flex-1 lg:h-full bg-ink-900 border-t lg:border-t-0 lg:border-l border-ink-700 p-4 overflow-y-auto space-y-4">
        {/* Monitoring Config & Telemetry */}
        <div className="p-3 rounded-xl bg-ink-800 border border-ink-700 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-mist-200">{t('ui_messages.sampling_interval', 'Sampling Interval')}</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={2}
                max={15}
                step={1}
                value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(parseInt(e.target.value))}
                className="w-24 accent-signal-cyan cursor-pointer"
              />
              <span className="text-xs font-condensed text-signal-cyan font-bold w-6">
                {intervalSeconds}s
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-condensed pt-2 border-t border-ink-700/60 text-mist-400">
            <div>Sampled: <strong className="text-mist-100">{framesSampled}</strong></div>
            <div>Skipped: <strong className="text-mist-100">{framesSkipped}</strong></div>
          </div>
        </div>

        {/* Latest Findings */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-mist-100">{t('ui_messages.latest_findings', 'Latest Findings')}</h3>
            {latestResult && (
              <RiskIndicator riskLevel={latestResult.overall_risk} size="sm" />
            )}
          </div>

          {selectedHazard ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSelectedHazard(null)}
                className="text-xs text-signal-cyan hover:underline"
              >
                ← {t('ui_messages.back_to_list', 'Back to list')}
              </button>
              <HazardDetail hazard={selectedHazard} onClose={() => setSelectedHazard(null)} />
            </div>
          ) : latestResult?.hazards && latestResult.hazards.length > 0 ? (
            <div className="space-y-2">
              {latestResult.hazards.map((h) => (
                <HazardRow
                  key={h.id}
                  hazard={h}
                  onSelect={(hz) => setSelectedHazard(hz)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-mist-400 italic bg-ink-800/60 p-3 rounded-xl border border-ink-700">
              {isLiveActive
                ? 'Monitoring active. Hazards will appear here when detected.'
                : 'Start camera monitoring to view real-time findings.'}
            </p>
          )}
        </div>

        {/* Coverage Limits Notice */}
        <CoverageNotes
          coverageGaps={latestResult?.scene?.coverage_gaps}
          limits={latestResult?.limits}
          samplingIntervalSeconds={intervalSeconds}
        />

        {/* Live Event Stream */}
        <EventStream events={events} />
      </div>
    </div>
  );
};
