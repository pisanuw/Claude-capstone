import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/analyze';
import { correlation, fitOpacity, findShift } from '../src/core/classify';
import { fillRect, makeBitmap, toLuma, crop } from '../src/core/bitmap';
import { blank, blend, BLACK, BLUE, PURPLE, speckle, stripes, WHITE } from './helpers';

describe('end-to-end classification (analyze)', () => {
  it('labels a new element as element-added', () => {
    const a = blank(120, 120);
    const b = blank(120, 120);
    fillRect(b, { x: 30, y: 30, w: 40, h: 30 }, BLUE);
    const result = analyze(a, b);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].type).toBe('element-added');
    expect(result.regions[0].confidence).toBeGreaterThan(0.9);
    expect(result.regions[0].reason).toMatch(/added/);
  });

  it('labels a vanished element as element-removed', () => {
    const a = blank(120, 120);
    const b = blank(120, 120);
    fillRect(a, { x: 30, y: 30, w: 40, h: 30 }, BLUE);
    const result = analyze(a, b);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].type).toBe('element-removed');
  });

  it('labels a recolored element as color', () => {
    const a = blank(120, 120);
    const b = blank(120, 120);
    fillRect(a, { x: 30, y: 30, w: 50, h: 30 }, BLUE);
    fillRect(b, { x: 30, y: 30, w: 50, h: 30 }, PURPLE);
    const result = analyze(a, b);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].type).toBe('color');
    expect(result.regions[0].reason).toMatch(/color moved/);
  });

  it('labels a moved block as layout with the measured shift', () => {
    const a = blank(200, 200);
    const b = blank(200, 200);
    stripes(a, { x: 40, y: 40, w: 40, h: 40 }, BLUE, BLACK);
    stripes(b, { x: 64, y: 60, w: 40, h: 40 }, BLUE, BLACK);
    const result = analyze(a, b);
    expect(result.regions).toHaveLength(1);
    const region = result.regions[0];
    expect(region.type).toBe('layout');
    expect(region.shift).toBeDefined();
    expect(region.shift?.dx).toBe(24);
    expect(region.shift?.dy).toBe(20);
  });

  it('labels a small single-axis nudge as spacing', () => {
    const a = blank(160, 160);
    const b = blank(160, 160);
    stripes(a, { x: 40, y: 40, w: 14, h: 24 }, BLUE, BLACK);
    stripes(b, { x: 48, y: 40, w: 14, h: 24 }, BLUE, BLACK);
    const result = analyze(a, b);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].type).toBe('spacing');
    expect(result.regions[0].shift?.dx).toBe(8);
    expect(result.regions[0].shift?.dy).toBe(0);
  });

  it('labels a faded element as visibility', () => {
    const a = blank(120, 120);
    const b = blank(120, 120);
    const full: [number, number, number, number] = [200, 30, 30, 255];
    fillRect(a, { x: 30, y: 30, w: 40, h: 24 }, full);
    fillRect(b, { x: 30, y: 30, w: 40, h: 24 }, blend(full, [255, 255, 255], 0.35));
    const result = analyze(a, b);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].type).toBe('visibility');
    expect(result.regions[0].reason).toMatch(/opacity/);
  });

  it('labels an element that became more visible as visibility', () => {
    const a = blank(120, 120);
    const b = blank(120, 120);
    const full: [number, number, number, number] = [200, 30, 30, 255];
    fillRect(a, { x: 30, y: 30, w: 40, h: 24 }, blend(full, [255, 255, 255], 0.35));
    fillRect(b, { x: 30, y: 30, w: 40, h: 24 }, full);
    const result = analyze(a, b);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].type).toBe('visibility');
    expect(result.regions[0].reason).toMatch(/more visible/);
  });

  it('stops classifying past the per-image region budget', () => {
    const a = blank(600, 600);
    const b = blank(600, 600);
    // 100 well-separated dots, each its own region; 64 get classified.
    for (let i = 0; i < 100; i++) {
      const x = 20 + (i % 10) * 58;
      const y = 20 + Math.floor(i / 10) * 58;
      fillRect(b, { x, y, w: 8, h: 8 }, BLACK);
    }
    const result = analyze(a, b);
    expect(result.regions).toHaveLength(100);
    const budgeted = result.regions.filter((r) => r.reason.includes('classification budget'));
    expect(budgeted).toHaveLength(36);
    expect(result.regions.filter((r) => r.type === 'element-added')).toHaveLength(64);
  });

  it('labels fine-grained in-place changes as text', () => {
    const a = blank(160, 120);
    const b = blank(160, 120);
    speckle(a, { x: 30, y: 40, w: 90, h: 18 }, 12345);
    speckle(b, { x: 30, y: 40, w: 90, h: 18 }, 99999);
    const result = analyze(a, b);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].type).toBe('text');
  });

  it('reports identical images as identical', () => {
    const a = blank(80, 80);
    const b = blank(80, 80);
    fillRect(a, { x: 10, y: 10, w: 20, h: 20 }, BLUE);
    fillRect(b, { x: 10, y: 10, w: 20, h: 20 }, BLUE);
    const result = analyze(a, b);
    expect(result.identical).toBe(true);
    expect(result.regions).toHaveLength(0);
    expect(result.changedRatio).toBe(0);
  });

  it('pads size-mismatched inputs and flags the mismatch', () => {
    const a = blank(100, 80);
    const b = blank(130, 80);
    fillRect(b, { x: 104, y: 20, w: 20, h: 20 }, BLUE);
    const result = analyze(a, b);
    expect(result.sizeMismatch).toBe(true);
    expect(result.width).toBe(130);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].type).toBe('element-added');
  });

  it('classifies multiple simultaneous changes independently', () => {
    const a = blank(300, 200);
    const b = blank(300, 200);
    // added element
    fillRect(b, { x: 20, y: 20, w: 30, h: 20 }, BLUE);
    // recolored element
    fillRect(a, { x: 200, y: 140, w: 50, h: 30 }, BLUE);
    fillRect(b, { x: 200, y: 140, w: 50, h: 30 }, PURPLE);
    const result = analyze(a, b);
    expect(result.regions).toHaveLength(2);
    const types = result.regions.map((r) => r.type).sort();
    expect(types).toEqual(['color', 'element-added']);
  });
});

describe('findShift', () => {
  function ctxFor(a: ReturnType<typeof blank>, b: ReturnType<typeof blank>) {
    return { a, b, lumaA: toLuma(a), lumaB: toLuma(b), maxShift: 48 };
  }

  it('returns null for a flat template', () => {
    const a = blank(100, 100);
    const b = blank(100, 100);
    expect(findShift(ctxFor(a, b), { x: 10, y: 10, w: 30, h: 30 })).toBeNull();
  });

  it('returns null when nothing matches', () => {
    const a = blank(100, 100);
    const b = blank(100, 100);
    speckle(a, { x: 20, y: 20, w: 30, h: 30 }, 7);
    speckle(b, { x: 20, y: 20, w: 30, h: 30 }, 8);
    expect(findShift(ctxFor(a, b), { x: 20, y: 20, w: 30, h: 30 })).toBeNull();
  });

  it('returns null for tiny regions', () => {
    const a = blank(50, 50);
    const b = blank(50, 50);
    expect(findShift(ctxFor(a, b), { x: 5, y: 5, w: 3, h: 3 })).toBeNull();
  });
});

describe('fitOpacity', () => {
  it('recovers the blend factor', () => {
    const full = makeBitmap(10, 10, [200, 30, 30, 255]);
    const faded = makeBitmap(10, 10, blend([200, 30, 30, 255], [255, 255, 255], 0.4));
    const fit = fitOpacity(full, faded, [255, 255, 255]);
    expect(fit).not.toBeNull();
    expect(fit!.alpha).toBeCloseTo(0.4, 1);
    expect(fit!.residual).toBeLessThan(0.05);
  });

  it('returns null for flat background sources and mismatched sizes', () => {
    expect(fitOpacity(blank(10, 10), blank(10, 10), [255, 255, 255])).toBeNull();
    expect(fitOpacity(blank(10, 10), blank(12, 10), [255, 255, 255])).toBeNull();
  });
});

describe('correlation', () => {
  it('is 1 for identical signals and ~0 for flat ones', () => {
    const x = new Float32Array([1, 5, 3, 8, 2]);
    expect(correlation(x, x)).toBeCloseTo(1, 5);
    expect(correlation(new Float32Array([2, 2, 2]), new Float32Array([1, 5, 9]))).toBe(0);
    expect(correlation(new Float32Array(0), new Float32Array(0))).toBe(0);
  });

  it('is -1 for inverted signals', () => {
    const x = new Float32Array([1, 2, 3, 4]);
    const y = new Float32Array([4, 3, 2, 1]);
    expect(correlation(x, y)).toBeCloseTo(-1, 5);
  });
});

describe('crop interaction with WHITE constant', () => {
  it('keeps helper constants intact', () => {
    // Guards against accidental mutation of shared fixtures by fillRect.
    expect(WHITE).toEqual([255, 255, 255, 255]);
    const c = crop(blank(5, 5), { x: 0, y: 0, w: 5, h: 5 });
    expect(c.width).toBe(5);
  });
});
