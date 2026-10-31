import { describe, expect, it } from 'vitest';
import { EXERCISES, compile, exerciseById, makeHarness, runExercise } from '../src/core/exercises';

describe('exercises', () => {
  for (const ex of EXERCISES) {
    it(`${ex.id}: starter fails at least one test`, () => {
      const results = runExercise(ex, ex.starter);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => !r.pass)).toBe(true);
    });
    it(`${ex.id}: reference solution passes every test`, () => {
      const results = runExercise(ex, ex.solution);
      expect(results.filter((r) => !r.pass)).toEqual([]);
    });
  }

  it('reports compile errors and missing functions', () => {
    const ex = EXERCISES[0];
    expect(runExercise(ex, 'function (')[0]).toMatchObject({ name: 'Compiles', pass: false });
    expect(runExercise(ex, 'const x = 1;')[0].detail).toMatch(/Define a function named makeDeadline/);
    expect(() => compile('function f() {}', 'g')).toThrow();
  });

  it('turns thrown errors into failed tests', () => {
    const ex = exerciseById('merge');
    const results = runExercise(ex!, 'function mergeLogs() { throw new Error("nope"); }');
    expect(results.every((r) => !r.pass && r.detail.includes('nope'))).toBe(true);
    expect(exerciseById('missing')).toBeUndefined();
  });

  it('harness wall clock steps back at 23:59:60 and forward at a removed second', () => {
    const h = makeHarness(500, 1);
    const w0 = h.clock.wallMs();
    const m0 = h.clock.monotonicMs();
    h.advance(1000);
    expect(h.clock.wallMs() - w0).toBe(0);
    expect(h.clock.monotonicMs() - m0).toBeCloseTo(1000, 6);
    const n = makeHarness(500, -1);
    const n0 = n.clock.wallMs();
    n.advance(1000);
    expect(n.clock.wallMs() - n0).toBe(2000);
  });
});
