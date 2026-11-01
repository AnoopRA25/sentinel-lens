/**
 * S-06: Video Frame Extractor (Client-Side)
 * Conforms to skills.md S-06, design.md §5, §11, and Rule R11.
 *
 * Responsibilities:
 * 1. Load video into a hidden <video muted playsinline preload="metadata"> element.
 * 2. Seek across interval timestamps without playing the entire video.
 * 3. Extract compressed JPEG frames using S-03 (captureFrame).
 * 4. Respect frame count caps (default <= 20) and max duration caps.
 * 5. Report seek progress via callback.
 * 6. Support cancellation via AbortSignal.
 * 7. Clean up Object URLs on completion, cancellation, or failure.
 * 8. Never upload the raw video file.
 */

import { captureFrame } from './frameCapture';
import {
  VideoExtractionOptions,
  VideoFrameResult,
  FrameCaptureOptions,
} from '../types/ui';

export const DEFAULT_VIDEO_INTERVAL_SECONDS = 2.0;
export const DEFAULT_MAX_VIDEO_FRAMES = 20;
export const DEFAULT_MAX_VIDEO_DURATION_SECONDS = 120;
const SEEK_TIMEOUT_MS = 6000;

/**
 * Calculates timestamps to extract from video duration.
 */
export function calculateSampleTimestamps(
  duration: number,
  intervalSeconds: number = DEFAULT_VIDEO_INTERVAL_SECONDS,
  maxFrames: number = DEFAULT_MAX_VIDEO_FRAMES,
  maxDuration: number = DEFAULT_MAX_VIDEO_DURATION_SECONDS
): number[] {
  if (!isFinite(duration) || duration <= 0) {
    return [];
  }

  const effectiveDuration = Math.min(duration, maxDuration);
  const step = Math.max(0.1, intervalSeconds);
  const timestamps: number[] = [];

  for (let t = 0; t < effectiveDuration && timestamps.length < maxFrames; t += step) {
    // Snap to 2 decimal places to avoid floating point drift
    timestamps.push(Math.round(t * 100) / 100);
  }

  // If video is short but no frames added, at least sample t=0
  if (timestamps.length === 0 && effectiveDuration > 0) {
    timestamps.push(0);
  }

  return timestamps;
}

/**
 * Waits for a video element to complete a seek operation with a timeout safety guard.
 */
function waitForSeek(video: HTMLVideoElement, timeoutMs = SEEK_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onSeeked = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(
        new Error(
          video.error?.message ||
            'This browser cannot decode this video format. Try Live mode or record again.'
        )
      );
    };

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Video seek timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
  });
}

/**
 * Extracts sampled frames from a video File or Blob on the client.
 */
export async function extractVideoFrames(
  source: File | Blob,
  options?: VideoExtractionOptions,
  captureOptions?: FrameCaptureOptions
): Promise<VideoFrameResult[]> {
  const intervalSeconds = options?.intervalSeconds ?? DEFAULT_VIDEO_INTERVAL_SECONDS;
  const maxFrames = options?.maxFrames ?? DEFAULT_MAX_VIDEO_FRAMES;
  const maxDuration = options?.maxDurationSeconds ?? DEFAULT_MAX_VIDEO_DURATION_SECONDS;
  const onProgress = options?.onProgress;
  const signal = options?.signal;

  if (signal?.aborted) {
    throw new DOMException('Video extraction was aborted.', 'AbortError');
  }

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.style.display = 'none';

  const objectUrl = URL.createObjectURL(source);
  video.src = objectUrl;

  try {
    // Wait for metadata to load
    await new Promise<void>((resolve, reject) => {
      const onLoadedMetadata = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(
          new Error(
            'This browser cannot decode this video format. Try Live mode or record again.'
          )
        );
      };

      const onAbort = () => {
        cleanup();
        reject(new DOMException('Video extraction was aborted.', 'AbortError'));
      };

      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };

      if (signal) {
        signal.addEventListener('abort', onAbort);
      }
      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('error', onError);
    });

    if (signal?.aborted) {
      throw new DOMException('Video extraction was aborted.', 'AbortError');
    }

    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) {
      throw new Error('Could not determine valid video duration.');
    }

    const sampleTimestamps = calculateSampleTimestamps(
      duration,
      intervalSeconds,
      maxFrames,
      maxDuration
    );

    const totalFrames = sampleTimestamps.length;
    const results: VideoFrameResult[] = [];

    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) {
        throw new DOMException('Video extraction was aborted.', 'AbortError');
      }

      const targetTime = sampleTimestamps[i];
      video.currentTime = targetTime;
      await waitForSeek(video);

      const captured = await captureFrame(video, captureOptions);

      results.push({
        frame: captured,
        timestamp: targetTime,
        index: i,
      });

      if (onProgress) {
        onProgress({
          currentFrame: i + 1,
          totalFrames,
          timestamp: targetTime,
          percent: Math.round(((i + 1) / totalFrames) * 100),
        });
      }
    }

    return results;
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute('src');
    video.load();
  }
}

/**
 * Convenience wrapper returning CapturedFrame[] for components expecting frame arrays.
 */
export async function extractFramesFromVideo(
  source: File | Blob,
  options?: {
    intervalSeconds?: number;
    maxFrames?: number;
    maxDurationSeconds?: number;
    onProgress?: (current: number, total: number) => void;
    signal?: AbortSignal;
  }
): Promise<import('../types/ui').CapturedFrame[]> {
  const convertedOptions: VideoExtractionOptions = {
    intervalSeconds: options?.intervalSeconds,
    maxFrames: options?.maxFrames,
    maxDurationSeconds: options?.maxDurationSeconds,
    signal: options?.signal,
    onProgress: options?.onProgress
      ? (p) => options.onProgress!(p.currentFrame, p.totalFrames)
      : undefined,
  };
  const results = await extractVideoFrames(source, convertedOptions);
  return results.map((r) => r.frame);
}

