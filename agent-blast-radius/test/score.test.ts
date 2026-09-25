import { describe, expect, it } from 'vitest';
import { dimensionScores, overallScore, riskLevel } from '../src/core/score.js';
import type { Capability } from '../src/core/types.js';

const c = (dimension: Capability['dimension'], weight: number): Capability => ({ dimension, weight, label: '', explain: '', evidence: '' });

describe('dimensionScores', () => {
  it('is zero for no capabilities', () => {
    expect(dimensionScores([])).toEqual({ filesystem: 0, shell: 0, network: 0, credentials: 0, browser: 0 });
  });

  it('takes the strongest capability and adds diminishing credit for more', () => {
    const one = dimensionScores([c('filesystem', 50)]).filesystem;
    const two = dimensionScores([c('filesystem', 50), c('filesystem', 50)]).filesystem;
    expect(one).toBe(50);
    expect(two).toBeGreaterThan(50);
    expect(two).toBeLessThan(60);
  });

  it('never exceeds 100 and clamps bad weights', () => {
    const s = dimensionScores([c('shell', 100), c('shell', 100), c('shell', 150), c('network', -5)]);
    expect(s.shell).toBe(100);
    expect(s.network).toBe(0);
  });
});

describe('overallScore', () => {
  it('weights shell above network', () => {
    const shell = overallScore(dimensionScores([c('shell', 60)]), []);
    const net = overallScore(dimensionScores([c('network', 60)]), []);
    expect(shell).toBeGreaterThan(net);
  });

  it('adds breadth and finding bumps, capped', () => {
    const dims = dimensionScores([c('shell', 50), c('filesystem', 50), c('network', 50)]);
    expect(overallScore(dims, [])).toBe(50 + 8);
    const many = Array.from({ length: 5 }, () => ({ severity: 'critical' as const, message: '' }));
    expect(overallScore(dims, many)).toBe(58 + 20);
    expect(overallScore(dimensionScores([c('shell', 100)]), many)).toBe(100);
  });
});

describe('riskLevel', () => {
  it('buckets scores', () => {
    expect(riskLevel(0)).toBe('low');
    expect(riskLevel(29)).toBe('low');
    expect(riskLevel(30)).toBe('medium');
    expect(riskLevel(60)).toBe('high');
    expect(riskLevel(85)).toBe('critical');
  });
});
