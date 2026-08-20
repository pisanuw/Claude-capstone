import { describe, expect, it } from 'vitest';
import { buildQueue, queueCounts } from '../src/core/scheduler';
import { initialCard, review } from '../src/core/sm2';
import type { CardState, Shortcut } from '../src/core/types';

const shortcuts: Shortcut[] = [
  { id: 'a', task: 'A', combo: 'A' },
  { id: 'b', task: 'B', combo: 'B' },
  { id: 'c', task: 'C', combo: 'C' },
  { id: 'd', task: 'D', combo: 'D' },
];

describe('buildQueue', () => {
  it('introduces new cards in library order up to the limit', () => {
    const q = buildQueue(shortcuts, {}, 100, 2);
    expect(q.map((i) => i.shortcut.id)).toEqual(['a', 'b']);
    expect(q.every((i) => i.isNew)).toBe(true);
  });

  it('puts due reviews before new cards, most overdue first', () => {
    const cards: Record<string, CardState> = {
      a: { ...initialCard(0), due: 99, seen: 1 },
      b: { ...initialCard(0), due: 90, seen: 1 },
      c: { ...initialCard(0), due: 200, seen: 1 },
    };
    const q = buildQueue(shortcuts, cards, 100, 5);
    expect(q.map((i) => i.shortcut.id)).toEqual(['b', 'a', 'd']);
    expect(q[0].isNew).toBe(false);
    expect(q[2].isNew).toBe(true);
  });

  it('excludes future-due cards and respects newLimit 0', () => {
    const cards: Record<string, CardState> = { a: { ...initialCard(0), due: 101, seen: 1 } };
    expect(buildQueue(shortcuts, cards, 100, 0)).toEqual([]);
  });

  it('includes a card due exactly today', () => {
    const cards: Record<string, CardState> = { a: review(initialCard(99), 5, 99) };
    const q = buildQueue(shortcuts, cards, 100, 0);
    expect(q.map((i) => i.shortcut.id)).toEqual(['a']);
  });
});

describe('queueCounts', () => {
  it('splits due and new', () => {
    const q = buildQueue(shortcuts, { a: { ...initialCard(0), due: 1, seen: 1 } }, 100, 2);
    expect(queueCounts(q)).toEqual({ due: 1, fresh: 2 });
  });
});
