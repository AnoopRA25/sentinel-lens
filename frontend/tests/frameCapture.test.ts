import { describe, it, expect } from 'vitest';
import { calculateFitDimensions, DEFAULT_MAX_IMAGE_SIDE } from '../src/lib/frameCapture';

describe('frameCapture (S-03)', () => {
  it('preserves dimensions when both width and height are below maxSide', () => {
    const res = calculateFitDimensions(800, 600, 1600);
    expect(res).toEqual({ width: 800, height: 600 });
  });

  it('scales down landscape images when width exceeds maxSide', () => {
    const res = calculateFitDimensions(3200, 1600, 1600);
    expect(res.width).toBe(1600);
    expect(res.height).toBe(800);
  });

  it('scales down portrait images when height exceeds maxSide', () => {
    const res = calculateFitDimensions(1080, 2160, 1600);
    expect(res.height).toBe(1600);
    expect(res.width).toBe(Math.round((1080 * 1600) / 2160));
  });

  it('scales down square images correctly to maxSide', () => {
    const res = calculateFitDimensions(2048, 2048, DEFAULT_MAX_IMAGE_SIDE);
    expect(res.width).toBe(1600);
    expect(res.height).toBe(1600);
  });

  it('throws an error for zero or negative dimensions', () => {
    expect(() => calculateFitDimensions(0, 500)).toThrow();
    expect(() => calculateFitDimensions(500, -10)).toThrow();
  });
});
