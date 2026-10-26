import { QUARTER_SINE } from './sintable';
import { float32Bits } from './rng';

/**
 * The simulation is written once against this interface and run with three
 * number systems: Q16.16 fixed point, and float32 evaluated two ways.
 * Angles are an opaque representation: integer units (4096 per turn) in
 * fixed point, radians in float.
 */
export interface Arith {
  readonly name: string;
  from(n: number): number;
  toNumber(v: number): number;
  add(a: number, b: number): number;
  sub(a: number, b: number): number;
  mul(a: number, b: number): number;
  div(a: number, b: number): number;
  sqrt(a: number): number;
  lt(a: number, b: number): boolean;
  /** Converts an integer angle in 1/4096ths of a turn into this representation. */
  angle(units: number): number;
  wrapAngle(h: number): number;
  sin(h: number): number;
  cos(h: number): number;
  /** Rounds a value as it is written back into the world state. */
  store(v: number): number;
  /** 32 bits identifying the stored value exactly (for state hashes). */
  bits(v: number): number;
}

export const ANGLE_UNITS = 4096;
const ONE = 65536;
const QUARTER = ANGLE_UNITS / 4;

/** sin of an integer angle (4096 per turn), from the committed quarter-wave table. */
export function tableSin(units: number): number {
  const a = ((units % ANGLE_UNITS) + ANGLE_UNITS) % ANGLE_UNITS;
  const q = Math.floor(a / QUARTER);
  const r = a % QUARTER;
  switch (q) {
    case 0:
      return QUARTER_SINE[r] as number;
    case 1:
      return QUARTER_SINE[QUARTER - r] as number;
    case 2:
      return -(QUARTER_SINE[r] as number);
    default:
      return -(QUARTER_SINE[QUARTER - r] as number);
  }
}

export const fixedArith: Arith = {
  name: 'Q16.16 fixed point',
  from: (n) => Math.round(n * ONE),
  toNumber: (v) => v / ONE,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  // Operands stay below 2^26, so a * b is an exact integer in a double.
  mul: (a, b) => Math.floor((a * b) / ONE),
  div: (a, b) => Math.floor((a * ONE) / b),
  sqrt: (a) => {
    if (a <= 0) return 0;
    const n = a * ONE;
    let r = Math.floor(Math.sqrt(n));
    while ((r + 1) * (r + 1) <= n) r++;
    while (r * r > n) r--;
    return r;
  },
  lt: (a, b) => a < b,
  angle: (units) => units,
  wrapAngle: (h) => ((h % ANGLE_UNITS) + ANGLE_UNITS) % ANGLE_UNITS,
  sin: (h) => tableSin(h),
  cos: (h) => tableSin(h + QUARTER),
  store: (v) => v,
  bits: (v) => v | 0,
};

/** A platform math library: how sin and cos are computed. */
export interface Libm {
  readonly name: string;
  sin(x: number): number;
  cos(x: number): number;
}

export const libmA: Libm = { name: 'libm A (engine Math.sin)', sin: Math.sin, cos: Math.cos };

/**
 * A second, plausible libm: quadrant reduction plus short Taylor polynomials.
 * It agrees with libm A to about 3e-7, which is enough to flip float32
 * roundings now and then (real libms differ by an ulp or so; the gap here is
 * wider so the lesson shows up within seconds rather than hours).
 */
export const libmB: Libm = {
  name: 'libm B (polynomial)',
  sin: (x) => polySin(x),
  cos: (x) => polySin(x + Math.PI / 2),
};

function polySin(x: number): number {
  const halfPi = Math.PI / 2;
  const q = Math.round(x / halfPi);
  const r = x - q * halfPi;
  const r2 = r * r;
  const s = r * (1 - (r2 / 6) * (1 - (r2 / 20) * (1 - r2 / 42)));
  const c = 1 - (r2 / 2) * (1 - (r2 / 12) * (1 - (r2 / 30) * (1 - r2 / 56)));
  switch (((q % 4) + 4) % 4) {
    case 0:
      return s;
    case 1:
      return c;
    case 2:
      return -s;
    default:
      return -c;
  }
}

const TWO_PI = 2 * Math.PI;

/**
 * float32 arithmetic. `strict` rounds every intermediate to float32 (what
 * SSE code compiled with strict FP does). `extended` keeps intermediates in
 * double and rounds only on store (what x87 extended precision or FMA
 * contraction effectively does). Same source code, different bits.
 */
export function floatArith(mode: 'strict' | 'extended', libm: Libm): Arith {
  const r = mode === 'strict' ? Math.fround : (v: number) => v;
  return {
    name: `float32 ${mode}, ${libm.name}`,
    from: (n) => Math.fround(n),
    toNumber: (v) => v,
    add: (a, b) => r(a + b),
    sub: (a, b) => r(a - b),
    mul: (a, b) => r(a * b),
    div: (a, b) => r(a / b),
    sqrt: (a) => (a <= 0 ? 0 : r(Math.sqrt(a))),
    lt: (a, b) => a < b,
    angle: (units) => Math.fround((units * TWO_PI) / ANGLE_UNITS),
    wrapAngle: (h) => {
      let v = h;
      while (v < 0) v = r(v + TWO_PI);
      while (v >= TWO_PI) v = r(v - TWO_PI);
      return v;
    },
    sin: (h) => r(libm.sin(h)),
    cos: (h) => r(libm.cos(h)),
    store: (v) => Math.fround(v),
    bits: (v) => float32Bits(v),
  };
}
