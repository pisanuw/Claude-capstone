import { describe, expect, it } from 'vitest';
import {
  Cache,
  DEFAULT_CONFIG,
  FullyAssociative,
  Kind,
  Replay,
  addressBits,
  mulberry32,
  sets,
  simulate,
  validateConfig,
  type CacheConfig,
} from '../src/core/cache';
import { buildTrace, type Trace } from '../src/core/trace';

const cfg = (c: Partial<CacheConfig>): CacheConfig => ({ ...DEFAULT_CONFIG, ...c });

/** Builds a trace directly from (address, write) pairs on one big byte array. */
function rawTrace(accesses: [number, boolean][]): Trace {
  const n = accesses.length;
  return {
    arrays: [{ name: 'M', type: 'char', elemSize: 1, dims: [1 << 20], base: 0, bytes: 1 << 20, id: 0 }],
    constants: [],
    length: n,
    addr: Float64Array.from(accesses.map((a) => a[0])),
    array: new Uint16Array(n),
    elem: Uint32Array.from(accesses.map((a) => a[0])),
    write: Uint8Array.from(accesses.map((a) => (a[1] ? 1 : 0))),
    line: new Uint32Array(n).fill(1),
  };
}

/** Obviously correct reference: each set is a list ordered by recency (or fill order). */
function reference(t: Trace, c: CacheConfig): boolean[] {
  const nSets = sets(c);
  const setLists: number[][] = Array.from({ length: nSets }, () => []);
  const out: boolean[] = [];
  for (let i = 0; i < t.length; i++) {
    const line = Math.floor((t.addr[i] as number) / c.lineSize);
    const list = setLists[line % nSets] as number[];
    const at = list.indexOf(line);
    if (at >= 0) {
      if (c.policy === 'lru') list.push(...list.splice(at, 1));
      out.push(true);
      continue;
    }
    out.push(false);
    if (t.write[i] && !c.writeAllocate) continue;
    if (list.length === c.ways) list.shift();
    list.push(line);
  }
  return out;
}

describe('configuration', () => {
  it('validates geometry', () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual([]);
    expect(validateConfig(cfg({ lineSize: 24 }))).toHaveLength(1);
    expect(validateConfig(cfg({ size: 1000 }))).toHaveLength(1);
    expect(validateConfig(cfg({ ways: 3 }))).toHaveLength(1);
    expect(validateConfig(cfg({ size: 64, lineSize: 32, ways: 4 }))[0]).toMatch(/larger than the cache/);
  });

  it('computes sets and address bits', () => {
    const c = cfg({ size: 1024, lineSize: 32, ways: 2 });
    expect(sets(c)).toBe(16);
    expect(addressBits(c)).toEqual({ offset: 5, index: 4 });
  });

  it('has a deterministic seeded RNG in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 100 }, a);
    expect(xs).toEqual(Array.from({ length: 100 }, b));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('cache', () => {
  it('maps addresses to sets and evicts LRU', () => {
    const c = new Cache(cfg({ size: 128, lineSize: 16, ways: 2 })); // 4 sets
    expect(c.access(0, false, 0)).toMatchObject({ hit: false, set: 0, way: 0, evicted: -1 });
    expect(c.access(8, false, 1)).toMatchObject({ hit: true, set: 0, way: 0 });
    expect(c.access(64, false, 2)).toMatchObject({ hit: false, set: 0, way: 1 });
    expect(c.access(0, false, 3).hit).toBe(true); // line 0 is now most recent
    expect(c.access(128, false, 4)).toMatchObject({ hit: false, way: 1, evicted: 4 });
    expect(c.filledBy[1]).toBe(4);
    expect(c.access(16, false, 5)).toMatchObject({ set: 1 });
  });

  it('evicts FIFO by fill order regardless of reuse', () => {
    const c = new Cache(cfg({ size: 128, lineSize: 16, ways: 2, policy: 'fifo' }));
    c.access(0, false, 0);
    c.access(64, false, 1);
    c.access(0, false, 2);
    expect(c.access(128, false, 3).evicted).toBe(0);
  });

  it('tracks dirty lines and write-backs', () => {
    const c = new Cache(cfg({ size: 32, lineSize: 16, ways: 1 })); // 2 sets
    c.access(0, true, 0);
    expect(c.dirtyCount()).toBe(1);
    expect(c.access(32, false, 1)).toMatchObject({ evicted: 0, writeback: true });
    expect(c.access(0, false, 2)).toMatchObject({ evicted: 2, writeback: false });
    c.access(0, true, 3);
    expect(c.dirtyCount()).toBe(1);
  });

  it('does not mark lines dirty under write-through and skips allocation without write-allocate', () => {
    const wt = new Cache(cfg({ size: 32, lineSize: 16, ways: 1, writeBack: false }));
    wt.access(0, true, 0);
    expect(wt.dirtyCount()).toBe(0);
    const nwa = new Cache(cfg({ size: 32, lineSize: 16, ways: 1, writeAllocate: false }));
    expect(nwa.access(0, true, 0)).toMatchObject({ hit: false, way: -1 });
    expect(nwa.access(0, false, 1).hit).toBe(false);
    expect(nwa.access(0, true, 2).hit).toBe(true);
  });

  it('agrees with a naive reference on random traces', () => {
    const r = mulberry32(7);
    for (let trial = 0; trial < 60; trial++) {
      const c = cfg({
        size: [64, 128, 256][trial % 3] as number,
        lineSize: [8, 16][trial % 2] as number,
        ways: [1, 2, 4][Math.floor(trial / 6) % 3] as number,
        policy: trial % 4 === 0 ? 'fifo' : 'lru',
        writeAllocate: trial % 5 !== 0,
      });
      const accesses: [number, boolean][] = Array.from({ length: 400 }, () => [Math.floor(r() * 1024), r() < 0.3]);
      const t = rawTrace(accesses);
      const kinds = simulate(t, c).kinds;
      expect([...kinds].map((k) => k === Kind.Hit)).toEqual(reference(t, c));
    }
  });

  it('random replacement is reproducible per seed', () => {
    const r = mulberry32(3);
    const t = rawTrace(Array.from({ length: 500 }, () => [Math.floor(r() * 2048), false] as [number, boolean]));
    const a = simulate(t, cfg({ size: 256, lineSize: 16, ways: 4, policy: 'random', seed: 5 }));
    const b = simulate(t, cfg({ size: 256, lineSize: 16, ways: 4, policy: 'random', seed: 5 }));
    expect([...a.kinds]).toEqual([...b.kinds]);
  });
});

describe('fully associative reference', () => {
  it('is LRU over the whole capacity', () => {
    const fa = new FullyAssociative(2, 16, true);
    expect(fa.access(0, false)).toBe(false);
    expect(fa.access(16, false)).toBe(false);
    expect(fa.access(0, false)).toBe(true);
    expect(fa.access(32, false)).toBe(false); // evicts 16
    expect(fa.access(16, false)).toBe(false);
    expect(fa.access(32, true)).toBe(true);
    const nwa = new FullyAssociative(2, 16, false);
    expect(nwa.access(0, true)).toBe(false);
    expect(nwa.access(0, false)).toBe(false);
  });
});

describe('3C classification', () => {
  it('row-major walk: only compulsory misses, one per line', () => {
    const t = buildTrace('double A[32][32]; double s = 0; for (int i = 0; i < 32; i++) for (int j = 0; j < 32; j++) s += A[i][j];');
    const st = simulate(t, cfg({ size: 1024, lineSize: 32, ways: 2 })).stats;
    expect(st).toMatchObject({ accesses: 1024, misses: 256, compulsory: 256, capacity: 0, conflict: 0, hits: 768 });
    expect(st.missRate).toBe(0.25);
    expect(st.bytesIn).toBe(8192);
  });

  it('column walk over an array bigger than the cache: every access misses', () => {
    const t = buildTrace('double A[32][32]; double s = 0; for (int j = 0; j < 32; j++) for (int i = 0; i < 32; i++) s += A[i][j];');
    const st = simulate(t, cfg({ size: 1024, lineSize: 32, ways: 2 })).stats;
    expect(st.misses).toBe(1024);
    expect(st.compulsory).toBe(256);
    expect(st.compulsory + st.capacity + st.conflict).toBe(st.misses);
  });

  it('two arrays one cache-size apart in a direct-mapped cache: conflict misses, fixed by 2 ways', () => {
    const src = 'float X[256], Y[256]; float d = 0; for (int i = 0; i < 256; i++) d += X[i] * Y[i];';
    const dm = simulate(buildTrace(src), cfg({ size: 1024, lineSize: 32, ways: 1 })).stats;
    expect(dm).toMatchObject({ misses: 512, compulsory: 64, conflict: 448, capacity: 0 });
    const two = simulate(buildTrace(src), cfg({ size: 1024, lineSize: 32, ways: 2 })).stats;
    expect(two).toMatchObject({ misses: 64, conflict: 0 });
  });

  it('a second pass over data that does not fit gives capacity misses', () => {
    const src = 'int A[512]; int s = 0; for (int r = 0; r < 2; r++) for (int i = 0; i < 512; i++) s += A[i];';
    const st = simulate(buildTrace(src), cfg({ size: 1024, lineSize: 32, ways: 1024 / 32 })).stats;
    expect(st).toMatchObject({ compulsory: 64, capacity: 64, conflict: 0 });
  });

  it('counts per array, per line and memory traffic', () => {
    const src = 'int A[64], B[64];\nfor (int i = 0; i < 64; i++)\n  B[i] = A[i];';
    const wb = simulate(buildTrace(src), cfg({ size: 256, lineSize: 32, ways: 2 })).stats;
    expect(wb.perArray.map((c) => [c.reads, c.writes, c.misses])).toEqual([
      [64, 0, 8],
      [0, 64, 8],
    ]);
    expect(wb.perLine.get(3)?.accesses).toBe(128);
    expect(wb.writebacks + wb.dirtyAtEnd).toBe(8);
    expect(wb.bytesOut).toBe(wb.writebacks * 32);
    const wt = simulate(buildTrace(src), cfg({ size: 256, lineSize: 32, ways: 2, writeBack: false })).stats;
    expect(wt).toMatchObject({ writebacks: 0, dirtyAtEnd: 0, bytesOut: 256 });
    const nwa = simulate(buildTrace(src), cfg({ size: 256, lineSize: 32, ways: 2, writeAllocate: false })).stats;
    expect(nwa.perArray[1]?.misses).toBe(64);
    expect(nwa.perArray[1]?.compulsory).toBe(64);
  });

  it('every miss is exactly one of the three kinds on all presets', async () => {
    const { PRESETS } = await import('../src/core/presets');
    for (const p of PRESETS)
      for (const src of [p.a, p.b ?? ''].filter(Boolean)) {
        const st = simulate(buildTrace(src), cfg(p.cache ?? {})).stats;
        expect(st.compulsory + st.capacity + st.conflict).toBe(st.misses);
        expect(st.hits + st.misses).toBe(st.accesses);
      }
  });

  it('handles an empty trace', () => {
    const st = simulate(buildTrace('int x = 1;'), DEFAULT_CONFIG).stats;
    expect(st.missRate).toBe(0);
  });

  it('replay exposes progress', () => {
    const r = new Replay(buildTrace('int A[2]; A[0] = A[1];'), DEFAULT_CONFIG);
    expect(r.done).toBe(false);
    r.step();
    r.step();
    expect(r.done).toBe(true);
  });
});
