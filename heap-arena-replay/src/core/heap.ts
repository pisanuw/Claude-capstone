// Word-accurate heap simulator in the style of the CS:APP implicit-list
// allocator (header and footer boundary tags, prologue and epilogue blocks),
// extended with explicit and segregated free lists whose pred/succ pointers
// live in the payload words of free blocks, exactly as a real allocator keeps
// them. All sizes and addresses are byte offsets from the start of the arena.

export type Fit = 'first' | 'next' | 'best' | 'worst';
export type ListKind = 'implicit' | 'explicit' | 'segregated';
export type Coalesce = 'immediate' | 'deferred' | 'none';
export type Insert = 'lifo' | 'address';

export interface HeapConfig {
  /** Header, footer and pointer size in bytes. Alignment is 2 * word. */
  word: 4 | 8;
  /** Arena size in bytes. Must be a multiple of 2 * word and at least 8 * word. */
  heapSize: number;
  list: ListKind;
  fit: Fit;
  coalesce: Coalesce;
  /** Free-list insertion order (explicit and segregated lists only). */
  insert: Insert;
}

export const DEFAULT_CONFIG: HeapConfig = {
  word: 4,
  heapSize: 512,
  list: 'implicit',
  fit: 'first',
  coalesce: 'immediate',
  insert: 'lifo',
};

export const MAX_HEAP = 65536;

/** Size classes for the segregated list: [min, 2*min), [2*min, 4*min), ... */
export const SEG_CLASSES = 8;

export interface Block {
  /** Address of the header word. */
  addr: number;
  /** Address of the payload (what malloc returns). */
  bp: number;
  /** Whole block size in bytes, header and footer included. */
  size: number;
  alloc: boolean;
  /** Requested payload bytes for an allocated block. */
  req?: number;
  /** Trace id for an allocated block. */
  id?: number;
  /** Free-list links (explicit/segregated lists, free blocks only). */
  pred?: number;
  succ?: number;
  /** Size class (segregated lists, free blocks only). */
  cls?: number;
}

export interface Metrics {
  heapSize: number;
  /** Bytes in allocated blocks, headers and footers included. */
  allocatedBytes: number;
  /** Requested payload bytes currently live. */
  payloadBytes: number;
  freeBytes: number;
  allocatedBlocks: number;
  freeBlocks: number;
  largestFree: number;
  /** payloadBytes / heapSize. */
  utilization: number;
  /** 1 - largestFree / freeBytes (0 when nothing is free). */
  externalFragmentation: number;
  /** (allocatedBytes - payloadBytes) / allocatedBytes (0 when nothing is allocated). */
  internalFragmentation: number;
}

export interface Examined {
  bp: number;
  size: number;
}

export interface MallocEvent {
  kind: 'malloc';
  id: number;
  req: number;
  asize: number;
  examined: Examined[];
  found?: { bp: number; size: number };
  split?: { bp: number; size: number };
  /** Blocks merged by a deferred coalescing sweep before a retry. */
  deferredMerges?: number;
  /** Payload address, or null when no block fits. */
  result: number | null;
  error?: string;
}

export interface FreeEvent {
  kind: 'free';
  id: number;
  bp: number;
  size: number;
  prevFree: boolean;
  nextFree: boolean;
  /** How many free blocks are merged into one by this free (1 when none). */
  merged: number;
  resultBp: number;
  resultSize: number;
  error?: string;
}

export interface ReallocEvent {
  kind: 'realloc';
  id: number;
  req: number;
  asize: number;
  oldBp: number;
  oldSize: number;
  strategy: 'keep' | 'shrink' | 'absorb' | 'move' | 'fail';
  examined: Examined[];
  result: number | null;
  error?: string;
}

export type Event = MallocEvent | FreeEvent | ReallocEvent;

export function alignment(cfg: Pick<HeapConfig, 'word'>): number {
  return cfg.word * 2;
}

export function minBlock(cfg: Pick<HeapConfig, 'word'>): number {
  return cfg.word * 4;
}

/** Block size needed for a payload request: header + payload + footer, aligned. */
export function adjustedSize(req: number, cfg: Pick<HeapConfig, 'word'>): number {
  const align = alignment(cfg);
  const raw = Math.ceil((req + 2 * cfg.word) / align) * align;
  return Math.max(minBlock(cfg), raw);
}

export function classOf(size: number, cfg: Pick<HeapConfig, 'word'>): number {
  const min = minBlock(cfg);
  let cls = 0;
  let bound = min * 2;
  while (size >= bound && cls < SEG_CLASSES - 1) {
    cls += 1;
    bound *= 2;
  }
  return cls;
}

export function classRange(cls: number, cfg: Pick<HeapConfig, 'word'>): [number, number | null] {
  const min = minBlock(cfg);
  const lo = min * 2 ** cls;
  return cls === SEG_CLASSES - 1 ? [lo, null] : [lo, lo * 2 - 1];
}

export function validateConfig(cfg: HeapConfig): string | null {
  if (cfg.word !== 4 && cfg.word !== 8) return 'word size must be 4 or 8';
  if (!Number.isInteger(cfg.heapSize)) return 'heap size must be an integer';
  if (cfg.heapSize < 8 * cfg.word) return `heap size must be at least ${8 * cfg.word} bytes`;
  if (cfg.heapSize > MAX_HEAP) return `heap size must be at most ${MAX_HEAP} bytes`;
  if (cfg.heapSize % alignment(cfg) !== 0) return `heap size must be a multiple of ${alignment(cfg)}`;
  return null;
}

export function hex(addr: number): string {
  return '0x' + addr.toString(16);
}

export class Heap {
  readonly cfg: HeapConfig;
  /** One entry per word; header/footer words hold size | alloc, pointer words hold addresses. */
  mem: Int32Array;
  /** Next-fit rover: payload address of the block where the next search starts. */
  rover: number;
  /** Free-list heads (payload addresses, 0 = null). One for explicit, SEG_CLASSES for segregated. */
  heads: number[];
  /** Trace id -> live allocation. */
  live = new Map<number, { bp: number; req: number }>();
  /** Payload address -> trace id and requested size. */
  reqAt = new Map<number, { id: number; req: number }>();

  constructor(cfg: HeapConfig) {
    const err = validateConfig(cfg);
    if (err) throw new Error(err);
    this.cfg = { ...cfg };
    const w = cfg.word;
    this.mem = new Int32Array(cfg.heapSize / w);
    // Padding word, prologue header, prologue footer, then one big free block, then epilogue.
    this.put(w, this.pack(2 * w, true));
    this.put(2 * w, this.pack(2 * w, true));
    const first = 4 * w;
    const size = cfg.heapSize - 4 * w;
    this.put(this.hdr(first), this.pack(size, false));
    this.put(this.ftr(first, size), this.pack(size, false));
    this.put(cfg.heapSize - w, this.pack(0, true));
    this.rover = first;
    this.heads = new Array(cfg.list === 'segregated' ? SEG_CLASSES : 1).fill(0);
    this.insertFree(first);
  }

  clone(): Heap {
    const h = Object.create(Heap.prototype) as Heap;
    Object.assign(h, {
      cfg: { ...this.cfg },
      mem: this.mem.slice(),
      rover: this.rover,
      heads: this.heads.slice(),
      live: new Map([...this.live].map(([k, v]) => [k, { ...v }])),
      reqAt: new Map([...this.reqAt].map(([k, v]) => [k, { ...v }])),
    });
    return h;
  }

  // ---- word access -------------------------------------------------------

  get(addr: number): number {
    return this.mem[addr / this.cfg.word];
  }

  put(addr: number, value: number): void {
    this.mem[addr / this.cfg.word] = value;
  }

  pack(size: number, alloc: boolean): number {
    return size | (alloc ? 1 : 0);
  }

  hdr(bp: number): number {
    return bp - this.cfg.word;
  }

  ftr(bp: number, size = this.size(bp)): number {
    return bp + size - 2 * this.cfg.word;
  }

  size(bp: number): number {
    return this.get(this.hdr(bp)) & ~1;
  }

  isAlloc(bp: number): boolean {
    return (this.get(this.hdr(bp)) & 1) === 1;
  }

  nextBp(bp: number): number {
    return bp + this.size(bp);
  }

  prevBp(bp: number): number {
    const prevSize = this.get(bp - 2 * this.cfg.word) & ~1;
    return bp - prevSize;
  }

  /** Payload address of the first real block (after the prologue). */
  firstBp(): number {
    return 4 * this.cfg.word;
  }

  /** True for the epilogue header (size 0). */
  isEpilogue(bp: number): boolean {
    return this.size(bp) === 0;
  }

  predOf(bp: number): number {
    return this.get(bp);
  }

  succOf(bp: number): number {
    return this.get(bp + this.cfg.word);
  }

  private setPred(bp: number, v: number): void {
    this.put(bp, v);
  }

  private setSucc(bp: number, v: number): void {
    this.put(bp + this.cfg.word, v);
  }

  // ---- views -------------------------------------------------------------

  /** Every real block in address order (prologue and epilogue excluded). */
  blocks(): Block[] {
    const out: Block[] = [];
    const seg = this.cfg.list === 'segregated';
    const linked = this.cfg.list !== 'implicit';
    for (let bp = this.firstBp(); !this.isEpilogue(bp); bp = this.nextBp(bp)) {
      const size = this.size(bp);
      const alloc = this.isAlloc(bp);
      const b: Block = { addr: this.hdr(bp), bp, size, alloc };
      if (alloc) {
        const r = this.reqAt.get(bp);
        if (r) {
          b.req = r.req;
          b.id = r.id;
        }
      } else if (linked) {
        b.pred = this.predOf(bp);
        b.succ = this.succOf(bp);
        if (seg) b.cls = classOf(size, this.cfg);
      }
      out.push(b);
    }
    return out;
  }

  /** Free-list contents in list order, one array per list. */
  freeLists(): number[][] {
    if (this.cfg.list === 'implicit') {
      return [this.blocks().filter((b) => !b.alloc).map((b) => b.bp)];
    }
    return this.heads.map((head) => {
      const out: number[] = [];
      for (let bp = head; bp !== 0 && out.length <= this.mem.length; bp = this.succOf(bp)) out.push(bp);
      return out;
    });
  }

  metrics(): Metrics {
    let allocatedBytes = 0;
    let payloadBytes = 0;
    let freeBytes = 0;
    let allocatedBlocks = 0;
    let freeBlocks = 0;
    let largestFree = 0;
    for (const b of this.blocks()) {
      if (b.alloc) {
        allocatedBytes += b.size;
        payloadBytes += b.req ?? 0;
        allocatedBlocks += 1;
      } else {
        freeBytes += b.size;
        freeBlocks += 1;
        largestFree = Math.max(largestFree, b.size);
      }
    }
    const heapSize = this.cfg.heapSize;
    return {
      heapSize,
      allocatedBytes,
      payloadBytes,
      freeBytes,
      allocatedBlocks,
      freeBlocks,
      largestFree,
      utilization: payloadBytes / heapSize,
      externalFragmentation: freeBytes > 0 ? 1 - largestFree / freeBytes : 0,
      internalFragmentation: allocatedBytes > 0 ? (allocatedBytes - payloadBytes) / allocatedBytes : 0,
    };
  }

  // ---- free-list maintenance ---------------------------------------------

  private listIndex(bp: number): number {
    return this.cfg.list === 'segregated' ? classOf(this.size(bp), this.cfg) : 0;
  }

  insertFree(bp: number): void {
    if (this.cfg.list === 'implicit') return;
    const li = this.listIndex(bp);
    const head = this.heads[li];
    if (this.cfg.insert === 'lifo' || head === 0 || head > bp) {
      this.setPred(bp, 0);
      this.setSucc(bp, head);
      if (head !== 0) this.setPred(head, bp);
      this.heads[li] = bp;
      return;
    }
    // Address-ordered: walk to the last node with a smaller address.
    let cur = head;
    while (this.succOf(cur) !== 0 && this.succOf(cur) < bp) cur = this.succOf(cur);
    const next = this.succOf(cur);
    this.setPred(bp, cur);
    this.setSucc(bp, next);
    this.setSucc(cur, bp);
    if (next !== 0) this.setPred(next, bp);
  }

  removeFree(bp: number): void {
    if (this.cfg.list === 'implicit') return;
    const li = this.listIndex(bp);
    const pred = this.predOf(bp);
    const succ = this.succOf(bp);
    if (pred !== 0) this.setSucc(pred, succ);
    else this.heads[li] = succ;
    if (succ !== 0) this.setPred(succ, pred);
    this.setPred(bp, 0);
    this.setSucc(bp, 0);
  }

  /** Rebuild every free list from a heap walk (used after a policy switch). */
  rebuildFreeLists(): void {
    this.heads = new Array(this.cfg.list === 'segregated' ? SEG_CLASSES : 1).fill(0);
    const free: number[] = [];
    for (let bp = this.firstBp(); !this.isEpilogue(bp); bp = this.nextBp(bp)) {
      if (!this.isAlloc(bp)) free.push(bp);
    }
    // Insert highest address first so a LIFO list reads in address order.
    for (let i = free.length - 1; i >= 0; i -= 1) this.insertFree(free[i]);
    if (this.isAlloc(this.rover) || this.isEpilogue(this.rover)) this.rover = this.firstBp();
  }

  /** Switch policy in place, keeping every block where it is. */
  switchPolicy(patch: Partial<Pick<HeapConfig, 'list' | 'fit' | 'coalesce' | 'insert'>>): void {
    Object.assign(this.cfg, patch);
    this.rebuildFreeLists();
  }

  // ---- searching ---------------------------------------------------------

  private pick(candidates: Iterable<number>, asize: number, fit: Fit, examined: Examined[]): number | null {
    let best: number | null = null;
    let bestSize = 0;
    for (const bp of candidates) {
      const size = this.size(bp);
      examined.push({ bp, size });
      if (size < asize) continue;
      if (fit === 'first' || fit === 'next') return bp;
      if (best === null || (fit === 'best' ? size < bestSize : size > bestSize)) {
        best = bp;
        bestSize = size;
        if (fit === 'best' && size === asize) return bp;
      }
    }
    return best;
  }

  private *implicitWalk(start: number): Generator<number> {
    for (let bp = start; !this.isEpilogue(bp); bp = this.nextBp(bp)) {
      if (!this.isAlloc(bp)) yield bp;
    }
  }

  private *listWalk(head: number): Generator<number> {
    for (let bp = head; bp !== 0; bp = this.succOf(bp)) yield bp;
  }

  private *roverWalk(): Generator<number> {
    const rover = this.rover;
    for (let bp = rover; !this.isEpilogue(bp); bp = this.nextBp(bp)) {
      if (!this.isAlloc(bp)) yield bp;
    }
    for (let bp = this.firstBp(); bp < rover; bp = this.nextBp(bp)) {
      if (!this.isAlloc(bp)) yield bp;
    }
  }

  find(asize: number, examined: Examined[]): number | null {
    const { list, fit } = this.cfg;
    if (list === 'implicit') {
      if (fit === 'next') return this.pick(this.roverWalk(), asize, 'next', examined);
      return this.pick(this.implicitWalk(this.firstBp()), asize, fit, examined);
    }
    if (list === 'explicit') {
      return this.pick(this.listWalk(this.heads[0]), asize, fit === 'next' ? 'first' : fit, examined);
    }
    const within: Fit = fit === 'best' ? 'best' : fit === 'worst' ? 'worst' : 'first';
    for (let cls = classOf(asize, this.cfg); cls < SEG_CLASSES; cls += 1) {
      const hit = this.pick(this.listWalk(this.heads[cls]), asize, within, examined);
      if (hit !== null) return hit;
    }
    return null;
  }

  // ---- placing, coalescing -----------------------------------------------

  /** Mark a free block allocated, splitting off the remainder when it can hold a block. */
  place(bp: number, asize: number): { bp: number; size: number } | undefined {
    const size = this.size(bp);
    this.removeFree(bp);
    if (size - asize >= minBlock(this.cfg)) {
      this.put(this.hdr(bp), this.pack(asize, true));
      this.put(this.ftr(bp, asize), this.pack(asize, true));
      const rest = bp + asize;
      const restSize = size - asize;
      this.put(this.hdr(rest), this.pack(restSize, false));
      this.put(this.ftr(rest, restSize), this.pack(restSize, false));
      this.insertFree(rest);
      this.rover = rest;
      return { bp: rest, size: restSize };
    }
    this.put(this.hdr(bp), this.pack(size, true));
    this.put(this.ftr(bp, size), this.pack(size, true));
    const next = this.nextBp(bp);
    this.rover = this.isEpilogue(next) ? this.firstBp() : next;
    return undefined;
  }

  /** Merge a free block with free neighbours. Returns the merged block. */
  coalesce(bp: number): { bp: number; size: number; prevFree: boolean; nextFree: boolean } {
    const prev = this.prevBp(bp);
    const next = this.nextBp(bp);
    const prevFree = !this.isAlloc(prev);
    const nextFree = !this.isAlloc(next);
    let size = this.size(bp);
    let start = bp;
    if (nextFree) {
      this.removeFree(next);
      size += this.size(next);
    }
    if (prevFree) {
      this.removeFree(prev);
      size += this.size(prev);
      start = prev;
    }
    if (prevFree || nextFree) {
      this.put(this.hdr(start), this.pack(size, false));
      this.put(this.ftr(start, size), this.pack(size, false));
      if (this.rover > start && this.rover < start + size) this.rover = start;
    }
    return { bp: start, size, prevFree, nextFree };
  }

  /** Merge every run of adjacent free blocks. Returns how many merges happened. */
  coalesceAll(): number {
    let merges = 0;
    for (let bp = this.firstBp(); !this.isEpilogue(bp); bp = this.nextBp(bp)) {
      if (this.isAlloc(bp)) continue;
      let next = this.nextBp(bp);
      while (!this.isEpilogue(next) && !this.isAlloc(next)) {
        const size = this.size(bp) + this.size(next);
        this.put(this.hdr(bp), this.pack(size, false));
        this.put(this.ftr(bp, size), this.pack(size, false));
        merges += 1;
        next = this.nextBp(bp);
      }
    }
    this.rebuildFreeLists();
    return merges;
  }

  private releaseBlock(bp: number): { bp: number; size: number; prevFree: boolean; nextFree: boolean; merged: number } {
    const size = this.size(bp);
    this.put(this.hdr(bp), this.pack(size, false));
    this.put(this.ftr(bp, size), this.pack(size, false));
    this.reqAt.delete(bp);
    if (this.cfg.coalesce === 'immediate') {
      const c = this.coalesce(bp);
      this.insertFree(c.bp);
      return { ...c, merged: 1 + (c.prevFree ? 1 : 0) + (c.nextFree ? 1 : 0) };
    }
    this.insertFree(bp);
    return { bp, size, prevFree: false, nextFree: false, merged: 1 };
  }

  // ---- the three operations ----------------------------------------------

  malloc(id: number, req: number): MallocEvent {
    const examined: Examined[] = [];
    const ev: MallocEvent = { kind: 'malloc', id, req, asize: 0, examined, result: null };
    if (!Number.isInteger(req) || req <= 0) {
      ev.error = `malloc(${req}): size must be a positive integer`;
      return ev;
    }
    if (this.live.has(id)) {
      ev.error = `id ${id} is already allocated`;
      return ev;
    }
    const asize = adjustedSize(req, this.cfg);
    ev.asize = asize;
    let bp = this.find(asize, examined);
    if (bp === null && this.cfg.coalesce === 'deferred') {
      ev.deferredMerges = this.coalesceAll();
      if (ev.deferredMerges > 0) bp = this.find(asize, examined);
    }
    if (bp === null) {
      ev.error = `no free block of ${asize} bytes: malloc returns NULL`;
      return ev;
    }
    ev.found = { bp, size: this.size(bp) };
    ev.split = this.place(bp, asize);
    this.live.set(id, { bp, req });
    this.reqAt.set(bp, { id, req });
    ev.result = bp;
    return ev;
  }

  free(id: number): FreeEvent {
    const ev: FreeEvent = {
      kind: 'free',
      id,
      bp: 0,
      size: 0,
      prevFree: false,
      nextFree: false,
      merged: 1,
      resultBp: 0,
      resultSize: 0,
    };
    const l = this.live.get(id);
    if (!l) {
      ev.error = `free(${id}): id ${id} is not allocated (double free or unknown id)`;
      return ev;
    }
    ev.bp = l.bp;
    ev.size = this.size(l.bp);
    this.live.delete(id);
    const r = this.releaseBlock(l.bp);
    ev.prevFree = r.prevFree;
    ev.nextFree = r.nextFree;
    ev.merged = r.merged;
    ev.resultBp = r.bp;
    ev.resultSize = r.size;
    return ev;
  }

  realloc(id: number, req: number): ReallocEvent {
    const examined: Examined[] = [];
    const ev: ReallocEvent = {
      kind: 'realloc',
      id,
      req,
      asize: 0,
      oldBp: 0,
      oldSize: 0,
      strategy: 'fail',
      examined,
      result: null,
    };
    const l = this.live.get(id);
    if (!l) {
      ev.error = `realloc(${id}): id ${id} is not allocated`;
      return ev;
    }
    if (!Number.isInteger(req) || req <= 0) {
      ev.error = `realloc(${req}): size must be a positive integer`;
      return ev;
    }
    const bp = l.bp;
    const oldSize = this.size(bp);
    const asize = adjustedSize(req, this.cfg);
    ev.asize = asize;
    ev.oldBp = bp;
    ev.oldSize = oldSize;
    const min = minBlock(this.cfg);
    if (asize <= oldSize) {
      if (oldSize - asize >= min) {
        // Shrink in place and release the tail.
        this.put(this.hdr(bp), this.pack(asize, true));
        this.put(this.ftr(bp, asize), this.pack(asize, true));
        const tail = bp + asize;
        const tailSize = oldSize - asize;
        this.put(this.hdr(tail), this.pack(tailSize, true));
        this.put(this.ftr(tail, tailSize), this.pack(tailSize, true));
        this.releaseBlock(tail);
        ev.strategy = 'shrink';
      } else {
        ev.strategy = 'keep';
      }
      ev.result = bp;
    } else {
      const next = this.nextBp(bp);
      if (!this.isEpilogue(next) && !this.isAlloc(next) && oldSize + this.size(next) >= asize) {
        this.removeFree(next);
        const total = oldSize + this.size(next);
        this.put(this.hdr(bp), this.pack(total, true));
        this.put(this.ftr(bp, total), this.pack(total, true));
        if (total - asize >= min) {
          this.put(this.hdr(bp), this.pack(asize, true));
          this.put(this.ftr(bp, asize), this.pack(asize, true));
          const rest = bp + asize;
          const restSize = total - asize;
          this.put(this.hdr(rest), this.pack(restSize, false));
          this.put(this.ftr(rest, restSize), this.pack(restSize, false));
          this.insertFree(rest);
        }
        if (this.rover === next) this.rover = bp;
        ev.strategy = 'absorb';
        ev.result = bp;
      } else {
        const dest = this.find(asize, examined);
        if (dest === null) {
          ev.error = `no free block of ${asize} bytes: realloc returns NULL and leaves the block in place`;
          return ev;
        }
        this.place(dest, asize);
        this.reqAt.delete(bp);
        this.live.delete(id);
        this.releaseBlock(bp);
        ev.strategy = 'move';
        ev.result = dest;
      }
    }
    const rbp = ev.result;
    this.live.set(id, { bp: rbp, req });
    this.reqAt.set(rbp, { id, req });
    return ev;
  }

  /** Consistency check: walks the heap and the free lists and reports every violation. */
  check(): string[] {
    const errs: string[] = [];
    const align = alignment(this.cfg);
    let bp = this.firstBp();
    const freeInHeap = new Set<number>();
    while (!this.isEpilogue(bp)) {
      const size = this.size(bp);
      if (bp % align !== 0) errs.push(`block at ${hex(bp)} is not ${align}-byte aligned`);
      if (size < minBlock(this.cfg) || size % align !== 0) errs.push(`block at ${hex(bp)} has bad size ${size}`);
      if (this.get(this.hdr(bp)) !== this.get(this.ftr(bp))) errs.push(`block at ${hex(bp)}: header and footer differ`);
      if (!this.isAlloc(bp)) {
        freeInHeap.add(bp);
        const next = this.nextBp(bp);
        if (this.cfg.coalesce === 'immediate' && !this.isEpilogue(next) && !this.isAlloc(next)) {
          errs.push(`free blocks at ${hex(bp)} and ${hex(next)} escaped coalescing`);
        }
      }
      if (bp + size > this.cfg.heapSize) {
        errs.push(`block at ${hex(bp)} runs past the heap end`);
        break;
      }
      bp = this.nextBp(bp);
    }
    if (this.cfg.list !== 'implicit') {
      const seen = new Set<number>();
      this.heads.forEach((head, li) => {
        let prev = 0;
        for (let cur = head; cur !== 0; cur = this.succOf(cur)) {
          if (seen.has(cur)) {
            errs.push(`free list cycle at ${hex(cur)}`);
            break;
          }
          seen.add(cur);
          if (!freeInHeap.has(cur)) errs.push(`free list entry ${hex(cur)} is not a free block`);
          if (this.predOf(cur) !== prev) errs.push(`bad pred pointer at ${hex(cur)}`);
          if (this.cfg.list === 'segregated' && classOf(this.size(cur), this.cfg) !== li) {
            errs.push(`block ${hex(cur)} (size ${this.size(cur)}) is in the wrong size class`);
          }
          prev = cur;
        }
      });
      for (const f of freeInHeap) if (!seen.has(f)) errs.push(`free block ${hex(f)} is missing from the free lists`);
    }
    return errs;
  }
}
