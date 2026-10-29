// Instruction set, microcode ROM and a tiny assembler for the SAP-1.

import { CONTROL_LINES, type ControlLine } from './netlist';

export const OPCODES = {
  NOP: 0x0,
  LDA: 0x1,
  ADD: 0x2,
  SUB: 0x3,
  STA: 0x4,
  LDI: 0x5,
  JMP: 0x6,
  JC: 0x7,
  JZ: 0x8,
  OUT: 0xe,
  HLT: 0xf,
} as const;
export type Mnemonic = keyof typeof OPCODES;

const TAKES_OPERAND: ReadonlySet<Mnemonic> = new Set(['LDA', 'ADD', 'SUB', 'STA', 'LDI', 'JMP', 'JC', 'JZ']);

export const MNEMONIC_OF: Record<number, Mnemonic> = Object.fromEntries(
  Object.entries(OPCODES).map(([m, op]) => [op, m as Mnemonic]),
);

export const USED_OPCODES: readonly number[] = Object.values(OPCODES);

/** Five T-states per instruction: T0 and T1 fetch, T2 to T4 execute. */
export const STEPS = 5;

export function lineBit(line: ControlLine): number {
  return 1 << CONTROL_LINES.indexOf(line);
}
const w = (...lines: ControlLine[]) => lines.reduce((acc, l) => acc | lineBit(l), 0);

/** ROM address: CF (bit 8), ZF (bit 7), opcode (bits 3..6), step (bits 0..2). */
export function romAddress(cf: number, zf: number, op: number, step: number): number {
  return (cf << 8) | (zf << 7) | (op << 3) | step;
}

export function decodeRomAddress(addr: number): { cf: number; zf: number; op: number; step: number } {
  return { cf: (addr >> 8) & 1, zf: (addr >> 7) & 1, op: (addr >> 3) & 15, step: addr & 7 };
}

function execSteps(op: number, cf: number, zf: number): number[] {
  switch (op) {
    case OPCODES.LDA: return [w('IO', 'MI'), w('RO', 'AI')];
    case OPCODES.ADD: return [w('IO', 'MI'), w('RO', 'BI'), w('EO', 'AI', 'FI')];
    case OPCODES.SUB: return [w('IO', 'MI'), w('RO', 'BI'), w('EO', 'AI', 'SU', 'FI')];
    case OPCODES.STA: return [w('IO', 'MI'), w('AO', 'RI')];
    case OPCODES.LDI: return [w('IO', 'AI')];
    case OPCODES.JMP: return [w('IO', 'J')];
    case OPCODES.JC: return [cf ? w('IO', 'J') : 0];
    case OPCODES.JZ: return [zf ? w('IO', 'J') : 0];
    case OPCODES.OUT: return [w('AO', 'OI')];
    case OPCODES.HLT: return [w('HLT')];
    default: return [];
  }
}

function buildRom(): Uint16Array {
  const rom = new Uint16Array(512);
  for (let cf = 0; cf < 2; cf++) {
    for (let zf = 0; zf < 2; zf++) {
      for (let op = 0; op < 16; op++) {
        const words = [w('MI', 'CO'), w('RO', 'II', 'CE'), ...execSteps(op, cf, zf)];
        words.forEach((word, step) => (rom[romAddress(cf, zf, op, step)] = word));
      }
    }
  }
  return rom;
}

export const MICROCODE: Readonly<Uint16Array> = buildRom();

export function describeWord(word: number): string {
  const on = CONTROL_LINES.filter((_, i) => word & (1 << i));
  return on.length ? on.join(' ') : '(none)';
}

export interface Program {
  readonly name: string;
  readonly source: string;
  readonly bytes: readonly number[];
}

export class AsmError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`line ${line}: ${message}`);
  }
}

/**
 * Assemble SAP-1 source into 16 bytes. Syntax per line: optional `label:`, then
 * a mnemonic with an optional operand (number or label), `DB n` for a raw
 * byte, or `ORG n` to move the location counter. `;` starts a comment.
 */
export function assemble(source: string): number[] {
  const lines = source.split('\n');
  const labels = new Map<string, number>();
  type Item = { addr: number; kind: 'op' | 'db'; word: string; operand: string | null; line: number };
  const items: Item[] = [];
  let pc = 0;
  lines.forEach((raw, i) => {
    const line = i + 1;
    let text = raw.replace(/;.*/, '').trim();
    const m = /^([A-Za-z_]\w*):\s*(.*)$/.exec(text);
    if (m) {
      const label = m[1].toLowerCase();
      if (labels.has(label)) throw new AsmError(`duplicate label ${m[1]}`, line);
      labels.set(label, pc);
      text = m[2];
    }
    if (!text) return;
    const [word, operand, extra] = text.split(/\s+/);
    if (extra !== undefined) throw new AsmError(`unexpected "${extra}"`, line);
    const upper = word.toUpperCase();
    if (upper === 'ORG') {
      const v = operand === undefined ? NaN : parseNumber(operand);
      if (!(v >= 0 && v < 16)) throw new AsmError('ORG needs an address 0..15', line);
      pc = v;
      return;
    }
    if (pc > 15) throw new AsmError('program does not fit in 16 bytes', line);
    if (upper === 'DB') {
      if (operand === undefined) throw new AsmError('DB needs a value', line);
      items.push({ addr: pc++, kind: 'db', word: upper, operand, line });
      return;
    }
    if (!(upper in OPCODES)) throw new AsmError(`unknown instruction ${word}`, line);
    const needs = TAKES_OPERAND.has(upper as Mnemonic);
    if (needs && operand === undefined) throw new AsmError(`${upper} needs an operand`, line);
    if (!needs && operand !== undefined) throw new AsmError(`${upper} takes no operand`, line);
    items.push({ addr: pc++, kind: 'op', word: upper, operand: operand ?? null, line });
  });
  const bytes = new Array<number>(16).fill(0);
  const filled = new Set<number>();
  for (const item of items) {
    if (filled.has(item.addr)) throw new AsmError(`address ${item.addr} is written twice`, item.line);
    filled.add(item.addr);
    const value = item.operand === null ? 0 : resolve(item.operand, labels, item.line);
    if (item.kind === 'db') {
      if (value > 255) throw new AsmError('DB value must be 0..255', item.line);
      bytes[item.addr] = value;
    } else {
      if (value > 15) throw new AsmError('operand must be 0..15', item.line);
      bytes[item.addr] = (OPCODES[item.word as Mnemonic] << 4) | value;
    }
  }
  return bytes;
}

function parseNumber(s: string): number {
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s.slice(2), 16);
  if (/^0b[01]+$/i.test(s)) return parseInt(s.slice(2), 2);
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return NaN;
}

function resolve(operand: string, labels: Map<string, number>, line: number): number {
  const n = parseNumber(operand);
  if (!Number.isNaN(n)) return n;
  const v = labels.get(operand.toLowerCase());
  if (v === undefined) throw new AsmError(`unknown label ${operand}`, line);
  return v;
}

export function disassemble(byte: number): string {
  const m = MNEMONIC_OF[byte >> 4];
  if (!m) return `?? ${byte >> 4}`;
  return TAKES_OPERAND.has(m) ? `${m} ${byte & 15}` : m;
}

function program(name: string, source: string): Program {
  return { name, source, bytes: assemble(source) };
}

/** Test programs every student can run for free. Each finishes well inside the cycle cap. */
export const TEST_PROGRAMS: readonly Program[] = [
  program(
    'Add two numbers',
    `; 28 + 14 = 42
      LDA x
      ADD y
      OUT
      HLT
      ORG 14
x:    DB 28
y:    DB 14`,
  ),
  program(
    'Walking ones',
    `; doubles A until it carries out: 1 2 4 ... 128 0
      LDI 1
loop: OUT
      STA t
      ADD t
      JC done
      JMP loop
done: OUT
      HLT
t:    DB 0`,
  ),
  program(
    'Countdown',
    `; 5 4 3 2 1 0 using SUB and JZ
      LDI 5
loop: OUT
      SUB one
      JZ done
      JMP loop
done: OUT
      HLT
one:  DB 1`,
  ),
  program(
    'Bit patterns',
    `; 0xAA, 0x55, then 0xFF and a carry to 0
      LDA a
      OUT
      LDA b
      OUT
      ADD a
      OUT
      ADD one
      OUT
      HLT
a:    DB 0xAA
b:    DB 0x55
one:  DB 1`,
  ),
];
