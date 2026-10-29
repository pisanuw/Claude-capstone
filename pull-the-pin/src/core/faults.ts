// Fault model: what can break on the board, how to name it, and the full
// catalog of single faults that the diagnosis view reasons over.

import { CONTROL_LINES, CHIP_IDS, NETS, PINS, type ChipId, netId, pinId } from './netlist';
import { MICROCODE, MNEMONIC_OF, USED_OPCODES, STEPS, decodeRomAddress, romAddress } from './isa';

export type Fault =
  /** A net held at 0 or 1 whatever drives it (a solder bridge to a rail, a dead driver). */
  | { kind: 'stuck'; net: number; value: 0 | 1 }
  /** A pin lifted off its pad: outputs stop reaching the net, inputs float (TTL reads a float as 1). */
  | { kind: 'open'; pin: number }
  /** Two adjacent bus lines bridged together: each reads the wired-AND of both. */
  | { kind: 'short'; a: number; b: number }
  /** One bit of the microcode ROM flipped at one address. */
  | { kind: 'rom'; addr: number; bit: number }
  /** A chip with no power: its outputs float and it latches nothing. */
  | { kind: 'dead'; chip: ChipId };

export type FaultKind = Fault['kind'];

export const KIND_TITLES: Record<FaultKind, string> = {
  stuck: 'Net stuck at 0 or 1',
  open: 'Open pin',
  short: 'Shorted bus lines',
  rom: 'Control ROM bit flip',
  dead: 'Dead chip',
};

export function faultKey(f: Fault): string {
  switch (f.kind) {
    case 'stuck': return `stuck:${NETS[f.net].name}:${f.value}`;
    case 'open': return `open:${PINS[f.pin].id}`;
    case 'short': return `short:${NETS[f.a].name}:${NETS[f.b].name}`;
    case 'rom': return `rom:${f.addr}:${f.bit}`;
    case 'dead': return `dead:${f.chip}`;
  }
}

export function parseFaultKey(key: string): Fault | null {
  const [kind, x, y] = key.split(':');
  try {
    switch (kind) {
      case 'stuck':
        if (y !== '0' && y !== '1') return null;
        return { kind, net: netId(x), value: y === '1' ? 1 : 0 };
      case 'open':
        return { kind, pin: pinId(x) };
      case 'short': {
        const a = netId(x);
        const b = netId(y);
        return SHORT_PAIRS.some(([p, q]) => p === a && q === b) ? { kind, a, b } : null;
      }
      case 'rom': {
        const addr = Number(x);
        const bit = Number(y);
        if (!Number.isInteger(addr) || addr < 0 || addr > 511 || !Number.isInteger(bit) || bit < 0 || bit > 15) return null;
        return { kind, addr, bit };
      }
      case 'dead':
        return (CHIP_IDS as readonly string[]).includes(x) ? { kind, chip: x as ChipId } : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function describeRomAddress(addr: number): string {
  const { cf, zf, op, step } = decodeRomAddress(addr);
  const m = MNEMONIC_OF[op] ?? `op ${op}`;
  return `${m} T${step} (CF=${cf} ZF=${zf})`;
}

export function describeFault(f: Fault): string {
  switch (f.kind) {
    case 'stuck': return `${NETS[f.net].name} stuck at ${f.value}`;
    case 'open': return `${PINS[f.pin].id} open (${PINS[f.pin].dir === 'in' ? 'input floats high' : 'output not reaching net'})`;
    case 'short': return `${NETS[f.a].name} shorted to ${NETS[f.b].name}`;
    case 'rom': {
      const was = (MICROCODE[f.addr] >> f.bit) & 1;
      return `ROM ${describeRomAddress(f.addr)}: ${CONTROL_LINES[f.bit]} flipped ${was} to ${1 - was}`;
    }
    case 'dead': return `${f.chip} chip dead`;
  }
}

/** The chip a fault lives on, if any (nets and shorts belong to the board). */
export function faultChip(f: Fault): ChipId | null {
  switch (f.kind) {
    case 'open': return PINS[f.pin].chip;
    case 'rom': return 'CTRL';
    case 'dead': return f.chip;
    default: return null;
  }
}

export const SHORT_PAIRS: readonly (readonly [number, number])[] = Array.from({ length: 7 }, (_, i) => [
  netId(`BUS${i}`),
  netId(`BUS${i + 1}`),
]);

function buildCatalog(): Fault[] {
  const out: Fault[] = [];
  NETS.forEach((_, net) => {
    out.push({ kind: 'stuck', net, value: 0 }, { kind: 'stuck', net, value: 1 });
  });
  PINS.forEach((_, pin) => out.push({ kind: 'open', pin }));
  for (const [a, b] of SHORT_PAIRS) out.push({ kind: 'short', a, b });
  for (const chip of CHIP_IDS) out.push({ kind: 'dead', chip });
  for (let cf = 0; cf < 2; cf++) {
    for (let zf = 0; zf < 2; zf++) {
      for (const op of USED_OPCODES) {
        for (let step = 0; step < STEPS; step++) {
          for (let bit = 0; bit < 16; bit++) out.push({ kind: 'rom', addr: romAddress(cf, zf, op, step), bit });
        }
      }
    }
  }
  return out;
}

/** Every single fault the tool knows about, in a fixed order. */
export const CATALOG: readonly Fault[] = buildCatalog();

const catalogIndex = new Map(CATALOG.map((f, i) => [faultKey(f), i]));
export function catalogIndexOf(f: Fault): number {
  const i = catalogIndex.get(faultKey(f));
  if (i === undefined) throw new Error(`fault not in catalog: ${faultKey(f)}`);
  return i;
}
