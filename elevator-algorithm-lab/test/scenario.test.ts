import { describe, expect, it } from 'vitest';
import { makeRng, randInt } from '../src/core/rng';
import { ScenarioError, expandScenario, generateTraffic, parseScenario } from '../src/core/scenario';
import { SCENARIOS, scenarioSpecById } from '../src/core/scenarios';

describe('rng', () => {
  it('is deterministic and uniform-ish in range', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const xs = Array.from({ length: 1000 }, () => randInt(a, 3, 7));
    const ys = Array.from({ length: 1000 }, () => randInt(b, 3, 7));
    expect(xs).toEqual(ys);
    expect(Math.min(...xs)).toBe(3);
    expect(Math.max(...xs)).toBe(7);
    for (let v = 3; v <= 7; v++) expect(xs.filter((x) => x === v).length).toBeGreaterThan(120);
  });
});

describe('generateTraffic', () => {
  it('up-peak trips start at the lobby and never end there', () => {
    const ps = generateTraffic({ seed: 1, count: 50, start: 0, end: 100, pattern: 'up-peak' }, 10);
    expect(ps.length).toBe(50);
    for (const p of ps) {
      expect(p.from).toBe(0);
      expect(p.to).toBeGreaterThanOrEqual(1);
      expect(p.to).toBeLessThanOrEqual(9);
      expect(p.t).toBeGreaterThanOrEqual(0);
      expect(p.t).toBeLessThanOrEqual(100);
    }
    // Sorted by arrival.
    for (let i = 1; i < ps.length; i++) expect(ps[i].t).toBeGreaterThanOrEqual(ps[i - 1].t);
  });

  it('down-peak trips end at the lobby; lunch mixes both', () => {
    const down = generateTraffic({ seed: 2, count: 30, start: 0, end: 10, pattern: 'down-peak', lobby: 1 }, 10);
    for (const p of down) {
      expect(p.to).toBe(1);
      expect(p.from).not.toBe(1);
    }
    const lunch = generateTraffic({ seed: 3, count: 100, start: 0, end: 10, pattern: 'lunch' }, 10);
    expect(lunch.some((p) => p.from === 0)).toBe(true);
    expect(lunch.some((p) => p.to === 0)).toBe(true);
  });

  it('interfloor trips stay inside floorRange and never go nowhere', () => {
    const ps = generateTraffic({ seed: 4, count: 200, start: 5, end: 5, pattern: 'interfloor', floorRange: [30, 40] }, 41);
    for (const p of ps) {
      expect(p.from).not.toBe(p.to);
      expect(p.from).toBeGreaterThanOrEqual(30);
      expect(p.to).toBeLessThanOrEqual(40);
      expect(p.t).toBe(5);
    }
    const single = generateTraffic({ seed: 4, count: 3, start: 0, end: 0, pattern: 'interfloor', floorRange: [4, 4] }, 10);
    expect(single.map((p) => [p.from, p.to])).toEqual([[4, 5], [4, 5], [4, 5]]);
  });

  it('rejects unknown patterns and bad seeds', () => {
    expect(() => generateTraffic({ seed: 1, count: 1, start: 0, end: 0, pattern: 'x' as 'lunch' }, 5)).toThrow(ScenarioError);
    expect(() => generateTraffic({ seed: -1, count: 1, start: 0, end: 0, pattern: 'lunch' }, 5)).toThrow(/seed/);
    expect(() => generateTraffic({ seed: 1, count: 1, start: 5, end: 2, pattern: 'lunch' }, 5)).toThrow(/generate.end/);
  });
});

describe('expandScenario', () => {
  it('fills defaults for a building', () => {
    const s = expandScenario({ id: 'a', name: '', floors: 5 });
    expect(s).toMatchObject({
      kind: 'building',
      name: 'a',
      cars: 1,
      capacity: 8,
      doorTime: 2,
      maxTime: 1000,
      initialFloor: [0],
      initialDirection: 1,
      passengers: [],
      hidden: false,
    });
  });

  it('merges explicit passengers with generated ones, sorted by time', () => {
    const s = expandScenario({
      id: 'b',
      name: 'b',
      floors: 10,
      passengers: [{ t: 50, from: 1, to: 2 }],
      generate: { seed: 9, count: 5, start: 0, end: 20, pattern: 'up-peak' },
    });
    expect(s.passengers.length).toBe(6);
    expect(s.passengers[5]).toEqual({ t: 50, from: 1, to: 2 });
  });

  it('expands a disk trace into one car with instant stops', () => {
    const s = expandScenario(scenarioSpecById('textbook-disk')!);
    expect(s.kind).toBe('disk');
    expect(s.cars).toBe(1);
    expect(s.doorTime).toBe(0);
    expect(s.initialFloor).toEqual([53]);
    expect(s.initialDirection).toBe(-1);
    expect(s.passengers.map((p) => p.from)).toEqual([98, 183, 37, 122, 14, 124, 65, 67]);
    expect(s.passengers.every((p) => p.t === 0 && p.from === p.to)).toBe(true);
    expect(s.maxTime).toBeGreaterThan(200 * 8);
  });

  it('generates disk requests from a seed', () => {
    const s = expandScenario({ kind: 'disk', id: 'd', name: 'd', cylinders: 100, head: 0, generate: { seed: 1, count: 20 } });
    expect(s.passengers.length).toBe(20);
    expect(s.passengers.every((p) => p.from >= 0 && p.from < 100)).toBe(true);
    expect(s.initialDirection).toBe(-1);
  });

  it('validates fields with helpful messages', () => {
    expect(() => expandScenario(null)).toThrow(/JSON object/);
    expect(() => expandScenario({ name: 'x', floors: 3 })).toThrow(/"id" is required/);
    expect(() => expandScenario({ id: 'x', name: 'x' })).toThrow(/"floors" is required/);
    expect(() => expandScenario({ id: 'x', name: 'x', floors: 1 })).toThrow(/between 2 and 1000/);
    expect(() => expandScenario({ id: 'x', name: 'x', floors: 5, cars: 2, initialFloor: [0] })).toThrow(/one floor per car/);
    expect(() => expandScenario({ id: 'x', name: 'x', floors: 5, initialDirection: 0 })).toThrow(/initialDirection/);
    expect(() => expandScenario({ id: 'x', name: 'x', floors: 5, passengers: [{ t: 0, from: 9, to: 0 }] })).toThrow(/passengers\[0\].from/);
    expect(() => expandScenario({ kind: 'tram', id: 'x', name: 'x' })).toThrow(/"kind"/);
    expect(() => expandScenario({ kind: 'disk', name: 'x', cylinders: 10, head: 0 })).toThrow(/"id"/);
    expect(() => expandScenario({ kind: 'disk', id: 'x', name: 'x', cylinders: 10, head: 10 })).toThrow(/"head"/);
    expect(() => expandScenario({ kind: 'disk', id: 'x', name: 'x', cylinders: 10, head: 0, initialDirection: 2 })).toThrow(/initialDirection/);
    expect(() => expandScenario({ kind: 'disk', id: 'x', name: 'x', cylinders: 10, head: 0, requests: [10] })).toThrow(/requests\[0\]/);
  });

  it('accepts per-car initial floors and hidden flags', () => {
    const s = expandScenario({ id: 'x', name: 'x', floors: 5, cars: 2, initialFloor: [1, 4], hidden: true, initialDirection: -1 });
    expect(s.initialFloor).toEqual([1, 4]);
    expect(s.hidden).toBe(true);
    expect(s.initialDirection).toBe(-1);
  });

  it('parses JSON text and reports syntax errors', () => {
    expect(parseScenario('{"id":"j","name":"j","floors":4}').floors).toBe(4);
    expect(() => parseScenario('{nope')).toThrow(/not valid JSON/);
  });

  it('every built-in scenario expands with a unique id', () => {
    const ids = new Set(SCENARIOS.map((s) => s.id));
    expect(ids.size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) expect(expandScenario(s).passengers.length).toBeGreaterThan(0);
    expect(scenarioSpecById('nope')).toBeUndefined();
  });
});
