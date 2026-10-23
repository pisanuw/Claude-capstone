// Spur-gear geometry: involute tooth outlines (20 degree pressure angle, ISO
// addendum 1 m, dedendum 1.25 m), arbor layout for a compound train, and the
// phase each arbor needs so drawn teeth actually interleave.

import type { Stage } from './search';

export const PRESSURE_ANGLE = (20 * Math.PI) / 180;

const inv = (a: number) => Math.tan(a) - a;

export interface GearDims {
  pitch: number;
  outer: number;
  root: number;
  base: number;
}

export function gearDims(teeth: number, module: number): GearDims {
  const pitch = (module * teeth) / 2;
  return { pitch, outer: pitch + module, root: pitch - 1.25 * module, base: pitch * Math.cos(PRESSURE_ANGLE) };
}

/** Half the angular tooth thickness at radius r (0 if the tooth has come to a point). */
export function halfThickness(teeth: number, module: number, r: number): number {
  const { pitch, base } = gearDims(teeth, module);
  const ar = r <= base ? 0 : Math.acos(base / r);
  const ap = Math.acos(base / pitch);
  return Math.max(0, Math.PI / (2 * teeth) + inv(ap) - inv(ar));
}

export type Point = [number, number];

/** Closed outline of a gear centred at the origin, tooth 0 pointing along +x. */
export function gearOutline(teeth: number, module: number, flankSteps = 6): Point[] {
  const { outer, root, base } = gearDims(teeth, module);
  const start = Math.max(root, base);
  const pts: Point[] = [];
  const polar = (r: number, a: number): Point => [r * Math.cos(a), r * Math.sin(a)];
  const step = (2 * Math.PI) / teeth;
  for (let k = 0; k < teeth; k++) {
    const c = k * step;
    const radii = Array.from({ length: flankSteps + 1 }, (_, i) => start + ((outer - start) * i) / flankSteps);
    // Right flank going out (from the previous gap), across the tip, left flank coming back.
    if (root < start) pts.push(polar(root, c - halfThickness(teeth, module, start)));
    for (const r of radii) pts.push(polar(r, c - halfThickness(teeth, module, r)));
    for (const r of [...radii].reverse()) pts.push(polar(r, c + halfThickness(teeth, module, r)));
    if (root < start) pts.push(polar(root, c + halfThickness(teeth, module, start)));
  }
  return pts;
}

export function outlinePath(points: Point[], dx = 0, dy = 0, digits = 3): string {
  const f = (n: number) => Number(n.toFixed(digits)).toString();
  return (
    points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x + dx)} ${f(y + dy)}`).join('') + 'Z'
  );
}

export interface PlacedGear {
  teeth: number;
  role: 'driver' | 'driven';
  stage: number;
}

export interface Arbor {
  x: number;
  y: number;
  gears: PlacedGear[];
  /** Turns of this arbor per input turn (signed: negative is the opposite direction). */
  speed: number;
  /** Rotation (radians) at t = 0 so meshing teeth interleave. */
  phase: number;
}

const ZIGZAG = (32 * Math.PI) / 180;

/**
 * Arbors for a compound train: arbor 0 carries the first driver (input),
 * arbor i carries stage i-1's driven gear and stage i's driver, the last arbor
 * carries the final driven gear (output). Centre distance is the sum of pitch
 * radii; the direction zig-zags so the train stays compact.
 */
export function layoutTrain(stages: Stage[], module: number): Arbor[] {
  const arbors: Arbor[] = [{ x: 0, y: 0, gears: [], speed: 1, phase: 0 }];
  stages.forEach((s, i) => {
    const from = arbors[i] as Arbor;
    from.gears.push({ teeth: s.driver, role: 'driver', stage: i });
    const dist = (module * (s.driver + s.driven)) / 2;
    const phi = i % 2 === 0 ? -ZIGZAG : ZIGZAG;
    const x = from.x + dist * Math.cos(phi);
    const y = from.y + dist * Math.sin(phi);
    const phase = meshPhase(phi, from.phase, s.driver, s.driven);
    arbors.push({ x, y, gears: [{ teeth: s.driven, role: 'driven', stage: i }], speed: (-from.speed * s.driver) / s.driven, phase });
  });
  return arbors;
}

/**
 * Rotation of gear B (tb teeth) meshing with gear A (ta teeth) along direction
 * phi from A's centre, given A's rotation a. When a tooth of A points at B, a
 * gap of B points back at A; the dependence on a is -ta/tb, i.e. the gears
 * counter-rotate at the tooth-count ratio.
 */
export function meshPhase(phi: number, a: number, ta: number, tb: number): number {
  return phi + Math.PI - Math.PI / tb + ((phi - a) * ta) / tb;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function trainBounds(arbors: Arbor[], module: number): Bounds {
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const a of arbors) {
    for (const g of a.gears) {
      const r = gearDims(g.teeth, module).outer;
      b.minX = Math.min(b.minX, a.x - r);
      b.minY = Math.min(b.minY, a.y - r);
      b.maxX = Math.max(b.maxX, a.x + r);
      b.maxY = Math.max(b.maxY, a.y + r);
    }
  }
  return b;
}
