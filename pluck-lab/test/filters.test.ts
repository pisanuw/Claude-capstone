import { describe, expect, it } from 'vitest';
import { compileFilter, DEFAULT_FILTER_SOURCE, FILTER_PRESETS } from '../src/core/filters';
import { analyzeFilter, decayTable, frequencyResponse, responseAt, t60 } from '../src/core/analysis';
import { OPEN_STRINGS } from '../src/core/guitar';

const params = { decay: 0.996, weight: 0.5 };
const preset = (id: string) => compileFilter(FILTER_PRESETS.find((p) => p.id === id)!.source).fn!;

describe('compileFilter', () => {
  it('compiles every preset', () => {
    for (const p of FILTER_PRESETS) expect(compileFilter(p.source).ok, p.id).toBe(true);
    expect(DEFAULT_FILTER_SOURCE).toContain('p.weight');
  });

  it('reports syntax errors', () => {
    const r = compileFilter('return (x +;');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^Syntax error/);
  });

  it('reports runtime errors and non-numbers', () => {
    expect(compileFilter('return state.missing.value;').error).toMatch(/^Runtime error/);
    expect(compileFilter('return "loud";').error).toMatch(/finite number/);
    expect(compileFilter('return x / 0 * Infinity;').error).toMatch(/finite number/);
    expect(compileFilter('').error).toMatch(/undefined/);
  });

  it('runs in strict mode', () => {
    expect(compileFilter('leaked = 1; return x;').ok).toBe(false);
  });
});

describe('responseAt', () => {
  it('matches the analytic response of the weighted average', () => {
    const fn = preset('weighted');
    for (const S of [0.1, 0.3, 0.5]) {
      for (const f of [0.01, 0.1, 0.3, 0.45]) {
        const w = 2 * Math.PI * f;
        const re = 1 - S + S * Math.cos(w);
        const im = -S * Math.sin(w);
        const r = responseAt(fn, { decay: 1, weight: S }, f);
        expect(r.gain).toBeCloseTo(Math.hypot(re, im), 6);
        expect(r.delay).toBeCloseTo(-Math.atan2(im, re) / w, 4);
      }
    }
  });

  it('reports zero delay at a null', () => {
    expect(responseAt(preset('classic'), params, 0.5).delay).toBe(0);
  });

  it('samples the band from near DC to near Nyquist', () => {
    const r = frequencyResponse(preset('none'), params, 10);
    expect(r).toHaveLength(10);
    expect(r[0]!.f).toBeCloseTo(0.002);
    expect(r[9]!.f).toBeCloseTo(0.498);
    for (const p of r) expect(p.gain).toBeCloseTo(0.996, 6);
  });
});

describe('analyzeFilter', () => {
  it('explains the default low-pass and its half-sample delay', () => {
    const r = analyzeFilter(preset('weighted'), params);
    expect(r.kind).toBe('low-pass');
    expect(r.linear).toBe(true);
    expect(r.randomized).toBe(false);
    expect(r.unstable).toBe(false);
    expect(r.lowDelay).toBeCloseTo(0.5, 3);
    expect(r.lines.join(' ')).toMatch(/Low-pass/);
    expect(r.lines.join(' ')).toMatch(/open A string/);
  });

  it('measures a whole sample of delay for the three-point average', () => {
    const r = analyzeFilter(preset('three-point'), params);
    expect(r.kind).toBe('low-pass');
    expect(r.lowDelay).toBeCloseTo(1, 2);
  });

  it('calls no smoothing flat', () => {
    const r = analyzeFilter(preset('none'), params);
    expect(r.kind).toBe('flat');
    expect(r.lowDelay).toBeCloseTo(0, 6);
    expect(r.lines[0]).toMatch(/^Flat/);
  });

  it('flags the unstable preset', () => {
    const r = analyzeFilter(preset('unstable'), params);
    expect(r.unstable).toBe(true);
    expect(r.lines.join(' ')).toMatch(/Unstable/);
  });

  it('detects randomized filters', () => {
    const r = analyzeFilter(preset('drum'), params);
    expect(r.randomized).toBe(true);
    expect(r.lowDelay).toBe(0.5);
    expect(r.lines[0]).toMatch(/p\.random/);
  });

  it('detects nonlinear filters', () => {
    const r = analyzeFilter(compileFilter('return 0.9 * Math.tanh(3 * x);').fn!, params);
    expect(r.linear).toBe(false);
    expect(r.lines[0]).toMatch(/not linear/);
  });

  it('describes high-pass and uneven filters', () => {
    const hp = analyzeFilter(compileFilter('return 0.9 * (0.5 * x - 0.4 * prev);').fn!, params);
    expect(hp.kind).toBe('high-pass');
    expect(hp.lines[0]).toMatch(/^High-pass/);
    const notch = analyzeFilter(compileFilter('const o = state.o ?? 0; state.o = prev; return 0.45 * (x + o);').fn!, params);
    expect(notch.kind).toBe('other');
    expect(notch.lines[0]).toMatch(/^Gain varies/);
  });
});

describe('t60 and decayTable', () => {
  it('handles the edges', () => {
    expect(t60(1, 100)).toBe(Infinity);
    expect(t60(0, 100)).toBe(0);
    expect(t60(0.999, 100)).toBeCloseTo(-3 / (100 * Math.log10(0.999)), 9);
  });

  it('higher strings ring shorter, unless decay is equalized', () => {
    const fn = preset('weighted');
    const natural = decayTable(fn, { ...params, decayMode: 'natural' }, 48000, OPEN_STRINGS);
    expect(natural[5]!.t60).toBeLessThan(natural[0]!.t60 / 3);
    const equal = decayTable(fn, { ...params, decayMode: 'equal' }, 48000, OPEN_STRINGS);
    expect(equal[5]!.decay).toBeGreaterThan(params.decay);
    expect(equal[5]!.t60 / equal[1]!.t60).toBeGreaterThan(0.85);
  });
});
