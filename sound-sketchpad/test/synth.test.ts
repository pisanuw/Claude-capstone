import { describe, expect, it } from 'vitest';
import { envelopeValue, renderSpec, sweepValue } from '../src/core/synth.js';
import { sweep, type SoundSpec } from '../src/core/spec.js';

function tone(overrides: Partial<SoundSpec> = {}): SoundSpec {
  return {
    name: 'test tone',
    duration: 0.5,
    drive: 1,
    crushBits: 0,
    masterGain: 0.9,
    layers: [
      {
        name: 'osc',
        source: { kind: 'osc', shape: 'sine', freq: sweep(440, 440, 'linear') },
        env: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.1 },
        gain: 1,
      },
    ],
    ...overrides,
  };
}

describe('sweepValue', () => {
  it('interpolates linearly', () => {
    const s = sweep(100, 200, 'linear');
    expect(sweepValue(s, 0)).toBe(100);
    expect(sweepValue(s, 0.5)).toBe(150);
    expect(sweepValue(s, 1)).toBe(200);
  });

  it('interpolates exponentially', () => {
    const s = sweep(100, 400, 'exp');
    expect(sweepValue(s, 0)).toBeCloseTo(100);
    expect(sweepValue(s, 0.5)).toBeCloseTo(200);
    expect(sweepValue(s, 1)).toBeCloseTo(400);
  });

  it('clamps t outside [0,1] and falls back to linear at non-positive endpoints', () => {
    const s = sweep(100, 200, 'exp');
    expect(sweepValue(s, -1)).toBeCloseTo(100);
    expect(sweepValue(s, 2)).toBeCloseTo(200);
    expect(sweepValue(sweep(0, 200, 'exp'), 0.5)).toBe(100);
  });
});

describe('envelopeValue', () => {
  const env = { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.2 };

  it('is zero outside the note', () => {
    expect(envelopeValue(env, -0.01, 1)).toBe(0);
    expect(envelopeValue(env, 1, 1)).toBe(0);
  });

  it('ramps through attack to peak', () => {
    expect(envelopeValue(env, 0.05, 1)).toBeCloseTo(0.5);
    expect(envelopeValue(env, 0.1, 1)).toBeCloseTo(1);
  });

  it('decays to sustain and holds', () => {
    expect(envelopeValue(env, 0.3, 1)).toBeCloseTo(0.5);
    expect(envelopeValue(env, 0.5, 1)).toBeCloseTo(0.5);
  });

  it('releases to zero at the end of the note', () => {
    expect(envelopeValue(env, 0.9, 1)).toBeCloseTo(0.25);
    expect(envelopeValue(env, 0.999, 1)).toBeLessThan(0.01);
  });

  it('handles zero-length attack and release', () => {
    const snap = { attack: 0, decay: 0.1, sustain: 0, release: 0 };
    expect(envelopeValue(snap, 0, 1)).toBe(1);
    expect(envelopeValue(snap, 0.05, 1)).toBeCloseTo(0.5);
  });
});

describe('renderSpec', () => {
  it('renders the requested number of samples', () => {
    expect(renderSpec(tone(), { sampleRate: 8000 }).length).toBe(4000);
  });

  it('is deterministic for the same seed and differs across seeds for noise', () => {
    const noisy: SoundSpec = tone({
      layers: [
        {
          name: 'noise',
          source: { kind: 'noise', color: 'white' },
          env: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.1 },
          gain: 1,
        },
      ],
    });
    const a = renderSpec(noisy, { sampleRate: 8000, seed: 9 });
    const b = renderSpec(noisy, { sampleRate: 8000, seed: 9 });
    const c = renderSpec(noisy, { sampleRate: 8000, seed: 10 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('normalizes the peak to masterGain', () => {
    const samples = renderSpec(tone({ masterGain: 0.5 }), { sampleRate: 8000 });
    let peak = 0;
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeCloseTo(0.5, 2);
  });

  it('renders all oscillator shapes and noise colors without NaN', () => {
    for (const shape of ['sine', 'square', 'sawtooth', 'triangle'] as const) {
      const spec = tone();
      spec.layers[0].source = { kind: 'osc', shape, freq: sweep(220, 880) };
      for (const s of renderSpec(spec, { sampleRate: 8000 })) {
        expect(Number.isFinite(s)).toBe(true);
      }
    }
    for (const color of ['white', 'pink', 'brown'] as const) {
      const spec = tone();
      spec.layers[0].source = { kind: 'noise', color };
      const samples = renderSpec(spec, { sampleRate: 8000, seed: 3 });
      let peak = 0;
      for (const s of samples) {
        expect(Number.isFinite(s)).toBe(true);
        peak = Math.max(peak, Math.abs(s));
      }
      expect(peak).toBeGreaterThan(0.1);
    }
  });

  it('applies vibrato, filters, repeats, startAt, echo, drive, and crush', () => {
    const spec: SoundSpec = {
      name: 'kitchen sink',
      duration: 1,
      drive: 2,
      crushBits: 8,
      masterGain: 0.9,
      echo: { time: 0.1, feedback: 0.4, mix: 0.4 },
      layers: [
        {
          name: 'wail',
          source: {
            kind: 'osc',
            shape: 'square',
            freq: sweep(400, 800),
            vibrato: { rate: 5, depth: 0.1 },
          },
          env: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.1 },
          filter: { type: 'lowpass', freq: sweep(2000, 500), q: 1.2 },
          gain: 0.8,
        },
        {
          name: 'hits',
          source: { kind: 'noise', color: 'pink' },
          env: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
          filter: { type: 'bandpass', freq: sweep(1500), q: 2 },
          repeat: { times: 3, interval: 0.2, gainDecay: 0.8 },
          startAt: 0.1,
          gain: 0.6,
        },
        {
          name: 'high',
          source: { kind: 'noise', color: 'brown' },
          env: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 },
          filter: { type: 'highpass', freq: sweep(300), q: 0.7 },
          gain: 0.5,
        },
      ],
    };
    const samples = renderSpec(spec, { sampleRate: 8000, seed: 77 });
    let peak = 0;
    for (const s of samples) {
      expect(Number.isFinite(s)).toBe(true);
      peak = Math.max(peak, Math.abs(s));
    }
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(0.9001);
  });

  it('skips repeats that start beyond the buffer and layers with zero note time', () => {
    const spec = tone();
    spec.layers[0].repeat = { times: 10, interval: 0.2, gainDecay: 0.9 };
    const samples = renderSpec(spec, { sampleRate: 8000 });
    expect(samples.length).toBe(4000);

    const late = tone();
    late.layers[0].startAt = 2; // beyond the 0.5s duration
    const quiet = renderSpec(late, { sampleRate: 8000 });
    let peak = 0;
    for (const s of quiet) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBe(0);
  });

  it('a silent spec stays silent instead of dividing by zero', () => {
    const silent = tone();
    silent.layers = [];
    const samples = renderSpec(silent, { sampleRate: 8000 });
    for (const s of samples) expect(s).toBe(0);
  });
});
