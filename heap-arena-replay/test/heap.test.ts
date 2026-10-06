import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, Heap, SEG_CLASSES, adjustedSize, classOf, classRange, hex, minBlock, validateConfig, type HeapConfig } from '../src/core/heap';

const cfg = (patch: Partial<HeapConfig> = {}): HeapConfig => ({ ...DEFAULT_CONFIG, heapSize: 256, ...patch });

describe('sizes and classes', () => {
  it('rounds requests up to aligned blocks with header and footer', () => {
    expect(adjustedSize(1, cfg())).toBe(16);
    expect(adjustedSize(8, cfg())).toBe(16);
    expect(adjustedSize(9, cfg())).toBe(24);
    expect(adjustedSize(24, cfg())).toBe(32);
    expect(adjustedSize(60, cfg())).toBe(72);
    expect(adjustedSize(1, cfg({ word: 8 }))).toBe(32);
    expect(adjustedSize(17, cfg({ word: 8 }))).toBe(48);
    expect(minBlock(cfg({ word: 8 }))).toBe(32);
  });

  it('maps sizes to power-of-two classes', () => {
    expect(classOf(16, cfg())).toBe(0);
    expect(classOf(31, cfg())).toBe(0);
    expect(classOf(32, cfg())).toBe(1);
    expect(classOf(64, cfg())).toBe(2);
    expect(classOf(1 << 20, cfg())).toBe(SEG_CLASSES - 1);
    expect(classRange(0, cfg())).toEqual([16, 31]);
    expect(classRange(SEG_CLASSES - 1, cfg())).toEqual([16 * 2 ** (SEG_CLASSES - 1), null]);
  });

  it('validates configs', () => {
    expect(validateConfig(cfg())).toBeNull();
    expect(validateConfig(cfg({ heapSize: 20 }))).toMatch(/at least/);
    expect(validateConfig(cfg({ heapSize: 100 }))).toMatch(/multiple of 8/);
    expect(validateConfig(cfg({ heapSize: 1 << 20 }))).toMatch(/at most/);
    expect(validateConfig(cfg({ heapSize: 64.5 }))).toMatch(/integer/);
    expect(validateConfig({ ...cfg(), word: 2 as unknown as 4 })).toMatch(/word size/);
    expect(() => new Heap(cfg({ heapSize: 100 }))).toThrow();
    expect(hex(255)).toBe('0xff');
  });
});

describe('fresh heap', () => {
  it('has a prologue, one free block and an epilogue', () => {
    const h = new Heap(cfg());
    expect(h.get(4)).toBe(8 | 1);
    expect(h.get(8)).toBe(8 | 1);
    expect(h.get(252)).toBe(1);
    const blocks = h.blocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ addr: 12, bp: 16, size: 240, alloc: false });
    expect(h.metrics().largestFree).toBe(240);
    expect(h.check()).toEqual([]);
  });

  it('keeps first payload aligned for 8-byte words', () => {
    const h = new Heap(cfg({ word: 8 }));
    expect(h.blocks()[0].bp).toBe(32);
    expect(h.blocks()[0].size).toBe(256 - 32);
    expect(h.malloc(0, 1).result).toBe(32);
    expect(h.malloc(1, 1).result).toBe(64);
    expect(h.check()).toEqual([]);
  });
});

describe('malloc and free, implicit first-fit', () => {
  it('splits, pads and reports what it examined', () => {
    const h = new Heap(cfg());
    const a = h.malloc(0, 24);
    expect(a.result).toBe(16);
    expect(a.asize).toBe(32);
    expect(a.found).toEqual({ bp: 16, size: 240 });
    expect(a.split).toEqual({ bp: 48, size: 208 });
    expect(a.examined).toEqual([{ bp: 16, size: 240 }]);
    const b = h.malloc(1, 60);
    expect(b.result).toBe(48);
    expect(b.asize).toBe(72);
    const blocks = h.blocks();
    expect(blocks.map((x) => [x.bp, x.size, x.alloc])).toEqual([
      [16, 32, true],
      [48, 72, true],
      [120, 136, false],
    ]);
    expect(blocks[1].req).toBe(60);
    expect(blocks[1].id).toBe(1);
    const m = h.metrics();
    expect(m.allocatedBytes).toBe(104);
    expect(m.payloadBytes).toBe(84);
    expect(m.freeBlocks).toBe(1);
    expect(m.utilization).toBeCloseTo(84 / 256);
    expect(m.internalFragmentation).toBeCloseTo(20 / 104);
    expect(m.externalFragmentation).toBe(0);
    expect(h.check()).toEqual([]);
  });

  it('does not split when the remainder is below the minimum block', () => {
    const h = new Heap(cfg({ heapSize: 64 }));
    // 48 usable bytes; a 40-byte block leaves 8, too small to split.
    const e = h.malloc(0, 36);
    expect(e.asize).toBe(48);
    expect(e.split).toBeUndefined();
    expect(h.blocks()[0].size).toBe(48);
    expect(h.check()).toEqual([]);
  });

  it('returns NULL and reports the examined blocks when nothing fits', () => {
    const h = new Heap(cfg());
    h.malloc(0, 100);
    const e = h.malloc(1, 200);
    expect(e.result).toBeNull();
    expect(e.error).toMatch(/NULL/);
    expect(e.examined).toEqual([{ bp: 128, size: 128 }]);
    expect(h.live.size).toBe(1);
  });

  it('rejects bad requests and double allocation of an id', () => {
    const h = new Heap(cfg());
    expect(h.malloc(0, 0).error).toMatch(/positive/);
    expect(h.malloc(0, 2.5).error).toMatch(/positive/);
    h.malloc(0, 8);
    expect(h.malloc(0, 8).error).toMatch(/already/);
    expect(h.free(7).error).toMatch(/not allocated/);
    expect(h.free(0).error).toBeUndefined();
    expect(h.free(0).error).toMatch(/double free/);
  });

  it('covers all four coalescing cases', () => {
    const h = new Heap(cfg());
    for (let i = 0; i < 6; i += 1) h.malloc(i, 16);
    const f1 = h.free(1);
    expect(f1).toMatchObject({ merged: 1, prevFree: false, nextFree: false, resultBp: 40, resultSize: 24 });
    const f3 = h.free(3);
    expect(f3.merged).toBe(1);
    const f2 = h.free(2);
    expect(f2).toMatchObject({ merged: 3, prevFree: true, nextFree: true, resultBp: 40, resultSize: 72 });
    const f5 = h.free(5);
    expect(f5).toMatchObject({ merged: 2, prevFree: false, nextFree: true, resultBp: 136 });
    const f4 = h.free(4);
    expect(f4).toMatchObject({ merged: 3, resultBp: 40 });
    const f0 = h.free(0);
    expect(f0).toMatchObject({ merged: 2, prevFree: false, nextFree: true, resultBp: 16, resultSize: 240 });
    expect(h.blocks()).toHaveLength(1);
    expect(h.check()).toEqual([]);
  });

  it('case 3 merges with the previous block only', () => {
    const h = new Heap(cfg());
    h.malloc(0, 16);
    h.malloc(1, 16);
    h.malloc(2, 16);
    h.free(0);
    const f = h.free(1);
    expect(f).toMatchObject({ merged: 2, prevFree: true, nextFree: false, resultBp: 16, resultSize: 48 });
    expect(h.check()).toEqual([]);
  });
});

describe('placement policies', () => {
  function holes(): Heap {
    // Layout: p0 (64) | p1 (16) | p2 (32) | p3 (16) | tail; then free p0 and p2.
    const h = new Heap(cfg());
    h.malloc(0, 56);
    h.malloc(1, 8);
    h.malloc(2, 24);
    h.malloc(3, 8);
    h.free(0);
    h.free(2);
    return h;
  }

  it('first-fit takes the first hole, best-fit the tightest, worst-fit the largest', () => {
    const first = holes();
    expect(first.malloc(4, 24).result).toBe(16);
    const best = holes();
    best.switchPolicy({ fit: 'best' });
    const e = best.malloc(4, 24);
    expect(e.result).toBe(96);
    expect(e.examined.map((x) => x.bp)).toEqual([16, 96]);
    const worst = holes();
    worst.switchPolicy({ fit: 'worst' });
    expect(worst.malloc(4, 24).result).toBe(144);
    expect(worst.malloc(5, 24).examined.length).toBeGreaterThan(0);
  });

  it('best-fit stops early on an exact fit', () => {
    const h = holes();
    h.switchPolicy({ fit: 'best' });
    const e = h.malloc(4, 56);
    expect(e.result).toBe(16);
    expect(e.examined).toHaveLength(1);
  });

  it('next-fit resumes at the rover and wraps around', () => {
    const h = new Heap(cfg({ fit: 'next' }));
    h.malloc(0, 8);
    h.malloc(1, 8);
    h.malloc(2, 8);
    h.free(1);
    // Rover sits after p2; next-fit carves fresh space instead of reusing p1's hole.
    const e = h.malloc(3, 8);
    expect(e.result).toBe(64);
    expect(e.examined[0].bp).toBe(64);
    // Leave a 16-byte sliver at the end, free p0 so the hole at 16 grows to 32,
    // then a 32-byte request must pass the sliver and wrap to the front.
    h.malloc(4, 150);
    expect(h.rover).toBe(240);
    h.free(0);
    const wrap = h.malloc(5, 20);
    expect(wrap.result).toBe(16);
    expect(wrap.examined.map((x) => x.bp)).toEqual([240, 16]);
    expect(h.check()).toEqual([]);
  });

  it('next-fit rover resets when its block is merged away', () => {
    const h = new Heap(cfg({ fit: 'next' }));
    h.malloc(0, 8);
    h.malloc(1, 8);
    h.malloc(2, 8);
    expect(h.rover).toBe(64);
    h.free(1);
    h.free(2);
    expect(h.rover).toBe(32);
    h.free(0);
    expect(h.rover).toBe(16);
    expect(h.check()).toEqual([]);
  });

  it('rover moves to the first block when an exact fit is the last block', () => {
    const h = new Heap(cfg({ heapSize: 64, fit: 'next' }));
    h.malloc(0, 44);
    expect(h.rover).toBe(16);
  });
});

describe('explicit free list', () => {
  it('keeps pred and succ pointers in payload words with LIFO insertion', () => {
    const h = new Heap(cfg({ list: 'explicit' }));
    expect(h.freeLists()).toEqual([[16]]);
    for (let i = 0; i < 4; i += 1) h.malloc(i, 16);
    h.free(0);
    h.free(2);
    expect(h.freeLists()[0]).toEqual([64, 16, 112]);
    const blocks = h.blocks();
    const b64 = blocks.find((b) => b.bp === 64)!;
    expect(b64.pred).toBe(0);
    expect(b64.succ).toBe(16);
    expect(h.get(16)).toBe(64); // pred of block 16
    expect(h.get(20)).toBe(112); // succ of block 16
    expect(h.check()).toEqual([]);
    expect(h.malloc(4, 16).result).toBe(64);
    expect(h.freeLists()[0]).toEqual([16, 112]);
  });

  it('address-ordered insertion keeps the list sorted', () => {
    const h = new Heap(cfg({ list: 'explicit', insert: 'address' }));
    for (let i = 0; i < 5; i += 1) h.malloc(i, 16);
    h.free(3);
    h.free(0);
    h.free(2);
    expect(h.freeLists()[0]).toEqual([16, 64, 136]);
    expect(h.check()).toEqual([]);
  });

  it('best-fit walks the whole list and next-fit degrades to first-fit', () => {
    const h = new Heap(cfg({ list: 'explicit', fit: 'best' }));
    h.malloc(0, 56);
    h.malloc(1, 8);
    h.malloc(2, 24);
    h.malloc(3, 8);
    h.free(0);
    h.free(2);
    expect(h.malloc(4, 24).result).toBe(96);
    const n = new Heap(cfg({ list: 'explicit', fit: 'next' }));
    n.malloc(0, 8);
    n.malloc(1, 8);
    n.free(0);
    expect(n.malloc(2, 8).result).toBe(16);
  });
});

describe('segregated lists', () => {
  it('routes free blocks to size classes and searches upward', () => {
    // Coalescing off so the freed blocks keep their sizes and classes.
    const h = new Heap(cfg({ list: 'segregated', heapSize: 1024, coalesce: 'none' }));
    h.malloc(0, 12); // 24 -> class 0
    h.malloc(1, 100); // 112 -> class 2
    h.malloc(2, 30); // 40 -> class 1
    h.malloc(3, 250); // 264 -> class 4
    h.free(1);
    h.free(3);
    h.free(0);
    h.free(2);
    const lists = h.freeLists();
    expect(lists[0]).toEqual([16]);
    expect(lists[1]).toEqual([152]);
    expect(lists[2]).toEqual([40]);
    expect(lists[4]).toEqual([192]);
    expect(lists[5]).toEqual([456]);
    expect(h.blocks().find((b) => b.bp === 40)!.cls).toBe(2);
    const e = h.malloc(4, 12);
    expect(e.result).toBe(16);
    expect(e.examined).toEqual([{ bp: 16, size: 24 }]);
    const f = h.malloc(5, 60);
    expect(f.result).toBe(40);
    expect(f.examined).toEqual([{ bp: 40, size: 112 }]);
    expect(h.freeLists()[1]).toEqual([112, 152]);
    // Class 2 is now empty, so a class-2 request walks up to class 4.
    const g = h.malloc(6, 100);
    expect(g.result).toBe(192);
    expect(g.examined).toEqual([{ bp: 192, size: 264 }]);
    expect(h.check()).toEqual([]);
  });

  it('best and worst fit within classes', () => {
    const b = new Heap(cfg({ list: 'segregated', fit: 'best', heapSize: 1024 }));
    b.malloc(0, 40);
    b.malloc(1, 8);
    b.malloc(2, 28);
    b.malloc(3, 8);
    b.free(0);
    b.free(2);
    expect(b.malloc(4, 28).result).toBe(80);
    const w = new Heap(cfg({ list: 'segregated', fit: 'worst', heapSize: 1024 }));
    w.malloc(0, 40);
    w.malloc(1, 8);
    w.malloc(2, 28);
    w.malloc(3, 8);
    w.free(0);
    w.free(2);
    expect(w.malloc(4, 28).result).toBe(16);
    w.switchPolicy({ fit: 'next' });
    expect(w.malloc(5, 28).result).toBe(80);
  });
});

describe('coalescing modes', () => {
  it('no coalescing leaves neighbours apart and check() reports nothing wrong', () => {
    const h = new Heap(cfg({ coalesce: 'none' }));
    h.malloc(0, 16);
    h.malloc(1, 16);
    h.free(0);
    const f = h.free(1);
    expect(f.merged).toBe(1);
    expect(h.blocks().filter((b) => !b.alloc)).toHaveLength(3);
    expect(h.check()).toEqual([]);
    expect(h.malloc(2, 40).result).toBe(64);
  });

  it('deferred coalescing sweeps only when a malloc fails', () => {
    const h = new Heap(cfg({ coalesce: 'deferred', list: 'explicit' }));
    for (let i = 0; i < 6; i += 1) h.malloc(i, 24);
    for (let i = 0; i < 6; i += 1) h.free(i);
    expect(h.blocks()).toHaveLength(7);
    const e = h.malloc(6, 150);
    expect(e.deferredMerges).toBe(6);
    expect(e.result).toBe(16);
    expect(h.blocks()).toHaveLength(2);
    expect(h.check()).toEqual([]);
    const fail = h.malloc(7, 500);
    expect(fail.deferredMerges).toBe(0);
    expect(fail.result).toBeNull();
  });
});

describe('realloc', () => {
  it('keeps, shrinks, absorbs and moves', () => {
    const h = new Heap(cfg());
    h.malloc(0, 40);
    h.malloc(1, 8);
    const keep = h.realloc(0, 30);
    expect(keep.strategy).toBe('keep');
    expect(keep.result).toBe(16);
    const shrink = h.realloc(0, 20);
    expect(shrink.strategy).toBe('shrink');
    expect(h.blocks().map((b) => [b.bp, b.size, b.alloc])).toEqual([
      [16, 32, true],
      [48, 16, false],
      [64, 16, true],
      [80, 176, false],
    ]);
    const absorb = h.realloc(0, 40);
    expect(absorb.strategy).toBe('absorb');
    expect(absorb.result).toBe(16);
    expect(h.blocks()[0].size).toBe(48);
    h.malloc(2, 8);
    const move = h.realloc(0, 80);
    expect(move.strategy).toBe('move');
    expect(move.result).toBe(96);
    expect(h.blocks()[0].alloc).toBe(false);
    expect(h.live.get(0)).toEqual({ bp: 96, req: 80 });
    expect(h.check()).toEqual([]);
  });

  it('absorbs without a remainder and reports failures', () => {
    const h = new Heap(cfg({ heapSize: 64 }));
    h.malloc(0, 8);
    const abs = h.realloc(0, 40);
    expect(abs.strategy).toBe('absorb');
    expect(h.blocks()).toHaveLength(1);
    const fail = h.realloc(0, 60);
    expect(fail.strategy).toBe('fail');
    expect(fail.error).toMatch(/NULL/);
    expect(h.live.get(0)!.req).toBe(40);
    expect(h.realloc(9, 8).error).toMatch(/not allocated/);
    expect(h.realloc(0, 0).error).toMatch(/positive/);
  });

  it('absorb keeps the rover valid under next-fit', () => {
    const h = new Heap(cfg({ fit: 'next' }));
    h.malloc(0, 8);
    expect(h.rover).toBe(32);
    const e = h.realloc(0, 40);
    expect(e.strategy).toBe('absorb');
    expect(h.rover).toBe(16);
  });
});

describe('policy switching and cloning', () => {
  it('rebuilds free lists in address order after a switch', () => {
    const h = new Heap(cfg());
    for (let i = 0; i < 4; i += 1) h.malloc(i, 16);
    h.free(2);
    h.free(0);
    h.switchPolicy({ list: 'explicit' });
    expect(h.freeLists()[0]).toEqual([16, 64, 112]);
    expect(h.check()).toEqual([]);
    h.switchPolicy({ list: 'segregated' });
    expect(h.freeLists()[0]).toEqual([16, 64]);
    expect(h.check()).toEqual([]);
    h.switchPolicy({ list: 'implicit', fit: 'next' });
    expect(h.freeLists()[0]).toEqual([16, 64, 112]);
  });

  it('clone is independent', () => {
    const h = new Heap(cfg({ list: 'explicit' }));
    h.malloc(0, 8);
    const c = h.clone();
    c.malloc(1, 8);
    expect(h.live.size).toBe(1);
    expect(c.live.size).toBe(2);
    expect(c.blocks()).toHaveLength(3);
  });

  it('check() flags corrupted memory', () => {
    const h = new Heap(cfg({ list: 'explicit' }));
    h.malloc(0, 8);
    h.put(12, h.pack(16, true) + 0); // fine
    h.put(24, 0); // footer no longer matches header
    expect(h.check().some((e) => /header and footer differ/.test(e))).toBe(true);
    const g = new Heap(cfg({ list: 'explicit' }));
    g.malloc(0, 8);
    g.heads[0] = 16; // points at an allocated block
    expect(g.check().some((e) => /not a free block/.test(e))).toBe(true);
    const s = new Heap(cfg({ list: 'segregated' }));
    s.malloc(0, 8);
    s.heads[0] = s.heads[3];
    s.heads[3] = 0;
    expect(s.check().some((e) => /wrong size class/.test(e))).toBe(true);
    s.heads[0] = 0;
    expect(s.check().some((e) => /missing from the free lists/.test(e))).toBe(true);
  });
});
