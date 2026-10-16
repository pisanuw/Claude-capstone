import { describe, expect, it } from 'vitest';
import { prng } from './helpers';
import { MIXTURE_FLOOR, MixturePredictor, NGramPredictor, createPredictor, replay, type Bit } from '../src/core/predictor';

const alt = (n: number): Bit[] => Array.from({ length: n }, (_, i) => (i % 2) as Bit);

describe('NGramPredictor', () => {
  it('rejects a bad order', () => {
    expect(() => new NGramPredictor(-1)).toThrow();
    expect(() => new NGramPredictor(1.5)).toThrow();
  });

  it('names itself by n-gram size and starts by predicting F, then a switch', () => {
    const p = new NGramPredictor(5);
    expect(p.name).toBe('6-gram');
    expect(p.predict()).toBe(0);
    p.update(1);
    // order-0 context now says J once; majority beats the switch default
    expect(p.predict()).toBe(1);
  });

  it('falls back to a switch when every context is tied', () => {
    const p = new NGramPredictor(0);
    p.update(0);
    p.update(1);
    expect(p.predict()).toBe(0);
  });

  it('learns a perfectly alternating player after a few presses', () => {
    const { correct } = replay(alt(100), 'easy');
    expect(correct.slice(10).every(Boolean)).toBe(true);
  });

  it('learns a period-3 pattern', () => {
    const seq = Array.from({ length: 90 }, (_, i) => (i % 3 === 2 ? 1 : 0) as Bit);
    const { correct } = replay(seq, 'easy');
    expect(correct.slice(15).every(Boolean)).toBe(true);
  });

  it('records context counts', () => {
    const p = new NGramPredictor(2);
    [0, 1, 1, 0, 1, 1].forEach((b) => p.update(b as Bit));
    expect(p.countsFor('01')).toEqual([0, 2]);
    expect(p.countsFor('')).toEqual([2, 4]);
    expect(p.countsFor('00')).toEqual([0, 0]);
  });

  it('cannot beat a fair coin by much', () => {
    const r = prng(7);
    const seq = Array.from({ length: 2000 }, () => (r() < 0.5 ? 0 : 1) as Bit);
    for (const mode of ['easy', 'hard'] as const) {
      const acc = replay(seq, mode).correct.filter(Boolean).length / seq.length;
      expect(acc).toBeGreaterThan(0.45);
      expect(acc).toBeLessThan(0.55);
    }
  });
});

describe('MixturePredictor', () => {
  it('needs at least one expert', () => {
    expect(() => new MixturePredictor([])).toThrow();
  });

  it('starts with equal weights and six experts', () => {
    const m = createPredictor('hard') as MixturePredictor;
    expect(m.experts.map((e) => e.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(m.weightsSnapshot().every((w) => Math.abs(w - 1 / 6) < 1e-12)).toBe(true);
    expect(m.leader()).toBe(0);
  });

  it('moves weight to the experts that guess right and keeps a floor', () => {
    const m = new MixturePredictor([0, 2]);
    // Pattern FFJ repeated: order-0 (majority F) misses every J, order-2 learns it.
    for (let i = 0; i < 120; i++) {
      m.predict();
      m.update((i % 3 === 2 ? 1 : 0) as Bit);
    }
    const w = m.weightsSnapshot();
    expect(w[1]).toBeGreaterThan(0.9);
    // floored before renormalising, so it can sit a hair under the floor
    expect(w[0]).toBeGreaterThan(MIXTURE_FLOOR * 0.9);
    expect(m.leader()).toBe(1);
    expect(Math.abs(w[0]! + w[1]! - 1)).toBeLessThan(1e-12);
  });

  it('updates correctly even if predict() was not called first', () => {
    const m = new MixturePredictor([0, 1]);
    m.update(1);
    m.update(1);
    expect(m.predict()).toBe(1);
  });

  it('breaks an exact tie with the leading expert', () => {
    // After F J F both experts have equal weight but disagree (order 0 says F, order 1 says J).
    const m = new MixturePredictor([0, 1]);
    for (const b of [0, 1, 0] as Bit[]) {
      m.predict();
      m.update(b);
    }
    expect(m.experts.map((e) => e.predict())).toEqual([0, 1]);
    expect(m.predict()).toBe(0);
  });

  it('beats a player who switches strategy halfway faster than a fixed 6-gram', () => {
    const first = alt(150);
    const second = Array.from({ length: 150 }, (_, i) => (i % 4 < 2 ? 0 : 1) as Bit);
    const seq = [...first, ...second];
    const easy = replay(seq, 'easy').correct.filter(Boolean).length;
    const hard = replay(seq, 'hard').correct.filter(Boolean).length;
    expect(hard).toBeGreaterThan(seq.length * 0.9);
    expect(easy).toBeGreaterThan(seq.length * 0.9);
  });

  it('replay predicts before seeing each bit', () => {
    const { predictions, correct } = replay([1, 1, 1], 'hard');
    expect(predictions[0]).toBe(0);
    expect(correct).toEqual([false, true, true]);
  });
});
