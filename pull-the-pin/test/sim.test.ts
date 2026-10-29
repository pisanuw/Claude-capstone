import { describe, expect, it } from 'vitest';
import { TEST_PROGRAMS, assemble } from '../src/core/isa';
import { Z, simulate } from '../src/core/sim';
import { NET_COUNT, netId, pinId, signalByName } from '../src/core/netlist';
import type { Fault } from '../src/core/faults';

const prog = (name: string) => TEST_PROGRAMS.find((p) => p.name === name)!.bytes;
const outs = (bytes: readonly number[], f: Fault | null = null) => simulate(bytes, f).outputs.map((o) => o.value);

describe('healthy machine', () => {
  it.each([
    ['Add two numbers', [42]],
    ['Walking ones', [1, 2, 4, 8, 16, 32, 64, 128, 0]],
    ['Countdown', [5, 4, 3, 2, 1, 0]],
    ['Bit patterns', [170, 85, 255, 0]],
  ])('%s outputs %j and halts', (name, expected) => {
    const r = simulate(prog(name), null);
    expect(r.outputs.map((o) => o.value)).toEqual(expected);
    expect(r.halted).toBe(true);
  });

  it('records every cycle with the bus pulled down when idle', () => {
    const r = simulate(prog('Add two numbers'), null, { record: true });
    expect(r.records).toHaveLength(r.cycles);
    // T0: PC drives the bus with 0 and MAR loads it.
    const t0 = r.records![0];
    expect(t0.state.step).toBe(0);
    expect(t0.values[netId('CO')]).toBe(1);
    expect(t0.values[netId('BUS0')]).toBe(0);
    // A disabled output pin is tri-stated.
    expect(t0.values[signalByName('RAM.Y0')]).toBe(Z);
    expect(r.records!.some((c) => c.contention)).toBe(false);
  });

  it('stops at the cycle cap when it never halts', () => {
    const r = simulate(assemble('loop: JMP loop'), null, { maxCycles: 50 });
    expect(r.halted).toBe(false);
    expect(r.cycles).toBe(50);
  });

  it('gives identical runs identical hashes', () => {
    expect(simulate(prog('Countdown'), null).hashes).toEqual(simulate(prog('Countdown'), null).hashes);
  });
});

describe('faults', () => {
  it('a bus line stuck at 0 clears that bit everywhere', () => {
    expect(outs(prog('Bit patterns'), { kind: 'stuck', net: netId('BUS1'), value: 0 })[0]).toBe(0xa8);
  });

  it('a bus line stuck at 1 corrupts fetched instructions too', () => {
    const r = simulate(prog('Add two numbers'), { kind: 'stuck', net: netId('BUS7'), value: 1 });
    expect(r.outputs.map((o) => o.value)).not.toEqual([42]);
  });

  it('an open output pin stops that bit reaching the bus but the pin still shows it', () => {
    const f: Fault = { kind: 'open', pin: pinId('RAM.Y3') };
    const r = simulate(prog('Bit patterns'), f, { record: true });
    // Bit 3 also drops out of fetched instructions, so the program goes wrong, not just the data.
    expect(r.outputs.map((o) => o.value)).not.toEqual([170, 85, 255, 0]);
    const drivingOne = r.records!.find((c) => c.values[signalByName('RAM.Y3')] === 1);
    expect(drivingOne).toBeDefined();
    expect(drivingOne!.values[netId('BUS3')]).toBe(0);
  });

  it('an open input pin floats high at the pin', () => {
    const f: Fault = { kind: 'open', pin: pinId('OUT.D0') };
    const r = simulate(prog('Add two numbers'), f, { record: true });
    expect(r.outputs[0].value).toBe(43);
    expect(r.records![0].values[signalByName('OUT.D0')]).toBe(Z);
  });

  it('a floating control input asserts it and causes contention', () => {
    const r = simulate(prog('Add two numbers'), { kind: 'open', pin: pinId('A.AO') }, { record: true });
    expect(r.records!.some((c) => c.contention)).toBe(true);
  });

  it('shorted bus lines read the wired-AND of both', () => {
    expect(outs(prog('Bit patterns'), { kind: 'short', a: netId('BUS0'), b: netId('BUS1') })[0]).not.toBe(0xaa);
    // A driven line and an undriven one: the driver wins on both.
    const r = simulate(prog('Bit patterns'), { kind: 'short', a: netId('BUS6'), b: netId('BUS7') }, { record: true });
    expect(r.records![0].values[netId('BUS6')]).toBe(r.records![0].values[netId('BUS7')]);
  });

  it('a flipped ROM bit changes one micro-step', () => {
    // OUT T2 normally AO OI; dropping OI means nothing is ever output.
    const addr = (0 << 8) | (0 << 7) | (0xe << 3) | 2;
    const r = simulate(prog('Add two numbers'), { kind: 'rom', addr, bit: 11 });
    expect(r.outputs).toEqual([]);
    expect(r.halted).toBe(true);
  });

  it('a dead chip floats its outputs and latches nothing', () => {
    expect(outs(prog('Add two numbers'), { kind: 'dead', chip: 'OUT' })).toEqual([]);
    const ram = simulate(prog('Add two numbers'), { kind: 'dead', chip: 'RAM' });
    expect(ram.outputs.map((o) => o.value)).not.toEqual([42]);
    const clk = simulate(prog('Add two numbers'), { kind: 'dead', chip: 'CLK' });
    expect(clk.halted).toBe(false);
    expect(clk.outputs).toEqual([]);
    const ctrl = simulate(prog('Add two numbers'), { kind: 'dead', chip: 'CTRL' }, { record: true });
    expect(ctrl.records![0].romAddr).toBe(-1);
    for (const chip of ['PC', 'MAR', 'IR', 'A', 'B', 'ALU', 'FLAGS'] as const) {
      expect(outs(prog('Countdown'), { kind: 'dead', chip })).not.toEqual([5, 4, 3, 2, 1, 0]);
    }
  });

  it('a stuck control net forces halt', () => {
    const r = simulate(prog('Countdown'), { kind: 'stuck', net: netId('HLT'), value: 1 });
    expect(r.cycles).toBe(1);
    expect(r.halted).toBe(true);
  });

  it('keeps nets before pins in the signal index', () => {
    expect(signalByName('BUS0')).toBe(0);
    expect(signalByName('PC.D0')).toBe(NET_COUNT);
  });
});
