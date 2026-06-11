import { describe, expect, it } from 'vitest';
import { fitWithin, JPEG_QUALITY, MAX_DIMENSION } from './photo.js';

describe('fitWithin', () => {
  it('leaves small images untouched', () => {
    expect(fitWithin(640, 480, 1280)).toEqual({ width: 640, height: 480 });
  });

  it('never upscales an exact-fit image', () => {
    expect(fitWithin(1280, 720, 1280)).toEqual({ width: 1280, height: 720 });
  });

  it('scales a landscape iPhone photo down by its long edge', () => {
    // 4032×3024 is the standard 12 MP iPhone frame.
    expect(fitWithin(4032, 3024, 1280)).toEqual({ width: 1280, height: 960 });
  });

  it('scales a portrait photo down by its long edge', () => {
    expect(fitWithin(3024, 4032, 1280)).toEqual({ width: 960, height: 1280 });
  });

  it('preserves extreme aspect ratios without collapsing to zero', () => {
    const out = fitWithin(10000, 10, 1280);
    expect(out.width).toBe(1280);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });

  it('exports sane defaults', () => {
    expect(MAX_DIMENSION).toBe(1280);
    expect(JPEG_QUALITY).toBeGreaterThan(0.5);
    expect(JPEG_QUALITY).toBeLessThan(1);
  });
});
