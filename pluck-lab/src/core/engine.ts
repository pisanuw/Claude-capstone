/**
 * Six strings and a pluck scheduler. The same class runs inside the
 * AudioWorklet (or a ScriptProcessor fallback) and in tests, so what you hear
 * is exactly what the tests check.
 */
import { compileFilter, DEFAULT_FILTER_SOURCE, type LoopFilter } from './filters';
import { KSString } from './ks';

export interface EngineParams {
  decay: number;
  weight: number;
  pickPosition: number;
  fractional: boolean;
  /** Phase delay of the current loop filter, subtracted from each delay line. */
  filterDelay: number;
  /** 'equal' scales the decay per note so high strings ring about as long as low ones. */
  decayMode: 'natural' | 'equal';
  volume: number;
}

export const DEFAULT_ENGINE_PARAMS: EngineParams = {
  decay: 0.993,
  weight: 0.5,
  pickPosition: 0.13,
  fractional: true,
  filterDelay: 0.5,
  decayMode: 'natural',
  volume: 0.35,
};

/** Reference pitch for 'equal' decay: the open A string. */
export const EQUAL_DECAY_REFERENCE_HZ = 110;

export interface PluckEvent {
  string: number;
  frequency: number;
  /** Samples from now until the pluck starts. */
  delay: number;
  velocity: number;
  seed: number;
}

/** The decay actually used for a note under the current decay mode. */
export function effectiveDecay(params: Pick<EngineParams, 'decay' | 'decayMode'>, frequency: number): number {
  if (params.decayMode === 'natural') return params.decay;
  // Per-second loss from rho is rho^f; holding it at the reference pitch's
  // value means rho_f = rho^(f_ref / f). The filter's own loss is not
  // compensated, so very bright settings still favour low notes.
  return Math.pow(params.decay, EQUAL_DECAY_REFERENCE_HZ / frequency);
}

export class Engine {
  readonly strings: KSString[];
  params: EngineParams = { ...DEFAULT_ENGINE_PARAMS };
  filter: LoopFilter;
  private decays: number[];
  private pending: { at: number; event: PluckEvent }[] = [];
  private now = 0;
  private dcIn = 0;
  private dcOut = 0;
  /** Set when a custom filter threw mid-block; the default filter takes over. */
  lastError: string | null = null;

  constructor(readonly sampleRate: number, count = 6) {
    this.strings = Array.from({ length: count }, () => new KSString(Math.ceil(sampleRate / 15)));
    this.decays = new Array<number>(count).fill(this.params.decay);
    this.filter = compileFilter(DEFAULT_FILTER_SOURCE).fn!;
  }

  setParams(p: Partial<EngineParams>): void {
    this.params = { ...this.params, ...p };
    this.strings.forEach((s, i) => {
      if (s.plan) this.decays[i] = effectiveDecay(this.params, s.plan.actualFrequency);
    });
  }

  /** Replace the loop filter. Returns the compile error, if any (the old filter stays). */
  setFilter(source: string): string | null {
    const compiled = compileFilter(source);
    if (!compiled.ok) return compiled.error ?? 'Unknown error';
    this.filter = compiled.fn!;
    return null;
  }

  schedule(events: PluckEvent[]): void {
    for (const event of events) this.pending.push({ at: this.now + Math.max(0, Math.round(event.delay)), event });
    this.pending.sort((a, b) => a.at - b.at);
  }

  damp(): void {
    this.pending = [];
    for (const s of this.strings) s.damp();
  }

  private start(e: PluckEvent): void {
    const s = this.strings[e.string];
    if (!s) return;
    s.pluck({
      sampleRate: this.sampleRate,
      frequency: e.frequency,
      filterDelay: this.params.filterDelay,
      fractional: this.params.fractional,
      pickPosition: this.params.pickPosition,
      velocity: e.velocity,
      seed: e.seed,
    });
    this.decays[e.string] = effectiveDecay(this.params, e.frequency);
  }

  /** Fill `out` with the next block of mono samples. */
  process(out: Float32Array): void {
    try {
      this.run(out);
    } catch (err) {
      this.lastError = `The filter threw: ${(err as Error).message}. Switched back to the default filter.`;
      this.filter = compileFilter(DEFAULT_FILTER_SOURCE).fn!;
      out.fill(0);
    }
  }

  private run(out: Float32Array): void {
    const { weight, volume } = this.params;
    for (let n = 0; n < out.length; n++) {
      while (this.pending.length > 0 && this.pending[0]!.at <= this.now) this.start(this.pending.shift()!.event);
      let mix = 0;
      for (let i = 0; i < this.strings.length; i++) {
        mix += this.strings[i]!.tick(this.filter, { decay: this.decays[i]!, weight });
      }
      // DC blocker, then a soft limiter so six strings at full velocity never hard-clip.
      const y = mix - this.dcIn + 0.995 * this.dcOut;
      this.dcIn = mix;
      this.dcOut = y;
      out[n] = Math.tanh(y * volume);
      this.now++;
    }
  }

  get time(): number {
    return this.now;
  }
}
