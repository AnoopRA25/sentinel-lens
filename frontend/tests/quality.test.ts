import { describe, it, expect } from 'vitest';
import {
  computeLuminanceStats,
  computeLaplacianVariance,
  toGrayscaleGrid,
  QUALITY_HINTS,
} from '../src/lib/quality';

describe('quality pre-check (S-04)', () => {
  it('correctly calculates mean brightness and clipped pixel fraction', () => {
    // 4 pixels: [0, 50, 100, 255]
    const grid = new Uint8Array([0, 50, 100, 255]);
    const stats = computeLuminanceStats(grid, 250);

    expect(stats.meanBrightness).toBeCloseTo((0 + 50 + 100 + 255) / 4);
    // 1 pixel >= 250 out of 4 -> 0.25
    expect(stats.clippedFraction).toBe(0.25);
  });

  it('computes zero Laplacian variance on completely uniform flat grid', () => {
    // 4x4 uniform grid
    const width = 4;
    const height = 4;
    const grid = new Uint8Array(width * height).fill(128);

    const variance = computeLaplacianVariance(grid, width, height);
    expect(variance).toBe(0);
  });

  it('computes positive Laplacian variance on textured grid (sharp edges)', () => {
    // 5x5 grid with a high-contrast step edge in the center
    const width = 5;
    const height = 5;
    const grid = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        grid[y * width + x] = x < 2 ? 10 : 220;
      }
    }

    const variance = computeLaplacianVariance(grid, width, height);
    expect(variance).toBeGreaterThan(0);
  });

  it('converts RGBA ImageData to grayscale accurately', () => {
    // 2x1 ImageData
    const width = 2;
    const height = 1;
    // Pixel 1: Pure White [255, 255, 255, 255]
    // Pixel 2: Pure Black [0, 0, 0, 255]
    const data = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 255,
    ]);

    const fakeImageData = { width, height, data } as unknown as ImageData;
    const { grid } = toGrayscaleGrid(fakeImageData);

    expect(grid[0]).toBe(255);
    expect(grid[1]).toBe(0);
  });

  it('complies with Rule R1: quality hints never contain forbidden words (safe, no danger, all clear)', () => {
    const forbidden = ['safe', 'no danger', 'all clear'];
    const hints = Object.values(QUALITY_HINTS);

    for (const hint of hints) {
      const lower = hint.toLowerCase();
      for (const phrase of forbidden) {
        expect(lower).not.toContain(phrase);
      }
    }
  });
});
