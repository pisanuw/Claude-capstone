import { describe, expect, it } from 'vitest';
import {
  AsmError, MICROCODE, OPCODES, TEST_PROGRAMS, assemble, decodeRomAddress, describeWord, disassemble, lineBit, romAddress,
} from '../src/core/isa';

describe('assembler', () => {
  it('assembles instructions, labels, ORG and DB', () => {
    const bytes = assemble(`start: LDA x ; comment
      ADD 0x0f
      OUT
      JMP start
      ORG 14
x:    DB 0b101
      DB 255`);
    expect(bytes.slice(0, 4)).toEqual([0x1e, 0x2f, 0xe0, 0x60]);
    expect(bytes[14]).toBe(5);
    expect(bytes[15]).toBe(255);
    expect(bytes).toHaveLength(16);
  });

  it('is case-insensitive for mnemonics and labels', () => {
    expect(assemble('Loop: jmp LOOP')[0]).toBe(0x60);
  });

  it.each([
    ['FOO', /unknown instruction/],
    ['LDA', /needs an operand/],
    ['OUT 3', /takes no operand/],
    ['LDA 16', /operand must be 0..15/],
    ['DB 256', /0..255/],
    ['DB', /DB needs a value/],
    ['JMP nowhere', /unknown label/],
    ['a: NOP\na: NOP', /duplicate label/],
    ['ORG 16', /ORG needs/],
    ['ORG', /ORG needs/],
    ['NOP 1 2', /unexpected/],
    ['ORG 3\nNOP\nORG 3\nNOP', /written twice/],
    ['ORG 15\nNOP\nNOP', /does not fit/],
  ])('rejects %j', (src, msg) => {
    expect(() => assemble(src)).toThrow(msg);
  });

  it('reports the line number', () => {
    try {
      assemble('NOP\nBAD');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AsmError);
      expect((e as AsmError).line).toBe(2);
    }
  });

  it('disassembles', () => {
    expect(disassemble(0x1e)).toBe('LDA 14');
    expect(disassemble(0xf0)).toBe('HLT');
    expect(disassemble(0x90)).toBe('?? 9');
  });
});

describe('microcode', () => {
  it('fetches the same way for every opcode', () => {
    for (let op = 0; op < 16; op++) {
      expect(describeWord(MICROCODE[romAddress(0, 0, op, 0)])).toBe('MI CO');
      expect(describeWord(MICROCODE[romAddress(1, 1, op, 1)])).toBe('RO II CE');
    }
  });

  it('jumps conditionally on the flags bank', () => {
    const jc = (cf: number) => MICROCODE[romAddress(cf, 0, OPCODES.JC, 2)];
    expect(jc(0)).toBe(0);
    expect(jc(1)).toBe(lineBit('IO') | lineBit('J'));
    expect(MICROCODE[romAddress(0, 1, OPCODES.JZ, 2)]).toBe(lineBit('IO') | lineBit('J'));
    expect(describeWord(0)).toBe('(none)');
  });

  it('round-trips ROM addresses', () => {
    expect(decodeRomAddress(romAddress(1, 0, 7, 3))).toEqual({ cf: 1, zf: 0, op: 7, step: 3 });
  });

  it('ships four test programs that fit', () => {
    expect(TEST_PROGRAMS).toHaveLength(4);
    for (const p of TEST_PROGRAMS) expect(p.bytes).toHaveLength(16);
  });
});
