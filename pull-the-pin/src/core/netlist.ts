// The board: chips, their pins, and the nets that join them.
//
// The machine is a Ben Eater style SAP-1: a shared 8-bit bus, a 4-bit program
// counter and memory address register, 16 bytes of RAM, an instruction
// register, A and B registers, an adder/subtractor, a flags register, an output
// register and a microcode ROM driving 16 control lines. Each module is drawn
// and simulated as one idealized chip package; a real breadboard build spreads
// each module over several 74LS parts.
//
// Every signal the logic analyzer can probe has an index: nets first, then
// pins. A pin's value is what you would see touching the chip's own leg; a
// net's value is what you would see touching the trace. They differ only when
// a pin is open (its leg lifted off the board).

export const CONTROL_LINES = [
  'HLT', 'MI', 'RI', 'RO', 'IO', 'II', 'AI', 'AO',
  'EO', 'SU', 'BI', 'OI', 'CE', 'CO', 'J', 'FI',
] as const;
export type ControlLine = (typeof CONTROL_LINES)[number];

export const CONTROL_HELP: Record<ControlLine, string> = {
  HLT: 'halt the clock',
  MI: 'memory address register in (from bus)',
  RI: 'RAM in (write the bus to RAM)',
  RO: 'RAM out (drive the bus)',
  IO: 'instruction register out (operand nibble to bus)',
  II: 'instruction register in',
  AI: 'A register in',
  AO: 'A register out',
  EO: 'ALU out (sum to bus)',
  SU: 'subtract',
  BI: 'B register in',
  OI: 'output register in',
  CE: 'counter enable (PC + 1)',
  CO: 'counter out (PC to bus)',
  J: 'jump (load PC from bus)',
  FI: 'flags in',
};

export const CHIP_IDS = ['PC', 'MAR', 'RAM', 'IR', 'CTRL', 'CLK', 'A', 'ALU', 'B', 'FLAGS', 'OUT'] as const;
export type ChipId = (typeof CHIP_IDS)[number];

export const CHIP_TITLES: Record<ChipId, string> = {
  PC: 'Program counter',
  MAR: 'Memory address register',
  RAM: 'RAM (16 x 8)',
  IR: 'Instruction register',
  CTRL: 'Control: step counter + microcode ROM',
  CLK: 'Clock and halt',
  A: 'A register',
  ALU: 'ALU (adder / subtractor)',
  B: 'B register',
  FLAGS: 'Flags register',
  OUT: 'Output register',
};

export interface NetDef {
  readonly name: string;
  /** Bus lines have pull-down resistors, so an undriven bus line reads 0. */
  readonly pulldown: boolean;
  readonly group: 'bus' | 'address' | 'opcode' | 'regA' | 'regB' | 'alu' | 'flags' | 'control';
}

export interface PinDef {
  readonly chip: ChipId;
  readonly name: string;
  readonly id: string;
  readonly net: number;
  readonly dir: 'in' | 'out';
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

const netDefs: NetDef[] = [
  ...range(8).map((i) => ({ name: `BUS${i}`, pulldown: true, group: 'bus' as const })),
  ...range(4).map((i) => ({ name: `MA${i}`, pulldown: false, group: 'address' as const })),
  ...range(4).map((i) => ({ name: `OP${i}`, pulldown: false, group: 'opcode' as const })),
  ...range(8).map((i) => ({ name: `RA${i}`, pulldown: false, group: 'regA' as const })),
  ...range(8).map((i) => ({ name: `RB${i}`, pulldown: false, group: 'regB' as const })),
  { name: 'CY', pulldown: false, group: 'alu' },
  { name: 'ZR', pulldown: false, group: 'alu' },
  { name: 'CF', pulldown: false, group: 'flags' },
  { name: 'ZF', pulldown: false, group: 'flags' },
  ...CONTROL_LINES.map((name) => ({ name, pulldown: false, group: 'control' as const })),
];

export const NETS: readonly NetDef[] = netDefs;
export const NET_COUNT = NETS.length;

const netIndex = new Map(NETS.map((n, i) => [n.name, i]));
export function netId(name: string): number {
  const i = netIndex.get(name);
  if (i === undefined) throw new Error(`unknown net ${name}`);
  return i;
}

type PinSpec = [name: string, net: string, dir: 'in' | 'out'];
const bits = (n: number, pin: string, net: string, dir: 'in' | 'out'): PinSpec[] =>
  range(n).map((i) => [`${pin}${i}`, `${net}${i}`, dir]);
const ctl = (...names: ControlLine[]): PinSpec[] => names.map((n) => [n, n, 'in']);

const chipPins: Record<ChipId, PinSpec[]> = {
  PC: [...bits(4, 'D', 'BUS', 'in'), ...ctl('CE', 'J', 'CO'), ...bits(4, 'Y', 'BUS', 'out')],
  MAR: [...bits(4, 'D', 'BUS', 'in'), ...ctl('MI'), ...bits(4, 'A', 'MA', 'out')],
  RAM: [...bits(4, 'A', 'MA', 'in'), ...ctl('RI', 'RO'), ...bits(8, 'D', 'BUS', 'in'), ...bits(8, 'Y', 'BUS', 'out')],
  IR: [...bits(8, 'D', 'BUS', 'in'), ...ctl('II', 'IO'), ...bits(4, 'Y', 'BUS', 'out'), ...bits(4, 'OP', 'OP', 'out')],
  CTRL: [
    ...bits(4, 'OP', 'OP', 'in'),
    ['CF', 'CF', 'in'],
    ['ZF', 'ZF', 'in'],
    ...CONTROL_LINES.map((n): PinSpec => [n, n, 'out']),
  ],
  CLK: ctl('HLT'),
  A: [...bits(8, 'D', 'BUS', 'in'), ...ctl('AI', 'AO'), ...bits(8, 'Y', 'BUS', 'out'), ...bits(8, 'Q', 'RA', 'out')],
  ALU: [
    ...bits(8, 'A', 'RA', 'in'),
    ...bits(8, 'B', 'RB', 'in'),
    ...ctl('SU', 'EO'),
    ...bits(8, 'Y', 'BUS', 'out'),
    ['CY', 'CY', 'out'],
    ['ZR', 'ZR', 'out'],
  ],
  B: [...bits(8, 'D', 'BUS', 'in'), ...ctl('BI'), ...bits(8, 'Q', 'RB', 'out')],
  FLAGS: [['C', 'CY', 'in'], ['Z', 'ZR', 'in'], ...ctl('FI'), ['CF', 'CF', 'out'], ['ZF', 'ZF', 'out']],
  OUT: [...bits(8, 'D', 'BUS', 'in'), ...ctl('OI')],
};

export const PINS: readonly PinDef[] = CHIP_IDS.flatMap((chip) =>
  chipPins[chip].map(([name, net, dir]) => ({ chip, name, id: `${chip}.${name}`, net: netId(net), dir })),
);
export const PIN_COUNT = PINS.length;

/** Total probe-able signals: nets, then pins. */
export const SIGNAL_COUNT = NET_COUNT + PIN_COUNT;

const pinIndex = new Map(PINS.map((p, i) => [p.id, i]));
export function pinId(id: string): number {
  const i = pinIndex.get(id);
  if (i === undefined) throw new Error(`unknown pin ${id}`);
  return i;
}

export function pinsOf(chip: ChipId): number[] {
  return PINS.flatMap((p, i) => (p.chip === chip ? [i] : []));
}

/** Pins attached to each net, split by direction. */
export const NET_READERS: readonly number[][] = NETS.map((_, n) =>
  PINS.flatMap((p, i) => (p.net === n && p.dir === 'in' ? [i] : [])),
);
export const NET_DRIVERS: readonly number[][] = NETS.map((_, n) =>
  PINS.flatMap((p, i) => (p.net === n && p.dir === 'out' ? [i] : [])),
);

export function signalName(s: number): string {
  return s < NET_COUNT ? NETS[s].name : PINS[s - NET_COUNT].id;
}

export function signalOfPin(pin: number): number {
  return NET_COUNT + pin;
}

export function signalByName(name: string): number {
  return name.includes('.') ? signalOfPin(pinId(name)) : netId(name);
}
