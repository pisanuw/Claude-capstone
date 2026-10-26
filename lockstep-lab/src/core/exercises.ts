import { tableSin } from './arith';
import { libmA, libmB, type Libm } from './arith';
import { Fnv, makeRandom } from './rng';

/**
 * "Make it deterministic" exercises. The student edits the body of
 * `step(world, api, Math)`; the grader runs it on two simulated machines for
 * thousands of ticks and compares a hash of the world after every tick.
 *
 * The machines differ exactly where real ones do: `Math.random` is seeded
 * from each machine's clock, `Math.sin`/`Math.cos` come from different
 * libms, `api.frameDt` is each machine's own frame time, and `world.units`
 * is a Map whose insertion order differs. The portable alternatives are
 * `api.rng()`, `api.fsin`/`api.fcos`, `api.dt` and `api.sortedUnits()`.
 */

export interface ExUnit {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  [key: string]: unknown;
}

export interface ExWorld {
  units: Map<number, ExUnit>;
  [key: string]: unknown;
}

export interface ExApi {
  tick: number;
  /** The fixed tick length in seconds. Identical everywhere. */
  dt: number;
  /** This machine's last frame time in seconds. Differs per machine. */
  frameDt: number;
  /** Shared, seeded RNG in [0, 1): the same sequence on every machine. */
  rng(): number;
  /** Portable sine and cosine (committed lookup table, radians in). */
  fsin(a: number): number;
  fcos(a: number): number;
  /** Units sorted by id: the same order on every machine. */
  sortedUnits(): ExUnit[];
}

export interface Exercise {
  id: string;
  title: string;
  brief: string;
  /** Builds the initial world (the grader adds units in a per-machine order). */
  setup(): { units: ExUnit[]; extra: Record<string, unknown> };
  starter: string;
  solution: string;
  hint: string;
  /** Behavioural check on the final world of machine A, so "do nothing" does not pass. */
  check?(world: ExWorld): string | null;
}

const TWO_PI = 2 * Math.PI;

function grid(n: number, spacing = 20, x0 = 20, y0 = 20): ExUnit[] {
  const out: ExUnit[] = [];
  for (let i = 0; i < n; i++) out.push({ id: i, x: x0 + (i % 6) * spacing, y: y0 + Math.floor(i / 6) * spacing, vx: 0, vy: 0 });
  return out;
}

export const EXERCISES: readonly Exercise[] = [
  {
    id: 'wander',
    title: '1. Wandering units',
    brief:
      'Idle units pick a new random direction now and then. Both machines run the same code, yet they disagree within a few ticks.',
    setup: () => ({ units: grid(12), extra: {} }),
    starter: `for (const u of api.sortedUnits()) {
  if (Math.random() < 0.05) {
    u.vx = (Math.random() - 0.5) * 20;
    u.vy = (Math.random() - 0.5) * 20;
  }
  u.x = Math.min(200, Math.max(0, u.x + u.vx * api.dt));
  u.y = Math.min(200, Math.max(0, u.y + u.vy * api.dt));
}`,
    solution: `for (const u of api.sortedUnits()) {
  if (api.rng() < 0.05) {
    u.vx = (api.rng() - 0.5) * 20;
    u.vy = (api.rng() - 0.5) * 20;
  }
  u.x = Math.min(200, Math.max(0, u.x + u.vx * api.dt));
  u.y = Math.min(200, Math.max(0, u.y + u.vy * api.dt));
}`,
    hint: 'Math.random() is seeded differently on every machine. The simulation needs a generator whose seed is part of the match.',
    check: (w) =>
      [...w.units.values()].filter((u) => u.vx !== 0).length >= 6 ? null : 'The units should still wander.',
  },
  {
    id: 'frame-dt',
    title: '2. Frame-rate physics',
    brief: 'Bouncing units integrate their velocity. One machine renders at 60 Hz and the other at 144 Hz.',
    setup: () => ({
      units: grid(10).map((u) => ({ ...u, vx: 15 + u.id, vy: 9 - u.id + 0.5 })),
      extra: {},
    }),
    starter: `for (const u of api.sortedUnits()) {
  u.x += u.vx * api.frameDt;
  u.y += u.vy * api.frameDt;
  if (u.x < 0 || u.x > 200) u.vx = -u.vx;
  if (u.y < 0 || u.y > 200) u.vy = -u.vy;
}`,
    solution: `for (const u of api.sortedUnits()) {
  u.x += u.vx * api.dt;
  u.y += u.vy * api.dt;
  if (u.x < 0 || u.x > 200) u.vx = -u.vx;
  if (u.y < 0 || u.y > 200) u.vy = -u.vy;
}`,
    hint: 'The simulation must advance by the same amount on every machine, whatever the frame rate.',
    check: (w) =>
      [...w.units.values()].every((u) => u.vx !== 0 && u.vy !== 0) ? null : 'The units should still move.',
  },
  {
    id: 'claims',
    title: '3. First come, first served',
    brief:
      'Each tick, every unit without a pad claims the nearest free one and walks to it; pads free up after a while. Iteration order decides who wins.',
    setup: () => ({
      units: grid(12),
      extra: { pads: Array.from({ length: 6 }, (_, i) => ({ x: 30 + i * 28, y: 150, owner: -1, timer: 0 })) },
    }),
    starter: claimsBody('world.units.values()'),
    solution: claimsBody('api.sortedUnits()'),
    hint: 'world.units is a Map; each machine inserted the units in a different order. Visit them in an order every machine agrees on.',
    check: (w) =>
      (w.pads as Array<{ owner: number }>).some((p) => p.owner >= 0) ? null : 'Units should still claim pads.',
  },
  {
    id: 'orbit',
    title: '4. Orbiting drones',
    brief: 'Drones circle a beacon using sine and cosine. The two machines ship different maths libraries.',
    setup: () => ({
      units: Array.from({ length: 8 }, (_, i) => ({ id: i, x: 0, y: 0, vx: 0, vy: 0, angle: i * 0.785, r: 40 + i * 5 })),
      extra: {},
    }),
    starter: `for (const u of api.sortedUnits()) {
  u.angle = (u.angle + 0.9 * api.dt) % (2 * Math.PI);
  u.x = 100 + u.r * Math.cos(u.angle);
  u.y = 100 + u.r * Math.sin(u.angle);
}`,
    solution: `for (const u of api.sortedUnits()) {
  u.angle = (u.angle + 0.9 * api.dt) % (2 * Math.PI);
  u.x = 100 + u.r * api.fcos(u.angle);
  u.y = 100 + u.r * api.fsin(u.angle);
}`,
    hint: 'Math.sin and Math.cos are not specified to the last bit. Use a portable implementation shared by every machine.',
    check: (w) => {
      for (const u of w.units.values()) {
        const d = Math.hypot(u.x - 100, u.y - 100);
        if (Math.abs(d - (u.r as number)) > 1) return `Drone ${u.id} left its orbit.`;
      }
      return null;
    },
  },
  {
    id: 'boss',
    title: '5. All of the above',
    brief: 'A skirmish step with every bug from the earlier exercises. Fix them all and survive 10,000 ticks.',
    setup: () => ({ units: grid(12).map((u) => ({ ...u, heading: u.id, hp: 100 })), extra: {} }),
    starter: `for (const u of world.units.values()) {
  if (Math.random() < 0.03) u.heading += (Math.random() - 0.5) * 2;
  u.x = Math.min(200, Math.max(0, u.x + Math.cos(u.heading) * 12 * api.frameDt));
  u.y = Math.min(200, Math.max(0, u.y + Math.sin(u.heading) * 12 * api.frameDt));
  for (const v of world.units.values()) {
    if (v !== u && v.hp > 0 && u.hp > 0 && Math.hypot(v.x - u.x, v.y - u.y) < 8) {
      v.hp -= 1;
      if (v.hp <= 0) u.hp = Math.min(100, u.hp + 20);
    }
  }
}`,
    solution: `for (const u of api.sortedUnits()) {
  if (api.rng() < 0.03) u.heading += (api.rng() - 0.5) * 2;
  u.x = Math.min(200, Math.max(0, u.x + api.fcos(u.heading) * 12 * api.dt));
  u.y = Math.min(200, Math.max(0, u.y + api.fsin(u.heading) * 12 * api.dt));
  for (const v of api.sortedUnits()) {
    if (v !== u && v.hp > 0 && u.hp > 0 && Math.hypot(v.x - u.x, v.y - u.y) < 8) {
      v.hp -= 1;
      if (v.hp <= 0) u.hp = Math.min(100, u.hp + 20);
    }
  }
}`,
    hint: 'Four sources: the RNG, the timestep, the maths library and the iteration order (both loops).',
    check: (w) =>
      [...w.units.values()].some((u) => u.heading !== u.id) ? null : 'Units should still change heading at random.',
  },
];

function claimsBody(loop: string): string {
  return `const pads = world.pads;
for (const u of ${loop}) {
  if (u.pad === undefined || u.pad < 0) {
    let best = -1, bestD = Infinity;
    pads.forEach((p, i) => {
      const d = Math.hypot(p.x - u.x, p.y - u.y);
      if (p.owner < 0 && d < bestD) { best = i; bestD = d; }
    });
    u.pad = best;
    if (best >= 0) { pads[best].owner = u.id; pads[best].timer = 40; }
  }
  if (u.pad >= 0) {
    const p = pads[u.pad];
    u.x += (p.x - u.x) * 0.1;
    u.y += (p.y - u.y) * 0.1;
    if (--p.timer <= 0) { p.owner = -1; u.pad = -1; u.y -= 60; }
  }
}`;
}

/** Portable sin from the committed Q16.16 table (4096 steps per turn), radians in. */
export function portableSin(a: number): number {
  const units = Math.round((a / TWO_PI) * 4096);
  return tableSin(units) / 65536;
}

export function portableCos(a: number): number {
  return portableSin(a + Math.PI / 2);
}

interface Machine {
  name: string;
  libm: Libm;
  hz: number;
  clockSeed: number;
  /** Reverse insertion order of units on machine B. */
  reverse: boolean;
}

export const MACHINES: readonly Machine[] = [
  { name: 'Machine A (60 Hz, libm A)', libm: libmA, hz: 60, clockSeed: 1_700_000_123, reverse: false },
  { name: 'Machine B (144 Hz, libm B)', libm: libmB, hz: 144, clockSeed: 1_700_000_987, reverse: true },
];

function makeMath(m: Machine): Math {
  const shadow = Object.create(Math) as Record<string, unknown>;
  shadow.random = makeRandom(m.clockSeed);
  shadow.sin = m.libm.sin;
  shadow.cos = m.libm.cos;
  shadow.tan = (x: number) => m.libm.sin(x) / m.libm.cos(x);
  return shadow as unknown as Math;
}

function deepCopy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Deep, order-independent hash of a world (units by id, object keys sorted). */
export function hashExWorld(w: ExWorld): number {
  const fnv = new Fnv();
  const visit = (v: unknown): void => {
    if (typeof v === 'number') fnv.word(1).double(v);
    else if (typeof v === 'string') fnv.word(2).text(v);
    else if (typeof v === 'boolean') fnv.word(v ? 3 : 4);
    else if (v === null || v === undefined) fnv.word(5);
    else if (Array.isArray(v)) {
      fnv.word(6).word(v.length);
      v.forEach(visit);
    } else if (v instanceof Map) {
      const keys = [...v.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      fnv.word(7).word(keys.length);
      for (const k of keys) {
        visit(k);
        visit(v.get(k));
      }
    } else if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o).sort();
      fnv.word(8).word(keys.length);
      for (const k of keys) {
        fnv.text(k);
        visit(o[k]);
      }
    } else fnv.word(9);
  };
  visit(w);
  return fnv.value();
}

/** The first differing unit field between two worlds, in id order. */
export function diffExWorlds(a: ExWorld, b: ExWorld): string {
  const ids = [...a.units.keys()].sort((x, y) => x - y);
  for (const id of ids) {
    const ua = a.units.get(id) as ExUnit;
    const ub = b.units.get(id);
    if (!ub) return `unit ${id} missing on machine B`;
    for (const k of Object.keys(ua).sort()) {
      if (!Object.is(ua[k], ub[k])) return `unit ${id}.${k}: A = ${String(ua[k])}, B = ${String(ub[k])}`;
    }
  }
  for (const k of Object.keys(a).sort()) {
    if (k === 'units') continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return `world.${k} differs`;
  }
  return 'hashes differ (no field-level difference found)';
}

export interface GradeResult {
  passed: boolean;
  ticks: number;
  /** First tick (0-based) after which the hashes differed. */
  divergedAt: number | null;
  diff: string | null;
  error: string | null;
  checkFailure: string | null;
  /** How many ticks changed the world at all. */
  liveTicks: number;
  hashes: [number, number];
}

type StepFn = (world: ExWorld, api: ExApi, math: Math) => void;

export function compile(code: string): StepFn {
  return new Function('world', 'api', 'Math', `"use strict";\n${code}`) as StepFn;
}

export function grade(ex: Exercise, code: string, ticks = 10_000): GradeResult {
  const result: GradeResult = {
    passed: false,
    ticks: 0,
    divergedAt: null,
    diff: null,
    error: null,
    checkFailure: null,
    liveTicks: 0,
    hashes: [0, 0],
  };
  let fn: StepFn;
  try {
    fn = compile(code);
  } catch (e) {
    result.error = `Syntax error: ${(e as Error).message}`;
    return result;
  }
  const init = ex.setup();
  const sims = MACHINES.map((m) => {
    const list = deepCopy(init.units);
    if (m.reverse) list.reverse();
    const world: ExWorld = { ...deepCopy(init.extra), units: new Map(list.map((u) => [u.id, u])) };
    const frameRandom = makeRandom(m.clockSeed ^ 0x51);
    const rng = makeRandom(20261012);
    const api: ExApi = {
      tick: 0,
      dt: 0.05,
      frameDt: 1 / m.hz,
      rng,
      fsin: portableSin,
      fcos: portableCos,
      sortedUnits: () => [...world.units.values()].sort((a, b) => a.id - b.id),
    };
    return { world, api, math: makeMath(m), frameRandom, hz: m.hz };
  });

  let prev = hashExWorld((sims[0] as (typeof sims)[number]).world);
  for (let t = 0; t < ticks; t++) {
    const hs: number[] = [];
    for (const s of sims) {
      s.api.tick = t;
      s.api.frameDt = (1 / s.hz) * (0.9 + 0.2 * s.frameRandom());
      try {
        fn(s.world, s.api, s.math);
      } catch (e) {
        result.error = `Tick ${t}: ${(e as Error).message}`;
        result.ticks = t;
        return result;
      }
      hs.push(hashExWorld(s.world));
    }
    result.ticks = t + 1;
    result.hashes = [hs[0] as number, hs[1] as number];
    if (hs[0] !== hs[1]) {
      result.divergedAt = t;
      result.diff = diffExWorlds((sims[0] as (typeof sims)[number]).world, (sims[1] as (typeof sims)[number]).world);
      return result;
    }
    if (hs[0] !== prev) result.liveTicks++;
    prev = hs[0] as number;
  }
  if (result.liveTicks < ticks / 2) {
    result.checkFailure = 'The world must keep changing: it changed on fewer than half of the ticks.';
    return result;
  }
  result.checkFailure = ex.check?.((sims[0] as (typeof sims)[number]).world) ?? null;
  result.passed = result.checkFailure === null;
  return result;
}
