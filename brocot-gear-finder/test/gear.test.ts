import { describe, expect, it } from 'vitest';
import { gearDims, gearOutline, halfThickness, layoutTrain, meshPhase, outlinePath, trainBounds } from '../src/core/gear';

const TAU = 2 * Math.PI;
const mod = (a: number, m: number) => ((a % m) + m) % m;

describe('gear geometry', () => {
  it('uses ISO proportions', () => {
    expect(gearDims(20, 2)).toEqual({ pitch: 20, outer: 22, root: 17.5, base: 20 * Math.cos((20 * Math.PI) / 180) });
  });

  it('teeth are half the pitch thick at the pitch circle and thinner at the tip', () => {
    const half = halfThickness(30, 1, 15);
    expect(half).toBeCloseTo(Math.PI / 60, 12);
    expect(halfThickness(30, 1, 16)).toBeLessThan(half);
    expect(halfThickness(30, 1, 14)).toBeGreaterThan(half);
    expect(halfThickness(30, 1, 1)).toBeCloseTo(halfThickness(30, 1, gearDims(30, 1).base), 12);
  });

  it('outlines stay between the root and outer circles', () => {
    for (const teeth of [8, 30, 120]) {
      const pts = gearOutline(teeth, 2, 4);
      const { root, outer, base } = gearDims(teeth, 2);
      const perTooth = 10 + (root < base ? 2 : 0);
      expect(pts).toHaveLength(teeth * perTooth);
      for (const [x, y] of pts) {
        const r = Math.hypot(x, y);
        expect(r).toBeGreaterThanOrEqual(root - 1e-9);
        expect(r).toBeLessThanOrEqual(outer + 1e-9);
      }
    }
  });

  it('serialises a path', () => {
    expect(outlinePath([[0, 0], [1.23456, 2], [3, 4]], 1, 1, 2)).toBe('M1 1L2.23 3L4 5Z');
  });
});

describe('meshing', () => {
  it('puts a gap of B opposite a tooth of A', () => {
    const phi = 0.4;
    const b = meshPhase(phi, phi, 12, 40); // A's tooth 0 points at B
    // A gap centre of B is at b + pi/40 + k * tau/40; one of them must be at phi + pi.
    expect(mod(phi + Math.PI - b - Math.PI / 40, TAU / 40)).toBeCloseTo(0, 9);
  });

  it('counter-rotates at the tooth ratio', () => {
    const b0 = meshPhase(0.3, 0, 12, 40);
    const b1 = meshPhase(0.3, 0.5, 12, 40);
    expect(b1 - b0).toBeCloseTo((-0.5 * 12) / 40, 12);
  });

  it('lays out compound trains with the right speeds and centre distances', () => {
    const stages = [
      { driver: 8, driven: 24 },
      { driver: 10, driven: 40 },
    ];
    const arbors = layoutTrain(stages, 2);
    expect(arbors).toHaveLength(3);
    expect(arbors[0]!.gears.map((g) => g.role)).toEqual(['driver']);
    expect(arbors[1]!.gears.map((g) => `${g.role}${g.teeth}`)).toEqual(['driven24', 'driver10']);
    expect(arbors[2]!.speed).toBeCloseTo(1 / 12, 12);
    expect(arbors[1]!.speed).toBeCloseTo(-1 / 3, 12);
    const d01 = Math.hypot(arbors[1]!.x - arbors[0]!.x, arbors[1]!.y - arbors[0]!.y);
    const d12 = Math.hypot(arbors[2]!.x - arbors[1]!.x, arbors[2]!.y - arbors[1]!.y);
    expect(d01).toBeCloseTo(32, 9);
    expect(d12).toBeCloseTo(50, 9);
    const b = trainBounds(arbors, 2);
    expect(b.maxX - b.minX).toBeGreaterThan(50);
    expect(b.minY).toBeLessThan(0);
  });
});
