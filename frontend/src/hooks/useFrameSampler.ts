import { useState, useRef, useEffect, useCallback } from 'react';
import { captureFrameFromSource } from '../lib/frameCapture';

export interface UseFrameSamplerOptions {
  intervalSeconds?: number;
  intervalMs?: number;
  isActive?: boolean;
  enabled?: boolean;
  isPaused?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
  onFrame?: (blob: Blob) => Promise<void>;
  onSample?: () => Promise<void>;
  onError?: (err: Error) => void;
  maxConsecutiveErrors?: number;
}

export function useFrameSampler({
  intervalSeconds = 5,
  intervalMs,
  isActive = false,
  enabled,
  isPaused = false,
  videoRef,
  onFrame,
  onSample,
  onError,
}: UseFrameSamplerOptions) {
  const effectiveIntervalMs = intervalMs ?? intervalSeconds * 1000;
  const initialActive = enabled ?? isActive;

  const [isRunning, setIsRunning] = useState<boolean>(initialActive);
  const [paused, setPaused] = useState<boolean>(isPaused);
  const [inFlight, setInFlight] = useState<boolean>(false);
  const [framesSampled, setFramesSampled] = useState<number>(0);
  const [framesSkipped, setFramesSkipped] = useState<number>(0);

  const inFlightRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setIsRunning(enabled ?? isActive);
  }, [enabled, isActive]);

  useEffect(() => {
    setPaused(isPaused);
  }, [isPaused]);

  const executeTick = useCallback(async () => {
    if (!isRunning || paused) {
      if (paused) {
        setFramesSkipped((prev) => prev + 1);
      }
      return;
    }

    // STRICT NO-OVERLAP RULE (S-05):
    // Skip tick if previous in-flight request is pending. Never queue.
    if (inFlightRef.current) {
      setFramesSkipped((prev) => prev + 1);
      return;
    }

    try {
      inFlightRef.current = true;
      setInFlight(true);

      if (onSample) {
        await onSample();
        setFramesSampled((prev) => prev + 1);
      } else if (onFrame && videoRef?.current) {
        const video = videoRef.current;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const captured = await captureFrameFromSource(
            video,
            video.videoWidth,
            video.videoHeight,
            0.8
          );
          setFramesSampled((prev) => prev + 1);
          await onFrame(captured.blob);
        }
      }
    } catch (err: any) {
      console.warn('Frame sampler error:', err);
      onError?.(err);
    } finally {
      inFlightRef.current = false;
      setInFlight(false);
    }
  }, [isRunning, paused, onSample, onFrame, videoRef, onError]);

  useEffect(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (isRunning) {
      timerRef.current = window.setInterval(executeTick, effectiveIntervalMs);
    }

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning, effectiveIntervalMs, executeTick]);


  const start = useCallback(() => {
    setIsRunning(true);
    setPaused(false);
  }, []);

  const stop = useCallback(() => {
    setIsRunning(false);
    setPaused(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    inFlightRef.current = false;
    setInFlight(false);
  }, []);

  const pause = useCallback(() => {
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    setPaused(false);
  }, []);

  return {
    inFlight,
    framesSampled,
    tickCount: framesSampled,
    framesSkipped,
    skipCount: framesSkipped,
    isRunning,
    isPaused: paused,
    start,
    stop,
    pause,
    resume,
    triggerNow: executeTick,
    triggerManualSample: executeTick,
  };
}
