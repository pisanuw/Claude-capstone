import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, Heap, hex, type HeapConfig } from '../src/core/heap';
import {
  PRESETS,
  POLICY_CHOICES,
  describeOp,
  formatTrace,
  generateRandom,
  parseTrace,
  policyLabel,
  replayTo,
  rng,
  runTrace,
  summarize,
} from '../src/core/trace';
import { narrate } from '../src/core/narrate';

const cfg = (patch: Partial<HeapConfig> = {}): HeapConfig => ({ ...DEFAULT_CONFIG, heapSize: 256, ...patch });

describe('parseTrace', () => {
  it('reads malloc-lab and C-style lines, comments and headers', () => {
    const t = parseTrace(['512', '3', '5', '1', 'a 0 24', 'alloc 1 8 # comment', 'f 0', '// c', 'p2 = malloc(16);', 'free(p1)', 'p2 = realloc(p2, 40)', 'r 2 8', ''].join('\n'));
    expect(t.errors).toEqual([]);
    expect(t.ops.map(describeOp)).toEqual(['p0 = malloc(24)', 'p1 = malloc(8)', 'free(p0)', 'p2 = malloc(16)', 'free(p1)', 'p2 = realloc(p2, 40)', 'p2 = realloc(p2, 8)']);
    expect(t.ops[1].line).toBe(6);
  });

  it('records returned addresses in several spellings', () => {
    const t = parseTrace('a 0 24 -> 0x10\na 1 8 => 48\nr 1 16 returns NULL\na 2 8 0x60\nf 0');
    expect(t.errors).toEqual([]);
    expect([...t.addresses.entries()]).toEqual([
      [0, 16],
      [1, 48],
      [2, 0],
      [3, 96],
    ]);
  });

  it('reports bad lines', () => {
    const t = parseTrace('a 0 24\nbogus line\nf 0 -> 0x10\na 1 8 -> zz\np1 = realloc(p2, 8)');
    expect(t.errors).toHaveLength(4);
    expect(t.errors[0]).toMatch(/line 2/);
    expect(t.errors[1]).toMatch(/free does not return/);
    expect(t.errors[2]).toMatch(/bad address/);
    expect(t.errors[3]).toMatch(/same id/);
  });

  it('round-trips through formatTrace', () => {
    const ops = generateRandom(3, { ops: 30 });
    const again = parseTrace(formatTrace(ops));
    expect(again.errors).toEqual([]);
    expect(again.ops.map(describeOp)).toEqual(ops.map(describeOp));
  });
});

describe('generation', () => {
  it('is deterministic and never frees or reallocs a dead block', () => {
    const a = generateRandom(42, { ops: 200, freeRate: 0.5, reallocRate: 0.1 });
    const b = generateRandom(42, { ops: 200, freeRate: 0.5, reallocRate: 0.1 });
    expect(formatTrace(a)).toBe(formatTrace(b));
    const run = runTrace(a, cfg({ heapSize: 4096 }));
    expect(run.summary.errors).toBe(0);
    expect(a.some((o) => o.kind === 'free')).toBe(true);
    expect(a.some((o) => o.kind === 'realloc')).toBe(true);
    const r = rng(1);
    const v = r();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
    expect(generateRandom(1, { ops: 5, freeRate: 0, reallocRate: 0 }).every((o) => o.kind === 'malloc')).toBe(true);
  });
});

describe('presets', () => {
  it('parse and pass the heap checker under every policy', () => {
    for (const p of PRESETS) {
      const t = parseTrace(p.text);
      expect(t.errors, p.key).toEqual([]);
      for (const pc of POLICY_CHOICES) {
        for (const coalesce of ['immediate', 'deferred', 'none'] as const) {
          const c = cfg({ heapSize: p.heapSize, ...pc.patch, coalesce });
          const h = new Heap(c);
          for (const op of t.ops) {
            if (op.kind === 'malloc') h.malloc(op.id, op.size);
            else if (op.kind === 'free') h.free(op.id);
            else h.realloc(op.id, op.size);
            expect(h.check(), `${p.key} ${pc.key} ${coalesce} after ${describeOp(op)}`).toEqual([]);
          }
        }
      }
    }
  });

  it('textbook preset fails once and then succeeds after coalescing', () => {
    const t = parseTrace(PRESETS[0].text);
    const run = runTrace(t.ops, cfg({ heapSize: 256 }));
    expect(run.summary.failures).toBe(1);
    expect(run.summary.firstFailure).toBe(8);
    const last = run.steps[run.steps.length - 1].event;
    expect(last.kind === 'malloc' && last.result).toBe(16);
    const none = runTrace(t.ops, cfg({ heapSize: 256, coalesce: 'none' }));
    expect(none.summary.failures).toBe(2);
  });

  it('first-vs-best preset separates the policies', () => {
    const t = parseTrace(PRESETS.find((p) => p.key === 'first-vs-best')!.text);
    expect(runTrace(t.ops, cfg({ heapSize: 192, fit: 'first' })).summary.failures).toBe(1);
    expect(runTrace(t.ops, cfg({ heapSize: 192, fit: 'best' })).summary.failures).toBe(0);
  });

  it('next-fit preset separates the policies', () => {
    const t = parseTrace(PRESETS.find((p) => p.key === 'next-fit')!.text);
    expect(runTrace(t.ops, cfg({ fit: 'first' })).summary.failures).toBe(0);
    expect(runTrace(t.ops, cfg({ fit: 'next' })).summary.failures).toBe(1);
  });

  it('fragment preset fails under every policy until a hole merges', () => {
    const t = parseTrace(PRESETS.find((p) => p.key === 'fragment')!.text);
    for (const pc of POLICY_CHOICES) {
      const run = runTrace(t.ops, cfg({ heapSize: 384, ...pc.patch }));
      expect(run.summary.firstFailure, pc.key).toBe(15);
      expect(run.summary.failures, pc.key).toBe(1);
    }
  });
});

describe('runTrace', () => {
  it('records steps, metrics and a summary', () => {
    const t = parseTrace('a 0 24\na 1 24\nf 0\nf 1\na 2 500\nf 9');
    const run = runTrace(t.ops, cfg());
    expect(run.steps).toHaveLength(6);
    expect(run.initial.blocks).toHaveLength(1);
    expect(run.steps[2].metrics.freeBlocks).toBe(2);
    expect(run.steps[3].metrics.freeBlocks).toBe(1);
    const s = run.summary;
    expect(s.ops).toBe(6);
    expect(s.failures).toBe(1);
    expect(s.firstFailure).toBe(4);
    expect(s.errors).toBe(1);
    expect(s.splits).toBe(2);
    expect(s.coalesces).toBe(1);
    expect(s.totalExamined).toBe(3);
    expect(s.avgExamined).toBe(1);
    expect(s.peakUtilization).toBeCloseTo(48 / 256);
    expect(summarize([])).toMatchObject({ ops: 0, avgUtilization: 0, finalExternalFragmentation: 0 });
  });

  it('applies policy switches at the right op and rebuilds lists', () => {
    const t = parseTrace('a 0 56\na 1 8\na 2 24\na 3 8\nf 0\nf 2\na 4 24\na 5 56');
    const plain = runTrace(t.ops, cfg({ heapSize: 192 }));
    expect(plain.summary.failures).toBe(1);
    const switched = runTrace(t.ops, cfg({ heapSize: 192 }), [{ at: 6, patch: { fit: 'best', list: 'explicit' } }]);
    expect(switched.summary.failures).toBe(0);
    expect(switched.steps[6].switched).toEqual({ fit: 'best', list: 'explicit' });
    expect(switched.steps[6].cfg.list).toBe('explicit');
    expect(switched.steps[5].cfg.list).toBe('implicit');
    expect(switched.steps[6].freeLists[0].length).toBeGreaterThan(0);
    const heap = replayTo(t.ops, cfg({ heapSize: 192 }), 8, [{ at: 6, patch: { fit: 'best', list: 'explicit' } }]);
    expect(heap.cfg.list).toBe('explicit');
    expect(heap.check()).toEqual([]);
    expect(replayTo(t.ops, cfg(), 0).blocks()).toHaveLength(1);
  });

  it('labels policies', () => {
    expect(policyLabel(cfg())).toBe('first-fit, implicit list');
    expect(policyLabel(cfg({ list: 'explicit', fit: 'next', coalesce: 'deferred', insert: 'address' }))).toBe('first-fit, explicit list, address-ordered, deferred coalescing');
    expect(policyLabel(cfg({ list: 'segregated', fit: 'best', coalesce: 'none' }))).toBe('best-fit, segregated lists, LIFO, no coalescing');
  });
});

describe('narrate', () => {
  it('describes malloc, free and realloc outcomes', () => {
    const t = parseTrace('a 0 60\na 1 8\nf 0\na 2 400\nr 1 20\nr 1 4\nr 1 6\na 3 100\nr 1 60\nf 1\nf 1\na 4 0\nr 4 5\na 5 16\nr 5 0');
    const run = runTrace(t.ops, cfg());
    const text = run.steps.map(narrate);
    expect(text[0]).toMatch(/4 bytes of padding/);
    expect(text[0]).toMatch(/split it/);
    expect(text[2]).toMatch(/case 1/);
    expect(text[3]).toMatch(/returns NULL/);
    expect(text[4]).toMatch(/absorbed in place/);
    expect(text[5]).toMatch(/shrinks in place/);
    expect(text[6]).toMatch(/spare bytes cannot form a block/);
    expect(text[8]).toMatch(/copied to 0x10/);
    expect(text[9]).toMatch(/case 2/);
    expect(text[10]).toMatch(/invalid/);
    expect(text[11]).toMatch(/invalid/);
    expect(text[12]).toMatch(/invalid/);
    expect(text[14]).toMatch(/invalid/);
  });

  it('describes exact fits, padding-only fits, case 3 and 4, and list details', () => {
    const t = parseTrace('a 0 16\na 1 16\na 2 16\na 3 16\nf 0\nf 1\nf 3\nf 2\na 4 232');
    const run = runTrace(t.ops, cfg({ list: 'explicit', insert: 'address' }));
    const text = run.steps.map(narrate);
    expect(text[4]).toMatch(/case 1/);
    expect(text[5]).toMatch(/case 3/);
    expect(text[5]).toMatch(/address order/);
    expect(text[6]).toMatch(/case 2/);
    expect(text[7]).toMatch(/case 4/);
    expect(text[8]).toMatch(/exact fit/);
    const pad = runTrace(parseTrace('a 0 36').ops, cfg({ heapSize: 64 }));
    expect(narrate(pad.steps[0])).toMatch(/exact fit/);
    const pad2 = runTrace(parseTrace('a 0 28').ops, cfg({ heapSize: 64 }));
    expect(narrate(pad2.steps[0])).toMatch(/stay inside as padding/);
    const lifo = runTrace(parseTrace('a 0 8\nf 0').ops, cfg({ list: 'segregated' }));
    expect(narrate(lifo.steps[1])).toMatch(/pushed on the front of its size-class list/);
  });

  it('describes coalescing modes, deferred sweeps, switches and realloc moves', () => {
    const none = runTrace(parseTrace('a 0 8\nf 0').ops, cfg({ coalesce: 'none' }));
    expect(narrate(none.steps[1])).toMatch(/Coalescing is off/);
    const def = runTrace(parseTrace('a 0 8\na 1 8\nf 0\nf 1\na 2 220\na 3 500').ops, cfg({ coalesce: 'deferred' }));
    expect(narrate(def.steps[3])).toMatch(/deferred until a malloc fails/);
    expect(narrate(def.steps[4])).toMatch(/deferred coalescing merged/);
    expect(narrate(def.steps[5])).toMatch(/found nothing adjacent to merge/);
    const sw = runTrace(parseTrace('a 0 8\na 1 8').ops, cfg(), [{ at: 1, patch: { list: 'segregated' } }]);
    expect(narrate(sw.steps[1])).toMatch(/Policy switched to first-fit, segregated lists/);
    expect(narrate(sw.steps[1])).toMatch(/size-class lists/);
    const mv = runTrace(parseTrace('a 0 8\na 1 8\nr 0 40\nr 0 400').ops, cfg());
    expect(narrate(mv.steps[2])).toMatch(/copied to 0x30/);
    expect(narrate(mv.steps[3])).toMatch(/leaves the block in place/);
    const nf = runTrace(parseTrace('a 0 8\na 1 8\nf 0\na 2 8').ops, cfg({ fit: 'next' }));
    expect(narrate(nf.steps[3])).toMatch(/next-fit examined/);
    expect(hex(nf.steps[3].event.kind === 'malloc' ? nf.steps[3].event.result! : 0)).toBe('0x30');
  });
});
