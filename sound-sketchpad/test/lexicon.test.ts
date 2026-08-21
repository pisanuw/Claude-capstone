import { describe, expect, it } from 'vitest';
import {
  BASE_SOUNDS,
  MODIFIERS,
  lookupBase,
  lookupModifier,
  scalePitch,
  stretchEnvelopes,
} from '../src/core/lexicon.js';
import { renderSpec } from '../src/core/synth.js';
import { sweep } from '../src/core/spec.js';

describe('lexicon integrity', () => {
  it('has no word claimed by two base sounds or two modifiers', () => {
    const seen = new Map<string, string>();
    for (const b of BASE_SOUNDS) {
      for (const w of b.words) {
        expect(seen.has(w), `word "${w}" in ${b.id} and ${seen.get(w)}`).toBe(false);
        seen.set(w, b.id);
      }
    }
    const seenMods = new Map<string, string>();
    for (const m of MODIFIERS) {
      for (const w of m.words) {
        expect(seenMods.has(w), `word "${w}" in ${m.id} and ${seenMods.get(w)}`).toBe(false);
        seenMods.set(w, m.id);
      }
    }
  });

  it('no word is both a base sound and a modifier', () => {
    const baseWords = new Set(BASE_SOUNDS.flatMap((b) => b.words));
    for (const m of MODIFIERS) {
      for (const w of m.words) {
        expect(baseWords.has(w), `"${w}" is both base and modifier`).toBe(false);
      }
    }
  });

  it('every base sound builds a valid spec', () => {
    for (const b of BASE_SOUNDS) {
      const spec = b.build();
      expect(spec.duration).toBeGreaterThan(0);
      expect(spec.layers.length).toBeGreaterThan(0);
      expect(spec.masterGain).toBeGreaterThan(0);
      expect(spec.masterGain).toBeLessThanOrEqual(1);
    }
  });

  it('every base sound renders audible, finite, bounded samples', () => {
    for (const b of BASE_SOUNDS) {
      const samples = renderSpec(b.build(), { sampleRate: 22050, seed: 123 });
      let peak = 0;
      let sum = 0;
      for (const s of samples) {
        expect(Number.isFinite(s), `${b.id} produced non-finite sample`).toBe(true);
        const a = Math.abs(s);
        if (a > peak) peak = a;
        sum += a;
      }
      expect(peak, `${b.id} is silent`).toBeGreaterThan(0.1);
      expect(peak, `${b.id} clips`).toBeLessThanOrEqual(1.0001);
      expect(sum / samples.length, `${b.id} has no body`).toBeGreaterThan(0.001);
    }
  });

  it('every modifier transforms every base sound without breaking rendering', () => {
    for (const m of MODIFIERS) {
      for (const b of BASE_SOUNDS) {
        const spec = b.build();
        m.apply(spec);
        const samples = renderSpec(spec, { sampleRate: 4000, seed: 5 });
        let peak = 0;
        for (const s of samples) {
          expect(Number.isFinite(s), `${m.id} on ${b.id} produced NaN`).toBe(true);
          peak = Math.max(peak, Math.abs(s));
        }
        expect(peak, `${m.id} on ${b.id} silenced it`).toBeGreaterThan(0.01);
      }
    }
  });

  it('lookups find every registered word', () => {
    for (const b of BASE_SOUNDS) for (const w of b.words) expect(lookupBase(w)?.id).toBe(b.id);
    for (const m of MODIFIERS) for (const w of m.words) expect(lookupModifier(w)?.id).toBe(m.id);
    expect(lookupBase('nonsenseword')).toBeUndefined();
    expect(lookupModifier('nonsenseword')).toBeUndefined();
  });
});

describe('modifier effects on the spec', () => {
  it('huge lengthens and deepens; tiny shortens and raises', () => {
    const huge = lookupBase('explosion')!.build();
    const tiny = lookupBase('explosion')!.build();
    const ref = lookupBase('explosion')!.build();
    lookupModifier('huge')!.apply(huge);
    lookupModifier('tiny')!.apply(tiny);
    expect(huge.duration).toBeGreaterThan(ref.duration);
    expect(tiny.duration).toBeLessThan(ref.duration);
    const freqOf = (s: typeof ref) => {
      const osc = s.layers.find((l) => l.source.kind === 'osc');
      return osc && osc.source.kind === 'osc' ? osc.source.freq.start : NaN;
    };
    expect(freqOf(huge)).toBeLessThan(freqOf(ref));
    expect(freqOf(tiny)).toBeGreaterThan(freqOf(ref));
  });

  it('muffled forces low-pass filters onto every layer', () => {
    const spec = lookupBase('coin')!.build();
    lookupModifier('muffled')!.apply(spec);
    for (const layer of spec.layers) {
      expect(layer.filter?.type).toBe('lowpass');
      expect(layer.filter!.freq.start).toBeLessThanOrEqual(900);
    }
  });

  it('echoing adds an echo and extends the tail', () => {
    const spec = lookupBase('hit')!.build();
    const before = spec.duration;
    lookupModifier('cave')!.apply(spec);
    expect(spec.echo).toBeDefined();
    expect(spec.echo!.mix).toBeGreaterThan(0);
    expect(spec.duration).toBeGreaterThan(before);
  });

  it('close removes echo; retro squares oscillators and crushes bits', () => {
    const spec = lookupBase('drip')!.build();
    expect(spec.echo).toBeDefined();
    lookupModifier('close')!.apply(spec);
    expect(spec.echo).toBeUndefined();

    const retro = lookupBase('laser')!.build();
    lookupModifier('8bit')!.apply(retro);
    expect(retro.crushBits).toBe(8);
    for (const layer of retro.layers) {
      if (layer.source.kind === 'osc') expect(layer.source.shape).toBe('square');
    }
  });

  it('metallic and glassy add ringing layers', () => {
    const spec = lookupBase('hit')!.build();
    const layerCount = spec.layers.length;
    lookupModifier('metallic')!.apply(spec);
    lookupModifier('glass')!.apply(spec);
    expect(spec.layers.length).toBe(layerCount + 3);
  });
});

describe('scalePitch / stretchEnvelopes', () => {
  it('scalePitch clamps into the audible range', () => {
    const spec = {
      name: 't',
      duration: 1,
      drive: 1,
      crushBits: 0,
      masterGain: 0.9,
      layers: [
        {
          name: 'osc',
          source: { kind: 'osc' as const, shape: 'sine' as const, freq: sweep(8000) },
          env: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.1 },
          gain: 1,
        },
      ],
    };
    scalePitch(spec, 100);
    const src = spec.layers[0].source;
    expect(src.freq.start).toBeLessThanOrEqual(9000);
    scalePitch(spec, 0.0001);
    expect(src.freq.start).toBeGreaterThanOrEqual(25);
  });

  it('stretchEnvelopes scales all stages and onsets', () => {
    const spec = lookupBase('coin')!.build();
    const before = structuredClone(spec.layers.map((l) => ({ env: l.env, startAt: l.startAt })));
    stretchEnvelopes(spec, 2);
    spec.layers.forEach((l, i) => {
      expect(l.env.attack).toBeCloseTo(before[i].env.attack * 2);
      expect(l.env.decay).toBeCloseTo(before[i].env.decay * 2);
      expect(l.env.release).toBeCloseTo(before[i].env.release * 2);
      if (before[i].startAt) expect(l.startAt).toBeCloseTo(before[i].startAt! * 2);
    });
  });
});
