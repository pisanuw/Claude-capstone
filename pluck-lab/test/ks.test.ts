import { describe, expect, it } from 'vitest';
import { compileFilter, DEFAULT_FILTER_SOURCE } from '../src/core/filters';
import { CLIP_LEVEL, excitation, KSString, planDelay, renderString } from '../src/core/ks';
import { estimatePitch, measureT60 } from '../src/core/analysis';

const avg = compileFilter(DEFAULT_FILTER_SOURCE).fn!;
const base = { sampleRate: 48000, filterDelay: 0.5, pickPosition: 0, velocity: 0.9, seed: 42 };
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);

describe('planDelay', () => {
  it('rounds the line length without fractional tuning and reports the error', () => {
    const p = planDelay(48000, 659.26, 0.5, false);
    expect(p.length).toBe(72);
    expect(p.actualFrequency).toBeCloseTo(48000 / 72.5, 6);
    expect(p.centsError).toBeCloseTo(7.4, 1);
    expect(p.allpassC).toBe(0);
  });

  it('keeps the allpass delay in [0.1, 1.1) and sums to the period', () => {
    for (const f of [82.41, 110, 196, 329.63, 659.26, 1318.5]) {
      const p = planDelay(44100, f, 0.5, true);
      expect(p.fraction).toBeGreaterThanOrEqual(0.1);
      expect(p.fraction).toBeLessThan(1.1);
      expect(p.length + p.fraction + 0.5).toBeCloseTo(44100 / f, 9);
      expect(p.allpassC).toBeCloseTo((1 - p.fraction) / (1 + p.fraction), 12);
      expect(p.centsError).toBe(0);
    }
  });

  it('never makes a line shorter than two samples', () => {
    expect(planDelay(8000, 7000, 0.5, false).length).toBe(2);
    expect(planDelay(8000, 7000, 0.5, true).length).toBe(2);
  });
});

describe('excitation', () => {
  it('is deterministic, zero-mean-ish and peaks at the velocity', () => {
    const a = excitation(400, 0, 0.8, 7);
    const b = excitation(400, 0, 0.8, 7);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Math.max(...Array.from(a, Math.abs))).toBeCloseTo(0.8, 6);
    const mean = a.reduce((s, x) => s + x, 0) / a.length;
    expect(Math.abs(mean)).toBeLessThan(1e-6);
    expect(Array.from(excitation(400, 0, 0.8, 8))).not.toEqual(Array.from(a));
  });

  it('a pick in the middle removes even harmonics', () => {
    const n = 512;
    const e = excitation(n, 0.5, 1, 3);
    // Second harmonic of a period-n signal: DFT bin 2.
    const bin = (k: number) => {
      let re = 0, im = 0;
      for (let i = 0; i < n; i++) {
        re += e[i]! * Math.cos((2 * Math.PI * k * i) / n);
        im -= e[i]! * Math.sin((2 * Math.PI * k * i) / n);
      }
      return Math.hypot(re, im);
    };
    expect(bin(2)).toBeLessThan(1e-3);
    expect(bin(4)).toBeLessThan(1e-3);
    expect(bin(1)).toBeGreaterThan(1);
  });

  it('is silent with zero velocity', () => {
    expect(Math.max(...excitation(64, 0.2, 0, 1))).toBe(0);
  });
});

describe('KSString', () => {
  it('produces the planned pitch with fractional tuning', () => {
    for (const f of [110, 329.63, 659.26]) {
      const out = renderString({ ...base, frequency: f, fractional: true }, avg, { decay: 0.999, weight: 0.5 }, 0.5);
      const est = estimatePitch(out.subarray(4800), 48000);
      expect(Math.abs(cents(est, f))).toBeLessThan(1.5);
    }
  });

  it('is off by the predicted amount with integer delays', () => {
    const f = 329.63;
    const sr = 8000;
    const plan = planDelay(sr, f, 0.5, false);
    const out = renderString({ ...base, sampleRate: sr, frequency: f, fractional: false }, avg, { decay: 0.999, weight: 0.5 }, 0.5);
    const est = estimatePitch(out.subarray(800), sr);
    expect(Math.abs(cents(est, plan.actualFrequency))).toBeLessThan(1.5);
    expect(Math.abs(plan.centsError)).toBeGreaterThan(5);
  });

  it('high notes decay faster than low ones', () => {
    const p = { decay: 0.996, weight: 0.5 };
    const low = measureT60(renderString({ ...base, frequency: 110, fractional: true }, avg, p, 4), 48000);
    const high = measureT60(renderString({ ...base, frequency: 330, fractional: true }, avg, p, 4), 48000);
    expect(high).toBeLessThan(low / 2);
  });

  it('is deterministic for a seed', () => {
    const opts = { ...base, frequency: 196, fractional: true };
    const a = renderString(opts, avg, { decay: 0.996, weight: 0.5 }, 0.05);
    const b = renderString(opts, avg, { decay: 0.996, weight: 0.5 }, 0.05);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('snapshot returns the line in reading order', () => {
    const s = new KSString(1000);
    s.pluck({ ...base, frequency: 48000 / 10.5, fractional: false });
    expect(s.length).toBe(10);
    const first = s.snapshot();
    const out = s.tick(avg, { decay: 1, weight: 0.5 });
    expect(out).toBe(first[0]);
    const next = s.snapshot();
    expect(next[0]).toBe(first[1]);
    expect(next[9]).toBeCloseTo(0.5 * (first[0]! + 0), 6);
    expect(s.age).toBe(1);
  });

  it('clips an unstable loop and flags it', () => {
    const grow = compileFilter('return 1.5 * x;').fn!;
    const s = new KSString(1000);
    s.pluck({ ...base, frequency: 4800, fractional: false });
    for (let i = 0; i < 2000; i++) s.tick(grow, { decay: 1, weight: 0 });
    expect(s.clipped).toBe(true);
    expect(Math.max(...Array.from(s.snapshot(), Math.abs))).toBeLessThanOrEqual(CLIP_LEVEL);
    const shrink = compileFilter('return -1.5 * x;').fn!;
    for (let i = 0; i < 2000; i++) s.tick(shrink, { decay: 1, weight: 0 });
    expect(Math.min(...s.snapshot())).toBeGreaterThanOrEqual(-CLIP_LEVEL);
  });

  it('replaces non-finite filter output with silence', () => {
    const bad = (() => NaN) as unknown as typeof avg;
    const s = new KSString(100);
    s.pluck({ ...base, frequency: 4800, fractional: true });
    for (let i = 0; i < 50; i++) s.tick(bad, { decay: 1, weight: 0 });
    expect(Array.from(s.snapshot()).every((x) => x === 0)).toBe(true);
  });

  it('damping fades the string out and stops it', () => {
    const s = new KSString(1000);
    expect(s.tick(avg, { decay: 1, weight: 0.5 })).toBe(0);
    s.damp();
    expect(s.active).toBe(false);
    s.pluck({ ...base, frequency: 200, fractional: true });
    s.damp();
    let n = 0;
    while (s.active && n < 48000) {
      s.tick(avg, { decay: 1, weight: 0.5 });
      n++;
    }
    expect(s.active).toBe(false);
    expect(n).toBeLessThan(24000);
  });

  it('clamps the line to the buffer size', () => {
    const s = new KSString(50);
    const plan = s.pluck({ ...base, frequency: 100, fractional: true });
    expect(plan.length).toBe(50);
  });
});
