import { describe, expect, it } from 'vitest';
import { BENCH, NOTES, RUNTIMES, noteFor, truthFor, verdict } from '../src/core/bench';

describe('bench', () => {
  it('has recorded results for every runtime', () => {
    expect(BENCH.cases.length).toBeGreaterThanOrEqual(10);
    for (const c of BENCH.cases) {
      for (const r of RUNTIMES) {
        expect(c.results[r], `${c.id}:${r}`).toBeDefined();
        expect(c.snippets[r]).toBeTruthy();
      }
    }
    expect(BENCH.runtimes.postgres).toMatch(/PostgreSQL/);
  });

  it('has a note and a truth for every case', () => {
    for (const c of BENCH.cases) {
      expect(truthFor(c.id), c.id).not.toBe('');
      for (const r of RUNTIMES) expect(noteFor(c.id, r), `${c.id}:${r}`).not.toBe('');
    }
    expect(Object.keys(NOTES)).toHaveLength(BENCH.cases.length * RUNTIMES.length);
    expect(truthFor('nope')).toBe('');
    expect(noteFor('nope', 'date')).toBe('');
  });

  it('truths are computed, not typed', () => {
    expect(truthFor('duration-across')).toMatch(/^2 SI/);
    expect(truthFor('duration-year')).toMatch(/^31622401 SI/);
    expect(truthFor('neg-duration')).toMatch(/^1 SI/);
    expect(truthFor('add-day')).toMatch(/2017-01-01T11:59:59Z/);
    expect(truthFor('fake-leap')).toMatch(/does not exist/);
    expect(truthFor('neg-label')).toMatch(/removes 23:59:59/);
    expect(truthFor('parse-leap')).toMatch(/2017-01-01T00:00:36/);
    expect(truthFor('parse-leap-frac')).toMatch(/00:00:36\.5/);
    expect(truthFor('unix-of-leap')).toMatch(/1483228799/);
  });

  it('classifies results', () => {
    const c = BENCH.cases.find((x) => x.id === 'parse-leap')!;
    expect(verdict(c, 'date')).toBe('loud');
    expect(verdict(c, 'postgres')).toBe('silent');
    expect(verdict(BENCH.cases.find((x) => x.id === 'unix-of-leap')!, 'temporal')).toBe('right');
    expect(verdict({ ...c, results: {} }, 'date')).toBe('missing');
  });
});
