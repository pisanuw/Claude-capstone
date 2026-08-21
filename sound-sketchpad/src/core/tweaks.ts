/**
 * Slider adjustments the UI applies on top of a parsed spec. Pure functions
 * over the spec so re-rendering after a tweak is just parse -> tweak -> render.
 */

import type { SoundSpec } from './spec.js';
import { cloneSpec, clamp } from './spec.js';
import { scalePitch, stretchEnvelopes } from './lexicon.js';

export interface Tweaks {
  /** Pitch multiplier, 0.25..4, 1 = as parsed. */
  pitch: number;
  /** Duration multiplier, 0.25..4, 1 = as parsed. */
  length: number;
  /** Filter-brightness multiplier applied to every filter, 0.25..4. */
  brightness: number;
  /** Echo wet mix override, 0..1; 0 removes echo entirely. */
  echoMix: number;
  /** Master output level 0..1. */
  gain: number;
}

export const DEFAULT_TWEAKS: Tweaks = {
  pitch: 1,
  length: 1,
  brightness: 1,
  echoMix: 0.2,
  gain: 0.9,
};

/** Initial slider positions matching what the parsed spec already sounds like. */
export function tweaksForSpec(spec: SoundSpec): Tweaks {
  return {
    ...DEFAULT_TWEAKS,
    echoMix: spec.echo?.mix ?? 0,
    gain: spec.masterGain,
  };
}

export function applyTweaks(spec: SoundSpec, tweaks: Tweaks): SoundSpec {
  const out = cloneSpec(spec);

  const pitch = clamp(tweaks.pitch, 0.25, 4);
  if (pitch !== 1) scalePitch(out, pitch);

  const length = clamp(tweaks.length, 0.25, 4);
  if (length !== 1) {
    out.duration = clamp(out.duration * length, 0.1, 12);
    stretchEnvelopes(out, length);
    for (const layer of out.layers) {
      if (layer.repeat) layer.repeat.interval *= length;
    }
  }

  const brightness = clamp(tweaks.brightness, 0.25, 4);
  if (brightness !== 1) {
    for (const layer of out.layers) {
      if (layer.filter) {
        layer.filter.freq.start = clamp(layer.filter.freq.start * brightness, 60, 14000);
        layer.filter.freq.end = clamp(layer.filter.freq.end * brightness, 60, 14000);
      }
    }
  }

  const echoMix = clamp(tweaks.echoMix, 0, 1);
  if (echoMix === 0) {
    delete out.echo;
  } else {
    out.echo = {
      time: out.echo?.time ?? 0.25,
      feedback: out.echo?.feedback ?? 0.35,
      mix: echoMix,
    };
  }

  out.masterGain = clamp(tweaks.gain, 0, 1);
  return out;
}
