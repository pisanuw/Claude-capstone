import { PIECE_TYPES, type PieceType } from './pieces';

/** Small, fast seeded PRNG (mulberry32). Same seed, same sequence, everywhere. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
}

/** Hash a string (such as a date) into a 32-bit seed. FNV-1a. */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The "7-bag" randomizer: every run of seven pieces is a shuffled copy of
 * all seven types, so droughts are bounded (at most 12 pieces between Is).
 */
export class Bag {
  private queue: PieceType[] = [];
  private readonly rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  private refill(): void {
    const bag = [...PIECE_TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this.queue.push(...bag);
  }

  next(): PieceType {
    if (this.queue.length === 0) this.refill();
    return this.queue.shift() as PieceType;
  }

  /** The next n pieces without consuming them. */
  peek(n: number): PieceType[] {
    while (this.queue.length < n) this.refill();
    return this.queue.slice(0, n);
  }
}
