// Challenges: seeded random faults by difficulty, shareable links, grading.

import { CATALOG, type Fault, faultKey, parseFaultKey } from './faults';
import { NETS } from './netlist';
import { TEST_PROGRAMS } from './isa';
import { simulate } from './sim';
import { FREE_SIGNAL, indistinguishable } from './diagnosis';

export type Tier = 'bench' | 'board' | 'deep';

export interface TierInfo {
  readonly title: string;
  readonly blurb: string;
  readonly budget: number;
  readonly includes: (f: Fault) => boolean;
}

export const TIERS: Record<Tier, TierInfo> = {
  bench: {
    title: 'Bench (easy)',
    blurb: 'A stuck bus line or a dead chip.',
    budget: 12,
    includes: (f) => (f.kind === 'stuck' && NETS[f.net].group === 'bus') || f.kind === 'dead',
  },
  board: {
    title: 'Board (medium)',
    blurb: 'Any stuck net, open pin, bus short or dead chip.',
    budget: 10,
    includes: (f) => f.kind !== 'rom',
  },
  deep: {
    title: 'Deep (hard)',
    blurb: 'Anything, including a flipped bit in the microcode ROM.',
    budget: 8,
    includes: () => true,
  },
};

export interface Challenge {
  readonly tier: Tier;
  readonly fault: Fault;
  readonly budget: number;
  /** The seed it was drawn from, or null when an instructor picked the fault. */
  readonly seed: number | null;
}

/** mulberry32: small, fast, and identical in every browser. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const nominalFree = TEST_PROGRAMS.map((p) => simulate(p.bytes, null).hashes[FREE_SIGNAL]);

/** A fault is a fair challenge if at least one test program shows a wrong output display. */
export function hasVisibleSymptom(f: Fault): boolean {
  return TEST_PROGRAMS.some((p, i) => simulate(p.bytes, f).hashes[FREE_SIGNAL] !== nominalFree[i]);
}

export function tierPool(tier: Tier): Fault[] {
  return CATALOG.filter(TIERS[tier].includes);
}

export function generate(seed: number, tier: Tier): Challenge {
  const pool = tierPool(tier);
  const next = rng(seed);
  // Most faults show a symptom, so this loop ends quickly; the scan is a fallback.
  for (let tries = 0; tries < 200; tries++) {
    const f = pool[Math.floor(next() * pool.length)];
    if (hasVisibleSymptom(f)) return { tier, fault: f, budget: TIERS[tier].budget, seed };
  }
  const f = pool.find(hasVisibleSymptom);
  /* c8 ignore next */
  if (!f) throw new Error(`no visible fault in tier ${tier}`);
  return { tier, fault: f, budget: TIERS[tier].budget, seed };
}

// Links are obfuscated, not encrypted: a determined student can decode them.
const MASK = 'pull-the-pin';
function scramble(s: string): string {
  return Array.from(s, (c, i) => String.fromCharCode(c.charCodeAt(0) ^ (MASK.charCodeAt(i % MASK.length) & 31))).join('');
}
const toB64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

export function encodeChallenge(c: Challenge): string {
  const body = c.seed !== null ? `s|${c.tier}|${c.seed}` : `f|${c.tier}|${faultKey(c.fault)}|${c.budget}`;
  return toB64(scramble(body));
}

export function decodeChallenge(code: string): Challenge | null {
  let body: string;
  try {
    body = scramble(fromB64(code));
  } catch {
    return null;
  }
  const [type, tier, x, y] = body.split('|');
  if (!(tier in TIERS)) return null;
  const t = tier as Tier;
  if (type === 's') {
    const seed = Number(x);
    return Number.isInteger(seed) && seed >= 0 ? generate(seed, t) : null;
  }
  if (type === 'f') {
    const fault = parseFaultKey(x ?? '');
    const budget = Number(y);
    if (!fault || !Number.isInteger(budget) || budget < 1 || budget > 99) return null;
    return { tier: t, fault, budget, seed: null };
  }
  return null;
}

export type Verdict = 'exact' | 'equivalent' | 'wrong';

/**
 * Exact if the student named the injected fault. Equivalent if their fault
 * behaves identically on every signal of every test program, so no probe
 * the tool offers could have told them apart.
 */
export function grade(answer: Fault, truth: Fault): Verdict {
  if (faultKey(answer) === faultKey(truth)) return 'exact';
  return indistinguishable(answer, truth, TEST_PROGRAMS.map((p) => p.bytes)) ? 'equivalent' : 'wrong';
}
