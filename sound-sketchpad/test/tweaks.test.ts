import { describe, expect, it } from 'vitest';
import { applyTweaks, DEFAULT_TWEAKS, tweaksForSpec } from '../src/core/tweaks.js';
import { parseDescription } from '../src/core/parse.js';
import { renderSpec } from '../src/core/synth.js';

describe('applyTweaks', () => {
  it('leaves the input spec untouched (works on a clone)', () => {
    const { spec } = parseDescription('laser');
    const before = structuredClone(spec);
    applyTweaks(spec, { ...DEFAULT_TWEAKS, pitch: 2, length: 2, echoMix: 0.5 });
    expect(spec).toEqual(before);
  });

  it('identity tweaks change nothing but echo and gain', () => {
    const { spec } = parseDescription('coin');
    const out = applyTweaks(spec, tweaksForSpec(spec));
    expect(out.duration).toBe(spec.duration);
    expect(out.layers.map((l) => l.source)).toEqual(spec.layers.map((l) => l.source));
  });

  it('pitch scales oscillator frequencies', () => {
    const { spec } = parseDescription('laser');
    const out = applyTweaks(spec, { ...DEFAULT_TWEAKS, pitch: 2 });
    const src = out.layers[0].source;
    const ref = spec.layers[0].source;
    if (src.kind === 'osc' && ref.kind === 'osc') {
      expect(src.freq.start).toBeCloseTo(ref.freq.start * 2);
    } else {
      throw new Error('expected osc layer');
    }
  });

  it('length scales duration, envelopes, and repeat intervals, clamped', () => {
    const { spec } = parseDescription('footsteps');
    const out = applyTweaks(spec, { ...DEFAULT_TWEAKS, length: 2 });
    expect(out.duration).toBeCloseTo(spec.duration * 2);
    expect(out.layers[0].repeat!.interval).toBeCloseTo(spec.layers[0].repeat!.interval * 2);
    const short = applyTweaks(spec, { ...DEFAULT_TWEAKS, length: 0.01 });
    expect(short.duration).toBeGreaterThanOrEqual(0.1);
  });

  it('brightness scales filter cutoffs within bounds', () => {
    const { spec } = parseDescription('explosion');
    const out = applyTweaks(spec, { ...DEFAULT_TWEAKS, brightness: 2 });
    const f = out.layers[0].filter!;
    const ref = spec.layers[0].filter!;
    expect(f.freq.start).toBeCloseTo(Math.min(ref.freq.start * 2, 14000));
  });

  it('echoMix zero strips echo; nonzero adds or adjusts it', () => {
    const { spec } = parseDescription('drip'); // has echo by default
    expect(applyTweaks(spec, { ...DEFAULT_TWEAKS, echoMix: 0 }).echo).toBeUndefined();
    const wet = applyTweaks(spec, { ...DEFAULT_TWEAKS, echoMix: 0.7 });
    expect(wet.echo!.mix).toBeCloseTo(0.7);

    const dry = parseDescription('coin').spec; // no echo by default
    const nowWet = applyTweaks(dry, { ...DEFAULT_TWEAKS, echoMix: 0.4 });
    expect(nowWet.echo).toBeDefined();
    expect(nowWet.echo!.time).toBeGreaterThan(0);
  });

  it('gain sets masterGain and the rendered peak follows', () => {
    const { spec, seed } = parseDescription('bell');
    const loud = renderSpec(applyTweaks(spec, { ...DEFAULT_TWEAKS, gain: 0.8 }), {
      sampleRate: 8000,
      seed,
    });
    const soft = renderSpec(applyTweaks(spec, { ...DEFAULT_TWEAKS, gain: 0.2 }), {
      sampleRate: 8000,
      seed,
    });
    const peak = (xs: Float32Array) => {
      let p = 0;
      for (const x of xs) p = Math.max(p, Math.abs(x));
      return p;
    };
    expect(peak(loud)).toBeCloseTo(0.8, 2);
    expect(peak(soft)).toBeCloseTo(0.2, 2);
  });

  it('tweaksForSpec mirrors the parsed spec settings', () => {
    const { spec } = parseDescription('drip');
    const t = tweaksForSpec(spec);
    expect(t.echoMix).toBeCloseTo(spec.echo!.mix);
    expect(t.gain).toBeCloseTo(spec.masterGain);
    expect(tweaksForSpec(parseDescription('coin').spec).echoMix).toBe(0);
  });
});
