/**
 * The offline renderer: a SoundSpec in, Float32Array samples out. Pure
 * sample-by-sample DSP with no Web Audio dependency, so the exact audio the
 * browser plays is also what the tests assert on and what the WAV export
 * writes.
 */

import type { Envelope, FilterSpec, Layer, SoundSpec, Sweep } from './spec.js';
import { clamp } from './spec.js';
import { mulberry32 } from './rng.js';

export function sweepValue(s: Sweep, t01: number): number {
  const t = clamp(t01, 0, 1);
  if (s.curve === 'linear' || s.start <= 0 || s.end <= 0) {
    return s.start + (s.end - s.start) * t;
  }
  return s.start * Math.pow(s.end / s.start, t);
}

/** ADSR level at time t within a note lasting `noteDur` seconds. */
export function envelopeValue(env: Envelope, t: number, noteDur: number): number {
  if (t < 0 || t >= noteDur) return 0;
  const releaseStart = Math.max(noteDur - env.release, 0);
  let level: number;
  if (t < env.attack) {
    level = env.attack > 0 ? t / env.attack : 1;
  } else if (t < env.attack + env.decay) {
    const d = (t - env.attack) / env.decay;
    level = 1 + (env.sustain - 1) * d;
  } else {
    level = env.sustain;
  }
  if (t >= releaseStart) {
    const r = env.release > 0 ? (t - releaseStart) / env.release : 1;
    level *= clamp(1 - r, 0, 1);
  }
  return clamp(level, 0, 1);
}

function oscSample(shape: string, phase: number): number {
  const p = phase % 1;
  switch (shape) {
    case 'sine':
      return Math.sin(2 * Math.PI * p);
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'sawtooth':
      return 2 * p - 1;
    default: // triangle
      return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
  }
}

/** RBJ-cookbook biquad, coefficients re-derived every block for sweeps. */
class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  configure(type: FilterSpec['type'], freq: number, q: number, sampleRate: number): void {
    const f = clamp(freq, 20, sampleRate * 0.45);
    const w0 = (2 * Math.PI * f) / sampleRate;
    const cosW0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.max(q, 0.05));
    let b0: number, b1: number, b2: number;
    const a0 = 1 + alpha;
    const a1 = -2 * cosW0;
    const a2 = 1 - alpha;
    if (type === 'lowpass') {
      b1 = 1 - cosW0;
      b0 = b1 / 2;
      b2 = b0;
    } else if (type === 'highpass') {
      b1 = -(1 + cosW0);
      b0 = -b1 / 2;
      b2 = b0;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = Number.isFinite(y) ? y : 0;
    return this.y1;
  }
}

const FILTER_BLOCK = 64;

/** Render one onset of a layer into `out` starting at sample `at`. */
function renderHit(
  out: Float32Array,
  layer: Layer,
  at: number,
  noteDur: number,
  gain: number,
  sampleRate: number,
  rand: () => number,
): void {
  const n = Math.min(Math.floor(noteDur * sampleRate), out.length - at);
  if (n <= 0) return;

  const filter = layer.filter ? new Biquad() : null;
  let phase = rand(); // deterministic per-seed phase offset

  // Noise state
  let pink0 = 0, pink1 = 0, pink2 = 0;
  let brown = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const t01 = i / n;
    let s: number;

    if (layer.source.kind === 'osc') {
      let freq = sweepValue(layer.source.freq, t01);
      const vib = layer.source.vibrato;
      if (vib) freq *= 1 + vib.depth * Math.sin(2 * Math.PI * vib.rate * t);
      phase += freq / sampleRate;
      s = oscSample(layer.source.shape, phase);
    } else {
      const white = rand() * 2 - 1;
      if (layer.source.color === 'white') {
        s = white;
      } else if (layer.source.color === 'pink') {
        // Paul Kellet's economy pink noise approximation.
        pink0 = 0.99765 * pink0 + white * 0.099046;
        pink1 = 0.963 * pink1 + white * 0.2965164;
        pink2 = 0.57 * pink2 + white * 1.0526913;
        s = (pink0 + pink1 + pink2 + white * 0.1848) * 0.2;
      } else {
        brown = clamp(brown + white * 0.02, -1, 1) * 0.997;
        s = brown * 3.5;
      }
    }

    if (filter && layer.filter) {
      if (i % FILTER_BLOCK === 0) {
        filter.configure(
          layer.filter.type,
          sweepValue(layer.filter.freq, t01),
          layer.filter.q,
          sampleRate,
        );
      }
      s = filter.process(s);
    }

    out[at + i] += s * envelopeValue(layer.env, t, noteDur) * gain;
  }
}

function applyEcho(mix: Float32Array, time: number, feedback: number, wet: number, sampleRate: number): void {
  const d = Math.max(1, Math.round(time * sampleRate));
  const buf = new Float32Array(d);
  let idx = 0;
  const fb = clamp(feedback, 0, 0.9);
  for (let i = 0; i < mix.length; i++) {
    const delayed = buf[idx];
    buf[idx] = mix[i] + delayed * fb;
    mix[i] += delayed * wet;
    idx = (idx + 1) % d;
  }
}

export interface RenderOptions {
  sampleRate?: number;
  seed?: number;
}

/** Render a spec to mono samples in [-1, 1]. Deterministic for a given seed. */
export function renderSpec(spec: SoundSpec, options: RenderOptions = {}): Float32Array {
  const sampleRate = options.sampleRate ?? 44100;
  const seed = options.seed ?? 1;
  const total = Math.max(1, Math.floor(spec.duration * sampleRate));
  const out = new Float32Array(total);

  for (const layer of spec.layers) {
    const rand = mulberry32(seed ^ hashLayerName(layer.name));
    const startAt = layer.startAt ?? 0;
    const repeat = layer.repeat ?? { times: 1, interval: 0, gainDecay: 1 };
    let gain = layer.gain;
    for (let hit = 0; hit < repeat.times; hit++) {
      const onset = Math.floor((startAt + hit * repeat.interval) * sampleRate);
      if (onset >= total) break;
      const noteDur = repeat.times > 1
        ? Math.min(spec.duration - startAt - hit * repeat.interval, repeat.interval * 1.5)
        : spec.duration - startAt;
      renderHit(out, layer, onset, noteDur, gain, sampleRate, rand);
      gain *= repeat.gainDecay;
    }
  }

  if (spec.echo) {
    applyEcho(out, spec.echo.time, spec.echo.feedback, spec.echo.mix, sampleRate);
  }

  if (spec.drive > 1) {
    for (let i = 0; i < total; i++) out[i] = Math.tanh(out[i] * spec.drive);
  }

  if (spec.crushBits > 0) {
    const steps = Math.pow(2, spec.crushBits - 1);
    for (let i = 0; i < total; i++) out[i] = Math.round(out[i] * steps) / steps;
  }

  // Normalize to a fixed peak so masterGain is meaningful and clipping is
  // impossible regardless of how many layers a modifier stacked on.
  let peak = 0;
  for (let i = 0; i < total; i++) {
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0) {
    const norm = clamp(spec.masterGain, 0, 1) / peak;
    for (let i = 0; i < total; i++) out[i] *= norm;
  }
  return out;
}

function hashLayerName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}
