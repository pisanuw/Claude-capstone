import { makeRng, randInt } from './rng';
import type {
  BuildingScenarioSpec,
  DiskScenarioSpec,
  PassengerSpec,
  Scenario,
  ScenarioSpec,
  TrafficGenerator,
} from './types';

export class ScenarioError extends Error {}

function int(v: unknown, name: string, lo: number, hi: number, fallback?: number): number {
  if (v === undefined) {
    if (fallback === undefined) throw new ScenarioError(`"${name}" is required`);
    return fallback;
  }
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) {
    throw new ScenarioError(`"${name}" must be an integer between ${lo} and ${hi}`);
  }
  return v;
}

/** Expand a traffic generator into concrete passengers (deterministic for a seed). */
export function generateTraffic(g: TrafficGenerator, floors: number): PassengerSpec[] {
  const rng = makeRng(int(g.seed, 'generate.seed', 0, 2 ** 32 - 1));
  const count = int(g.count, 'generate.count', 0, 5000);
  const start = int(g.start, 'generate.start', 0, 1e6, 0);
  const end = int(g.end, 'generate.end', start, 1e6, start);
  const lobby = int(g.lobby, 'generate.lobby', 0, floors - 1, 0);
  const [lo, hi] = g.floorRange ?? [lobby === 0 ? 1 : 0, floors - 1];
  int(lo, 'generate.floorRange[0]', 0, floors - 1);
  int(hi, 'generate.floorRange[1]', lo, floors - 1);
  const patterns = ['up-peak', 'down-peak', 'lunch', 'interfloor'];
  if (!patterns.includes(g.pattern)) {
    throw new ScenarioError(`"generate.pattern" must be one of ${patterns.join(', ')}`);
  }
  const pickFloor = (avoid: number): number => {
    if (lo === hi) return lo;
    let f = randInt(rng, lo, hi);
    while (f === avoid) f = randInt(rng, lo, hi);
    return f;
  };
  const out: PassengerSpec[] = [];
  for (let i = 0; i < count; i++) {
    const t = randInt(rng, start, end);
    let pattern = g.pattern;
    if (pattern === 'lunch') pattern = rng() < 0.5 ? 'up-peak' : 'down-peak';
    let from: number;
    let to: number;
    if (pattern === 'up-peak') {
      from = lobby;
      to = pickFloor(lobby);
    } else if (pattern === 'down-peak') {
      from = pickFloor(lobby);
      to = lobby;
    } else {
      from = randInt(rng, lo, hi);
      to = pickFloor(from);
      // A one-floor range cannot produce a trip inside it: step just outside.
      if (to === from) to = from + 1 < floors ? from + 1 : from - 1;
    }
    out.push({ t, from, to });
  }
  // Stable order: by arrival, then original index, so ids are meaningful.
  return out.map((p, i) => ({ p, i })).sort((a, b) => a.p.t - b.p.t || a.i - b.i).map((x) => x.p);
}

function expandBuilding(spec: BuildingScenarioSpec): Scenario {
  if (typeof spec.id !== 'string' || !spec.id) throw new ScenarioError('"id" is required');
  const floors = int(spec.floors, 'floors', 2, 1000);
  const cars = int(spec.cars, 'cars', 1, 16, 1);
  const capacity = int(spec.capacity, 'capacity', 1, 10_000, 8);
  const doorTime = int(spec.doorTime, 'doorTime', 0, 100, 2);
  const maxTime = int(spec.maxTime, 'maxTime', 1, 100_000, 1000);
  const initialFloor = Array.isArray(spec.initialFloor)
    ? spec.initialFloor.map((f, i) => int(f, `initialFloor[${i}]`, 0, floors - 1))
    : new Array<number>(cars).fill(int(spec.initialFloor, 'initialFloor', 0, floors - 1, 0));
  if (initialFloor.length !== cars) {
    throw new ScenarioError('"initialFloor" must list one floor per car');
  }
  const initialDirection = spec.initialDirection ?? 1;
  if (initialDirection !== 1 && initialDirection !== -1) {
    throw new ScenarioError('"initialDirection" must be 1 or -1');
  }
  const passengers: PassengerSpec[] = [];
  (spec.passengers ?? []).forEach((p, i) => {
    passengers.push({
      t: int(p.t, `passengers[${i}].t`, 0, maxTime),
      from: int(p.from, `passengers[${i}].from`, 0, floors - 1),
      to: int(p.to, `passengers[${i}].to`, 0, floors - 1),
    });
  });
  if (spec.generate) passengers.push(...generateTraffic(spec.generate, floors));
  passengers.sort((a, b) => a.t - b.t);
  return {
    kind: 'building',
    id: spec.id,
    name: spec.name || spec.id,
    description: spec.description ?? '',
    floors,
    cars,
    capacity,
    doorTime,
    maxTime,
    initialFloor,
    initialDirection,
    passengers,
    hidden: Boolean(spec.hidden),
  };
}

function expandDisk(spec: DiskScenarioSpec): Scenario {
  if (typeof spec.id !== 'string' || !spec.id) throw new ScenarioError('"id" is required');
  const cylinders = int(spec.cylinders, 'cylinders', 2, 100_000);
  const head = int(spec.head, 'head', 0, cylinders - 1);
  const initialDirection = spec.initialDirection ?? -1;
  if (initialDirection !== 1 && initialDirection !== -1) {
    throw new ScenarioError('"initialDirection" must be 1 or -1');
  }
  const requests = (spec.requests ?? []).map((c, i) => int(c, `requests[${i}]`, 0, cylinders - 1));
  if (spec.generate) {
    const rng = makeRng(int(spec.generate.seed, 'generate.seed', 0, 2 ** 32 - 1));
    const n = int(spec.generate.count, 'generate.count', 0, 5000);
    for (let i = 0; i < n; i++) requests.push(randInt(rng, 0, cylinders - 1));
  }
  // Disk requests are all outstanding at t = 0; a stop costs no ticks, so the
  // simulated time equals head movement.
  return {
    kind: 'disk',
    id: spec.id,
    name: spec.name || spec.id,
    description: spec.description ?? '',
    floors: cylinders,
    cars: 1,
    capacity: Number.MAX_SAFE_INTEGER,
    doorTime: 0,
    maxTime: cylinders * (requests.length + 2),
    initialFloor: [head],
    initialDirection,
    passengers: requests.map((c) => ({ t: 0, from: c, to: c })),
    hidden: Boolean(spec.hidden),
  };
}

/** Validate and expand an instructor-written scenario. Throws ScenarioError. */
export function expandScenario(spec: unknown): Scenario {
  if (!spec || typeof spec !== 'object') throw new ScenarioError('scenario must be a JSON object');
  const s = spec as ScenarioSpec;
  if (s.kind === 'disk') return expandDisk(s);
  if (s.kind !== undefined && s.kind !== 'building') {
    throw new ScenarioError('"kind" must be "building" or "disk"');
  }
  return expandBuilding(s as BuildingScenarioSpec);
}

/** Parse scenario JSON text. */
export function parseScenario(text: string): Scenario {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new ScenarioError(`not valid JSON: ${(e as Error).message}`);
  }
  return expandScenario(obj);
}
