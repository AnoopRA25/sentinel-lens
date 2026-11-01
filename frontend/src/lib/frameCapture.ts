/**
 * S-03: Frame Capture and Compression
 * Conforms to skills.md S-03, design.md §16 (Privacy by default).
 *
 * Responsibilities:
 * 1. Draw HTMLVideoElement, CanvasImageSource, or Blob/File to an offscreen canvas.
 * 2. Downscale longest side to <= MAX_IMAGE_SIDE (default 1600px) preserving aspect ratio.
 * 3. Re-encode to image/jpeg (default quality 0.80) to strip EXIF and GPS metadata in the browser.
 * 4. Return typed CapturedFrame { blob, dataUrl?, width, height, capturedAt }.
 */

import { CapturedFrame, FrameCaptureOptions } from '../types/ui';

export { type CapturedFrame };

export const DEFAULT_MAX_IMAGE_SIDE = 1600;
export const DEFAULT_JPEG_QUALITY = 0.8;

type DrawableSource =
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap
  | Blob
  | File;

/**
 * Loads a Blob or File into an HTMLImageElement for canvas drawing.
 */
function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image from Blob: ${err}`));
    };

    img.src = url;
  });
}

/**
 * Computes scaled dimensions fitting within maxSide while preserving aspect ratio.
 */
export function calculateFitDimensions(
  srcWidth: number,
  srcHeight: number,
  maxSide: number = DEFAULT_MAX_IMAGE_SIDE
): { width: number; height: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    throw new Error(`Invalid source dimensions: ${srcWidth}x${srcHeight}`);
  }

  if (srcWidth <= maxSide && srcHeight <= maxSide) {
    return { width: Math.round(srcWidth), height: Math.round(srcHeight) };
  }

  if (srcWidth >= srcHeight) {
    const scale = maxSide / srcWidth;
    return {
      width: maxSide,
      height: Math.max(1, Math.round(srcHeight * scale)),
    };
  } else {
    const scale = maxSide / srcHeight;
    return {
      width: Math.max(1, Math.round(srcWidth * scale)),
      height: maxSide,
    };
  }
}

/**
 * Captures and scales down a frame from a CanvasImageSource,
 * re-encoding as JPEG to strip EXIF/GPS metadata.
 */
export async function captureFrameFromSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  quality: number = DEFAULT_JPEG_QUALITY
): Promise<CapturedFrame> {
  const { width: targetWidth, height: targetHeight } = calculateFitDimensions(
    sourceWidth,
    sourceHeight,
    DEFAULT_MAX_IMAGE_SIDE
  );

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to generate JPEG blob'));
      },
      'image/jpeg',
      quality
    );
  });

  return {
    blob,
    dataUrl,
    width: targetWidth,
    height: targetHeight,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Resizes and strips EXIF from a File or Blob, returning a clean JPEG Blob and dataUrl.
 */
export async function processImageFile(
  file: File | Blob,
  quality: number = DEFAULT_JPEG_QUALITY
): Promise<CapturedFrame> {
  const img = await loadImageFromBlob(file);
  return captureFrameFromSource(img, img.naturalWidth, img.naturalHeight, quality);
}

/**
 * Captures and compresses a frame from a video, image, canvas, or file.
 * Canvas re-encoding inherently strips EXIF and GPS metadata.
 */
export async function captureFrame(
  source: DrawableSource,
  options?: FrameCaptureOptions
): Promise<CapturedFrame> {
  const quality = options?.quality ?? DEFAULT_JPEG_QUALITY;

  if (source instanceof Blob) {
    return processImageFile(source, quality);
  }

  let rawWidth = 0;
  let rawHeight = 0;

  if (source instanceof HTMLVideoElement) {
    rawWidth = source.videoWidth;
    rawHeight = source.videoHeight;
    if (rawWidth === 0 || rawHeight === 0) {
      throw new Error('Video source has zero dimensions or is not ready to play.');
    }
  } else if (source instanceof HTMLImageElement) {
    rawWidth = source.naturalWidth || source.width;
    rawHeight = source.naturalHeight || source.height;
  } else if (source instanceof HTMLCanvasElement) {
    rawWidth = source.width;
    rawHeight = source.height;
  } else if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    rawWidth = source.width;
    rawHeight = source.height;
  } else {
    throw new Error('Unsupported source passed to captureFrame.');
  }

  return captureFrameFromSource(source, rawWidth, rawHeight, quality);
}
