import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, simulate, validateConfig } from '../src/core/cache';
import { PRESETS } from '../src/core/presets';
import { buildTrace } from '../src/core/trace';

const run = (id: string, which: 'a' | 'b') => {
  const p = PRESETS.find((x) => x.id === id)!;
  return simulate(buildTrace(p[which] as string), { ...DEFAULT_CONFIG, ...p.cache }).stats;
};

describe('presets', () => {
  it('all parse, have valid caches and sweep a real constant', () => {
    for (const p of PRESETS) {
      expect(validateConfig({ ...DEFAULT_CONFIG, ...p.cache })).toEqual([]);
      const names = [p.a, p.b ?? ''].filter(Boolean).flatMap((s) => buildTrace(s).constants.map((c) => c.name));
      if (p.sweep) expect(names).toContain(p.sweep.name);
    }
  });

  it('tell the stories their notes promise', () => {
    expect(run('row-col', 'a').misses * 4).toBe(run('row-col', 'b').misses);
    expect(run('matmul-order', 'b').misses).toBeLessThan(run('matmul-order', 'a').misses / 2);
    expect(run('blocked-matmul', 'a').misses).toBe(3744);
    expect(run('blocked-matmul', 'b').misses).toBe(1008);
    expect(run('transpose', 'b').misses).toBeLessThan(run('transpose', 'a').misses / 2);
    expect(run('conflict', 'a').conflict).toBeGreaterThan(400);
    expect(run('conflict', 'b').conflict).toBe(0);
    expect(run('stencil', 'a').misses).toBe(run('stencil', 'a').compulsory);
  });
});
