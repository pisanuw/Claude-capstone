// Re-runs kernels while varying one knob: a constant in the kernel source
// (#define or top-level scalar) or a cache parameter.

import { simulate, validateConfig, type CacheConfig } from './cache';
import { buildTrace } from './trace';

export type SweepTarget =
  | { kind: 'const'; name: string }
  | { kind: 'size' }
  | { kind: 'lineSize' }
  | { kind: 'ways' };

export interface SweepPoint {
  x: number;
  /** null when this kernel does not run (or the config is invalid) at this x. */
  missRate: number | null;
  misses: number | null;
  accesses: number | null;
  error?: string;
}

export function parseValues(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(/[\s,]+/).filter(Boolean)) {
    const v = Number(part);
    if (!Number.isFinite(v)) throw new Error(`'${part}' is not a number`);
    out.push(v);
  }
  if (!out.length) throw new Error('enter at least one value');
  if (out.length > 40) throw new Error('at most 40 values');
  return out;
}

export function sweep(src: string, cfg: CacheConfig, target: SweepTarget, values: number[], maxAccesses = 1_000_000): SweepPoint[] {
  const base = target.kind === 'const' ? null : buildTrace(src, { maxAccesses });
  return values.map((x) => {
    try {
      const c = { ...cfg };
      if (target.kind !== 'const') c[target.kind] = x;
      const errs = validateConfig(c);
      if (errs.length) throw new Error(errs[0]);
      const trace = base ?? buildTrace(src, { overrides: { [(target as { name: string }).name]: x }, maxAccesses });
      const { stats } = simulate(trace, c);
      return { x, missRate: stats.missRate, misses: stats.misses, accesses: stats.accesses };
    } catch (e) {
      return { x, missRate: null, misses: null, accesses: null, error: (e as Error).message };
    }
  });
}
