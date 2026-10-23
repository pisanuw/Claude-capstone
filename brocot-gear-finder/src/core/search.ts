// Gear-train search. A compound train with k stages has k driving gears and k
// driven gears; its reduction (input turns per output turn) is
// prod(driven) / prod(driver). So a ratio N/D is buildable in k stages exactly
// when both N and D are products of k tooth counts inside the allowed range.
// Brocot did this by hand with factor tables; here we enumerate every such
// product once and, for each possible driver product D, test the two nearest
// numerators round(R * D) +- 1 against the same table.

import { gcd } from './fractions';

export interface Limits {
  minTeeth: number;
  maxTeeth: number;
  maxStages: number;
}

export interface Stage {
  driver: number;
  driven: number;
}

export interface Train {
  stages: Stage[];
  /** prod(driven) */
  num: number;
  /** prod(driver) */
  den: number;
  /** num/den */
  ratio: number;
  /** ratio / target - 1. Positive means the output turns too slowly. */
  error: number;
  teeth: number;
}

export const LIMIT_BOUNDS = { minTeeth: 6, maxTeeth: 200, maxStages: 3 } as const;

export function validateLimits(l: Limits): string | null {
  if (!Number.isInteger(l.minTeeth) || !Number.isInteger(l.maxTeeth) || !Number.isInteger(l.maxStages))
    return 'Tooth counts and stages must be whole numbers';
  if (l.minTeeth < LIMIT_BOUNDS.minTeeth) return `Fewest teeth must be at least ${LIMIT_BOUNDS.minTeeth}`;
  if (l.maxTeeth > LIMIT_BOUNDS.maxTeeth) return `Most teeth can be at most ${LIMIT_BOUNDS.maxTeeth}`;
  if (l.minTeeth > l.maxTeeth) return 'Fewest teeth is larger than most teeth';
  if (l.maxStages < 1 || l.maxStages > LIMIT_BOUNDS.maxStages)
    return `Stages must be between 1 and ${LIMIT_BOUNDS.maxStages}`;
  return null;
}

const tableCache = new Map<string, Uint8Array>();

/**
 * A byte per integer up to maxTeeth^k: bit (s - 1) is set when the integer is
 * a product of exactly s tooth counts in [min, max].
 */
export function productTable(l: Limits): Uint8Array {
  const key = `${l.minTeeth}-${l.maxTeeth}-${l.maxStages}`;
  const hit = tableCache.get(key);
  if (hit) return hit;
  const size = l.maxTeeth ** l.maxStages + 1;
  const table = new Uint8Array(size);
  const walk = (start: number, product: number, depth: number) => {
    for (let t = start; t <= l.maxTeeth; t++) {
      const p = product * t;
      table[p] = (table[p] as number) | (1 << depth);
      if (depth + 1 < l.maxStages) walk(t, p, depth + 1);
    }
  };
  walk(l.minTeeth, 1, 0);
  tableCache.set(key, table);
  return table;
}

/**
 * The most even factorisation of n into exactly k tooth counts (ascending,
 * smallest largest factor), or null. Even factors give even stage ratios and
 * avoid pointless 1:1 stages.
 */
export function factorInto(n: number, k: number, min: number, max: number): number[] | null {
  let best: number[] | null = null;
  const walk = (rest: number, left: number, from: number, acc: number[]) => {
    if (left === 1) {
      if (rest >= from && rest <= max && (!best || rest < (best.at(-1) as number))) best = [...acc, rest];
      return;
    }
    for (let t = from; t <= max && t ** left <= rest; t++) if (rest % t === 0) walk(rest / t, left - 1, t, [...acc, t]);
  };
  walk(n, k, min, []);
  return best;
}

/**
 * Pair drivers with driven gears so stage ratios are as even as possible:
 * both sorted ascending, smallest with smallest.
 */
export function pairStages(drivers: number[], drivens: number[]): Stage[] {
  const d = [...drivers].sort((a, b) => a - b);
  const n = [...drivens].sort((a, b) => a - b);
  return d.map((driver, i) => ({ driver, driven: n[i] as number }));
}

export function makeTrain(stages: Stage[], target: number): Train {
  const num = stages.reduce((a, s) => a * s.driven, 1);
  const den = stages.reduce((a, s) => a * s.driver, 1);
  const ratio = num / den;
  return {
    stages,
    num,
    den,
    ratio,
    error: ratio / target - 1,
    teeth: stages.reduce((a, s) => a + s.driver + s.driven, 0),
  };
}

export interface SearchResult {
  /** Best trains overall, sorted by |error|, then stages, then total teeth. */
  trains: Train[];
  /** The most accurate train for each stage count (index 0 = 1 stage), then fewest teeth. */
  bestByStages: (Train | null)[];
  examined: number;
}

function better(a: Train, b: Train): number {
  return Math.abs(a.error) - Math.abs(b.error) || a.stages.length - b.stages.length || a.teeth - b.teeth;
}

/** Search every k-stage train (k <= maxStages) for reduction `target`. */
export function searchTrains(target: number, l: Limits, keep = 25): SearchResult {
  if (!(target > 0) || !Number.isFinite(target)) throw new Error('Target must be a positive number');
  const bad = validateLimits(l);
  if (bad) throw new Error(bad);
  const table = productTable(l);
  const byRatio = new Map<string, Train>();
  const bestByStages: (Train | null)[] = Array.from({ length: l.maxStages }, () => null);
  let examined = 0;

  for (let k = 1; k <= l.maxStages; k++) {
    const bit = 1 << (k - 1);
    const lo = l.minTeeth ** k;
    const hi = l.maxTeeth ** k;
    for (let den = lo; den <= hi; den++) {
      if (!((table[den] as number) & bit)) continue;
      const ideal = target * den;
      const base = Math.round(ideal);
      for (const num of [base - 1, base, base + 1]) {
        if (num < lo || num > hi || !((table[num] as number) & bit)) continue;
        examined++;
        const g = gcd(num, den);
        const key = `${num / g}/${den / g}`;
        const prev = byRatio.get(key);
        const best = bestByStages[k - 1];
        // Same reduced ratio: keep the fewest stages, then the fewest teeth. Cheap pre-check before factoring,
        // unless this could still become the best train for its own stage count.
        const err = Math.abs(num / den / target - 1);
        const canBeatStageBest = !best || err < Math.abs(best.error) || (err === Math.abs(best.error) && num < best.num);
        if (prev && prev.stages.length <= k && prev.num <= num && !canBeatStageBest) continue;
        const drivers = factorInto(den, k, l.minTeeth, l.maxTeeth) as number[];
        const drivens = factorInto(num, k, l.minTeeth, l.maxTeeth) as number[];
        const train = makeTrain(pairStages(drivers, drivens), target);
        if (!prev || better(train, prev) < 0) byRatio.set(key, train);
        if (!best || better(train, best) < 0) bestByStages[k - 1] = train;
      }
    }
  }

  const all = [...byRatio.values()].sort(better);
  return { trains: all.slice(0, keep), bestByStages, examined };
}

/** Is p/q (any multiple of it) buildable within the limits? Returns the fewest stages, or 0. */
export function buildableStages(p: number, q: number, l: Limits): number {
  const table = productTable(l);
  for (let k = 1; k <= l.maxStages; k++) {
    const bit = 1 << (k - 1);
    const hi = l.maxTeeth ** k;
    for (let m = 1; m * Math.max(p, q) <= hi; m++) {
      if ((table[p * m] as number) & bit && (table[q * m] as number) & bit) return k;
    }
  }
  return 0;
}
