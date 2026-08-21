import { describe, expect, it } from 'vitest';
import { hashString, mulberry32 } from '../src/core/rng';

describe('hashString', () => {
  it('is deterministic', () => {
    expect(hashString('gauntlet-daily-2026-08-21')).toBe(hashString('gauntlet-daily-2026-08-21'));
  });

  it('distinguishes nearby inputs', () => {
    expect(hashString('2026-08-21')).not.toBe(hashString('2026-08-22'));
  });

  it('returns an unsigned 32-bit integer', () => {
    for (const s of ['', 'a', 'seed', '2026-08-21']) {
      const h = hashString(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i += 1) expect(a.next()).toBe(b.next());
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const same = Array.from({ length: 10 }, () => a.next() === b.next());
    expect(same.every(Boolean)).toBe(false);
  });

  it('next stays in [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i += 1) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('int stays in [0, n)', () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 1000; i += 1) {
      const x = rng.int(5);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(5);
      expect(Number.isInteger(x)).toBe(true);
    }
  });

  it('pick returns members and throws on empty', () => {
    const rng = mulberry32(11);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i += 1) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow();
  });

  it('shuffle returns a permutation without touching the input', () => {
    const rng = mulberry32(13);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = rng.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });
});
