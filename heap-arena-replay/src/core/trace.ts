// Trace text parsing, seeded trace generation and whole-trace replay.

import { Heap, type Event, type HeapConfig, type Block, type Metrics } from './heap';

export type Op =
  | { kind: 'malloc'; id: number; size: number; line: number }
  | { kind: 'free'; id: number; line: number }
  | { kind: 'realloc'; id: number; size: number; line: number };

export interface ParsedTrace {
  ops: Op[];
  /** Returned payload addresses given in the text (student traces), by op index. */
  addresses: Map<number, number>;
  errors: string[];
}

function parseAddr(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (/^0x[0-9a-f]+$/.test(t)) return parseInt(t, 16);
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (t === 'null' || t === 'nil' || t === '0' || t === '(nil)') return 0;
  return null;
}

/**
 * Accepts the malloc-lab format (`a id size`, `f id`, `r id size`, optional
 * numeric header lines) and C-style lines (`p0 = malloc(24)`, `free(p0)`,
 * `p0 = realloc(p0, 48)`). `#` and `//` start comments. A trailing `-> addr`
 * or `= addr` column (or a bare fourth column) records the address a student
 * allocator returned, for diff mode.
 */
export function parseTrace(text: string): ParsedTrace {
  const ops: Op[] = [];
  const addresses = new Map<number, number>();
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = i + 1;
    let s = raw.replace(/(#|\/\/).*$/, '').trim();
    if (!s) return;
    let addr: number | null = null;
    const arrow = s.match(/^(.*?)\s*(?:->|=>|returns?)\s*(\S+)$/);
    if (arrow) {
      addr = parseAddr(arrow[2]);
      if (addr === null) {
        errors.push(`line ${line}: bad address "${arrow[2]}"`);
        return;
      }
      s = arrow[1].trim();
    }
    let m: RegExpMatchArray | null;
    if ((m = s.match(/^(?:a|alloc|malloc)\s+(\d+)\s+(\d+)(?:\s+(\S+))?$/i))) {
      ops.push({ kind: 'malloc', id: +m[1], size: +m[2], line });
      if (m[3] !== undefined) addr = parseAddr(m[3]);
    } else if ((m = s.match(/^(?:f|free)\s+(\d+)$/i))) {
      ops.push({ kind: 'free', id: +m[1], line });
    } else if ((m = s.match(/^(?:r|realloc)\s+(\d+)\s+(\d+)(?:\s+(\S+))?$/i))) {
      ops.push({ kind: 'realloc', id: +m[1], size: +m[2], line });
      if (m[3] !== undefined) addr = parseAddr(m[3]);
    } else if ((m = s.match(/^p?(\d+)\s*=\s*malloc\(\s*(\d+)\s*\)\s*;?$/i))) {
      ops.push({ kind: 'malloc', id: +m[1], size: +m[2], line });
    } else if ((m = s.match(/^free\(\s*p?(\d+)\s*\)\s*;?$/i))) {
      ops.push({ kind: 'free', id: +m[1], line });
    } else if ((m = s.match(/^p?(\d+)\s*=\s*realloc\(\s*p?(\d+)\s*,\s*(\d+)\s*\)\s*;?$/i))) {
      if (m[1] !== m[2]) {
        errors.push(`line ${line}: realloc must assign back to the same id (p${m[2]})`);
        return;
      }
      ops.push({ kind: 'realloc', id: +m[1], size: +m[3], line });
    } else if (/^\d+$/.test(s)) {
      return; // malloc-lab header line (heap size, ids, ops, weight)
    } else {
      errors.push(`line ${line}: cannot parse "${raw.trim()}"`);
      return;
    }
    if (addr === null && arrow === null) return;
    if (addr === null) {
      errors.push(`line ${line}: bad address`);
      return;
    }
    const op = ops[ops.length - 1];
    if (op.kind === 'free') {
      errors.push(`line ${line}: free does not return an address`);
      return;
    }
    addresses.set(ops.length - 1, addr);
  });
  return { ops, addresses, errors };
}

export function formatOp(op: Op): string {
  if (op.kind === 'malloc') return `a ${op.id} ${op.size}`;
  if (op.kind === 'free') return `f ${op.id}`;
  return `r ${op.id} ${op.size}`;
}

export function describeOp(op: Op): string {
  if (op.kind === 'malloc') return `p${op.id} = malloc(${op.size})`;
  if (op.kind === 'free') return `free(p${op.id})`;
  return `p${op.id} = realloc(p${op.id}, ${op.size})`;
}

export function formatTrace(ops: Op[]): string {
  return ops.map(formatOp).join('\n') + '\n';
}

// ---- seeded generation -----------------------------------------------------

/** Mulberry32: small, fast, deterministic. */
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

export interface GenOptions {
  ops: number;
  minSize: number;
  maxSize: number;
  /** Probability that an op frees a live block (when one exists). */
  freeRate: number;
  /** Probability that an op is a realloc of a live block. */
  reallocRate: number;
}

export const DEFAULT_GEN: GenOptions = { ops: 40, minSize: 4, maxSize: 96, freeRate: 0.4, reallocRate: 0.05 };

export function generateRandom(seed: number, opts: Partial<GenOptions> = {}): Op[] {
  const o = { ...DEFAULT_GEN, ...opts };
  const r = rng(seed);
  const ops: Op[] = [];
  const live: number[] = [];
  let nextId = 0;
  const span = Math.max(0, o.maxSize - o.minSize);
  for (let i = 0; i < o.ops; i += 1) {
    const u = r();
    if (live.length > 0 && u < o.freeRate) {
      const k = Math.floor(r() * live.length);
      const id = live.splice(k, 1)[0];
      ops.push({ kind: 'free', id, line: i + 1 });
    } else if (live.length > 0 && u < o.freeRate + o.reallocRate) {
      const id = live[Math.floor(r() * live.length)];
      ops.push({ kind: 'realloc', id, size: o.minSize + Math.floor(r() * (span + 1)), line: i + 1 });
    } else {
      const id = nextId;
      nextId += 1;
      live.push(id);
      ops.push({ kind: 'malloc', id, size: o.minSize + Math.floor(r() * (span + 1)), line: i + 1 });
    }
  }
  return ops;
}

export interface Preset {
  key: string;
  title: string;
  blurb: string;
  heapSize: number;
  text: string;
}

export const PRESETS: Preset[] = [
  {
    key: 'textbook',
    title: 'Textbook walk-through',
    blurb: 'Five mallocs, a free in the middle, and a request that only fits after coalescing.',
    heapSize: 256,
    text: [
      '# Heap of 256 bytes, 4-byte words: 240 usable.',
      'a 0 24',
      'a 1 40',
      'a 2 16',
      'a 3 8',
      'f 1',
      'f 2',
      'a 4 60   # lands in the merged hole only if free(1) and free(2) coalesced',
      'f 0',
      'a 5 120  # 152 bytes are free but the biggest hole is 120: malloc returns NULL',
      'f 3',
      'f 4',
      'a 5 120  # now it fits',
    ].join('\n'),
  },
  {
    key: 'coalesce',
    title: 'The four coalescing cases',
    blurb: 'Frees arranged so each one hits a different case: no neighbour, next, previous, both.',
    heapSize: 256,
    text: [
      'a 0 16',
      'a 1 16',
      'a 2 16',
      'a 3 16',
      'a 4 16',
      'a 5 16',
      'f 1   # case 1: both neighbours allocated, nothing merges',
      'f 3   # case 1 again',
      'f 2   # case 4: both neighbours free, three blocks become one',
      'f 5   # case 2: the tail is free, merges with the next block',
      'f 4   # case 4 again, swallowing everything after p0',
      'f 0   # case 2: everything merges back into one free block',
    ].join('\n'),
  },
  {
    key: 'first-vs-best',
    title: 'First-fit vs best-fit',
    blurb: 'Two holes of different sizes; first-fit takes the big one and later fails, best-fit does not.',
    heapSize: 192,
    text: [
      'a 0 56',
      'a 1 8',
      'a 2 24',
      'a 3 8',
      'f 0    # a 64-byte hole',
      'f 2    # a 32-byte hole',
      'a 4 24 # first-fit splits the big hole; best-fit takes the exact 32-byte one',
      'a 5 56 # only succeeds if the 64-byte hole is still whole',
    ].join('\n'),
  },
  {
    key: 'next-fit',
    title: 'Next-fit rover',
    blurb: 'Next-fit resumes after the last allocation and walks past a hole first-fit would reuse.',
    heapSize: 256,
    text: ['a 0 8', 'a 1 8', 'a 2 8', 'a 3 8', 'f 1', 'a 4 8   # first-fit reuses p1 hole, next-fit carves fresh space', 'f 3', 'a 5 8', 'a 6 140 # succeeds only if the tail was not nibbled'].join('\n'),
  },
  {
    key: 'fragment',
    title: 'External fragmentation',
    blurb: 'Alternate frees leave plenty of free bytes but no hole big enough.',
    heapSize: 384,
    text: [
      'a 0 24',
      'a 1 24',
      'a 2 24',
      'a 3 24',
      'a 4 24',
      'a 5 24',
      'a 6 24',
      'a 7 24',
      'a 8 24',
      'a 9 24',
      'f 0',
      'f 2',
      'f 4',
      'f 6',
      'f 8',
      'a 10 60 # 208 bytes are free, none contiguous: NULL under every policy',
      'f 1',
      'a 10 60 # now two holes merged',
    ].join('\n'),
  },
  {
    key: 'realloc',
    title: 'Realloc strategies',
    blurb: 'Shrink in place, absorb the free neighbour, then move when nothing adjacent is free.',
    heapSize: 256,
    text: ['a 0 40', 'a 1 8', 'r 0 20  # shrink: tail becomes a free block', 'r 0 48  # absorb: the tail comes back', 'a 2 8', 'r 0 80  # move: p0 lands in fresh space, old block freed', 'f 1'].join('\n'),
  },
  {
    key: 'segregated',
    title: 'Size classes',
    blurb: 'Mixed sizes that land in different segregated classes; compare search cost against a single list.',
    heapSize: 1024,
    text: [
      'a 0 12',
      'a 1 100',
      'a 2 30',
      'a 3 250',
      'a 4 12',
      'a 5 60',
      'f 1',
      'f 3',
      'f 0',
      'f 2',
      'a 6 12  # one list: walks big holes first; size classes: straight to the small one',
      'a 7 200',
      'a 8 90',
      'f 5',
      'f 4',
      'a 9 50',
    ].join('\n'),
  },
];

// ---- replay ------------------------------------------------------------------

export interface PolicySwitch {
  /** Op index before which the switch applies. */
  at: number;
  patch: Partial<Pick<HeapConfig, 'list' | 'fit' | 'coalesce' | 'insert'>>;
}

export interface Step {
  index: number;
  op: Op;
  event: Event;
  /** Config in force for this op. */
  cfg: HeapConfig;
  blocks: Block[];
  freeLists: number[][];
  rover: number;
  metrics: Metrics;
  /** A policy switch happened right before this op. */
  switched?: PolicySwitch['patch'];
}

export interface Run {
  cfg: HeapConfig;
  steps: Step[];
  /** State before any op. */
  initial: { blocks: Block[]; freeLists: number[][]; metrics: Metrics; rover: number };
  summary: RunSummary;
}

export interface RunSummary {
  ops: number;
  failures: number;
  firstFailure: number | null;
  errors: number;
  totalExamined: number;
  avgExamined: number;
  avgUtilization: number;
  peakUtilization: number;
  peakExternalFragmentation: number;
  finalExternalFragmentation: number;
  avgInternalFragmentation: number;
  coalesces: number;
  splits: number;
}

export function applyOp(heap: Heap, op: Op): Event {
  if (op.kind === 'malloc') return heap.malloc(op.id, op.size);
  if (op.kind === 'free') return heap.free(op.id);
  return heap.realloc(op.id, op.size);
}

export function runTrace(ops: Op[], cfg: HeapConfig, switches: PolicySwitch[] = []): Run {
  const heap = new Heap(cfg);
  const steps: Step[] = [];
  const initial = { blocks: heap.blocks(), freeLists: heap.freeLists(), metrics: heap.metrics(), rover: heap.rover };
  const sorted = [...switches].sort((a, b) => a.at - b.at);
  let si = 0;
  ops.forEach((op, index) => {
    let switched: PolicySwitch['patch'] | undefined;
    while (si < sorted.length && sorted[si].at <= index) {
      heap.switchPolicy(sorted[si].patch);
      switched = { ...(switched ?? {}), ...sorted[si].patch };
      si += 1;
    }
    const event = applyOp(heap, op);
    const step: Step = {
      index,
      op,
      event,
      cfg: { ...heap.cfg },
      blocks: heap.blocks(),
      freeLists: heap.freeLists(),
      rover: heap.rover,
      metrics: heap.metrics(),
    };
    if (switched) step.switched = switched;
    steps.push(step);
  });
  return { cfg, steps, initial, summary: summarize(steps) };
}

/** Replays the first `count` ops and returns the live heap (for word dumps). */
export function replayTo(ops: Op[], cfg: HeapConfig, count: number, switches: PolicySwitch[] = []): Heap {
  const heap = new Heap(cfg);
  const sorted = [...switches].sort((a, b) => a.at - b.at);
  let si = 0;
  for (let i = 0; i < Math.min(count, ops.length); i += 1) {
    while (si < sorted.length && sorted[si].at <= i) {
      heap.switchPolicy(sorted[si].patch);
      si += 1;
    }
    applyOp(heap, ops[i]);
  }
  return heap;
}

export function summarize(steps: Step[]): RunSummary {
  let failures = 0;
  let firstFailure: number | null = null;
  let errors = 0;
  let totalExamined = 0;
  let searches = 0;
  let utilSum = 0;
  let peakUtil = 0;
  let peakExt = 0;
  let intSum = 0;
  let coalesces = 0;
  let splits = 0;
  for (const s of steps) {
    const e = s.event;
    const noFit = e.kind !== 'free' && e.result === null && e.asize > 0 && e.error?.startsWith('no free block');
    if (noFit) {
      failures += 1;
      if (firstFailure === null) firstFailure = s.index;
    } else if (e.error) {
      errors += 1;
    }
    if (e.kind !== 'free') {
      if (e.examined.length > 0 || e.result !== null) searches += 1;
      totalExamined += e.examined.length;
    }
    if (e.kind === 'malloc' && e.split) splits += 1;
    if (e.kind === 'free' && e.merged > 1) coalesces += 1;
    utilSum += s.metrics.utilization;
    peakUtil = Math.max(peakUtil, s.metrics.utilization);
    peakExt = Math.max(peakExt, s.metrics.externalFragmentation);
    intSum += s.metrics.internalFragmentation;
  }
  const n = steps.length;
  return {
    ops: n,
    failures,
    firstFailure,
    errors,
    totalExamined,
    avgExamined: searches > 0 ? totalExamined / searches : 0,
    avgUtilization: n > 0 ? utilSum / n : 0,
    peakUtilization: peakUtil,
    peakExternalFragmentation: peakExt,
    finalExternalFragmentation: n > 0 ? steps[n - 1].metrics.externalFragmentation : 0,
    avgInternalFragmentation: n > 0 ? intSum / n : 0,
    coalesces,
    splits,
  };
}

/** Every policy combination worth comparing, with a short label. */
export interface PolicyChoice {
  key: string;
  label: string;
  patch: Pick<HeapConfig, 'list' | 'fit'>;
}

export const POLICY_CHOICES: PolicyChoice[] = [
  { key: 'implicit-first', label: 'Implicit first-fit', patch: { list: 'implicit', fit: 'first' } },
  { key: 'implicit-next', label: 'Implicit next-fit', patch: { list: 'implicit', fit: 'next' } },
  { key: 'implicit-best', label: 'Implicit best-fit', patch: { list: 'implicit', fit: 'best' } },
  { key: 'implicit-worst', label: 'Implicit worst-fit', patch: { list: 'implicit', fit: 'worst' } },
  { key: 'explicit-first', label: 'Explicit first-fit', patch: { list: 'explicit', fit: 'first' } },
  { key: 'explicit-best', label: 'Explicit best-fit', patch: { list: 'explicit', fit: 'best' } },
  { key: 'segregated-first', label: 'Segregated first-fit', patch: { list: 'segregated', fit: 'first' } },
  { key: 'segregated-best', label: 'Segregated best-fit', patch: { list: 'segregated', fit: 'best' } },
];

export function policyLabel(cfg: Pick<HeapConfig, 'list' | 'fit' | 'coalesce' | 'insert'>): string {
  const list = cfg.list === 'implicit' ? 'implicit list' : cfg.list === 'explicit' ? 'explicit list' : 'segregated lists';
  const fit = cfg.list !== 'implicit' && cfg.fit === 'next' ? 'first' : cfg.fit;
  const co = cfg.coalesce === 'immediate' ? '' : cfg.coalesce === 'deferred' ? ', deferred coalescing' : ', no coalescing';
  const ins = cfg.list === 'implicit' ? '' : cfg.insert === 'lifo' ? ', LIFO' : ', address-ordered';
  return `${fit}-fit, ${list}${ins}${co}`;
}
