import { describe, expect, it } from 'vitest';
import { compilePolicy } from '../src/core/compile';
import { POLICIES, policyById } from '../src/core/policies';
import { expandScenario } from '../src/core/scenario';
import { SCENARIOS, scenarioSpecById } from '../src/core/scenarios';
import { simulate } from '../src/core/sim';
import type { DispatchFn, Scenario } from '../src/core/types';

function run(scenarioId: string, policyId: string) {
  const spec = scenarioSpecById(scenarioId);
  const policy = policyById(policyId);
  if (!spec || !policy) throw new Error('unknown fixture');
  return simulate(expandScenario(spec), compilePolicy(policy.source));
}

const textbook = (policyId: string) => run('textbook-disk', policyId).metrics.energy;

describe('textbook disk trace (Silberschatz: 53 toward 0; 98 183 37 122 14 124 65 67)', () => {
  it('FCFS moves 640 cylinders', () => expect(textbook('fcfs')).toBe(640));
  it('SSTF moves 236 cylinders', () => expect(textbook('sstf')).toBe(236));
  it('SCAN moves 236 cylinders (53 to 0, then up to 183)', () => expect(textbook('scan')).toBe(236));
  it('LOOK moves 208 cylinders (reverses at 14)', () => expect(textbook('look')).toBe(208));
  it('C-LOOK moves 326 cylinders (down to 14, jump to 183, down to 65)', () => expect(textbook('clook')).toBe(326));

  it('serves requests in FCFS queue order', () => {
    const r = run('textbook-disk', 'fcfs');
    const order = r.events.filter((e) => e.type === 'alight').map((e) => e.floor);
    expect(order).toEqual([98, 183, 37, 122, 14, 124, 65, 67]);
    expect(r.metrics.served).toBe(8);
    expect(r.metrics.finishTime).toBe(640);
  });

  it('SCAN visits cylinder 0 even though nothing is requested there', () => {
    const r = run('textbook-disk', 'scan');
    const dispatches = r.events.filter((e) => e.type === 'dispatch').map((e) => e.target);
    expect(dispatches).toContain(0);
    expect(r.frames.some((f) => f.cars[0].floor === 0)).toBe(true);
  });

  it('time equals head movement on a disk (stops cost nothing)', () => {
    const r = run('textbook-disk', 'look');
    expect(r.frames[r.frames.length - 1].t).toBe(208);
    expect(r.metrics.meanRide).toBe(0);
  });
});

describe('building scenarios', () => {
  it('every built-in policy completes every built-in scenario without errors', () => {
    for (const s of SCENARIOS) {
      const sc = expandScenario(s);
      for (const p of POLICIES) {
        const r = simulate(sc, compilePolicy(p.source));
        expect(r.error, `${s.id}/${p.id}`).toBeNull();
        expect(r.warnings, `${s.id}/${p.id}`).toEqual([]);
        expect(r.metrics.served + r.metrics.unserved).toBe(sc.passengers.length);
      }
    }
  });

  it('is deterministic', () => {
    const a = run('lunch-spike', 'look');
    const b = run('lunch-spike', 'look');
    expect(a.metrics).toEqual(b.metrics);
    expect(a.frames).toEqual(b.frames);
  });

  it('SSTF starves the lone passenger on floor 1 while LOOK serves everyone', () => {
    const sstf = run('starvation-trap', 'sstf');
    const look = run('starvation-trap', 'look');
    const lonely = sstf.passengers.find((p) => p.from === 1 && p.to === 0);
    expect(lonely?.alightedAt).toBeNull();
    expect(sstf.metrics.unserved).toBeGreaterThan(0);
    expect(sstf.metrics.maxWait).toBe(1200 - 6);
    expect(look.metrics.unserved).toBe(0);
    expect(look.metrics.maxWait).toBeLessThan(sstf.metrics.maxWait);
  });

  it('SCAN uses more energy than LOOK (it always finishes the sweep)', () => {
    const scan = run('morning-rush', 'scan');
    const look = run('morning-rush', 'look');
    expect(scan.metrics.energy).toBeGreaterThan(look.metrics.energy);
    expect(scan.metrics.unserved).toBe(0);
    expect(look.metrics.unserved).toBe(0);
  });

  it('counts energy as floors travelled and stops as door openings', () => {
    const sc = expandScenario({
      id: 'two',
      name: 'two',
      floors: 10,
      cars: 1,
      capacity: 4,
      doorTime: 1,
      maxTime: 100,
      passengers: [{ t: 0, from: 0, to: 5 }],
    });
    const r = simulate(sc, compilePolicy(policyById('look')!.source));
    expect(r.metrics.energy).toBe(5);
    expect(r.metrics.stops).toBe(2);
    const p = r.passengers[0];
    expect(p.boardedAt).toBe(0);
    // Doors open 1 tick at the lobby, then 5 floors.
    expect(p.alightedAt).toBe(6);
    expect(r.metrics.meanWait).toBe(0);
    expect(r.metrics.meanRide).toBe(6);
    expect(r.metrics.finishTime).toBe(6);
  });

  it('respects capacity and leaves the rest for a second trip', () => {
    const sc = expandScenario({
      id: 'cap',
      name: 'cap',
      floors: 5,
      capacity: 2,
      doorTime: 0,
      maxTime: 200,
      passengers: [
        { t: 0, from: 0, to: 4 },
        { t: 0, from: 0, to: 4 },
        { t: 0, from: 0, to: 4 },
      ],
    });
    const r = simulate(sc, compilePolicy(policyById('sstf')!.source));
    expect(r.metrics.served).toBe(3);
    expect(Math.max(...r.frames.map((f) => f.cars[0].load))).toBe(2);
    expect(r.metrics.energy).toBe(12);
  });

  it('a car heading up does not take a passenger who wants to go down', () => {
    const sc = expandScenario({
      id: 'dir',
      name: 'dir',
      floors: 10,
      capacity: 8,
      doorTime: 0,
      maxTime: 200,
      passengers: [
        { t: 0, from: 0, to: 9 },
        { t: 0, from: 3, to: 9 },
        { t: 0, from: 3, to: 1 },
      ],
    });
    const r = simulate(sc, compilePolicy(policyById('look')!.source));
    const down = r.passengers[2];
    const up = r.passengers[1];
    expect(up.boardedAt).toBe(3);
    expect(down.boardedAt).toBeGreaterThan(3);
    expect(r.metrics.served).toBe(3);
  });

  it('hides hall calls on the car floor it could not take, so SSTF does not spin', () => {
    const sc = expandScenario({
      id: 'spin',
      name: 'spin',
      floors: 6,
      capacity: 1,
      doorTime: 0,
      maxTime: 100,
      passengers: [
        { t: 0, from: 0, to: 5 },
        { t: 0, from: 0, to: 5 },
      ],
    });
    const seen: number[] = [];
    const spy: DispatchFn = (car, state) => {
      seen.push(state.hallCalls.length);
      return car.stops[0]?.floor ?? state.hallCalls[0]?.floor ?? null;
    };
    const r = simulate(sc, spy);
    expect(r.metrics.served).toBe(2);
    // While standing full at floor 0 the remaining hall call there is hidden.
    expect(seen[0]).toBe(0);
  });

  it('sees hall calls grouped by floor and direction with counts and ages', () => {
    const sc = expandScenario({
      id: 'calls',
      name: 'calls',
      floors: 10,
      initialFloor: 9,
      doorTime: 0,
      maxTime: 50,
      passengers: [
        { t: 0, from: 2, to: 5 },
        { t: 1, from: 2, to: 7 },
        { t: 0, from: 2, to: 0 },
      ],
    });
    let snapshot: ReturnType<typeof Object.freeze> | null = null;
    const r = simulate(sc, (car, state) => {
      if (state.time < 1) return null;
      if (snapshot === null) snapshot = JSON.parse(JSON.stringify(state.hallCalls));
      return state.hallCalls[0]?.floor ?? car.stops[0]?.floor ?? null;
    });
    expect(r.error).toBeNull();
    expect(snapshot).toEqual([
      { floor: 2, direction: -1, count: 1, since: 0, seq: 1 },
      { floor: 2, direction: 1, count: 2, since: 0, seq: 0 },
    ]);
  });
});

describe('policy robustness', () => {
  const tiny: Scenario = expandScenario({
    id: 't',
    name: 't',
    floors: 4,
    doorTime: 0,
    maxTime: 30,
    passengers: [{ t: 0, from: 0, to: 3 }],
  });

  it('stops the run and reports where the policy threw', () => {
    const r = simulate(tiny, () => {
      throw new Error('boom');
    });
    expect(r.error).toBe('tick 0, car 0: boom');
    expect(r.frames.length).toBe(1);
    expect(r.metrics.unserved).toBe(1);
  });

  it('ignores invalid return values with a warning and idles', () => {
    const r = simulate(tiny, () => 'up' as unknown as number);
    expect(r.warnings[0]).toMatch(/returned "up"/);
    expect(r.metrics.served).toBe(0);
    const r2 = simulate(tiny, () => 99);
    expect(r2.warnings[0]).toMatch(/expected a floor 0\.\.3/);
    const r3 = simulate(tiny, () => 1.5);
    expect(r3.warnings.length).toBe(1);
  });

  it('caps the number of warnings', () => {
    const r = simulate(expandScenario({ ...tiny, passengers: Array.from({ length: 40 }, (_, i) => ({ t: i % 20, from: 0, to: 3 })) }), () => -1);
    expect(r.warnings.length).toBe(20);
  });

  it('treats null and the current floor as "stay", and wakes the car on the next request', () => {
    const sc = expandScenario({
      id: 'null',
      name: 'null',
      floors: 4,
      doorTime: 0,
      maxTime: 30,
      passengers: [
        { t: 0, from: 2, to: 3 },
        { t: 5, from: 0, to: 3 },
      ],
    });
    let calls = 0;
    const r = simulate(sc, (car, state) => {
      calls++;
      if (state.time < 5) return car.floor;
      return state.hallCalls[0]?.floor ?? car.stops[0]?.floor ?? null;
    });
    expect(r.warnings).toEqual([]);
    expect(r.frames[1].cars[0].floor).toBe(0);
    expect(r.metrics.served).toBe(2);
    expect(calls).toBeGreaterThan(1);
  });

  it('counts decisions and records dispatch events', () => {
    const r = simulate(tiny, compilePolicy(policyById('fcfs')!.source));
    expect(r.decisions).toBeGreaterThan(0);
    expect(r.events.filter((e) => e.type === 'dispatch').length).toBe(r.decisions);
  });

  it('runs a multi-car policy where idle cars stay put', () => {
    const sc = expandScenario({
      id: 'multi',
      name: 'multi',
      floors: 10,
      cars: 2,
      initialFloor: [0, 9],
      doorTime: 0,
      maxTime: 60,
      passengers: [
        { t: 0, from: 8, to: 9 },
        { t: 0, from: 1, to: 0 },
      ],
    });
    const r = simulate(sc, (car, state) => {
      // Each car only takes the call nearest to it.
      const reqs = [...state.hallCalls.map((h) => h.floor), ...car.stops.map((s) => s.floor)];
      if (reqs.length === 0) return null;
      const other = state.cars.find((c) => c.id !== car.id)!;
      const mine = reqs.filter((f) => Math.abs(f - car.floor) <= Math.abs(f - other.floor));
      return mine.length ? mine[0] : null;
    });
    expect(r.error).toBeNull();
    expect(r.metrics.served).toBe(2);
    expect(r.passengers[0].car).toBe(1);
    expect(r.passengers[1].car).toBe(0);
    expect(r.metrics.energy).toBe(4);
  });
});
