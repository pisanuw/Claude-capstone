/**
 * Deterministic PRNG so puzzle generation is reproducible: the same seed
 * always yields the same puzzle, which powers both shareable practice seeds
 * and the shared daily challenge (no server needed).
 */

/** xmur3 string hash: turns any string into a well-mixed 32-bit seed. */
export function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Pick one element. Throws on an empty array. */
  pick<T>(items: T[]): T;
  /** Fisher-Yates shuffle (returns a new array). */
  shuffle<T>(items: T[]): T[];
}

/** mulberry32: tiny, fast, good-enough distribution for game purposes. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(n: number): number {
      return Math.floor(next() * n);
    },
    pick<T>(items: T[]): T {
      if (items.length === 0) throw new Error('pick from empty array');
      return items[Math.floor(next() * items.length)];
    },
    shuffle<T>(items: T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
