// Diagnosis by elimination: which single faults are still consistent with
// everything the student has observed, and which probe would narrow them most.
//
// Every candidate fault is simulated on each program the student has run, and
// each signal's whole waveform is reduced to a hash. An observation (the free
// view of the output display, or one probed signal during one run) keeps the
// candidates whose hash for that signal matches what the real board showed.

import { CATALOG, type Fault, faultKey } from './faults';
import { SIGNAL_COUNT } from './netlist';
import { simulate } from './sim';

/** Index used for the free observation (output display, halt) of a run. */
export const FREE_SIGNAL = SIGNAL_COUNT;

export interface Observation {
  /** The program bytes the board was running. */
  readonly bytes: readonly number[];
  /** A signal index, or FREE_SIGNAL for watching the output display. */
  readonly signal: number;
  /** The hash of what the real board showed for that signal. */
  readonly hash: number;
}

export interface ProbeSuggestion {
  readonly program: number;
  readonly signal: number;
  readonly groups: number;
  /** Expected number of candidates left after this probe. */
  readonly expected: number;
}

export const programKey = (bytes: readonly number[]) => bytes.join(',');

/** Hashes per fault, flattened: fault i, signal s lives at i * WIDTH + s. */
export const WIDTH = SIGNAL_COUNT + 1;

/**
 * Simulate every fault on one program. Slow enough (about a second for the
 * full catalog) that the app runs it in a worker.
 */
export function computeSignatures(
  bytes: readonly number[],
  catalog: readonly Fault[] = CATALOG,
  onProgress?: (done: number, total: number) => void,
): Uint32Array {
  const out = new Uint32Array(catalog.length * WIDTH);
  const nominal = simulate(bytes, null);
  catalog.forEach((f, i) => {
    // A flipped ROM bit at an address the healthy run never reads cannot
    // change anything, so it shares the healthy signature without a re-run.
    const h = f.kind === 'rom' && !nominal.romReads.has(f.addr) ? nominal.hashes : simulate(bytes, f).hashes;
    out.set(h, i * WIDTH);
    if (onProgress && (i % 250 === 249 || i === catalog.length - 1)) onProgress(i + 1, catalog.length);
  });
  return out;
}

export class Diagnoser {
  private readonly cache = new Map<string, Uint32Array>();

  constructor(readonly catalog: readonly Fault[] = CATALOG) {}

  has(bytes: readonly number[]): boolean {
    return this.cache.has(programKey(bytes));
  }

  /** Store signatures computed elsewhere (the worker). */
  store(bytes: readonly number[], sigs: Uint32Array): void {
    if (sigs.length !== this.catalog.length * WIDTH) throw new Error('signature table has the wrong size');
    this.cache.set(programKey(bytes), sigs);
  }

  /** Signal hashes for every catalog fault running this program. */
  signatures(bytes: readonly number[]): Uint32Array {
    const key = programKey(bytes);
    let sigs = this.cache.get(key);
    if (!sigs) {
      sigs = computeSignatures(bytes, this.catalog);
      this.cache.set(key, sigs);
    }
    return sigs;
  }

  /** Catalog indices still consistent with all observations. */
  consistent(observations: readonly Observation[]): number[] {
    let alive = this.catalog.map((_, i) => i);
    for (const o of observations) {
      const sigs = this.signatures(o.bytes);
      alive = alive.filter((i) => sigs[i * WIDTH + o.signal] === o.hash);
    }
    return alive;
  }

  /**
   * Split candidates into groups that no probe of these programs can tell
   * apart. One group left means more probing of these programs is pointless.
   */
  groups(candidates: readonly number[], programs: readonly (readonly number[])[]): number[][] {
    const sigs = programs.map((p) => this.signatures(p));
    const byKey = new Map<string, number[]>();
    for (const i of candidates) {
      const key = sigs.map((s) => s.subarray(i * WIDTH, (i + 1) * WIDTH).join(',')).join('|');
      const g = byKey.get(key);
      if (g) g.push(i);
      else byKey.set(key, [i]);
    }
    return [...byKey.values()];
  }

  /**
   * The probe (program, signal) that minimizes the expected number of
   * candidates left, assuming each candidate is equally likely. Returns null
   * when no probe of these programs splits the set.
   */
  bestProbe(candidates: readonly number[], programs: readonly (readonly number[])[]): ProbeSuggestion | null {
    if (candidates.length < 2) return null;
    let best: ProbeSuggestion | null = null;
    programs.forEach((bytes, program) => {
      const sigs = this.signatures(bytes);
      for (let signal = 0; signal <= SIGNAL_COUNT; signal++) {
        const counts = new Map<number, number>();
        for (const i of candidates) {
          const h = sigs[i * WIDTH + signal];
          counts.set(h, (counts.get(h) ?? 0) + 1);
        }
        if (counts.size < 2) continue;
        let sq = 0;
        for (const c of counts.values()) sq += c * c;
        const expected = sq / candidates.length;
        if (!best || expected < best.expected - 1e-9) best = { program, signal, groups: counts.size, expected };
      }
    });
    return best;
  }
}

/** True when no probe of any of these programs can tell the two faults apart. */
export function indistinguishable(a: Fault, b: Fault, programs: readonly (readonly number[])[]): boolean {
  if (faultKey(a) === faultKey(b)) return true;
  return programs.every((bytes) => {
    const ha = simulate(bytes, a).hashes;
    const hb = simulate(bytes, b).hashes;
    return ha.every((h, i) => h === hb[i]);
  });
}
