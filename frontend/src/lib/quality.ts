/**
 * S-04: Image Quality Pre-check (Advisory)
 * Conforms to skills.md S-04, design.md §11, and Rule R1.
 *
 * Checks:
 * 1. Mean brightness on a ~256px grayscale copy (too dark check).
 * 2. Variance of discrete Laplacian convolution (blur check).
 * 3. Clipped pixel fraction >= 250 (glare / overexposure check).
 *
 * Advisory only: returns structured scores and user-facing hints, never a hard block.
 * Per Rule R1, user-facing text never asserts "safe" or "no danger".
 */

import { QualityCheckResult } from '../types/ui';

export interface QualityThresholds {
  /** Mean grayscale luminance below which image is considered too dark (default: 45) */
  darknessThreshold?: number;
  /** Laplacian variance below which image is considered blurry (default: 100) */
  blurThreshold?: number;
  /** Fraction of pixels with luminance >= 250 indicating glare (default: 0.15) */
  glareThreshold?: number;
  /** Sample thumbnail side length for fast computation (default: 256) */
  sampleSide?: number;
}

export const DEFAULT_THRESHOLDS: Required<QualityThresholds> = {
  darknessThreshold: 45,
  blurThreshold: 100,
  glareThreshold: 0.15,
  sampleSide: 256,
};

export const QUALITY_HINTS = {
  tooDark: 'Too dark to check reliably. Turn on a light or move closer to a window.',
  blurry: 'Image appears blurry. Hold phone steady and refocus.',
  glare: 'Strong glare detected. Adjust the angle to reduce reflection.',
} as const;

type QualityCheckInput =
  | HTMLCanvasElement
  | HTMLImageElement
  | HTMLVideoElement
  | ImageData
  | Blob;

/**
 * Converts a raw ImageData buffer into a 2D Uint8Array of grayscale values.
 */
export function toGrayscaleGrid(
  imageData: ImageData
): { grid: Uint8Array; width: number; height: number } {
  const { width, height, data } = imageData;
  const grid = new Uint8Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Standard perceptual luminance weights (Rec. 601)
    grid[p] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  return { grid, width, height };
}

/**
 * Computes mean brightness and clipped pixel (glare) fraction.
 */
export function computeLuminanceStats(
  grid: Uint8Array,
  clipThreshold = 250
): { meanBrightness: number; clippedFraction: number } {
  const total = grid.length;
  if (total === 0) {
    return { meanBrightness: 0, clippedFraction: 0 };
  }

  let sum = 0;
  let clippedCount = 0;

  for (let i = 0; i < total; i++) {
    const val = grid[i];
    sum += val;
    if (val >= clipThreshold) {
      clippedCount++;
    }
  }

  return {
    meanBrightness: sum / total,
    clippedFraction: clippedCount / total,
  };
}

/**
 * Computes blur score using the variance of discrete Laplacian convolution.
 *
 * Laplacian Kernel:
 * [ 0,  1,  0 ]
 * [ 1, -4,  1 ]
 * [ 0,  1,  0 ]
 */
export function computeLaplacianVariance(
  grid: Uint8Array,
  width: number,
  height: number
): number {
  if (width < 3 || height < 3) {
    return 0;
  }

  const innerCount = (width - 2) * (height - 2);
  if (innerCount <= 0) return 0;

  let sum = 0;
  let sumSq = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowPrev = (y - 1) * width;
    const rowCurr = y * width;
    const rowNext = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const center = grid[rowCurr + x];
      const top = grid[rowPrev + x];
      const bottom = grid[rowNext + x];
      const left = grid[rowCurr + (x - 1)];
      const right = grid[rowCurr + (x + 1)];

      const lap = top + bottom + left + right - 4 * center;

      sum += lap;
      sumSq += lap * lap;
    }
  }

  const mean = sum / innerCount;
  const variance = sumSq / innerCount - mean * mean;

  return Math.max(0, variance);
}

/**
 * Draws input onto an offscreen canvas scaled to ~sampleSide and extracts ImageData.
 */
async function extractSampleImageData(
  input: QualityCheckInput,
  sampleSide: number
): Promise<ImageData> {
  if (input instanceof ImageData) {
    return input;
  }

  let drawable: CanvasImageSource;
  let origWidth = 0;
  let origHeight = 0;

  if (input instanceof Blob) {
    const url = URL.createObjectURL(input);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
    drawable = img;
    origWidth = img.naturalWidth;
    origHeight = img.naturalHeight;
  } else if (input instanceof HTMLVideoElement) {
    drawable = input;
    origWidth = input.videoWidth;
    origHeight = input.videoHeight;
  } else if (input instanceof HTMLImageElement) {
    drawable = input;
    origWidth = input.naturalWidth || input.width;
    origHeight = input.naturalHeight || input.height;
  } else if (input instanceof HTMLCanvasElement) {
    drawable = input;
    origWidth = input.width;
    origHeight = input.height;
  } else {
    throw new Error('Unsupported input type for quality pre-check.');
  }

  if (origWidth === 0 || origHeight === 0) {
    throw new Error('Input element has zero dimensions.');
  }

  // Scale longest side to sampleSide
  let targetWidth = sampleSide;
  let targetHeight = sampleSide;
  if (origWidth >= origHeight) {
    targetWidth = sampleSide;
    targetHeight = Math.max(1, Math.round((origHeight * sampleSide) / origWidth));
  } else {
    targetHeight = sampleSide;
    targetWidth = Math.max(1, Math.round((origWidth * sampleSide) / origHeight));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to obtain canvas 2d context for quality check.');
  }

  ctx.drawImage(drawable, 0, 0, targetWidth, targetHeight);
  return ctx.getImageData(0, 0, targetWidth, targetHeight);
}

/**
 * Performs advisory image quality pre-check.
 */
export async function checkImageQuality(
  input: QualityCheckInput,
  customThresholds?: QualityThresholds
): Promise<QualityCheckResult> {
  const config = { ...DEFAULT_THRESHOLDS, ...customThresholds };

  const sampleData = await extractSampleImageData(input, config.sampleSide);
  const { grid, width, height } = toGrayscaleGrid(sampleData);

  const { meanBrightness, clippedFraction } = computeLuminanceStats(grid);
  const blurScore = computeLaplacianVariance(grid, width, height);

  const isTooDark = meanBrightness < config.darknessThreshold;
  const isBlurry = blurScore < config.blurThreshold;
  const isGlare = clippedFraction > config.glareThreshold;

  // Derive highest-priority user-facing advisory hint
  let hint: string | null = null;
  if (isTooDark) {
    hint = QUALITY_HINTS.tooDark;
  } else if (isBlurry) {
    hint = QUALITY_HINTS.blurry;
  } else if (isGlare) {
    hint = QUALITY_HINTS.glare;
  }

  const isAcceptable = !isTooDark && !isBlurry && !isGlare;

  return {
    isTooDark,
    isBlurry,
    isGlare,
    isAcceptable,
    message: hint || undefined,
    darknessScore: Number(meanBrightness.toFixed(2)),
    blurScore: Number(blurScore.toFixed(2)),
    glareScore: Number(clippedFraction.toFixed(4)),
    hint,
  };
}

// Alias for component compatibility
export const assessImageQuality = checkImageQuality;

