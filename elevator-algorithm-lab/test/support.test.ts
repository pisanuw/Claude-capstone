import { describe, expect, it } from 'vitest';
import { PolicyError, compilePolicy, policyHash } from '../src/core/compile';
import {
  addEntry,
  mergeBoards,
  parseBoard,
  rank,
  score,
  toCsv,
  type LeaderboardEntry,
} from '../src/core/leaderboard';
import { METRIC_COLUMNS, computeMetrics, formatMetric, percentile } from '../src/core/metrics';
import { POLICIES, policyById } from '../src/core/policies';
import { decodeShare, encodeShare } from '../src/core/share';
import type { Metrics, PassengerResult } from '../src/core/types';

describe('compilePolicy', () => {
  it('compiles every preset and exposes the helpers', () => {
    for (const p of POLICIES) expect(typeof compilePolicy(p.source)).toBe('function');
    const fn = compilePolicy('function dispatch(car, state) { return nearest(car.floor, pending(car, state)); }');
    expect(typeof fn).toBe('function');
    expect(policyById('look')?.name).toBe('LOOK');
    expect(policyById('nope')).toBeUndefined();
  });

  it('keeps top-level state between calls', () => {
    const fn = compilePolicy('let n = 0; function dispatch() { n++; return n; }');
    const state = { time: 0, floors: 9, initialDirection: 1 as const, cars: [], hallCalls: [] };
    const car = { id: 0, floor: 0, direction: 0 as const, target: null, capacity: 1, stops: [], load: 0 };
    expect(fn(car, state)).toBe(1);
    expect(fn(car, state)).toBe(2);
  });

  it('reports empty, syntax, load-time and missing-dispatch errors', () => {
    expect(() => compilePolicy('')).toThrow(/empty/);
    expect(() => compilePolicy('function dispatch( {')).toThrow(PolicyError);
    expect(() => compilePolicy('function dispatch( {')).toThrow(/syntax error/);
    expect(() => compilePolicy('throw new Error("nope"); function dispatch() {}')).toThrow(/while loading the policy: nope/);
    expect(() => compilePolicy('const x = 1;')).toThrow(/must define function dispatch/);
    expect(() => compilePolicy('const dispatch = 3;')).toThrow(/must define function dispatch/);
  });

  it('cannot see the prelude as the helpers named by the student shadow it', () => {
    const fn = compilePolicy('function nearest() { return { floor: 7 }; } function dispatch(car, state) { return nearest().floor; }');
    expect(fn({} as never, {} as never)).toBe(7);
  });

  it('hashes ignore comments and whitespace', () => {
    const a = policyHash('function dispatch(car, state) { return 1; }');
    const b = policyHash('// hello\nfunction dispatch(car,   state) {\n  return 1;\n}');
    const c = policyHash('function dispatch(car, state) { return 2; }');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('metrics', () => {
  const px = (t: number, boardedAt: number | null, alightedAt: number | null, id = 0): PassengerResult => ({
    id,
    t,
    from: 0,
    to: 1,
    boardedAt,
    alightedAt,
    car: boardedAt === null ? null : 0,
  });

  it('computes waits, rides, tail and starvation for unserved passengers', () => {
    const m = computeMetrics(
      [px(0, 2, 5), px(0, 4, 10, 1), px(10, null, null, 2), px(20, 30, null, 3)],
      { energy: 12, stops: 3, endTime: 100, maxTime: 100 },
    );
    expect(m.served).toBe(2);
    expect(m.unserved).toBe(2);
    // waits: 2, 4, 90 (still waiting at maxTime), 10 (boarded, not yet delivered)
    expect(m.meanWait).toBe((2 + 4 + 90 + 10) / 4);
    expect(m.maxWait).toBe(90);
    expect(m.p95Wait).toBe(90);
    expect(m.meanRide).toBe((3 + 6) / 2);
    expect(m.meanTotal).toBe((5 + 10) / 2);
    expect(m.energy).toBe(12);
    expect(m.stops).toBe(3);
    expect(m.finishTime).toBe(100);
  });

  it('handles an empty passenger list', () => {
    const m = computeMetrics([], { energy: 0, stops: 0, endTime: 0, maxTime: 10 });
    expect(m.meanWait).toBe(0);
    expect(m.maxWait).toBe(0);
    expect(m.p95Wait).toBe(0);
  });

  it('nearest-rank percentile', () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0)).toBe(1);
  });

  it('formats integer-like metrics without decimals', () => {
    expect(formatMetric('meanWait', 12.345)).toBe('12.3');
    expect(formatMetric('energy', 12.9)).toBe('13');
    expect(METRIC_COLUMNS.map((c) => c.key)).toContain('maxWait');
  });
});

const metrics = (meanWait: number, maxWait: number, unserved = 0): Metrics => ({
  served: 10 - unserved,
  unserved,
  meanWait,
  p95Wait: maxWait,
  maxWait,
  meanRide: 5,
  meanTotal: 5 + meanWait,
  energy: 100,
  finishTime: 300,
  stops: 20,
});

const entry = (name: string, hash: string, m: Metrics, scenarioId = 's1'): LeaderboardEntry => ({
  name,
  scenarioId,
  policyHash: hash,
  policyName: 'custom',
  metrics: m,
  at: '2026-10-01T00:00:00.000Z',
});

describe('leaderboard', () => {
  it('scores mean wait plus a quarter of the starvation tail and punishes unserved', () => {
    expect(score(metrics(10, 40))).toBe(20);
    expect(score(metrics(10, 40, 1))).toBe(1020);
  });

  it('adds, replaces same policy+scenario+name, ranks per scenario', () => {
    let list: LeaderboardEntry[] = [];
    list = addEntry(list, entry('ann', 'aaaa', metrics(30, 100)));
    list = addEntry(list, entry('bob', 'bbbb', metrics(10, 100)));
    list = addEntry(list, entry('ann', 'aaaa', metrics(20, 100)));
    list = addEntry(list, entry('cat', 'cccc', metrics(10, 100), 'other'));
    expect(list.length).toBe(3);
    expect(rank(list, 's1').map((e) => e.name)).toEqual(['bob', 'ann']);
    expect(rank(list, 'other').map((e) => e.name)).toEqual(['cat']);
    expect(rank(list, 'none')).toEqual([]);
  });

  it('keeps earlier runs ahead on ties', () => {
    const list = [entry('first', 'a', metrics(10, 10)), entry('second', 'b', metrics(10, 10))];
    expect(rank(list, 's1').map((e) => e.name)).toEqual(['first', 'second']);
  });

  it('exports CSV with quoting', () => {
    const csv = toCsv([entry('Ann, "the" fast', 'aaaa', metrics(10.5, 40))]);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('name,scenario,policy,policyHash,score,meanWait,p95Wait,maxWait,meanRide,energy,finishTime,stops,served,unserved,at');
    expect(lines[1].startsWith('"Ann, ""the"" fast",s1,custom,aaaa,20.50,10.50,40,40,5,100,300,20,10,0,')).toBe(true);
  });

  it('parses saved boards defensively and merges imports', () => {
    expect(parseBoard(null)).toEqual([]);
    expect(parseBoard('not json')).toEqual([]);
    expect(parseBoard('{"a":1}')).toEqual([]);
    const good = entry('ann', 'aaaa', metrics(1, 1));
    const parsed = parseBoard(JSON.stringify([good, { name: 'broken' }, null]));
    expect(parsed).toEqual([good]);
    const merged = mergeBoards([good], [entry('ann', 'aaaa', metrics(2, 2)), entry('zed', 'zzzz', metrics(3, 3))]);
    expect(merged.length).toBe(2);
    expect(merged.find((e) => e.name === 'ann')?.metrics.meanWait).toBe(2);
  });
});

describe('share links', () => {
  it('round-trips a scenario, code and scenario id', async () => {
    const payload = {
      scenario: { id: 'x', name: 'X', floors: 12, generate: { seed: 1, count: 10, start: 0, end: 10, pattern: 'lunch' as const } },
      code: 'function dispatch() { return 0; }',
      scenarioId: 'morning-rush',
    };
    const frag = await encodeShare(payload);
    expect(frag.startsWith('v1.')).toBe(true);
    expect(frag).not.toMatch(/[+/=]/);
    expect(await decodeShare('#' + frag)).toEqual(payload);
    expect(await decodeShare(frag)).toEqual(payload);
  });

  it('drops unknown fields and returns null for garbage', async () => {
    const frag = await encodeShare({ code: 'a', extra: 1 } as never);
    expect(await decodeShare(frag)).toEqual({ code: 'a' });
    expect(await decodeShare('')).toBeNull();
    expect(await decodeShare('#v2.abc')).toBeNull();
    expect(await decodeShare('v1.!!!notbase64')).toBeNull();
    expect(await decodeShare('v1.' + btoa('xx').replace(/=/g, ''))).toBeNull();
  });

  it('compresses a scenario with an explicit passenger list', async () => {
    const passengers = Array.from({ length: 200 }, (_, i) => ({ t: i, from: 0, to: 1 + (i % 9) }));
    const frag = await encodeShare({ scenario: { id: 'big', name: 'big', floors: 10, passengers } });
    expect(frag.length).toBeLessThan(JSON.stringify(passengers).length / 3);
    const back = await decodeShare(frag);
    expect(back?.scenario && 'passengers' in back.scenario && back.scenario.passengers?.length).toBe(200);
  });
});
