import type { Arith } from './arith';
import { Fnv, hex32, nextRandom } from './rng';

export interface Unit {
  id: number;
  owner: number;
  x: number;
  y: number;
  /** Heading, in the arithmetic's angle representation. */
  h: number;
  tx: number;
  ty: number;
  moving: boolean;
}

export interface World {
  /** Number of ticks simulated so far: this is the state before tick `tick`. */
  tick: number;
  /** Insertion order is part of the state: Map iteration follows it. */
  units: Map<number, Unit>;
  rng: number;
}

/** A player command for one tick. Groups: 0 even-numbered units, 1 odd, 2 all. */
export type Command =
  | { kind: 'move'; group: 0 | 1 | 2; x: number; y: number }
  | { kind: 'stop'; group: 0 | 1 | 2 };

export const FIELD = 256;
const SPEED = 40; // field units per second
const WANDER = 10;
const RADIUS = 5;

export interface WorldOptions {
  players: number;
  unitsPerPlayer: number;
  /** Seed for the game RNG. Clients that disagree on it desync at once. */
  rngSeed: number;
  /** Units of this player are created first (as if created when the local click happened). */
  localPlayer: number;
}

export interface StepOptions {
  arith: Arith;
  /** 'sorted' iterates by unit id; 'insertion' iterates the Map as it happens to be ordered. */
  order: 'sorted' | 'insertion';
}

const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [40, 40],
  [216, 216],
  [216, 40],
  [40, 216],
];

export function createWorld(opts: WorldOptions, arith: Arith): World {
  const all: Unit[] = [];
  for (let p = 0; p < opts.players; p++) {
    const [cx, cy] = CORNERS[p % CORNERS.length] as readonly [number, number];
    for (let i = 0; i < opts.unitsPerPlayer; i++) {
      const id = p * 100 + i;
      const x = cx + ((i % 4) - 1.5) * 12;
      const y = cy + (Math.floor(i / 4) - 1.5) * 12;
      all.push({
        id,
        owner: p,
        x: arith.store(arith.from(x)),
        y: arith.store(arith.from(y)),
        h: arith.store(arith.angle((id * 613) % 4096)),
        tx: arith.store(arith.from(x)),
        ty: arith.store(arith.from(y)),
        moving: false,
      });
    }
  }
  const local = all.filter((u) => u.owner === opts.localPlayer);
  const rest = all.filter((u) => u.owner !== opts.localPlayer);
  const units = new Map<number, Unit>();
  for (const u of [...local, ...rest]) units.set(u.id, u);
  return { tick: 0, units, rng: opts.rngSeed | 0 };
}

export function cloneWorld(w: World): World {
  const units = new Map<number, Unit>();
  for (const [id, u] of w.units) units.set(id, { ...u });
  return { tick: w.tick, units, rng: w.rng };
}

export function unitsInOrder(w: World, order: 'sorted' | 'insertion'): Unit[] {
  const list = [...w.units.values()];
  return order === 'sorted' ? list.sort((a, b) => a.id - b.id) : list;
}

function inGroup(u: Unit, group: 0 | 1 | 2): boolean {
  return group === 2 || u.id % 2 === group;
}

/**
 * Advances the world by one tick. `inputs[p]` is player p's command for this
 * tick (or null). `dtMs` is the timestep: a constant in a correct lockstep
 * game, the measured frame time in a broken one.
 */
export function step(w: World, inputs: ReadonlyArray<Command | null>, dtMs: number, opts: StepOptions): void {
  const A = opts.arith;
  const list = unitsInOrder(w, opts.order);

  inputs.forEach((cmd, p) => {
    if (!cmd) return;
    for (const u of list) {
      if (u.owner !== p || !inGroup(u, cmd.group)) continue;
      if (cmd.kind === 'move') {
        u.tx = A.store(A.from(cmd.x));
        u.ty = A.store(A.from(cmd.y));
        u.moving = true;
      } else {
        u.moving = false;
      }
    }
  });

  const dt = A.div(A.from(dtMs), A.from(1000));
  const stride = A.mul(A.from(SPEED), dt);
  const wander = A.mul(A.from(WANDER), dt);
  const lo = A.from(0);
  const hi = A.from(FIELD);
  const clamp = (v: number) => (A.lt(v, lo) ? lo : A.lt(hi, v) ? hi : v);

  for (const u of list) {
    if (u.moving) {
      const dx = A.sub(u.tx, u.x);
      const dy = A.sub(u.ty, u.y);
      const d = A.sqrt(A.add(A.mul(dx, dx), A.mul(dy, dy)));
      if (!A.lt(stride, d)) {
        u.x = u.tx;
        u.y = u.ty;
        u.moving = false;
      } else {
        u.x = A.store(A.add(u.x, A.div(A.mul(dx, stride), d)));
        u.y = A.store(A.add(u.y, A.div(A.mul(dy, stride), d)));
      }
    } else {
      // Idle units wander: the RNG is consumed in iteration order.
      const r = nextRandom(w.rng);
      w.rng = r.state;
      const turn = (r.value % 161) - 80;
      u.h = A.store(A.wrapAngle(A.add(u.h, A.angle(turn))));
      u.x = A.store(clamp(A.add(u.x, A.mul(A.cos(u.h), wander))));
      u.y = A.store(clamp(A.add(u.y, A.mul(A.sin(u.h), wander))));
    }
  }

  // Separation, Gauss-Seidel style: each push sees the previous pushes, so
  // the result depends on the order pairs are visited.
  const minD = A.from(RADIUS * 2);
  const minD2 = A.mul(minD, minD);
  const half = A.from(0.5);
  for (let i = 0; i < list.length; i++) {
    const u = list[i] as Unit;
    for (let j = i + 1; j < list.length; j++) {
      const v = list[j] as Unit;
      let dx = A.sub(v.x, u.x);
      let dy = A.sub(v.y, u.y);
      const d2 = A.add(A.mul(dx, dx), A.mul(dy, dy));
      if (!A.lt(d2, minD2)) continue;
      let d = A.sqrt(d2);
      if (!A.lt(A.from(0), d)) {
        dx = A.from(1);
        dy = A.from(0);
        d = A.from(1);
      }
      const push = A.mul(A.sub(minD, d), half);
      const px = A.div(A.mul(dx, push), d);
      const py = A.div(A.mul(dy, push), d);
      u.x = A.store(clamp(A.sub(u.x, px)));
      u.y = A.store(clamp(A.sub(u.y, py)));
      v.x = A.store(clamp(A.add(v.x, px)));
      v.y = A.store(clamp(A.add(v.y, py)));
    }
  }
  w.tick++;
}

export const UNIT_FIELDS = ['x', 'y', 'h', 'tx', 'ty', 'moving'] as const;
export type UnitField = (typeof UNIT_FIELDS)[number];

function fieldBits(u: Unit, f: UnitField, A: Arith): number {
  return f === 'moving' ? (u.moving ? 1 : 0) : A.bits(u[f]);
}

/** A 32-bit hash of the world, independent of Map insertion order (as real games hash). */
export function hashWorld(w: World, A: Arith): number {
  const fnv = new Fnv().word(w.tick).word(w.rng);
  for (const u of unitsInOrder(w, 'sorted')) {
    fnv.word(u.id).word(u.owner);
    for (const f of UNIT_FIELDS) fnv.word(fieldBits(u, f, A));
  }
  return fnv.value();
}

export interface WorldDiff {
  /** Unit id, or null when the difference is in the world itself (rng, tick). */
  unit: number | null;
  field: string;
  a: string;
  b: string;
  /** Number of (unit, field) pairs that differ in total. */
  count: number;
}

function show(u: Unit, f: UnitField, A: Arith): string {
  if (f === 'moving') return String(u.moving);
  const v = u[f];
  return `${A.toNumber(v)} (0x${hex32(A.bits(v))})`;
}

/** The first difference between two worlds, in unit-id order, or null if identical. */
export function diffWorlds(a: World, b: World, arithA: Arith, arithB: Arith = arithA): WorldDiff | null {
  let first: WorldDiff | null = null;
  let count = 0;
  const note = (d: Omit<WorldDiff, 'count'>) => {
    count++;
    if (!first) first = { ...d, count: 0 };
  };
  if (a.rng !== b.rng) note({ unit: null, field: 'rng', a: hex32(a.rng), b: hex32(b.rng) });
  for (const ua of unitsInOrder(a, 'sorted')) {
    const ub = b.units.get(ua.id);
    if (!ub) {
      note({ unit: ua.id, field: '(missing)', a: 'present', b: 'missing' });
      continue;
    }
    for (const f of UNIT_FIELDS) {
      if (fieldBits(ua, f, arithA) !== fieldBits(ub, f, arithB))
        note({ unit: ua.id, field: f, a: show(ua, f, arithA), b: show(ub, f, arithB) });
    }
  }
  if (!first) return null;
  return { ...(first as WorldDiff), count };
}
