import { describe, expect, it } from 'vitest';
import { colorDelta, pixelDiff } from '../src/core/pixelDiff';
import { fillRect, makeBitmap } from '../src/core/bitmap';
import { blank, BLACK } from './helpers';

describe('pixelDiff', () => {
  it('reports zero changes for identical images', () => {
    const a = blank(20, 20);
    const b = blank(20, 20);
    fillRect(a, { x: 2, y: 2, w: 5, h: 5 }, BLACK);
    fillRect(b, { x: 2, y: 2, w: 5, h: 5 }, BLACK);
    const diff = pixelDiff(a, b);
    expect(diff.changed).toBe(0);
    expect(diff.mask.every((v) => v === 0)).toBe(true);
  });

  it('detects a changed rectangle', () => {
    const a = blank(20, 20);
    const b = blank(20, 20);
    fillRect(b, { x: 5, y: 5, w: 6, h: 6 }, BLACK);
    const diff = pixelDiff(a, b);
    // All 36 pixels differ; some may be discounted as anti-aliasing.
    expect(diff.changed + diff.antialiased).toBe(36);
    expect(diff.changed).toBeGreaterThan(20);
    expect(diff.mask[5 * 20 + 5]).not.toBe(0);
    expect(diff.mask[0]).toBe(0);
  });

  it('ignores sub-threshold color noise', () => {
    const a = makeBitmap(10, 10, [200, 200, 200, 255]);
    const b = makeBitmap(10, 10, [204, 202, 199, 255]);
    expect(pixelDiff(a, b, 0.1).changed).toBe(0);
    // A tighter threshold catches it.
    expect(pixelDiff(a, b, 0.005).changed).toBe(100);
  });

  it('classifies a smoothed edge pixel as anti-aliasing', () => {
    // A: sharp black/white vertical edge. B: same edge with a gray blend column.
    const a = blank(12, 12);
    const b = blank(12, 12);
    fillRect(a, { x: 0, y: 0, w: 6, h: 12 }, BLACK);
    fillRect(b, { x: 0, y: 0, w: 6, h: 12 }, BLACK);
    fillRect(b, { x: 6, y: 0, w: 1, h: 12 }, [128, 128, 128, 255]);
    const smart = pixelDiff(a, b, 0.1, true);
    expect(smart.changed).toBe(0);
    expect(smart.antialiased).toBe(12);
    const strict = pixelDiff(a, b, 0.1, false);
    expect(strict.changed).toBe(12);
  });

  it('treats transparency as white background', () => {
    const a = makeBitmap(4, 4); // transparent
    const b = blank(4, 4); // opaque white
    expect(pixelDiff(a, b).changed).toBe(0);
    expect(colorDelta(a, b, 0)).toBe(0);
  });

  it('throws on size mismatch', () => {
    expect(() => pixelDiff(blank(4, 4), blank(5, 4))).toThrow(/same-sized/);
  });
});
