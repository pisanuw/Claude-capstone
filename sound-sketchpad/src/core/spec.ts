/**
 * The intermediate representation between the description parser and the DSP
 * renderer. A SoundSpec is plain data: the parser produces one, modifier and
 * slider transforms rewrite it, and the synthesizer renders it to samples.
 */

export type OscShape = 'sine' | 'square' | 'sawtooth' | 'triangle';
export type NoiseColor = 'white' | 'pink' | 'brown';
export type SweepCurve = 'linear' | 'exp';

/** A parameter that moves from `start` to `end` over the layer's lifetime. */
export interface Sweep {
  start: number;
  end: number;
  curve: SweepCurve;
}

/** Times in seconds; sustain is a 0..1 level held between decay and release. */
export interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface FilterSpec {
  type: 'lowpass' | 'highpass' | 'bandpass';
  freq: Sweep;
  q: number;
}

export interface Vibrato {
  rate: number;
  depth: number; // fraction of the base frequency, e.g. 0.02 = ±2%
}

export type LayerSource =
  | { kind: 'osc'; shape: OscShape; freq: Sweep; vibrato?: Vibrato }
  | { kind: 'noise'; color: NoiseColor };

/** Retrigger a layer several times (footsteps, drips, alarm beeps). */
export interface Repeat {
  times: number;
  interval: number; // seconds between onsets
  gainDecay: number; // multiplier applied to each successive hit, 0..1
}

export interface Layer {
  name: string;
  source: LayerSource;
  env: Envelope;
  filter?: FilterSpec;
  gain: number;
  startAt?: number; // onset offset in seconds
  repeat?: Repeat;
}

export interface Echo {
  time: number; // seconds
  feedback: number; // 0..1
  mix: number; // 0..1 wet level
}

export interface SoundSpec {
  name: string;
  duration: number; // seconds
  layers: Layer[];
  echo?: Echo;
  /** tanh drive; 1 = clean, >1 adds saturation */
  drive: number;
  /** Post-render bit quantization for a retro feel; 0 = off. */
  crushBits: number;
  masterGain: number;
}

export function sweep(start: number, end = start, curve: SweepCurve = 'exp'): Sweep {
  return { start, end, curve };
}

export function cloneSpec(spec: SoundSpec): SoundSpec {
  return structuredClone(spec);
}

/** Clamp helper shared by transforms and the synthesizer. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
