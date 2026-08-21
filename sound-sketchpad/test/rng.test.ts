import { describe, expect, it } from 'vitest';
import { hashString, mulberry32 } from '../src/core/rng.js';

describe('hashString', () => {
  it('is deterministic', () => {
    expect(hashString('muffled explosion')).toBe(hashString('muffled explosion'));
  });

  it('differs for different strings', () => {
    expect(hashString('coin')).not.toBe(hashString('laser'));
  });

  it('returns an unsigned 32-bit integer', () => {
    const h = hashString('anything at all');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('produces values in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});
