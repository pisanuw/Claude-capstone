/**
 * Measurements: the loop filter's frequency response, decay times, pitch
 * estimates and the tables the lecture scenes show. This is the deterministic
 * stand-in for "ask an LLM to explain my filter": it runs the filter and
 * reports what it does.
 */
import type { FilterParams, LoopFilter } from './filters';
import { mulberry32 } from './random';
import { planDelay } from './ks';
import { effectiveDecay } from './engine';

export interface ResponsePoint {
  /** Frequency as a fraction of the sample rate, 0 to 0.5. */
  f: number;
  gain: number;
  /** Phase delay in samples. */
  delay: number;
}

type Params = Omit<FilterParams, 'random'>;

function run(fn: LoopFilter, input: ArrayLike<number>, params: Params, seed: number): Float64Array {
  const state = {};
  const p: FilterParams = { ...params, random: mulberry32(seed) };
  const out = new Float64Array(input.length);
  let prev = 0;
  for (let n = 0; n < input.length; n++) {
    out[n] = fn(input[n]!, prev, state, p);
    prev = input[n]!;
  }
  return out;
}

/** Gain and phase delay at one frequency, by least-squares fit of a steady-state sinusoid. */
export function responseAt(fn: LoopFilter, params: Params, f: number): ResponsePoint {
  const total = 768;
  const skip = 256;
  const w = 2 * Math.PI * f;
  const input = new Float64Array(total);
  for (let n = 0; n < total; n++) input[n] = Math.cos(w * n);
  const y = run(fn, input, params, 1);
  // Fit y[n] = a cos(wn) + b sin(wn) over the steady-state tail.
  let cc = 0, ss = 0, cs = 0, yc = 0, ys = 0;
  for (let n = skip; n < total; n++) {
    const c = Math.cos(w * n);
    const s = Math.sin(w * n);
    cc += c * c;
    ss += s * s;
    cs += c * s;
    yc += y[n]! * c;
    ys += y[n]! * s;
  }
  const det = cc * ss - cs * cs;
  const a = (yc * ss - ys * cs) / det;
  const b = (ys * cc - yc * cs) / det;
  const gain = Math.hypot(a, b);
  // y = g cos(wn - phi), so the phase delay is phi / w samples.
  let phi = Math.atan2(b, a);
  if (phi < -1e-9) phi += 2 * Math.PI;
  return { f, gain, delay: gain < 1e-9 ? 0 : phi / w };
}

export function frequencyResponse(fn: LoopFilter, params: Params, points = 48): ResponsePoint[] {
  const out: ResponsePoint[] = [];
  for (let i = 0; i < points; i++) out.push(responseAt(fn, params, 0.002 + (0.496 * i) / (points - 1)));
  return out;
}

export type FilterKind = 'low-pass' | 'flat' | 'high-pass' | 'other';

export interface FilterReport {
  linear: boolean;
  randomized: boolean;
  unstable: boolean;
  kind: FilterKind;
  dcGain: number;
  nyquistGain: number;
  maxGain: number;
  maxGainAt: number;
  /** Phase delay at low frequencies: what tuning has to subtract. */
  lowDelay: number;
  response: ResponsePoint[];
  /** Plain-language explanation, one sentence per entry. */
  lines: string[];
}

function close(a: ArrayLike<number>, b: ArrayLike<number>, scale: number): boolean {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > 1e-7 * scale) return false;
  return true;
}

/** Seconds for a note to fall 60 dB when it keeps `gainPerPeriod` of its amplitude each period. */
export function t60(gainPerPeriod: number, frequency: number): number {
  if (gainPerPeriod >= 1) return Infinity;
  if (gainPerPeriod <= 0) return 0;
  return -3 / (frequency * Math.log10(gainPerPeriod));
}

export function analyzeFilter(fn: LoopFilter, params: Params, sampleRate = 48000): FilterReport {
  const rand = mulberry32(7);
  const u = Array.from({ length: 256 }, () => rand() * 2 - 1);
  const v = Array.from({ length: 256 }, () => rand() * 2 - 1);
  const yu = run(fn, u, params, 1);
  const yv = run(fn, v, params, 1);
  const y2u = run(fn, u.map((x) => 2 * x), params, 1);
  const yuv = run(fn, u.map((x, i) => x + v[i]!), params, 1);
  const yuOther = run(fn, u, params, 2);
  const scale = Math.max(1, ...Array.from(yu, Math.abs));
  const randomized = !close(yu, yuOther, scale);
  const linear = close(y2u, Array.from(yu, (x) => 2 * x), scale) && close(yuv, Array.from(yu, (x, i) => x + yv[i]!), scale);

  const response = frequencyResponse(fn, params);
  const dc = response[0]!;
  const nyq = response[response.length - 1]!;
  let max = dc;
  for (const pt of response) if (pt.gain > max.gain) max = pt;
  const unstable = linear && !randomized && max.gain > 1.00001;

  const min = Math.min(...response.map((pt) => pt.gain));
  let kind: FilterKind = 'other';
  if (max.gain > 0 && max.gain - min <= max.gain * 0.05) kind = 'flat';
  else if (nyq.gain < dc.gain * 0.7 && max.gain <= dc.gain * 1.02) kind = 'low-pass';
  else if (nyq.gain > dc.gain * 1.3 && max.gain <= nyq.gain * 1.02) kind = 'high-pass';

  const lines: string[] = [];
  const pct = (g: number) => `${(g * 100).toFixed(g > 0.999 && g < 1 ? 2 : 1)}%`;
  if (randomized) {
    lines.push('It calls p.random(), so every trip round the loop is different: there is no fixed frequency response, and the string will not settle into one clear pitch.');
    lines.push('Karplus and Strong used exactly this trick (random sign flips) to turn the string into a drum.');
  } else if (!linear) {
    lines.push('It is not linear: doubling the input does not double the output (or two inputs do not add). Harmonics interact, so the sound depends on how loud you pluck. Listen rather than read the curve.');
  } else {
    if (kind === 'low-pass') {
      lines.push(`Low-pass: each trip keeps ${pct(dc.gain)} of the lowest frequencies but only ${pct(nyq.gain)} near the top, so high harmonics die first and the noise turns into a mellow string. This is the Karplus-Strong idea.`);
    } else if (kind === 'flat') {
      lines.push(`Flat: every frequency keeps about ${pct(dc.gain)} per trip, so all harmonics die together. The starting noise never smooths out; you hear a pitched buzz, not a string.`);
    } else if (kind === 'high-pass') {
      lines.push(`High-pass: the top keeps ${pct(nyq.gain)} per trip but the bottom only ${pct(dc.gain)}, so the fundamental dies first. Expect something thin and metallic.`);
    } else {
      lines.push(`Gain varies across the band (from ${pct(dc.gain)} at the bottom to ${pct(nyq.gain)} at the top, peaking at ${pct(max.gain)}).`);
    }
    if (unstable) {
      lines.push(`Unstable: at ${(max.f * sampleRate).toFixed(0)} Hz it keeps ${pct(max.gain)} per trip, more than it started with, so that part of the sound grows every period until the engine clips it at ±4.`);
    } else {
      const lowA = responseAt(fn, params, 110 / sampleRate).gain;
      const highE = responseAt(fn, params, 329.63 / sampleRate).gain;
      const a = t60(lowA, 110);
      const e = t60(highE, 329.63);
      const fmt = (t: number) => (Number.isFinite(t) ? `${t.toFixed(t < 10 ? 1 : 0)} s` : 'forever');
      lines.push(`Ignoring the allpass and the decay mode, an open A string (110 Hz) would take ${fmt(a)} to fall 60 dB and the high E (330 Hz) ${fmt(e)}: higher notes make more trips per second, so they lose more per second.`);
    }
    lines.push(`It adds ${dc.delay.toFixed(2)} samples of delay at low frequencies. Pluck Lab shortens the delay line by the same amount so notes stay in tune.`);
  }
  return {
    linear,
    randomized,
    unstable,
    kind,
    dcGain: dc.gain,
    nyquistGain: nyq.gain,
    maxGain: max.gain,
    maxGainAt: max.f,
    lowDelay: linear && !randomized ? dc.delay : 0.5,
    response,
    lines,
  };
}

/** Fundamental by normalized autocorrelation with parabolic interpolation. */
export function estimatePitch(samples: Float32Array, sampleRate: number, minHz = 50, maxHz = 2000): number {
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.ceil(sampleRate / minHz);
  const n = samples.length - maxLag;
  const r = (lag: number) => {
    let acc = 0, e0 = 0, e1 = 0;
    for (let i = 0; i < n; i++) {
      acc += samples[i]! * samples[i + lag]!;
      e0 += samples[i]! * samples[i]!;
      e1 += samples[i + lag]! * samples[i + lag]!;
    }
    return acc / Math.sqrt(e0 * e1 || 1);
  };
  const values = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) values[lag] = r(lag);
  // First peak that comes close to the best one, to avoid octave errors.
  let best = minLag;
  for (let lag = minLag; lag <= maxLag; lag++) if (values[lag]! > values[best]!) best = lag;
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (values[lag]! > 0.9 * values[best]! && values[lag]! >= values[lag - 1]! && values[lag]! >= values[lag + 1]!) {
      best = lag;
      break;
    }
  }
  const a = values[best - 1] ?? values[best]!;
  const b = values[best]!;
  const c = values[best + 1] ?? values[best]!;
  const denom = a - 2 * b + c;
  const shift = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
  return sampleRate / (best + shift);
}

/** Time for the RMS envelope to fall 60 dB, extrapolated from a fit over the first 30 dB of decay. */
export function measureT60(samples: Float32Array, sampleRate: number, windowMs = 20): number {
  const w = Math.max(1, Math.round((windowMs / 1000) * sampleRate));
  const env: number[] = [];
  for (let i = 0; i + w <= samples.length; i += w) {
    let e = 0;
    for (let j = i; j < i + w; j++) e += samples[j]! * samples[j]!;
    env.push(10 * Math.log10(e / w + 1e-30));
  }
  const peak = Math.max(...env);
  const pts: [number, number][] = [];
  env.forEach((db, k) => {
    const rel = db - peak;
    if (rel <= -5 && rel >= -35) pts.push([(k * w) / sampleRate, db]);
  });
  if (pts.length < 2) return Infinity;
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let num = 0, den = 0;
  for (const [x, y] of pts) {
    num += (x - mx) * (y - my);
    den += (x - mx) * (x - mx);
  }
  const slope = num / den; // dB per second
  return slope >= 0 ? Infinity : -60 / slope;
}

export interface TuningRow {
  note: string;
  target: number;
  length: number;
  actual: number;
  cents: number;
}

/** What integer-only delay lines do to a set of notes at one sample rate. */
export function tuningTable(sampleRate: number, filterDelay: number, notes: { name: string; freq: number }[]): TuningRow[] {
  return notes.map(({ name, freq }) => {
    const plan = planDelay(sampleRate, freq, filterDelay, false);
    return { note: name, target: freq, length: plan.length, actual: plan.actualFrequency, cents: plan.centsError };
  });
}

/** Rule of thumb: a chord sounds out of tune once a string is off by about this many cents. */
export const AUDIBLE_CENTS = 5;

export interface DecayRow {
  note: string;
  frequency: number;
  /** Decay factor after the decay mode is applied. */
  decay: number;
  /** Amplitude kept per period at the fundamental: decay times filter gain. */
  gainPerPeriod: number;
  t60: number;
}

/** How long each open string rings, from the filter's gain at its fundamental. */
export function decayTable(
  fn: LoopFilter,
  params: Params & { decayMode: 'natural' | 'equal' },
  sampleRate: number,
  notes: { name: string; freq: number }[],
): DecayRow[] {
  return notes.map(({ name, freq }) => {
    const decay = effectiveDecay(params, freq);
    // The filter applies decay itself, so measure it with the per-note value.
    const gainPerPeriod = responseAt(fn, { decay, weight: params.weight }, freq / sampleRate).gain;
    return { note: name, frequency: freq, decay, gainPerPeriod, t60: t60(gainPerPeriod, freq) };
  });
}
