import { describe, it, expect } from 'vitest';
import { calculateSampleTimestamps } from '../src/lib/videoFrames';

describe('videoFrames (S-06)', () => {
  it('calculates evenly spaced sample timestamps', () => {
    // 10 second video, 2 second intervals
    const timestamps = calculateSampleTimestamps(10, 2, 20, 120);
    expect(timestamps).toEqual([0, 2, 4, 6, 8]);
  });

  it('respects maxFrames cap', () => {
    // 100 second video, 1s interval, capped at 5 frames
    const timestamps = calculateSampleTimestamps(100, 1, 5, 120);
    expect(timestamps.length).toBe(5);
    expect(timestamps).toEqual([0, 1, 2, 3, 4]);
  });

  it('respects maxDuration cap', () => {
    // 60 second video, capped at 10 seconds max duration, 2s interval
    const timestamps = calculateSampleTimestamps(60, 2, 20, 10);
    expect(timestamps).toEqual([0, 2, 4, 6, 8]);
  });

  it('returns empty array for non-positive or invalid duration', () => {
    expect(calculateSampleTimestamps(0)).toEqual([]);
    expect(calculateSampleTimestamps(-5)).toEqual([]);
    expect(calculateSampleTimestamps(NaN)).toEqual([]);
  });

  it('samples at least t=0 for short video duration less than interval', () => {
    const timestamps = calculateSampleTimestamps(0.8, 2, 20, 120);
    expect(timestamps).toEqual([0]);
  });
});
