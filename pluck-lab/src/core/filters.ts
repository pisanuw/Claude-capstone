/**
 * Loop filters for the Karplus-Strong feedback path.
 *
 * A filter is the body of `function (x, prev, state, p) { ... }`: `x` is the
 * sample leaving the delay line now, `prev` the one that left a step earlier,
 * `state` a per-string object the filter may keep values in, and `p` the
 * slider values plus a seeded `random()`. Whatever it returns is fed back into
 * the delay line.
 */

export interface FilterParams {
  /** Loss per trip round the loop, rho in Karplus and Strong (0.9 to 1). */
  decay: number;
  /** Averaging weight S: 0 = no smoothing, 0.5 = the classic two-point average. */
  weight: number;
  /** Seeded uniform random number in [0, 1). */
  random: () => number;
}

export type FilterState = Record<string, number>;
export type LoopFilter = (x: number, prev: number, state: FilterState, p: FilterParams) => number;

export interface FilterPreset {
  id: string;
  name: string;
  blurb: string;
  source: string;
}

export const FILTER_PRESETS: readonly FilterPreset[] = [
  {
    id: 'weighted',
    name: 'Weighted average (default)',
    blurb: 'Jaffe and Smith: a two-point average whose weight S sets the tone. S = 0.5 is the original.',
    source: 'return p.decay * ((1 - p.weight) * x + p.weight * prev);',
  },
  {
    id: 'classic',
    name: 'Karplus-Strong 1983',
    blurb: 'Average the two samples and feed them back. The decay slider is the only extra.',
    source: 'return p.decay * 0.5 * (x + prev);',
  },
  {
    id: 'none',
    name: 'No smoothing',
    blurb: 'Only the decay factor: every harmonic dies at the same rate, so the noise never turns into a tone.',
    source: 'return p.decay * x;',
  },
  {
    id: 'three-point',
    name: 'Three-point average',
    blurb: 'Averages three samples using state to remember the oldest one. Darker, and half a sample more delay.',
    source: [
      'const older = state.older ?? 0;',
      'state.older = prev;',
      'return p.decay * (0.25 * x + 0.5 * prev + 0.25 * older);',
    ].join('\n'),
  },
  {
    id: 'drum',
    name: 'Drum (random sign)',
    blurb: 'Karplus and Strong\'s drum variant: flip the sign of half the samples at random. Not linear, so it has no single frequency response.',
    source: [
      'const avg = p.decay * 0.5 * (x + prev);',
      'return p.random() < 0.5 ? avg : -avg;',
    ].join('\n'),
  },
  {
    id: 'unstable',
    name: 'Unstable (gain above 1)',
    blurb: 'Multiplies by 1.002 with no smoothing, so the string grows each trip. The engine clips it so your speakers survive.',
    source: 'return 1.002 * x;',
  },
];

export const DEFAULT_FILTER_SOURCE = FILTER_PRESETS[0]!.source;

export interface CompiledFilter {
  ok: boolean;
  fn?: LoopFilter;
  error?: string;
}

/** Compile and smoke-test a filter body. Never throws. */
export function compileFilter(source: string): CompiledFilter {
  let fn: LoopFilter;
  try {
    fn = new Function('x', 'prev', 'state', 'p', `"use strict";\n${source}`) as LoopFilter;
  } catch (err) {
    return { ok: false, error: `Syntax error: ${(err as Error).message}` };
  }
  const state: FilterState = {};
  const p: FilterParams = { decay: 0.996, weight: 0.5, random: () => 0.25 };
  try {
    for (let i = 0; i < 8; i++) {
      const y = fn(Math.sin(i), Math.sin(i - 1), state, p);
      if (typeof y !== 'number' || !Number.isFinite(y)) {
        return { ok: false, error: `The filter must return a finite number; it returned ${String(y)}.` };
      }
    }
  } catch (err) {
    return { ok: false, error: `Runtime error: ${(err as Error).message}` };
  }
  return { ok: true, fn };
}
