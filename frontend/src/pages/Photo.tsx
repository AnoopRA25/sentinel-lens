import React, { useState, useRef, useMemo } from 'react';
import {
  SceneViewport,
  CoverageArc,
  NativeCapture,
  NativeCaptureRef,
  QualityHint,
  PipelineStrip,
  ResultSheet,
} from '../components';
import { processImageFile, CapturedFrame } from '../lib/frameCapture';
import { assessImageQuality } from '../lib/quality';
import { QualityCheckResult, CoverageSegment } from '../types/ui';
import { AnalysisResult, PersonCategory, Language, TraceEvent, PipelineEvent } from '../types/api';
import { analyzeImage, createAnalysisJob, streamJobEvents } from '../services/api';
import { useHistory } from '../hooks/useHistory';
import { Camera, Image as ImageIcon, Sparkles, Zap, RotateCcw } from 'lucide-react';
import { useTranslation } from '../i18n';

interface PhotoPageProps {
  personCategory: PersonCategory;
  language: Language;
  segments: CoverageSegment[];
  onRecordScan: (result: AnalysisResult, thumbnail?: string) => void;
  onFinishSweep?: () => void;
  onSheetSnapChange?: (snap: 'peek' | 'half' | 'full' | null) => void;
}

export const Photo: React.FC<PhotoPageProps> = ({
  personCategory,
  language,
  segments,
  onRecordScan,
  onFinishSweep,
  onSheetSnapChange,
}) => {
  const [currentFrame, setCurrentFrame] = useState<CapturedFrame | null>(null);
  const [quality, setQuality] = useState<QualityCheckResult | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [currentNode, setCurrentNode] = useState<string | null>(null);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [pipelineEvents, setPipelineEvents] = useState<PipelineEvent[]>([]);
  const [mode, setMode] = useState<'quick' | 'deep'>('quick');

  const nativeCaptureRef = useRef<NativeCaptureRef | null>(null);
  const { saveResult } = useHistory();
  const { t, translateResult } = useTranslation();

  const localizedResult = useMemo(() => {
    return result ? translateResult(result, language) : null;
  }, [result, language, translateResult]);

  const completedSweepCount = segments.filter(
    (s) => s.state === 'done' || s.state === 'inconclusive'
  ).length;

  const handleFileSelected = async (file: File) => {
    try {
      setResult(null);
      setTraceEvents([]);
      setPipelineEvents([]);
      const processed = await processImageFile(file);
      setCurrentFrame(processed);

      // Pre-check quality
      const img = new Image();
      img.src = processed.dataUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const qResult = await assessImageQuality(img);
      setQuality(qResult);

      if (qResult.isAcceptable) {
        runAnalysis(processed.blob, processed.dataUrl);
      }
    } catch (err) {
      console.error('File selection error:', err);
    }
  };

  const runAnalysis = async (blob: Blob, thumbnail?: string) => {
    setInFlight(true);
    setCurrentNode('ingest');

    // Simulate stepping through the 9 specialized agents in sequence during processing
    const pipelineSequence = [
      'ingest',
      'perceive',
      'classify',
      'person_context',
      'assess_risk',
      'retrieve_guidelines',
      'verify',
      'report',
      'notify',
    ];
    let stepIndex = 0;
    const progressTimer = setInterval(() => {
      stepIndex = (stepIndex + 1) % pipelineSequence.length;
      setCurrentNode((curr) => {
        return curr === null || pipelineSequence.includes(curr)
          ? pipelineSequence[stepIndex]
          : curr;
      });
    }, 700);

    try {
      // Try async job with SSE streaming first for live pipeline reflection
      try {
        const { job_id } = await createAnalysisJob(blob, personCategory, language, mode, 'photo');

        await new Promise<AnalysisResult>((resolve, reject) => {
          streamJobEvents(
            job_id,
            (event) => {
              if (event.node) {
                setCurrentNode(event.node);
              }
              setPipelineEvents((prev) => [...prev, event]);
              if (event.node) {
                setTraceEvents((prev) => [
                  ...prev,
                  {
                    node: event.node!,
                    status: event.type === 'node_failed' ? 'failed' : 'ok',
                    duration_ms: event.duration_ms || 0,
                    summary: event.summary,
                    ts: event.ts,
                  },
                ]);
              }
            },
            (finalRes) => {
              resolve(finalRes);
            },
            (err) => {
              reject(err);
            }
          );
        }).then((res) => {
          handleAnalysisSuccess(res, thumbnail);
        });
      } catch (jobErr) {
        console.warn('Job stream unavailable, falling back to direct analyze:', jobErr);
        const res = await analyzeImage(blob, personCategory, language, mode, 'photo');
        handleAnalysisSuccess(res, thumbnail);
      }
    } catch (err: any) {
      console.error('Analysis failed:', err);
      // R1: A failed analysis is NEVER shown as safe. Outcomes are exactly: hazards_found, none_observed, inconclusive, failed.
      const fallbackFail: AnalysisResult = {
        id: `fail_${Date.now()}`,
        timestamp: new Date().toISOString(),
        outcome: 'failed',
        analysis_reliable: false,
        person_category: personCategory,
        language,
        scene: {
          environment: 'unknown',
          summary: 'Analysis did not complete.',
          quality_flags: ['error'],
          coverage_gaps: ['Whole image could not be analyzed.'],
        },
        hazards: [],
        overall_risk: 'uncertain',
        immediate_action: false,
        verification: {
          status: 'failed_fallback',
          issues: [err.message || 'Network or model error'],
          changes: [],
          retries_used: 0,
        },
        notification: {
          status: 'failed',
          reason: 'Analysis did not complete',
        },
        errors: [err.message || 'Failed analysis'],
        trace: traceEvents,
        limits: 'Analysis did not complete. No safety inference should be made.',
        source: 'photo',
      };
      setResult(fallbackFail);
      onRecordScan(fallbackFail, thumbnail);
    } finally {
      clearInterval(progressTimer);
      setInFlight(false);
      setCurrentNode(null);
    }
  };

  const handleAnalysisSuccess = (res: AnalysisResult, thumbnail?: string) => {
    setResult(res);
    setTraceEvents(res.trace || []);
    onRecordScan(res, thumbnail);
    saveResult(res);
  };

  const handleShutterClick = () => {
    if (!currentFrame || result) {
      nativeCaptureRef.current?.triggerPhotoCamera();
    } else {
      runAnalysis(currentFrame.blob, currentFrame.dataUrl);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between overflow-hidden bg-[#030302] text-[#FBFAF9] font-mono">
      <NativeCapture
        ref={nativeCaptureRef}
        onFile={(file) => handleFileSelected(file)}
        acceptMode="photo"
      />

      {/* Top Capture HUD: Monospace Sweep Progress + Mode Toggle */}
      <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
        {/* Monospace Sweep Progress HUD */}
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-full bg-[#252422]/90 border border-[#151513] text-[#FBFAF9] text-xs font-mono shadow-md backdrop-blur-md flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FF6542] animate-pulse" />
            <span className="text-[#898580]">{t('ui_messages.sweep', 'SWEEP:')}</span>
            <span className="font-bold tracking-wider">
              [&nbsp;{completedSweepCount}&nbsp;/&nbsp;{segments.length}&nbsp;]
            </span>
          </div>

          {/* Monospace Quality Indicator Badge */}
          {quality && (
            <div
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-mono backdrop-blur-md ${
                quality.isAcceptable
                  ? 'bg-[#252422]/90 text-[#FBFAF9] border-[#151513]'
                  : 'bg-[#252422]/90 text-[#FF6542] border-[#FF6542]/40'
              }`}
            >
              <span className="text-[#898580]">{t('ui_messages.quality', 'QUALITY:')}</span>
              <span className="font-semibold uppercase">
                {quality.isAcceptable
                  ? 'PASS [OK]'
                  : `FLAG [${quality.isTooDark ? 'DARK' : quality.isBlurry ? 'BLUR' : quality.isGlare ? 'GLARE' : 'WARN'}]`}
              </span>
            </div>
          )}
        </div>

        {/* Mode Toggle: Quick vs Deep in Dark Solid Pill Controls */}
        <div className="pointer-events-auto bg-[#252422] border border-[#151513] rounded-full p-1 flex items-center shadow-lg backdrop-blur-md">
          <button
            type="button"
            onClick={() => setMode('quick')}
            className={`px-3 py-1 rounded-full text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer ${
              mode === 'quick'
                ? 'bg-[#353431] text-[#FBFAF9] font-medium border border-[#FF6542]/40 shadow-sm'
                : 'text-[#898580] hover:text-[#FBFAF9]'
            }`}
          >
            <Zap className="w-3 h-3 text-[#FF6542]" />
            <span>{t('ui_messages.quick', 'Quick')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('deep')}
            className={`px-3 py-1 rounded-full text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer ${
              mode === 'deep'
                ? 'bg-[#353431] text-[#FBFAF9] font-medium border border-[#FF6542]/40 shadow-sm'
                : 'text-[#898580] hover:text-[#FBFAF9]'
            }`}
          >
            <Sparkles className="w-3 h-3 text-[#FF6542]" />
            <span>{t('ui_messages.deep', 'Deep')}</span>
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden">
        <SceneViewport
          imageSrc={currentFrame?.dataUrl}
          isInFlight={inFlight}
          activeNode={currentNode}
          overallRisk={result?.overall_risk}
          hasResult={Boolean(result)}
          className="w-full h-full"
        >
          {/* Empty state prompt */}
          {!currentFrame && (
            <div className="text-center p-6 space-y-4 max-w-sm mx-auto z-10 bg-[#252422]/80 backdrop-blur-md border border-[#151513] rounded-2xl shadow-2xl">
              <div className="w-14 h-14 rounded-2xl bg-[#181818] border border-[#151513] flex items-center justify-center mx-auto text-[#FF6542]">
                <Camera className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-[#898580] font-mono uppercase tracking-[0.2em] block">
                  OPTICAL_SENSOR // READY
                </span>
                <h2 className="text-base font-bold text-[#FBFAF9] font-display">
                  {t('ui_messages.point_camera', 'Point Camera at Area')}
                </h2>
                <p className="text-xs text-[#898580] leading-relaxed">
                  {t('ui_messages.point_camera_desc', { person: t(`person_categories.${personCategory}`, personCategory) }, `Capture room view to detect hazards for demographic: ${personCategory}.`)}
                </p>
              </div>

              {/* Terminal Ember Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5 w-full">
                <button
                  type="button"
                  onClick={() => nativeCaptureRef.current?.triggerPhotoCamera()}
                  className="btn-hero-primary bg-[#FBFAF9] text-[#353431] rounded-full px-5 py-3 font-mono font-medium shadow-sm hover:bg-[#FBF9F9] flex items-center gap-2 text-xs w-full sm:w-auto justify-center cursor-pointer transition-transform active:scale-95 min-h-[48px] touch-manipulation"
                >
                  <Camera className="w-4 h-4 text-[#FF6542]" />
                  <span>{t('ui_messages.take_photo', 'Take photo')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => nativeCaptureRef.current?.triggerPhotoPicker()}
                  className="btn-dark-solid bg-[#353431] text-[#FBFAF9] rounded-full px-5 py-3 font-mono text-xs flex items-center gap-2 border border-[#151513] hover:bg-[#151513] w-full sm:w-auto justify-center cursor-pointer min-h-[48px] touch-manipulation active:scale-95"
                >
                  <ImageIcon className="w-4 h-4 text-[#898580]" />
                  <span>{t('ui_messages.gallery', 'Gallery')}</span>
                </button>
              </div>
            </div>
          )}
        </SceneViewport>
      </div>

      {/* Floating Controls Bar */}
      <div className="w-full z-20 px-4 pb-3 flex flex-col items-center">
        {quality && !quality.isAcceptable && !result && (
          <div className="w-full max-w-md mb-2">
            <QualityHint
              assessment={{
                isAcceptable: false,
                message: quality.message || quality.hint || undefined,
              }}
              onRetake={() => nativeCaptureRef.current?.triggerPhotoCamera()}
              onAnalyzeAnyway={() => currentFrame && runAnalysis(currentFrame.blob, currentFrame.dataUrl)}
            />
          </div>
        )}

        <div className="w-full max-w-xl">
          <PipelineStrip
            activeNode={currentNode}
            completedNodes={traceEvents.filter((t) => t.status === 'ok').map((t) => t.node)}
            failedNodes={traceEvents.filter((t) => t.status === 'failed').map((t) => t.node)}
            events={pipelineEvents}
          />
        </div>

        {/* Shutter / Trigger Area */}
        <div className="my-2 flex flex-col items-center gap-2">
          {/* Main Action Trigger Buttons */}
          {currentFrame && !result && !inFlight ? (
            <button
              type="button"
              onClick={() => runAnalysis(currentFrame.blob, currentFrame.dataUrl)}
              className="bg-[#FF6542] hover:bg-[#FF6542]/90 text-white rounded-full px-7 py-3 min-h-[48px] font-mono text-xs sm:text-sm font-bold shadow-[0_0_24px_rgba(255,101,66,0.4)] flex items-center gap-2 cursor-pointer transition-transform active:scale-95 animate-pulse touch-manipulation"
            >
              <Sparkles className="w-4 h-4" />
              <span>{t('ui_messages.run_audit_scan', 'RUN AUDIT SCAN')}</span>
            </button>
          ) : (
            <CoverageArc
              segments={segments}
              isScanning={inFlight}
              onCapture={handleShutterClick}
              onFinishSweep={onFinishSweep}
            />
          )}

          {/* Quick Rescan / Retake Affordance if frame captured */}
          {currentFrame && !inFlight && !result && (
            <button
              type="button"
              onClick={() => {
                setCurrentFrame(null);
                setQuality(null);
                onSheetSnapChange?.(null);
                nativeCaptureRef.current?.triggerPhotoCamera();
              }}
              className="text-xs text-[#898580] hover:text-[#FBFAF9] flex items-center gap-1.5 font-mono transition-colors cursor-pointer min-h-[44px] py-2 px-3 touch-manipulation active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('ui_messages.discard_retake', 'Discard & Retake')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom Result Sheet */}
      {localizedResult && (
        <ResultSheet
          result={localizedResult}
          onSnapChange={(snap) => onSheetSnapChange?.(snap)}
          onRescan={() => {
            setResult(null);
            setCurrentFrame(null);
            setQuality(null);
            onSheetSnapChange?.(null);
            nativeCaptureRef.current?.triggerPhotoCamera();
          }}
          onSave={(res) => saveResult(res)}
        />
      )}
    </div>
  );
};
