import { describe, expect, it } from 'vitest';
import { radarAxes, radarPoints, setStats } from '../src/core/stats';
import { initialCard } from '../src/core/sm2';
import type { CardState, ShortcutSet } from '../src/core/types';

const set: ShortcutSet = {
  version: 1,
  id: 's',
  name: 'S',
  tool: 'S',
  shortcuts: [
    { id: 'a', task: 'A', combo: 'A' },
    { id: 'b', task: 'B', combo: 'B' },
    { id: 'c', task: 'C', combo: 'C' },
    { id: 'd', task: 'D', combo: 'D' },
  ],
};

function card(over: Partial<CardState>): CardState {
  return { ...initialCard(0), ...over };
}

describe('setStats', () => {
  it('is all zeros for an untouched set', () => {
    const st = setStats(set, undefined);
    expect(st).toMatchObject({ total: 4, started: 0, mature: 0, mastery: 0, accuracy: 0 });
  });

  it('blends coverage and maturity 50/50', () => {
    const st = setStats(set, {
      a: card({ seen: 2, correct: 2, intervalDays: 30 }),
      b: card({ seen: 4, correct: 2, intervalDays: 6 }),
    });
    // started 2/4 → 0.25 ; mature 1/4 → 0.125
    expect(st.mastery).toBeCloseTo(0.375, 5);
    expect(st.started).toBe(2);
    expect(st.mature).toBe(1);
    expect(st.accuracy).toBeCloseTo(4 / 6, 5);
  });

  it('ignores cards that exist but were never seen', () => {
    const st = setStats(set, { a: card({}) });
    expect(st.started).toBe(0);
  });

  it('handles an empty set without dividing by zero', () => {
    const st = setStats({ ...set, shortcuts: [] }, {});
    expect(st.mastery).toBe(0);
  });
});

describe('radarPoints', () => {
  it('puts the first axis straight up and clamps values', () => {
    const pts = radarPoints([1, 2, -1, 0.5], 100, 100, 50);
    const pairs = pts.split(' ').map((p) => p.split(',').map(Number));
    expect(pairs).toHaveLength(4);
    expect(pairs[0][0]).toBeCloseTo(100, 0);
    expect(pairs[0][1]).toBeCloseTo(50, 0);
    // clamped to 1 → full radius right
    expect(pairs[1][0]).toBeCloseTo(150, 0);
    // clamped to 0 → center
    expect(pairs[2][0]).toBeCloseTo(100, 0);
    expect(pairs[2][1]).toBeCloseTo(100, 0);
  });

  it('returns empty for no axes', () => {
    expect(radarPoints([], 0, 0, 10)).toBe('');
  });
});

describe('radarAxes', () => {
  it('returns n unit points on the circle', () => {
    const axes = radarAxes(4, 0, 0, 10);
    expect(axes).toHaveLength(4);
    expect(axes[0].y).toBeCloseTo(-10, 5);
    expect(axes[1].x).toBeCloseTo(10, 5);
  });
});
