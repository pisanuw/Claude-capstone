import { describe, expect, it } from 'vitest';
import {
  Enigma,
  allRotorOrders,
  cycles,
  encipher,
  formatCycles,
  formatPlugboard,
  groupFives,
  normalizeText,
  parsePlugboard,
  rotorPermutation,
  validateConfig,
  type EnigmaConfig,
} from '../src/core/enigma';

const BASE: EnigmaConfig = { rotors: ['I', 'II', 'III'], reflector: 'B', rings: 'AAA', positions: 'AAA', plugboard: '' };

describe('Enigma I', () => {
  it('matches the textbook vector AAAAA -> BDZGO', () => {
    expect(encipher(BASE, 'AAAAA')).toBe('BDZGO');
  });

  it('is its own inverse at the same start position', () => {
    const ct = encipher(BASE, 'HELLOWORLD');
    expect(encipher(BASE, ct)).toBe('HELLOWORLD');
  });

  it('never enciphers a letter to itself', () => {
    const e = new Enigma({ ...BASE, plugboard: 'AB CD' });
    for (let i = 0; i < 500; i++) {
      const ch = String.fromCharCode(65 + (i % 26));
      const t = e.press(ch);
      expect(t.output).not.toBe(t.input);
    }
  });

  it('double-steps the middle rotor: ADU -> ADV -> AEW -> BFX -> BFY', () => {
    const e = new Enigma({ ...BASE, positions: 'ADU' });
    const seq: string[] = [];
    for (let i = 0; i < 4; i++) {
      const t = e.press('A');
      seq.push(t.positions);
    }
    expect(seq).toEqual(['ADV', 'AEW', 'BFX', 'BFY']);
    expect(e.press('A').positions).toBe('BFZ');
  });

  it('reports which rotors stepped', () => {
    const e = new Enigma({ ...BASE, positions: 'ADU' });
    expect(e.press('A').stepped).toEqual([false, false, true]);
    expect(e.press('A').stepped).toEqual([false, true, true]);
    expect(e.press('A').stepped).toEqual([true, true, true]);
  });

  it('decrypts the 1930 Enigma instruction manual message (rings, plugboard, UKW-A)', () => {
    const ct = 'GCDSE AHUGW TQGRK VLFGX UCALX VYMIG MMNMF DXTGN VHVRM MEVOU YFZSL RHDRR XFJWC FHUHM UNZEF RDISI KBGPM YVXUZ';
    const pt = encipher({ rotors: ['II', 'I', 'III'], reflector: 'A', rings: 'XMV', positions: 'ABL', plugboard: 'AM FI NV PS TU WZ' }, ct);
    expect(pt).toBe('FEINDLIQEINFANTERIEKOLONNEBEOBAQTETXANFANGSUEDAUSGANGBAERWALDEXENDEDREIKMOSTWAERTSNEUSTADT');
  });

  it('records the nine hops of the signal path', () => {
    const e = new Enigma({ ...BASE, plugboard: 'AZ' });
    const t = e.press('A');
    expect(t.hops.map((h) => h.component)).toEqual(['plugboard-in', 'rotor-R', 'rotor-M', 'rotor-L', 'reflector', 'rotor-L-back', 'rotor-M-back', 'rotor-R-back', 'plugboard-out']);
    expect(t.hops[0]).toEqual({ component: 'plugboard-in', from: 0, to: 25 });
    for (let i = 1; i < t.hops.length; i++) expect(t.hops[i].from).toBe(t.hops[i - 1].to);
    expect(t.hops[8].to).toBe(t.output);
  });

  it('ring settings shift the wiring but not the window letters', () => {
    const a = encipher({ ...BASE, rings: 'AAA' }, 'AAAAA');
    const b = encipher({ ...BASE, rings: 'BBB' }, 'AAAAA');
    expect(a).not.toBe(b);
    // Ring B with position one step further is the same wiring offset as ring A at A,
    // except that the notch (tied to the window) moves. Short texts agree.
    const c = encipher({ ...BASE, rings: 'BBB', positions: 'BBB' }, 'AAA');
    expect(c).toBe(a.slice(0, 3));
  });

  it('exposes the scrambler as a fixed-point-free involution', () => {
    const e = new Enigma({ ...BASE, positions: 'QEV' });
    const s = e.scrambler();
    for (let i = 0; i < 26; i++) {
      expect(s[i]).not.toBe(i);
      expect(s[s[i]]).toBe(i);
    }
  });

  it('predicts middle-rotor turnover within a span', () => {
    const e = new Enigma({ ...BASE, positions: 'AAT' }); // rotor III notch V: T->U, U->V, V->W steps the middle
    expect(e.turnoverWithin(2)).toBe(false);
    expect(e.turnoverWithin(3)).toBe(true);
    expect(e.positions).toBe('AAT');
  });

  it('setPositions moves the window', () => {
    const e = new Enigma(BASE);
    e.setPositions('XYZ');
    expect(e.positions).toBe('XYZ');
  });

  it('rejects bad settings', () => {
    expect(validateConfig({ ...BASE, rotors: ['I', 'I', 'II'] })).toContain('Each rotor can be used only once.');
    expect(validateConfig({ ...BASE, rings: 'AB' })[0]).toMatch(/Ring/);
    expect(validateConfig({ ...BASE, positions: 'ABCD' })[0]).toMatch(/Positions/);
    expect(() => new Enigma({ ...BASE, plugboard: 'AA' })).toThrow(/itself/);
  });
});

describe('plugboard', () => {
  it('parses pairs in several spellings', () => {
    expect(parsePlugboard('AM FI').pairs).toEqual([['A', 'M'], ['F', 'I']]);
    expect(parsePlugboard('am-fi, nv').pairs).toEqual([['A', 'M'], ['F', 'I'], ['N', 'V']]);
    const m = parsePlugboard('AM').map;
    expect(m[0]).toBe(12);
    expect(m[12]).toBe(0);
    expect(m[1]).toBe(1);
  });

  it('flags odd length, duplicates and too many pairs', () => {
    expect(parsePlugboard('ABC').error).toMatch(/pairs/);
    expect(parsePlugboard('AB AC').error).toMatch(/plugged twice/);
    expect(parsePlugboard('ABCDEFGHIJKLMNOPQRSTUVWXYZ').pairs.length).toBe(13);
    expect(parsePlugboard('ABCDEFGHIJKLMNOPQRSTUVWXYZ').error).toBeUndefined();
  });

  it('formats a map back to pairs', () => {
    expect(formatPlugboard(parsePlugboard('ZA MB').map)).toBe('AZ BM');
    expect(formatPlugboard(parsePlugboard('').map)).toBe('');
  });
});

describe('helpers', () => {
  it('normalizes and groups text', () => {
    expect(normalizeText('Hello, World! 123')).toBe('HELLOWORLD');
    expect(groupFives('ABCDEFGHIJKL')).toBe('ABCDE FGHIJ KL');
    expect(groupFives('ABCDE')).toBe('ABCDE');
  });

  it('decomposes permutations into cycles', () => {
    const cs = cycles([1, 0, 3, 4, 2, ...Array.from({ length: 21 }, (_, i) => i + 5)]);
    expect(formatCycles(cs.slice(0, 2))).toBe('(AB)(CDE)');
    expect(cs.length).toBe(23);
  });

  it('rotor permutation at window A ring A equals the wiring', () => {
    const p = rotorPermutation('I', 0, 0);
    expect(p.map((i) => String.fromCharCode(65 + i)).join('')).toBe('EKMFLGDQVZNTOWYHXUSPAIBRCJ');
    const shifted = rotorPermutation('I', 1, 0);
    expect(shifted).not.toEqual(p);
    // Conjugation keeps cycle lengths.
    expect(cycles(shifted).map((c) => c.length).sort()).toEqual(cycles(p).map((c) => c.length).sort());
  });

  it('enumerates 60 rotor orders', () => {
    expect(allRotorOrders().length).toBe(60);
    expect(allRotorOrders(['I', 'II', 'III']).length).toBe(6);
    expect(allRotorOrders(['I'])).toEqual([]);
  });
});
