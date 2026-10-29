import { describe, expect, it } from 'vitest';
import {
  CATALOG, SHORT_PAIRS, catalogIndexOf, describeFault, describeRomAddress, faultChip, faultKey, parseFaultKey, type Fault,
} from '../src/core/faults';
import { NET_COUNT, PIN_COUNT, netId, pinId, signalName, pinsOf, NET_DRIVERS, CHIP_IDS } from '../src/core/netlist';
import { romAddress, OPCODES } from '../src/core/isa';

describe('netlist', () => {
  it('has 52 nets and 168 pins', () => {
    expect(NET_COUNT).toBe(52);
    expect(PIN_COUNT).toBe(168);
    expect(signalName(NET_COUNT)).toBe('PC.D0');
    expect(signalName(0)).toBe('BUS0');
  });
  it('every net has a driver and every chip has pins', () => {
    NET_DRIVERS.forEach((d) => expect(d.length).toBeGreaterThan(0));
    for (const c of CHIP_IDS) expect(pinsOf(c).length).toBeGreaterThan(0);
  });
  it('rejects unknown names', () => {
    expect(() => netId('NOPE')).toThrow();
    expect(() => pinId('X.Y')).toThrow();
  });
});

describe('fault catalog', () => {
  it('covers every kind once', () => {
    const keys = new Set(CATALOG.map(faultKey));
    expect(keys.size).toBe(CATALOG.length);
    expect(CATALOG.length).toBe(52 * 2 + 168 + 7 + 11 + 4 * 11 * 5 * 16);
    expect(SHORT_PAIRS).toHaveLength(7);
  });

  it('round-trips every key', () => {
    for (const f of CATALOG) expect(parseFaultKey(faultKey(f))).toEqual(f);
    expect(catalogIndexOf(CATALOG[42])).toBe(42);
  });

  it.each(['', 'stuck:BUS0:2', 'stuck:NOPE:1', 'open:X.Y', 'short:BUS0:BUS2', 'rom:600:1', 'rom:1:16', 'dead:CPU', 'zap:1'])(
    'rejects %j',
    (k) => expect(parseFaultKey(k)).toBeNull(),
  );

  it('refuses faults outside the catalog', () => {
    expect(() => catalogIndexOf({ kind: 'rom', addr: romAddress(0, 0, 9, 2), bit: 0 })).toThrow();
  });

  it('describes faults in words', () => {
    const cases: [Fault, RegExp, string | null][] = [
      [{ kind: 'stuck', net: netId('BUS3'), value: 1 }, /BUS3 stuck at 1/, null],
      [{ kind: 'open', pin: pinId('RAM.Y3') }, /RAM.Y3 open \(output/, 'RAM'],
      [{ kind: 'open', pin: pinId('OUT.D0') }, /input floats high/, 'OUT'],
      [{ kind: 'short', a: netId('BUS0'), b: netId('BUS1') }, /BUS0 shorted to BUS1/, null],
      [{ kind: 'rom', addr: romAddress(0, 0, OPCODES.OUT, 2), bit: 11 }, /OUT T2 \(CF=0 ZF=0\): OI flipped 1 to 0/, 'CTRL'],
      [{ kind: 'dead', chip: 'ALU' }, /ALU chip dead/, 'ALU'],
    ];
    for (const [f, re, chip] of cases) {
      expect(describeFault(f)).toMatch(re);
      expect(faultChip(f)).toBe(chip);
    }
    expect(describeRomAddress(romAddress(1, 1, 9, 0))).toBe('op 9 T0 (CF=1 ZF=1)');
  });
});
