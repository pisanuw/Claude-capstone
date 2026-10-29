// Signal-level, cycle-by-cycle simulation of the SAP-1 with at most one fault.
//
// Each clock cycle settles the combinational logic in four stages, in the
// order the signals depend on each other:
//   1. register outputs (MAR address, IR opcode, A and B to the ALU, flags)
//   2. the control ROM, addressed by opcode, flags and the step counter
//   3. the ALU (sum, carry, zero, and its bus driver)
//   4. the other bus drivers (PC, RAM, IR operand, A)
// and then the rising clock edge latches every register whose load line is
// high. Values are 0, 1 or Z (undriven). Two drivers on one net resolve to the
// wired-AND (a low TTL output wins) and flag bus contention.

import {
  CHIP_IDS,
  CONTROL_LINES,
  NETS,
  NET_COUNT,
  NET_READERS,
  PINS,
  PIN_COUNT,
  SIGNAL_COUNT,
  type ChipId,
  netId,
  pinId,
} from './netlist';
import { MICROCODE, STEPS, romAddress } from './isa';
import type { Fault } from './faults';

export const Z = 2;
/** Long enough for every test program (the longest needs 208 cycles). */
export const DEFAULT_MAX_CYCLES = 256;

export interface MachineState {
  pc: number;
  mar: number;
  ir: number;
  a: number;
  b: number;
  cf: number;
  zf: number;
  out: number;
  step: number;
}

export interface CycleRecord {
  /** Nets then pins, 0 / 1 / Z, as settled before the clock edge. */
  readonly values: Uint8Array;
  /** Register contents during this cycle (before the edge). */
  readonly state: Readonly<MachineState>;
  readonly ram: readonly number[];
  readonly romAddr: number;
  readonly contention: boolean;
}

export interface OutputEvent {
  readonly cycle: number;
  readonly value: number;
}

export interface RunResult {
  readonly cycles: number;
  readonly halted: boolean;
  readonly outputs: readonly OutputEvent[];
  /** Per-cycle records, present only when `record` was requested. */
  readonly records: readonly CycleRecord[] | null;
  /** One hash per signal waveform, plus the free observation hash at index SIGNAL_COUNT. */
  readonly hashes: Uint32Array;
  /** ROM addresses read at least once. */
  readonly romReads: ReadonlySet<number>;
}

export interface RunOptions {
  maxCycles?: number;
  record?: boolean;
}

const pins = (chip: ChipId, prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => pinId(`${chip}.${prefix}${i}`));
const pin = (id: string) => pinId(id);
const nets = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => netId(`${prefix}${i}`));

const P = {
  pcD: pins('PC', 'D', 4), pcY: pins('PC', 'Y', 4), pcCE: pin('PC.CE'), pcJ: pin('PC.J'), pcCO: pin('PC.CO'),
  marD: pins('MAR', 'D', 4), marMI: pin('MAR.MI'), marA: pins('MAR', 'A', 4),
  ramA: pins('RAM', 'A', 4), ramRI: pin('RAM.RI'), ramRO: pin('RAM.RO'), ramD: pins('RAM', 'D', 8), ramY: pins('RAM', 'Y', 8),
  irD: pins('IR', 'D', 8), irII: pin('IR.II'), irIO: pin('IR.IO'), irY: pins('IR', 'Y', 4), irOP: pins('IR', 'OP', 4),
  ctlOP: pins('CTRL', 'OP', 4), ctlCF: pin('CTRL.CF'), ctlZF: pin('CTRL.ZF'), ctlOut: CONTROL_LINES.map((l) => pin(`CTRL.${l}`)),
  clkHLT: pin('CLK.HLT'),
  aD: pins('A', 'D', 8), aAI: pin('A.AI'), aAO: pin('A.AO'), aY: pins('A', 'Y', 8), aQ: pins('A', 'Q', 8),
  aluA: pins('ALU', 'A', 8), aluB: pins('ALU', 'B', 8), aluSU: pin('ALU.SU'), aluEO: pin('ALU.EO'), aluY: pins('ALU', 'Y', 8),
  aluCY: pin('ALU.CY'), aluZR: pin('ALU.ZR'),
  bD: pins('B', 'D', 8), bBI: pin('B.BI'), bQ: pins('B', 'Q', 8),
  flC: pin('FLAGS.C'), flZ: pin('FLAGS.Z'), flFI: pin('FLAGS.FI'), flCF: pin('FLAGS.CF'), flZF: pin('FLAGS.ZF'),
  outD: pins('OUT', 'D', 8), outOI: pin('OUT.OI'),
};

const STAGE1 = [...nets('MA', 4), ...nets('OP', 4), ...nets('RA', 8), ...nets('RB', 8), netId('CF'), netId('ZF')];
const STAGE2 = CONTROL_LINES.map((l) => netId(l));
const STAGE3 = [netId('CY'), netId('ZR')];
const STAGE4 = nets('BUS', 8);

const PIN_CHIP: Uint8Array = Uint8Array.from(PINS, (p) => CHIP_IDS.indexOf(p.chip));
const PIN_NET: Uint8Array = Uint8Array.from(PINS, (p) => p.net);
const PULLDOWN: Uint8Array = Uint8Array.from(NETS, (n) => (n.pulldown ? 1 : 0));
const C = Object.fromEntries(CHIP_IDS.map((c, i) => [c, i])) as Record<ChipId, number>;
const READERS: readonly Uint16Array[] = NET_READERS.map((r) => Uint16Array.from(r));

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 16777619;

export function initialState(): MachineState {
  return { pc: 0, mar: 0, ir: 0, a: 0, b: 0, cf: 0, zf: 0, out: 0, step: 0 };
}

export function simulate(program: readonly number[], fault: Fault | null, opts: RunOptions = {}): RunResult {
  const maxCycles = opts.maxCycles ?? DEFAULT_MAX_CYCLES;
  const record = opts.record ?? false;

  const open = new Uint8Array(PIN_COUNT);
  const dead = new Uint8Array(CHIP_IDS.length);
  const stuck = new Int8Array(NET_COUNT).fill(-1);
  const partner = new Int16Array(NET_COUNT).fill(-1);
  let flipAddr = -1;
  let flipMask = 0;
  if (fault) {
    switch (fault.kind) {
      case 'stuck': stuck[fault.net] = fault.value; break;
      case 'open': open[fault.pin] = 1; break;
      case 'short': partner[fault.a] = fault.b; partner[fault.b] = fault.a; break;
      case 'rom': flipAddr = fault.addr; flipMask = 1 << fault.bit; break;
      case 'dead': dead[C[fault.chip]] = 1; break;
    }
  }

  const drv = new Uint8Array(NET_COUNT);
  const drvCount = new Uint8Array(NET_COUNT);
  const netV = new Uint8Array(NET_COUNT);
  const pinV = new Uint8Array(PIN_COUNT);
  const hashes = new Uint32Array(SIGNAL_COUNT + 1).fill(FNV_OFFSET);
  const records: CycleRecord[] | null = record ? [] : null;
  const outputs: OutputEvent[] = [];
  const romReads = new Set<number>();

  const s = initialState();
  const ram = Array.from({ length: 16 }, (_, i) => (program[i] ?? 0) & 255);
  let contention = false;

  const drive = (p: number, v: number) => {
    if (dead[PIN_CHIP[p]]) v = Z;
    pinV[p] = v;
    if (v === Z || open[p]) return;
    const n = PIN_NET[p];
    drvCount[n]++;
    drv[n] = drv[n] === Z ? v : drv[n] & v;
  };
  const settle = (list: readonly number[]) => {
    for (const n of list) {
      if (drvCount[n] > 1) contention = true;
      let v = drv[n];
      const q = partner[n];
      if (q >= 0) {
        const u = drv[q];
        v = v === Z ? u : u === Z ? v : v & u;
      }
      if (v === Z && PULLDOWN[n]) v = 0;
      if (stuck[n] >= 0) v = stuck[n];
      netV[n] = v;
      const rs = READERS[n];
      for (let k = 0; k < rs.length; k++) pinV[rs[k]] = open[rs[k]] ? Z : v;
    }
  };
  // TTL reads a floating input as high.
  const rd = (p: number) => (pinV[p] === Z ? 1 : pinV[p]);
  const word = (ps: readonly number[]) => {
    let v = 0;
    for (let i = 0; i < ps.length; i++) v |= rd(ps[i]) << i;
    return v;
  };
  const driveWord = (ps: readonly number[], value: number, enabled: number) => {
    for (let i = 0; i < ps.length; i++) drive(ps[i], enabled ? (value >> i) & 1 : Z);
  };

  let cycle = 0;
  let halted = false;
  for (; cycle < maxCycles; cycle++) {
    drv.fill(Z);
    drvCount.fill(0);
    pinV.fill(Z);
    contention = false;

    // 1. register outputs
    driveWord(P.marA, s.mar, 1);
    driveWord(P.irOP, s.ir >> 4, 1);
    driveWord(P.aQ, s.a, 1);
    driveWord(P.bQ, s.b, 1);
    drive(P.flCF, s.cf);
    drive(P.flZF, s.zf);
    settle(STAGE1);

    // 2. control ROM
    const addr = romAddress(rd(P.ctlCF), rd(P.ctlZF), word(P.ctlOP), s.step);
    const ctrlAlive = !dead[C.CTRL];
    if (ctrlAlive) romReads.add(addr);
    const control = MICROCODE[addr] ^ (addr === flipAddr ? flipMask : 0);
    driveWord(P.ctlOut, control, 1);
    settle(STAGE2);

    // 3. ALU
    const su = rd(P.aluSU);
    const sum = word(P.aluA) + (su ? ~word(P.aluB) & 255 : word(P.aluB)) + su;
    const y = sum & 255;
    drive(P.aluCY, (sum >> 8) & 1);
    drive(P.aluZR, y === 0 ? 1 : 0);
    driveWord(P.aluY, y, rd(P.aluEO));
    settle(STAGE3);

    // 4. bus drivers
    driveWord(P.pcY, s.pc, rd(P.pcCO));
    driveWord(P.ramY, ram[word(P.ramA)], rd(P.ramRO));
    driveWord(P.irY, s.ir & 15, rd(P.irIO));
    driveWord(P.aY, s.a, rd(P.aAO));
    settle(STAGE4);

    for (let i = 0; i < NET_COUNT; i++) hashes[i] = Math.imul(hashes[i] ^ (netV[i] + 1), FNV_PRIME);
    for (let i = 0; i < PIN_COUNT; i++) {
      const k = NET_COUNT + i;
      hashes[k] = Math.imul(hashes[k] ^ (pinV[i] + 1), FNV_PRIME);
    }
    if (records) {
      const values = new Uint8Array(SIGNAL_COUNT);
      values.set(netV, 0);
      values.set(pinV, NET_COUNT);
      records.push({ values, state: { ...s }, ram: ram.slice(), romAddr: ctrlAlive ? addr : -1, contention });
    }

    // Rising edge. A dead clock never ticks, so nothing ever latches.
    if (dead[C.CLK]) continue;
    if (rd(P.clkHLT)) {
      halted = true;
      cycle++;
      break;
    }
    // Every input was settled above, so latching in place cannot leak a new value into another latch.
    if (!dead[C.PC]) {
      if (rd(P.pcJ)) s.pc = word(P.pcD);
      else if (rd(P.pcCE)) s.pc = (s.pc + 1) & 15;
    }
    if (!dead[C.MAR] && rd(P.marMI)) s.mar = word(P.marD);
    if (!dead[C.RAM] && rd(P.ramRI)) ram[word(P.ramA)] = word(P.ramD);
    if (!dead[C.IR] && rd(P.irII)) s.ir = word(P.irD);
    if (!dead[C.A] && rd(P.aAI)) s.a = word(P.aD);
    if (!dead[C.B] && rd(P.bBI)) s.b = word(P.bD);
    if (!dead[C.FLAGS] && rd(P.flFI)) {
      s.cf = rd(P.flC);
      s.zf = rd(P.flZ);
    }
    if (!dead[C.OUT] && rd(P.outOI)) {
      s.out = word(P.outD);
      outputs.push({ cycle, value: s.out });
    }
    if (ctrlAlive) s.step = (s.step + 1) % STEPS;
  }

  // What anyone sees without a probe: the output display over time and whether it halted.
  let h = FNV_OFFSET;
  const mix = (v: number) => (h = Math.imul(h ^ v, FNV_PRIME));
  mix(cycle);
  mix(halted ? 1 : 2);
  for (const o of outputs) {
    mix(o.cycle);
    mix(o.value + 7);
  }
  hashes[SIGNAL_COUNT] = h >>> 0;

  return { cycles: cycle, halted, outputs, records, hashes, romReads };
}
