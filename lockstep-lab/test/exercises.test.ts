import { describe, expect, it } from 'vitest';
import { EXERCISES, diffExWorlds, grade, hashExWorld, portableCos, portableSin } from '../src/core/exercises';

describe('exercises', () => {
  for (const ex of EXERCISES) {
    it(`${ex.id}: the starter desyncs and the solution survives 10,000 ticks`, () => {
      const bad = grade(ex, ex.starter);
      expect(bad.passed).toBe(false);
      expect(bad.divergedAt).not.toBeNull();
      expect(bad.diff).toMatch(/unit \d+\./);
      const good = grade(ex, ex.solution);
      expect(good.error).toBeNull();
      expect(good.divergedAt).toBeNull();
      expect(good.checkFailure).toBeNull();
      expect(good.passed).toBe(true);
      expect(good.ticks).toBe(10_000);
      expect(good.hashes[0]).toBe(good.hashes[1]);
    });
  }

  const wander = EXERCISES[0]!;

  it('rejects code that does nothing', () => {
    const r = grade(wander, '', 500);
    expect(r.passed).toBe(false);
    expect(r.checkFailure).toMatch(/keep changing/);
  });

  it('runs the behavioural check', () => {
    const orbit = EXERCISES.find((e) => e.id === 'orbit')!;
    const r = grade(orbit, 'for (const u of api.sortedUnits()) { u.angle += 0.1; u.x = u.angle; u.y = 0; }', 500);
    expect(r.passed).toBe(false);
    expect(r.checkFailure).toMatch(/orbit/);
    const claims = EXERCISES.find((e) => e.id === 'claims')!;
    expect(grade(claims, 'for (const u of api.sortedUnits()) u.x += 1;', 300).checkFailure).toMatch(/pads/);
    expect(grade(wander, 'api.tick;', 300).checkFailure).toMatch(/keep changing/);
    expect(grade(wander, 'for (const u of api.sortedUnits()) u.y += 1;', 300).checkFailure).toMatch(/wander/);
    expect(grade(EXERCISES[1]!, 'for (const u of api.sortedUnits()) u.vx = 0 * (u.y += 1);', 300).checkFailure).toMatch(/move/);
    expect(grade(EXERCISES[4]!, 'for (const u of api.sortedUnits()) u.y += 1;', 300).checkFailure).toMatch(/heading/);
  });

  it('reports syntax and runtime errors', () => {
    expect(grade(wander, 'for (', 10).error).toMatch(/Syntax error/);
    const r = grade(wander, 'if (api.tick === 3) throw new Error("boom");', 10);
    expect(r.error).toBe('Tick 3: boom');
    expect(r.ticks).toBe(3);
  });

  it('hashes worlds independently of insertion order and key order', () => {
    const a = { units: new Map([[1, { id: 1, x: 1, y: 2, vx: 0, vy: 0 }], [2, { id: 2, x: 3, y: 4, vx: 0, vy: 0 }]]), tag: 'k', flag: true, none: null };
    const b = { none: null, flag: true, tag: 'k', units: new Map([[2, { y: 4, x: 3, id: 2, vx: 0, vy: 0 }], [1, { id: 1, x: 1, y: 2, vx: 0, vy: 0 }]]) };
    expect(hashExWorld(a)).toBe(hashExWorld(b));
    expect(hashExWorld({ ...a, flag: false })).not.toBe(hashExWorld(a));
    expect(hashExWorld({ ...a, fn: () => 0 } as never)).not.toBe(hashExWorld(a));
    expect(diffExWorlds(a, b)).toMatch(/no field-level/);
    expect(diffExWorlds(a, { ...b, tag: 'z' })).toBe('world.tag differs');
    expect(diffExWorlds(a, { units: new Map() })).toBe('unit 1 missing on machine B');
  });

  it('portable trig is close to Math and identical everywhere', () => {
    for (let x = -7; x < 7; x += 0.13) {
      expect(Math.abs(portableSin(x) - Math.sin(x))).toBeLessThan(2e-3);
      expect(Math.abs(portableCos(x) - Math.cos(x))).toBeLessThan(2e-3);
    }
  });
});
