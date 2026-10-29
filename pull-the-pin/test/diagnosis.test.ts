import { describe, expect, it } from 'vitest';
import { Diagnoser, FREE_SIGNAL, WIDTH, computeSignatures, indistinguishable, type Observation } from '../src/core/diagnosis';
import { CATALOG, catalogIndexOf, type Fault } from '../src/core/faults';
import { TEST_PROGRAMS } from '../src/core/isa';
import { netId, pinId, signalByName } from '../src/core/netlist';
import { simulate } from '../src/core/sim';

// A small catalog keeps these tests fast; the full one is exercised in challenge tests.
const small: Fault[] = [
  ...['BUS0', 'BUS1', 'BUS2', 'BUS3'].flatMap((n) => [0, 1].map((v) => ({ kind: 'stuck', net: netId(n), value: v }) as Fault)),
  { kind: 'open', pin: pinId('RAM.Y3') },
  { kind: 'open', pin: pinId('OUT.D3') },
  { kind: 'dead', chip: 'B' },
  { kind: 'rom', addr: (0xe << 3) | 2, bit: 11 },
  { kind: 'rom', addr: (0x9 << 3) | 2, bit: 0 },
];
const bytes = TEST_PROGRAMS.map((p) => p.bytes);
const observe = (truth: Fault, program: readonly number[], signal: number): Observation => ({
  bytes: program,
  signal,
  hash: simulate(program, truth).hashes[signal],
});

describe('Diagnoser', () => {
  it('keeps the truth and drops what the output display rules out', () => {
    const d = new Diagnoser(small);
    const truth = small[8];
    const left = d.consistent([observe(truth, bytes[3], FREE_SIGNAL)]);
    expect(left).toContain(8);
    expect(left.length).toBeLessThan(small.length);
    expect(d.consistent([])).toHaveLength(small.length);
  });

  it('a probe at the pin separates an open output from a stuck net', () => {
    const d = new Diagnoser(small);
    const truth = small[8]; // RAM.Y3 open
    const obs = [observe(truth, bytes[3], FREE_SIGNAL), observe(truth, bytes[3], signalByName('RAM.Y3'))];
    expect(d.consistent(obs)).toEqual([8]);
  });

  it('suggests the probe that splits the set most', () => {
    const d = new Diagnoser(small);
    const all = small.map((_, i) => i);
    const s = d.bestProbe(all, bytes)!;
    expect(s.groups).toBeGreaterThan(1);
    expect(s.expected).toBeLessThan(all.length);
    expect(d.bestProbe([0], bytes)).toBeNull();
    // An unreachable ROM bit and no fault at all look identical; nothing splits them.
    const unreachable = small.length - 1;
    expect(d.groups([unreachable], bytes)).toEqual([[unreachable]]);
  });

  it('groups faults no probe can tell apart', () => {
    const d = new Diagnoser(small);
    const groups = d.groups(small.map((_, i) => i), bytes);
    expect(groups.flat().sort((a, b) => a - b)).toEqual(small.map((_, i) => i));
    expect(d.bestProbe([small.length - 1, small.length - 1], bytes)).toBeNull();
  });

  it('stores and validates precomputed tables', () => {
    const d = new Diagnoser(small);
    expect(d.has(bytes[0])).toBe(false);
    const table = computeSignatures(bytes[0], small, () => {});
    d.store(bytes[0], table);
    expect(d.has(bytes[0])).toBe(true);
    expect(d.signatures(bytes[0])).toBe(table);
    expect(() => d.store(bytes[1], new Uint32Array(3))).toThrow();
    expect(table.length).toBe(small.length * WIDTH);
  });

  it('reports progress over the full catalog', () => {
    let last = 0;
    computeSignatures(bytes[0], CATALOG, (done) => (last = done));
    expect(last).toBe(CATALOG.length);
  });
});

describe('indistinguishable', () => {
  it('treats a fault as equal to itself and unlike a different one', () => {
    expect(indistinguishable(small[0], small[0], bytes)).toBe(true);
    expect(indistinguishable(small[0], small[1], bytes)).toBe(false);
  });
  it('finds genuinely equivalent faults', () => {
    // Two ROM bits at an address no test program reaches (an unused opcode).
    const a: Fault = { kind: 'rom', addr: (0x9 << 3) | 2, bit: 0 };
    const b: Fault = { kind: 'rom', addr: (0x9 << 3) | 3, bit: 5 };
    expect(catalogIndexOf({ kind: 'dead', chip: 'B' })).toBeGreaterThan(0);
    expect(indistinguishable(a, b, bytes)).toBe(true);
  });
});
