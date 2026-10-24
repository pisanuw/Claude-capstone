// Set-associative cache simulator with LRU, FIFO and seeded random
// replacement, write-allocate or no-write-allocate, and write-back or
// write-through. Misses are classified with the 3C model by running an
// infinite cache (compulsory) and a fully associative LRU cache of the same
// capacity (capacity) beside the real one: a miss that the fully associative
// cache would have hit is a conflict miss.

import type { Trace } from './trace';

export type Policy = 'lru' | 'fifo' | 'random';

export interface CacheConfig {
  /** Total data capacity in bytes. */
  size: number;
  lineSize: number;
  /** Ways per set; equal to size / lineSize for a fully associative cache. */
  ways: number;
  policy: Policy;
  writeAllocate: boolean;
  writeBack: boolean;
  seed: number;
}

export const DEFAULT_CONFIG: CacheConfig = {
  size: 1024,
  lineSize: 32,
  ways: 2,
  policy: 'lru',
  writeAllocate: true,
  writeBack: true,
  seed: 1,
};

const isPow2 = (n: number) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

/** Returns a list of problems with the configuration (empty when valid). */
export function validateConfig(c: CacheConfig): string[] {
  const errs: string[] = [];
  if (!isPow2(c.lineSize) || c.lineSize < 4 || c.lineSize > 1024) errs.push('Line size must be a power of two between 4 and 1024 bytes.');
  if (!isPow2(c.size) || c.size < 16 || c.size > 16 * 1024 * 1024) errs.push('Cache size must be a power of two between 16 B and 16 MB.');
  if (!isPow2(c.ways)) errs.push('Associativity must be a power of two.');
  if (!errs.length && c.lineSize * c.ways > c.size) errs.push('Line size × associativity is larger than the cache.');
  return errs;
}

export function sets(c: CacheConfig): number {
  return c.size / (c.lineSize * c.ways);
}

/** Address split for display: offset, index and tag widths in bits. */
export function addressBits(c: CacheConfig): { offset: number; index: number } {
  return { offset: Math.log2(c.lineSize), index: Math.log2(sets(c)) };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface AccessResult {
  hit: boolean;
  set: number;
  /** Way that now holds the line, or -1 when a write miss did not allocate. */
  way: number;
  /** Memory line number (address / lineSize) that was evicted, or -1. */
  evicted: number;
  /** True when the evicted line was dirty and had to be written back. */
  writeback: boolean;
}

/** The real cache. Lines are memory line numbers (address >> offset bits). */
export class Cache {
  readonly sets: number;
  readonly ways: number;
  readonly lines: Float64Array;
  readonly dirty: Uint8Array;
  /** LRU: time of last use. FIFO: time of fill. */
  readonly stamp: Float64Array;
  /** Index of the access that brought each line in. */
  readonly filledBy: Int32Array;
  private time = 0;
  private readonly rand: () => number;

  constructor(readonly cfg: CacheConfig) {
    this.sets = sets(cfg);
    this.ways = cfg.ways;
    const n = this.sets * this.ways;
    this.lines = new Float64Array(n).fill(-1);
    this.dirty = new Uint8Array(n);
    this.stamp = new Float64Array(n);
    this.filledBy = new Int32Array(n).fill(-1);
    this.rand = mulberry32(cfg.seed);
  }

  access(addr: number, write: boolean, index: number): AccessResult {
    const line = Math.floor(addr / this.cfg.lineSize);
    const set = line % this.sets;
    const base = set * this.ways;
    this.time++;
    for (let w = 0; w < this.ways; w++) {
      if (this.lines[base + w] === line) {
        if (this.cfg.policy === 'lru') this.stamp[base + w] = this.time;
        if (write && this.cfg.writeBack) this.dirty[base + w] = 1;
        return { hit: true, set, way: w, evicted: -1, writeback: false };
      }
    }
    if (write && !this.cfg.writeAllocate) return { hit: false, set, way: -1, evicted: -1, writeback: false };
    let victim = -1;
    for (let w = 0; w < this.ways; w++) {
      if (this.lines[base + w] === -1) {
        victim = w;
        break;
      }
    }
    if (victim < 0) {
      if (this.cfg.policy === 'random') victim = Math.floor(this.rand() * this.ways);
      else {
        victim = 0;
        for (let w = 1; w < this.ways; w++) if ((this.stamp[base + w] as number) < (this.stamp[base + victim] as number)) victim = w;
      }
    }
    const slot = base + victim;
    const evicted = this.lines[slot] as number;
    const writeback = evicted >= 0 && this.dirty[slot] === 1;
    this.lines[slot] = line;
    this.dirty[slot] = write && this.cfg.writeBack ? 1 : 0;
    this.stamp[slot] = this.time;
    this.filledBy[slot] = index;
    return { hit: false, set, way: victim, evicted, writeback };
  }

  dirtyCount(): number {
    let n = 0;
    for (let i = 0; i < this.dirty.length; i++) n += this.dirty[i] as number;
    return n;
  }
}

/** Fully associative LRU cache, used as the 3C reference. */
export class FullyAssociative {
  private readonly lru = new Map<number, true>();
  constructor(
    private readonly capacity: number,
    private readonly lineSize: number,
    private readonly writeAllocate: boolean,
  ) {}
  access(addr: number, write: boolean): boolean {
    const line = Math.floor(addr / this.lineSize);
    if (this.lru.has(line)) {
      this.lru.delete(line);
      this.lru.set(line, true);
      return true;
    }
    if (write && !this.writeAllocate) return false;
    if (this.lru.size >= this.capacity) this.lru.delete(this.lru.keys().next().value as number);
    this.lru.set(line, true);
    return false;
  }
}

export const Kind = { Hit: 0, Compulsory: 1, Capacity: 2, Conflict: 3 } as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

export const KIND_NAMES = ['hit', 'compulsory', 'capacity', 'conflict'] as const;

export interface Counts {
  accesses: number;
  reads: number;
  writes: number;
  hits: number;
  misses: number;
  compulsory: number;
  capacity: number;
  conflict: number;
}

export interface SimStats extends Counts {
  missRate: number;
  /** Dirty lines written back on eviction (write-back only). */
  writebacks: number;
  /** Dirty lines still in the cache at the end (write-back only). */
  dirtyAtEnd: number;
  /** Bytes read from memory (line fills). */
  bytesIn: number;
  /** Bytes written to memory: write-backs, or every write for write-through. */
  bytesOut: number;
  perArray: Counts[];
  /** Keyed by source line. */
  perLine: Map<number, Counts>;
}

export interface SimResult {
  kinds: Uint8Array;
  stats: SimStats;
}

const zero = (): Counts => ({ accesses: 0, reads: 0, writes: 0, hits: 0, misses: 0, compulsory: 0, capacity: 0, conflict: 0 });

function count(c: Counts, write: boolean, kind: Kind): void {
  c.accesses++;
  if (write) c.writes++;
  else c.reads++;
  if (kind === Kind.Hit) c.hits++;
  else {
    c.misses++;
    if (kind === Kind.Compulsory) c.compulsory++;
    else if (kind === Kind.Capacity) c.capacity++;
    else c.conflict++;
  }
}

/** Steps a trace through the real and reference caches together. */
export class Replay {
  readonly cache: Cache;
  private readonly fa: FullyAssociative;
  private readonly seen = new Set<number>();
  pos = 0;

  constructor(
    readonly trace: Trace,
    readonly cfg: CacheConfig,
  ) {
    this.cache = new Cache(cfg);
    this.fa = new FullyAssociative(cfg.size / cfg.lineSize, cfg.lineSize, cfg.writeAllocate);
  }

  get done(): boolean {
    return this.pos >= this.trace.length;
  }

  step(): { index: number; kind: Kind; result: AccessResult } {
    const i = this.pos++;
    const addr = this.trace.addr[i] as number;
    const write = this.trace.write[i] === 1;
    const result = this.cache.access(addr, write, i);
    const faHit = this.fa.access(addr, write);
    const line = Math.floor(addr / this.cfg.lineSize);
    const first = !this.seen.has(line);
    if (first && (!write || this.cfg.writeAllocate)) this.seen.add(line);
    let kind: Kind = Kind.Hit;
    if (!result.hit) kind = first ? Kind.Compulsory : faHit ? Kind.Conflict : Kind.Capacity;
    return { index: i, kind, result };
  }
}

export function simulate(trace: Trace, cfg: CacheConfig): SimResult {
  const r = new Replay(trace, cfg);
  const kinds = new Uint8Array(trace.length);
  const total = zero();
  const perArray = trace.arrays.map(zero);
  const perLine = new Map<number, Counts>();
  let writebacks = 0;
  let fills = 0;
  while (!r.done) {
    const { index, kind, result } = r.step();
    kinds[index] = kind;
    const write = trace.write[index] === 1;
    count(total, write, kind);
    count(perArray[trace.array[index] as number] as Counts, write, kind);
    const ln = trace.line[index] as number;
    let c = perLine.get(ln);
    if (!c) perLine.set(ln, (c = zero()));
    count(c, write, kind);
    if (result.writeback) writebacks++;
    if (!result.hit && result.way >= 0) fills++;
  }
  const dirtyAtEnd = cfg.writeBack ? r.cache.dirtyCount() : 0;
  return {
    kinds,
    stats: {
      ...total,
      missRate: total.accesses ? total.misses / total.accesses : 0,
      writebacks,
      dirtyAtEnd,
      bytesIn: fills * cfg.lineSize,
      bytesOut: cfg.writeBack ? writebacks * cfg.lineSize : countWriteBytes(trace),
      perArray,
      perLine,
    },
  };
}

function countWriteBytes(trace: Trace): number {
  let n = 0;
  for (let i = 0; i < trace.length; i++) if (trace.write[i] === 1) n += (trace.arrays[trace.array[i] as number] as { elemSize: number }).elemSize;
  return n;
}
