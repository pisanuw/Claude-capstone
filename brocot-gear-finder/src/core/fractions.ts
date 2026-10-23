// Continued fractions, convergents and the Stern-Brocot walk toward a real
// target. Everything here works on plain doubles with integer numerators and
// denominators well inside Number.MAX_SAFE_INTEGER.

export interface Rational {
  p: number;
  q: number;
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function reduce(p: number, q: number): Rational {
  const g = gcd(p, q) || 1;
  return { p: p / g, q: q / g };
}

/** Relative error of p/q against x, signed: positive when p/q is larger. */
export function relError(r: Rational, x: number): number {
  return r.p / r.q / x - 1;
}

/**
 * Continued-fraction terms [a0; a1, a2, ...] of a positive x. Stops when the
 * remainder is (numerically) zero, after maxTerms terms, or when the next
 * convergent's denominator would pass maxDen.
 */
export function continuedFraction(x: number, maxTerms = 24, maxDen = 1e12): number[] {
  if (!(x > 0)) throw new Error('Target must be positive');
  const terms: number[] = [];
  let rem = x;
  let [q0, q1] = [0, 1];
  for (let i = 0; i < maxTerms; i++) {
    const a = Math.floor(rem + 1e-12);
    const q2 = a * q1 + q0;
    if (i > 0 && q2 > maxDen) break;
    terms.push(a);
    [q0, q1] = [q1, q2];
    const frac = rem - a;
    // Relative tolerance: once the convergent matches x to ~1e-13 the rest is float noise.
    const conv = convergents(terms).at(-1) as Rational;
    if (frac < 1e-12 || Math.abs(conv.p / conv.q - x) <= 1e-13 * x) break;
    rem = 1 / frac;
  }
  return terms;
}

export function convergents(terms: number[]): Rational[] {
  const out: Rational[] = [];
  let [p0, p1, q0, q1] = [0, 1, 1, 0];
  for (const a of terms) {
    [p0, p1] = [p1, a * p1 + p0];
    [q0, q1] = [q1, a * q1 + q0];
    out.push({ p: p1, q: q1 });
  }
  return out;
}

export interface SternBrocotRun {
  dir: 'L' | 'R';
  count: number;
}

/**
 * The Stern-Brocot path to x as run-length encoded moves. A run of k moves in
 * one direction is exactly one continued-fraction term, so this is cheap even
 * for 1440 (R^1439) or a 200-term walk.
 */
export function sternBrocotRuns(terms: number[]): SternBrocotRun[] {
  const runs: SternBrocotRun[] = [];
  terms.forEach((a, i) => {
    // The final term contributes a - 1 moves: the last mediant *is* the target.
    const count = i === terms.length - 1 ? a - 1 : a;
    if (count > 0) runs.push({ dir: i % 2 === 0 ? 'R' : 'L', count });
  });
  return runs;
}

export function formatRuns(runs: SternBrocotRun[], max = 12): string {
  if (runs.length === 0) return '(root: 1/1)';
  const parts = runs.slice(0, max).map((r) => (r.count === 1 ? r.dir : `${r.dir}${superscript(r.count)}`));
  if (runs.length > max) parts.push('…');
  return parts.join(' ');
}

function superscript(n: number): string {
  const map = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  return String(n)
    .split('')
    .map((d) => map[Number(d)])
    .join('');
}

export interface Approximation extends Rational {
  error: number;
  kind: 'convergent' | 'semiconvergent';
}

/**
 * Best rational approximations of the first kind with q <= maxDen: every p/q
 * that is closer to x than any fraction with a smaller denominator. These are
 * all convergents or semiconvergents, i.e. mediants on the Stern-Brocot path.
 */
export function bestApproximations(x: number, maxDen: number, limit = 40): Approximation[] {
  const terms = continuedFraction(x, 40, maxDen * 4);
  const out: Approximation[] = [];
  let [p0, p1, q0, q1] = [0, 1, 1, 0];
  let bestErr = Infinity;
  const push = (p: number, q: number, kind: Approximation['kind']) => {
    if (q < 1 || q > maxDen || p < 1) return;
    const err = Math.abs(p / q - x);
    if (err < bestErr - 1e-18) {
      bestErr = err;
      out.push({ p, q, error: relError({ p, q }, x), kind });
    }
  };
  for (let i = 0; i < terms.length; i++) {
    const a = terms[i] as number;
    // Semiconvergents (p0 + k p1)/(q0 + k q1) for k from ceil(a/2) (only those can beat the last convergent) up to a - 1.
    // The first term's are just smaller integers, never better than floor(x).
    if (i > 0) for (let k = Math.max(1, Math.ceil(a / 2)); k < a; k++) push(k * p1 + p0, k * q1 + q0, 'semiconvergent');
    [p0, p1] = [p1, a * p1 + p0];
    [q0, q1] = [q1, a * q1 + q0];
    push(p1, q1, 'convergent');
    if (q1 > maxDen) break;
  }
  return out.slice(-limit);
}
