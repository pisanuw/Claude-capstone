import { computeMetrics } from './metrics';
import type {
  CarCall,
  CarView,
  Direction,
  DispatchFn,
  Frame,
  HallCall,
  PassengerResult,
  PolicyState,
  Scenario,
  SimEvent,
  SimResult,
} from './types';

interface Car {
  id: number;
  floor: number;
  direction: Direction;
  target: number | null;
  doorsLeft: number;
  aboard: PassengerResult[];
  /** True when the car should ask the policy before its next move. */
  needsDecision: boolean;
}

const MAX_WARNINGS = 20;

function sign(n: number): Direction {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function carView(car: Car, capacity: number): CarView {
  const byFloor = new Map<number, CarCall>();
  for (const p of car.aboard) {
    const c = byFloor.get(p.to);
    if (c) {
      c.count++;
      c.since = Math.min(c.since, p.boardedAt as number);
      c.seq = Math.min(c.seq, p.id);
    } else {
      byFloor.set(p.to, { floor: p.to, count: 1, since: p.boardedAt as number, seq: p.id });
    }
  }
  return {
    id: car.id,
    floor: car.floor,
    direction: car.direction,
    target: car.target,
    capacity,
    load: car.aboard.length,
    stops: [...byFloor.values()].sort((a, b) => a.floor - b.floor),
  };
}

function hallCalls(waiting: PassengerResult[][]): HallCall[] {
  const out: HallCall[] = [];
  waiting.forEach((list, floor) => {
    if (list.length === 0) return;
    const groups = new Map<Direction, HallCall>();
    for (const p of list) {
      const d = sign(p.to - p.from);
      const g = groups.get(d);
      if (g) {
        g.count++;
        g.since = Math.min(g.since, p.t);
        g.seq = Math.min(g.seq, p.id);
      } else {
        groups.set(d, { floor, direction: d, count: 1, since: p.t, seq: p.id });
      }
    }
    out.push(...groups.values());
  });
  return out.sort((a, b) => a.floor - b.floor || a.direction - b.direction);
}

/**
 * Run `dispatch` against a scenario, tick by tick.
 *
 * Each tick a car either waits with its doors open, moves one floor toward its
 * target, or (when idle or just arrived) opens its doors for anyone it can take
 * on this floor and then asks the policy for a new target. Stops happen only
 * at the target floor: the policy owns every decision, which is what makes
 * SCAN and LOOK on a building identical to SCAN and LOOK on a disk.
 *
 * Hall calls on the car's own floor that it could not take (full, or they
 * want to go the other way) are hidden from that car's view of the state, so
 * a nearest-first policy cannot pick its own floor forever.
 */
export function simulate(scenario: Scenario, dispatch: DispatchFn): SimResult {
  const { floors, capacity, doorTime, maxTime } = scenario;
  const passengers: PassengerResult[] = scenario.passengers.map((p, id) => ({
    ...p,
    id,
    boardedAt: null,
    alightedAt: null,
    car: null,
  }));
  const waiting: PassengerResult[][] = Array.from({ length: floors }, () => []);
  const cars: Car[] = scenario.initialFloor.map((floor, id) => ({
    id,
    floor,
    direction: 0,
    target: null,
    doorsLeft: 0,
    aboard: [],
    needsDecision: true,
  }));
  const frames: Frame[] = [];
  const events: SimEvent[] = [];
  const warnings: string[] = [];
  let error: string | null = null;
  let energy = 0;
  let stops = 0;
  let decisions = 0;
  let nextArrival = 0;
  let delivered = 0;

  const warn = (msg: string): void => {
    if (warnings.length < MAX_WARNINGS) warnings.push(msg);
  };

  const state = (time: number, forCar: Car): PolicyState => ({
    time,
    floors,
    initialDirection: scenario.initialDirection,
    cars: cars.map((c) => carView(c, capacity)),
    hallCalls: hallCalls(waiting).filter((h) => h.floor !== forCar.floor),
  });

  /** Ask the policy for a target. Returns false when the policy threw. */
  const decide = (car: Car, t: number): boolean => {
    const st = state(t, car);
    const me = st.cars[car.id];
    let out: unknown;
    try {
      out = dispatch(me, st);
      decisions++;
    } catch (e) {
      error = `tick ${t}, car ${car.id}: ${e instanceof Error ? e.message : String(e)}`;
      return false;
    }
    let target: number | null = null;
    if (out === null || out === undefined) {
      target = null;
    } else if (typeof out === 'number' && Number.isInteger(out) && out >= 0 && out < floors) {
      target = out;
    } else {
      warn(`tick ${t}, car ${car.id}: dispatch returned ${JSON.stringify(out) ?? String(out)}, expected a floor 0..${floors - 1} or null`);
    }
    // Naming the current floor means "stay": everyone who could board already has.
    car.target = target === car.floor ? null : target;
    if (car.target !== null) car.direction = sign(car.target - car.floor);
    events.push({ t, type: 'dispatch', car: car.id, floor: car.floor, target });
    car.needsDecision = false;
    return true;
  };

  /** Unload and load at the car's current floor. Returns true when anyone moved. */
  const serve = (car: Car, t: number): boolean => {
    let moved = false;
    for (let i = car.aboard.length - 1; i >= 0; i--) {
      const p = car.aboard[i];
      if (p.to === car.floor) {
        car.aboard.splice(i, 1);
        p.alightedAt = t;
        delivered++;
        events.push({ t, type: 'alight', car: car.id, floor: car.floor, passenger: p.id });
        moved = true;
      }
    }
    const here = waiting[car.floor];
    if (here.length > 0) {
      // Passengers travelling the car's way board first; an empty car takes anyone.
      const dir = car.direction;
      const board = (pred: (p: PassengerResult) => boolean): void => {
        for (let i = 0; i < here.length && car.aboard.length < capacity; ) {
          const p = here[i];
          if (!pred(p)) {
            i++;
            continue;
          }
          here.splice(i, 1);
          if (p.to === p.from) {
            // Disk request: served the moment the head stops here.
            p.boardedAt = t;
            p.alightedAt = t;
            p.car = car.id;
            delivered++;
            events.push({ t, type: 'board', car: car.id, floor: car.floor, passenger: p.id });
            events.push({ t, type: 'alight', car: car.id, floor: car.floor, passenger: p.id });
          } else {
            p.boardedAt = t;
            p.car = car.id;
            car.aboard.push(p);
            events.push({ t, type: 'board', car: car.id, floor: car.floor, passenger: p.id });
          }
          moved = true;
        }
      };
      board((p) => dir === 0 || sign(p.to - p.from) === dir || p.to === p.from);
      if (car.aboard.length === 0) board(() => true);
    }
    return moved;
  };

  const anyPending = (): boolean =>
    waiting.some((w) => w.length > 0) || cars.some((c) => c.aboard.length > 0);

  for (let t = 0; t <= maxTime; t++) {
    // Arrivals.
    while (nextArrival < passengers.length && passengers[nextArrival].t <= t) {
      const p = passengers[nextArrival++];
      waiting[p.from].push(p);
      events.push({ t, type: 'request', floor: p.from, passenger: p.id });
      for (const c of cars) if (c.target === null && c.doorsLeft === 0) c.needsDecision = true;
    }

    for (const car of cars) {
      if (car.doorsLeft > 0) {
        car.doorsLeft--;
        if (car.doorsLeft > 0) continue;
        // Doors close this tick; the car can decide and start moving next tick.
        car.needsDecision = true;
      }
      if (car.target !== null && car.target !== car.floor) {
        car.floor += car.direction;
        energy++;
        if (car.floor !== car.target) continue;
        // Arrived.
        events.push({ t, type: 'arrive', car: car.id, floor: car.floor });
        car.target = null;
        car.needsDecision = true;
      }
      if (!car.needsDecision) continue;
      // Idle or just arrived: open the doors for anyone this car can take
      // here, then ask the policy where to go next.
      if (serve(car, t)) {
        stops++;
        car.doorsLeft = doorTime;
        for (const other of cars) if (other.target === null && other.doorsLeft === 0) other.needsDecision = true;
        if (doorTime > 0) continue;
      }
      if (!anyPending()) {
        car.needsDecision = false;
        continue;
      }
      if (!decide(car, t)) break;
      if (error) break;
    }

    frames.push({
      t,
      cars: cars.map((c) => ({
        floor: c.floor,
        direction: c.direction,
        target: c.target,
        doors: c.doorsLeft > 0,
        load: c.aboard.length,
      })),
      waiting: waiting.map((w) => w.length),
    });

    if (error) break;
    if (delivered === passengers.length && nextArrival === passengers.length) break;
  }

  const lastT = frames.length > 0 ? frames[frames.length - 1].t : 0;
  const metrics = computeMetrics(passengers, {
    energy,
    stops,
    endTime: delivered === passengers.length ? lastT : maxTime,
    maxTime,
  });
  return { scenario, frames, events, passengers, metrics, warnings, error, decisions };
}
