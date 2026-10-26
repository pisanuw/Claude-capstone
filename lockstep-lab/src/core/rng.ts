/** mulberry32: a tiny 32-bit PRNG whose whole state is one integer, so it can be snapshotted. */
export function nextRandom(state: number): { state: number; value: number } {
  const s = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { state: s, value: (t ^ (t >>> 14)) >>> 0 };
}

/** A stateful wrapper around mulberry32 returning floats in [0, 1). */
export function makeRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    const r = nextRandom(state);
    state = r.state;
    return r.value / 4294967296;
  };
}

/** Stateless integer hash of a few integers (for bot scripts and the fake network). */
export function hashInts(...xs: number[]): number {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** FNV-1a over 32-bit words. */
export class Fnv {
  private h = 0x811c9dc5;
  word(x: number): this {
    let v = x >>> 0;
    for (let i = 0; i < 4; i++) {
      this.h = Math.imul(this.h ^ (v & 0xff), 0x01000193);
      v >>>= 8;
    }
    return this;
  }
  text(s: string): this {
    for (let i = 0; i < s.length; i++) this.word(s.charCodeAt(i));
    return this;
  }
  /** Hashes the exact IEEE 754 double bit pattern of n. */
  double(n: number): this {
    F64[0] = n;
    return this.word(U32[0] as number).word(U32[1] as number);
  }
  value(): number {
    return this.h >>> 0;
  }
}

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);

const F32 = new Float32Array(1);
const U32F = new Uint32Array(F32.buffer);

/** The float32 bit pattern of n (n is rounded to float32 first). */
export function float32Bits(n: number): number {
  F32[0] = n;
  return U32F[0] as number;
}

export function hex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}
