import { describe, expect, it } from 'vitest';
import { enumerateGraph, restartGraph } from '../src/core/enumerate';
import { createPuzzle } from '../src/core/factory';
import { SpatialIndex, computeLayout } from '../src/core/layout';
import { KLOTSKI_MINI } from '../src/core/presets';

const hanoi = enumerateGraph(createPuzzle({ kind: 'hanoi', disks: 4 }));
const tiles = enumerateGraph(createPuzzle({ kind: 'tiles', rows: 2, cols: 3 }));

describe('computeLayout', () => {
  it('places every node in [0, 1] with x given by its layer', () => {
    const l = computeLayout(hanoi, 'layered');
    expect(l.mode).toBe('layered');
    expect(l.x.length).toBe(hanoi.keys.length);
    for (let i = 0; i < hanoi.keys.length; i++) {
      expect(l.x[i]).toBeGreaterThanOrEqual(0);
      expect(l.x[i]).toBeLessThanOrEqual(1);
      expect(l.y[i]).toBeGreaterThanOrEqual(0);
      expect(l.y[i]).toBeLessThanOrEqual(1);
      expect(l.x[i]).toBeCloseTo(hanoi.distFromStart[i] / hanoi.depth, 5);
    }
    // The start is alone in layer 0 and centred.
    expect(l.layerSizes[0]).toBe(1);
    expect(l.y[hanoi.start]).toBeCloseTo(0.5, 5);
    expect(Array.from(l.layerSizes).reduce((a, b) => a + b, 0)).toBe(hanoi.keys.length);
  });

  it('gives nodes in one layer distinct y positions and keeps layer widths proportional', () => {
    const l = computeLayout(tiles, 'layered');
    const byLayer = new Map<number, number[]>();
    for (let i = 0; i < tiles.keys.length; i++) {
      const d = tiles.distFromStart[i];
      byLayer.set(d, [...(byLayer.get(d) ?? []), l.y[i]]);
    }
    let widest = 0;
    for (const ys of byLayer.values()) {
      expect(new Set(ys.map((y) => y.toFixed(6))).size).toBe(ys.length);
      const span = Math.max(...ys) - Math.min(...ys);
      widest = Math.max(widest, span);
    }
    expect(widest).toBeCloseTo(1, 5);
  });

  it('reduces edge length with barycentre sweeps compared to no sweeps', () => {
    const g = enumerateGraph(createPuzzle(KLOTSKI_MINI));
    const total = (sweeps: number) => {
      const l = computeLayout(g, 'layered', sweeps);
      let sum = 0;
      for (let u = 0; u < g.keys.length; u++) {
        for (let k = g.adjStart[u]; k < g.adjStart[u + 1]; k++) {
          const v = g.adj[k];
          if (v > u) sum += Math.abs(l.y[u] - l.y[v]);
        }
      }
      return sum;
    };
    expect(total(4)).toBeLessThan(total(0));
  });

  it('lays out radially around the start', () => {
    const l = computeLayout(hanoi, 'radial');
    expect(l.mode).toBe('radial');
    expect(l.x[hanoi.start]).toBeCloseTo(0.5, 5);
    expect(l.y[hanoi.start]).toBeCloseTo(0.5, 5);
    for (let i = 0; i < hanoi.keys.length; i++) {
      const r = Math.hypot(l.x[i] - 0.5, l.y[i] - 0.5);
      expect(r).toBeCloseTo((hanoi.distFromStart[i] / hanoi.depth) * 0.48, 4);
    }
  });

  it('handles a graph whose start is the only layer', () => {
    const g = restartGraph(enumerateGraph(createPuzzle({ kind: 'hanoi', disks: 1 })), 0);
    const one = { ...g, keys: [g.keys[0]], adjStart: new Int32Array([0, 0]), adj: new Int32Array(0), distFromStart: new Int32Array([0]), depth: 0 };
    const l = computeLayout(one, 'layered');
    expect(l.x[0]).toBe(0.5);
    expect(l.y[0]).toBe(0.5);
    const r = computeLayout(one, 'radial');
    expect(r.x[0]).toBeCloseTo(0.5);
  });

  it('parks unreachable nodes in the corner', () => {
    const g = { ...hanoi, distFromStart: Int32Array.from(hanoi.distFromStart) };
    g.distFromStart[5] = -1;
    const l = computeLayout(g, 'layered');
    expect(l.x[5]).toBe(1);
    expect(l.y[5]).toBe(1);
  });
});

describe('SpatialIndex', () => {
  it('finds the nearest node within a pixel radius and nothing beyond it', () => {
    const l = computeLayout(tiles, 'layered');
    const idx = new SpatialIndex(l, 16);
    for (const i of [0, 7, 100, tiles.keys.length - 1]) {
      expect(idx.nearest(l.x[i], l.y[i], 1, 1000, 1000)).toBe(i);
    }
    expect(idx.nearest(-5, -5, 2, 1000, 1000)).toBe(-1);
    // A generous radius always finds something.
    expect(idx.nearest(0.5, 0.5, 5000, 1000, 1000)).toBeGreaterThanOrEqual(0);
  });
});
