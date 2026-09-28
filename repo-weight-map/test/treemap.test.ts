import { describe, expect, it } from 'vitest';
import { inset, squarify, type Rect } from '../src/core/treemap.js';

const area = (r: Rect): number => r.w * r.h;

describe('squarify', () => {
  it('tiles the bounds exactly with areas proportional to values', () => {
    const items = [6, 6, 4, 3, 2, 2, 1];
    const bounds = { x: 0, y: 0, w: 600, h: 400 };
    const placed = squarify(items, (v) => v, bounds);
    expect(placed).toHaveLength(items.length);
    const total = placed.reduce((s, p) => s + area(p.rect), 0);
    expect(total).toBeCloseTo(600 * 400, 3);
    for (const p of placed) {
      expect(area(p.rect)).toBeCloseTo((p.item / 24) * 240000, 3);
      expect(p.rect.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.rect.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(400 + 1e-6);
    }
  });
  it('does not overlap', () => {
    const items = Array.from({ length: 30 }, (_, i) => 30 - i);
    const placed = squarify(items, (v) => v, { x: 10, y: 20, w: 300, h: 200 });
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i].rect;
        const b = placed[j].rect;
        const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        expect(overlap).toBeLessThan(1e-6);
      }
    }
  });
  it('keeps the classic example near-square', () => {
    // Bruls et al. example: 6 6 4 3 2 2 1 in a 6x4 box; the first two should be 3x2-ish, not slivers.
    const placed = squarify([6, 6, 4, 3, 2, 2, 1], (v) => v, { x: 0, y: 0, w: 6, h: 4 });
    const first = placed[0].rect;
    expect(Math.max(first.w / first.h, first.h / first.w)).toBeLessThan(2);
  });
  it('handles portrait bounds, zero values, and empty input', () => {
    const placed = squarify([0, 5, 0, 5], (v) => v, { x: 0, y: 0, w: 100, h: 300 });
    expect(placed).toHaveLength(2);
    expect(placed[0].rect.h).toBeCloseTo(150);
    expect(squarify([], (v: number) => v, { x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
    expect(squarify([1], (v) => v, { x: 0, y: 0, w: 0, h: 10 })).toEqual([]);
  });
});

describe('inset', () => {
  it('shrinks without going negative', () => {
    expect(inset({ x: 0, y: 0, w: 10, h: 10 }, 2)).toEqual({ x: 2, y: 2, w: 6, h: 6 });
    expect(inset({ x: 0, y: 0, w: 2, h: 2 }, 2)).toEqual({ x: 2, y: 2, w: 0, h: 0 });
  });
});
