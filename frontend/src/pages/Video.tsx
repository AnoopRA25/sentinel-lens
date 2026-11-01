import React, { useState, useRef } from 'react';
import { VideoPanel } from '../components/ui/VideoPanel';
import { CoverageNotes } from '../components/report/CoverageNotes';
import { HazardRow } from '../components/hazards/HazardRow';
import { HazardDetail } from '../components/hazards/HazardDetail';
import { RiskIndicator } from '../components/hazards/RiskIndicator';
import { extractFramesFromVideo } from '../lib/videoFrames';
import { analyzeImage } from '../services/api';
import { useHistory } from '../hooks/useHistory';
import { PersonCategory, Language, Hazard, RiskLevel } from '../types/api';
import { Film, Upload, Video as VideoIcon } from 'lucide-react';

interface MergedHazardItem {
  hazard: Hazard;
  sightings: number;
  totalFrames: number;
  maxRisk: RiskLevel;
}

interface VideoPageProps {
  personCategory: PersonCategory;
  language: Language;
}

export const Video: React.FC<VideoPageProps> = ({ personCategory, language }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [intervalSeconds, setIntervalSeconds] = useState<number>(5);
  const [maxFrames, setMaxFrames] = useState<number>(20);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressCurrent, setProgressCurrent] = useState<number>(0);
  const [progressTotal, setProgressTotal] = useState<number>(0);
  const [mergedHazards, setMergedHazards] = useState<MergedHazardItem[]>([]);
  const [overallVideoRisk, setOverallVideoRisk] = useState<RiskLevel>('low');
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [analyzedCount, setAnalyzedCount] = useState<number>(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const { saveResult } = useHistory();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setMergedHazards([]);
      setAnalyzedCount(0);
    }
  };

  const handleStartAnalysis = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setProgressCurrent(0);
    setProgressTotal(0);
    setMergedHazards([]);
    setSelectedHazard(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Step 1: Extract frames in browser (does NOT upload video)
      const frames = await extractFramesFromVideo(selectedFile, {
        intervalSeconds,
        maxFrames,
        signal: controller.signal,
        onProgress: (current, total) => {
          setProgressCurrent(current);
          setProgressTotal(total);
        },
      });

      const totalFrames = frames.length;
      setProgressTotal(totalFrames);

      // Step 2: Analyze each extracted frame sequentially
      const hazardMap = new Map<string, { hazard: Hazard; sightings: number; maxRisk: RiskLevel }>();
      let highestRisk: RiskLevel = 'low';

      for (let i = 0; i < totalFrames; i++) {
        if (controller.signal.aborted) break;

        setProgressCurrent(i + 1);
        const frame = frames[i];

        try {
          const res = await analyzeImage(
            frame.blob,
            personCategory,
            language,
            'quick',
            'video_frame',
            undefined,
            frame.capturedAt
          );

          if (res.overall_risk === 'high') highestRisk = 'high';
          else if (res.overall_risk === 'medium' && highestRisk !== 'high') highestRisk = 'medium';

          // Group sightings by title / category
          (res.hazards || []).forEach((h) => {
            const key = `${h.category_id}_${h.title.toLowerCase().trim()}`;
            const existing = hazardMap.get(key);
            if (existing) {
              existing.sightings += 1;
              if (h.risk.level === 'high') existing.maxRisk = 'high';
              else if (h.risk.level === 'medium' && existing.maxRisk !== 'high') existing.maxRisk = 'medium';
            } else {
              hazardMap.set(key, {
                hazard: h,
                sightings: 1,
                maxRisk: h.risk.level,
              });
            }
          });

          // Save scan result to history
          saveResult(res);
        } catch (frameErr) {
          console.warn(`Frame ${i + 1} analysis failed:`, frameErr);
        }
      }

      setAnalyzedCount(totalFrames);
      setOverallVideoRisk(highestRisk);

      const mergedList: MergedHazardItem[] = Array.from(hazardMap.values()).map((item) => ({
        hazard: item.hazard,
        sightings: item.sightings,
        totalFrames,
        maxRisk: item.maxRisk,
      }));

      // Sort by sightings descending, then high risk
      mergedList.sort((a, b) => b.sightings - a.sightings);
      setMergedHazards(mergedList);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        alert(err.message || 'Video analysis encountered an error');
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="w-full h-full p-4 sm:p-6 overflow-y-auto space-y-6 max-w-4xl mx-auto">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-700 pb-3">
        <div>
          <h1 className="text-lg font-bold text-mist-100 flex items-center gap-2">
            <Film className="w-5 h-5 text-signal-cyan" />
            Video Frame Extraction & Hazard Scan
          </h1>
          <p className="text-xs text-mist-400 mt-1">
            Browser-side periodic frame sampling. Video file is not transmitted to server.
          </p>
        </div>
      </div>

      {/* Video File Selector Box */}
      {!selectedFile ? (
        <div className="p-8 rounded-2xl border-2 border-dashed border-ink-700 bg-ink-850 bg-ink-800/50 hover:bg-ink-800 transition-colors flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-ink-700 flex items-center justify-center text-signal-cyan">
            <VideoIcon className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-mist-100">Select or Record a Video Clip</h2>
            <p className="text-xs text-mist-400 mt-1">MP4, WebM, or MOV up to 2 minutes</p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-signal-cyan hover:bg-signal-cyan/90 text-ink-900 font-bold text-xs flex items-center gap-1.5 transition-colors shadow"
            >
              <VideoIcon className="w-4 h-4" />
              <span>Record Video</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-ink-700 hover:bg-ink-600 text-mist-100 font-semibold text-xs flex items-center gap-1.5 transition-colors border border-ink-600"
            >
              <Upload className="w-4 h-4" />
              <span>Upload File</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* File summary pill */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-ink-800 border border-ink-700 text-xs">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-signal-cyan" />
              <span className="font-semibold text-mist-100">{selectedFile.name}</span>
              <span className="text-mist-400">({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)</span>
            </div>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setSelectedFile(null)}
              className="text-xs text-risk-medium hover:underline disabled:opacity-50"
            >
              Change clip
            </button>
          </div>

          {/* Configuration and Progress Panel */}
          <VideoPanel
            intervalSeconds={intervalSeconds}
            onIntervalChange={(sec) => setIntervalSeconds(typeof sec === 'function' ? sec(intervalSeconds) : sec)}
            maxFrames={maxFrames}
            onMaxFramesChange={(max) => setMaxFrames(typeof max === 'function' ? max(maxFrames) : max)}
            isProcessing={isProcessing}
            currentFrame={progressCurrent}
            totalFrames={progressTotal}
            onStartAnalysis={handleStartAnalysis}
            onCancel={handleCancel}
            hasFileSelected={true}
          />
        </div>
      )}

      {/* Merged Findings Summary */}
      {mergedHazards.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-ink-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-mist-100">
                Merged Video Findings ({analyzedCount} frames sampled)
              </h2>
              <p className="text-xs text-mist-400 mt-0.5">
                Sightings frequency across extracted timeline frames
              </p>
            </div>
            <RiskIndicator riskLevel={overallVideoRisk} />
          </div>

          {selectedHazard ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setSelectedHazard(null)}
                className="text-xs text-signal-cyan hover:underline"
              >
                ← Back to merged list
              </button>
              <HazardDetail hazard={selectedHazard} onClose={() => setSelectedHazard(null)} />
            </div>
          ) : (
            <div className="space-y-3">
              {mergedHazards.map((item, idx) => (
                <div key={idx} className="relative">
                  <HazardRow
                    hazard={item.hazard}
                    onSelect={(h) => setSelectedHazard(h)}
                  />
                  <div className="absolute top-3 right-8 px-2 py-0.5 rounded-full bg-ink-900 border border-ink-700 text-[11px] font-condensed text-signal-cyan">
                    seen in {item.sightings} of {item.totalFrames} frames
                  </div>
                </div>
              ))}
            </div>
          )}

          <CoverageNotes
            samplingIntervalSeconds={intervalSeconds}
            limits="Video analysis is based on discrete frames sampled at regular intervals. Transitory events between frames were not captured."
          />
        </div>
      )}
    </div>
  );
};
