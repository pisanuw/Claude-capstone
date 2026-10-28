/**
 * The Karplus-Strong string: a delay line full of noise, a loop filter and a
 * first-order allpass for the fractional part of the period.
 *
 * Each step reads the oldest sample x out of the delay line, filters it with
 * the one read before it, passes that through the allpass and writes the
 * result back where x was. The loop's total delay (delay line + filter +
 * allpass) is one period of the note.
 */
import type { FilterParams, FilterState, LoopFilter } from './filters';
import { mulberry32 } from './random';

/** Anything written back larger than this is clipped, so an unstable filter cannot explode. */
export const CLIP_LEVEL = 4;

export interface DelayPlan {
  /** Target period in samples, sampleRate / frequency. */
  period: number;
  /** Integer delay-line length. */
  length: number;
  /** Delay the allpass supplies (0 when fractional tuning is off). */
  fraction: number;
  /** Allpass coefficient C = (1 - d) / (1 + d). */
  allpassC: number;
  /** Frequency the loop actually produces (at low frequencies). */
  actualFrequency: number;
  /** actual vs target, in cents. */
  centsError: number;
}

/**
 * Split the period into an integer delay line and a fractional allpass delay.
 * The allpass is kept in its well-behaved range d in [0.1, 1.1) (Jaffe and
 * Smith 1983). Without it, the line length is simply rounded, which is what
 * makes high notes audibly out of tune.
 */
export function planDelay(
  sampleRate: number,
  frequency: number,
  filterDelay: number,
  fractional: boolean,
): DelayPlan {
  const period = sampleRate / frequency;
  const loop = period - filterDelay;
  if (fractional) {
    const length = Math.max(2, Math.floor(loop - 0.1));
    const fraction = loop - length;
    const allpassC = (1 - fraction) / (1 + fraction);
    return { period, length, fraction, allpassC, actualFrequency: frequency, centsError: 0 };
  }
  const length = Math.max(2, Math.round(loop));
  const actualFrequency = sampleRate / (length + filterDelay);
  return {
    period,
    length,
    fraction: 0,
    allpassC: 0,
    actualFrequency,
    centsError: 1200 * Math.log2(actualFrequency / frequency),
  };
}

export interface PluckOptions {
  sampleRate: number;
  frequency: number;
  /** Phase delay of the loop filter at low frequencies, in samples. */
  filterDelay: number;
  fractional: boolean;
  /** Pick position beta as a fraction of the string (0 = off, 0.5 = middle). */
  pickPosition: number;
  /** Peak amplitude of the initial noise, 0 to 1. */
  velocity: number;
  seed: number;
}

/** The initial excitation: zero-mean noise, comb-filtered for the pick position. */
export function excitation(length: number, pickPosition: number, velocity: number, seed: number): Float32Array {
  const rand = mulberry32(seed);
  const noise = new Float32Array(length);
  let mean = 0;
  for (let i = 0; i < length; i++) {
    noise[i] = rand() * 2 - 1;
    mean += noise[i]!;
  }
  mean /= length;
  for (let i = 0; i < length; i++) noise[i] = noise[i]! - mean;

  const out = new Float32Array(length);
  const m = Math.round(pickPosition * length);
  let peak = 0;
  for (let i = 0; i < length; i++) {
    // 1 - z^-M puts notches at every harmonic that has a node at the pick point.
    const v = m > 0 && m < length ? noise[i]! - noise[(i - m + length) % length]! : noise[i]!;
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  const scale = peak > 0 ? velocity / peak : 0;
  for (let i = 0; i < length; i++) out[i] = out[i]! * scale;
  return out;
}

export class KSString {
  readonly buffer: Float32Array;
  length = 0;
  /** Index of the next sample to leave the line (also where its replacement goes). */
  index = 0;
  prev = 0;
  apIn = 0;
  apOut = 0;
  plan: DelayPlan | null = null;
  state: FilterState = {};
  /** Per-trip loss multiplier applied on top of the filter (1, or the mute ramp). */
  mute = 1;
  /** Samples processed since the last pluck. */
  age = 0;
  clipped = false;
  private random: () => number = Math.random;

  constructor(maxLength: number) {
    this.buffer = new Float32Array(maxLength);
  }

  pluck(opts: PluckOptions): DelayPlan {
    const plan = planDelay(opts.sampleRate, opts.frequency, opts.filterDelay, opts.fractional);
    const length = Math.min(plan.length, this.buffer.length);
    const exc = excitation(length, opts.pickPosition, opts.velocity, opts.seed);
    this.buffer.fill(0);
    this.buffer.set(exc);
    this.length = length;
    this.plan = { ...plan, length };
    this.index = 0;
    this.prev = 0;
    this.apIn = 0;
    this.apOut = 0;
    this.state = {};
    this.mute = 1;
    this.age = 0;
    this.clipped = false;
    // A separate stream from the excitation, for filters that call p.random().
    this.random = mulberry32(opts.seed ^ 0x9e3779b9);
    return this.plan;
  }

  get active(): boolean {
    return this.length > 0;
  }

  /** Begin damping the string (a palm mute): it fades out within a few tenths of a second. */
  damp(): void {
    if (this.active) this.mute = 0.9995;
  }

  /** Advance one sample; returns the sample that left the delay line. */
  tick(filter: LoopFilter, params: Omit<FilterParams, 'random'>): number {
    if (this.length === 0) return 0;
    const x = this.buffer[this.index]!;
    let y = filter(x, this.prev, this.state, { decay: params.decay, weight: params.weight, random: this.random });
    if (!Number.isFinite(y)) y = 0;
    const c = this.plan!.allpassC;
    let v = c === 0 ? y : c * y + this.apIn - c * this.apOut;
    this.apIn = y;
    this.apOut = v;
    if (this.mute < 1) {
      v *= this.mute;
      this.mute *= 0.9995;
      if (this.mute < 1e-4) {
        this.stop();
        return x;
      }
    }
    if (v > CLIP_LEVEL) {
      v = CLIP_LEVEL;
      this.clipped = true;
    } else if (v < -CLIP_LEVEL) {
      v = -CLIP_LEVEL;
      this.clipped = true;
    }
    this.buffer[this.index] = v;
    this.prev = x;
    this.index = this.index + 1 === this.length ? 0 : this.index + 1;
    this.age++;
    return x;
  }

  stop(): void {
    this.length = 0;
    this.plan = null;
  }

  /** The delay line in reading order: element 0 leaves next, the last was written most recently. */
  snapshot(): Float32Array {
    const out = new Float32Array(this.length);
    for (let i = 0; i < this.length; i++) out[i] = this.buffer[(this.index + i) % this.length]!;
    return out;
  }
}

/** Render a single plucked string offline, for tests, measurements and tables. */
export function renderString(
  opts: PluckOptions,
  filter: LoopFilter,
  params: Omit<FilterParams, 'random'>,
  seconds: number,
): Float32Array {
  const s = new KSString(Math.ceil(opts.sampleRate / 15));
  s.pluck(opts);
  const out = new Float32Array(Math.round(seconds * opts.sampleRate));
  for (let i = 0; i < out.length; i++) out[i] = s.tick(filter, params);
  return out;
}
