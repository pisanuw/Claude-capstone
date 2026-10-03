import { describe, expect, it } from 'vitest';
import { MESSAGES, decodeChallenge, encodeChallenge, generateChallenge, gradeAnswer, inferStartPositions, publicView, randomConfig, randomPlugboard, rng, stopToConfig } from '../src/core/challenge';
import { Enigma, encipher, parsePlugboard, validateConfig } from '../src/core/enigma';
import { buildMenu } from '../src/core/crib';
import { runBombe } from '../src/core/bombe';

describe('random settings', () => {
  it('rng is deterministic', () => {
    const a = rng(42);
    const b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(a()).toBeGreaterThanOrEqual(0);
    expect(a()).toBeLessThan(1);
  });

  it('plugboards have the requested number of disjoint pairs', () => {
    for (const n of [0, 1, 10, 13, 20]) {
      const pb = randomPlugboard(rng(n), n);
      const parsed = parsePlugboard(pb);
      expect(parsed.error).toBeUndefined();
      expect(parsed.pairs.length).toBe(Math.min(13, n));
    }
  });

  it('randomConfig is valid and honours options', () => {
    const c = randomConfig(rng(7), { plugPairs: 3, randomRings: true, reflector: 'C' });
    expect(validateConfig(c)).toEqual([]);
    expect(c.reflector).toBe('C');
    expect(parsePlugboard(c.plugboard).pairs.length).toBe(3);
    expect(randomConfig(rng(7)).rings).toBe('AAA');
  });
});

describe('challenges', () => {
  it('generates a message whose crib span has no middle-rotor turnover', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const c = generateChallenge(seed);
      const offset = c.plaintext.indexOf(c.crib);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(c.offset).toBe(-1);
      const e = new Enigma(c.settings);
      for (let i = 0; i < offset; i++) e.step();
      expect(e.turnoverWithin(c.crib.length)).toBe(false);
      expect(encipher(c.settings, c.plaintext)).toBe(c.ciphertext);
    }
  });

  it('can reveal the offset and pick a message', () => {
    const c = generateChallenge(3, { revealOffset: true, message: 2 });
    expect(c.title).toBe(MESSAGES[2].title);
    expect(c.offset).toBe(MESSAGES[2].text.indexOf(MESSAGES[2].crib));
    expect(publicView(c)).toEqual({ ciphertext: c.ciphertext, crib: c.crib, offset: c.offset, title: c.title });
  });

  it('round-trips through the link encoding and rejects junk', () => {
    const c = generateChallenge(99, { randomRings: true });
    const s = encodeChallenge(c);
    expect(s).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(decodeChallenge(s)).toEqual(c);
    expect(decodeChallenge('nonsense')).toBeNull();
    expect(decodeChallenge('eyJ4IjoxfQ.eyJ4IjoxfQ')).toBeNull();
    expect(decodeChallenge('')).toBeNull();
  });

  it('grades an answer letter by letter', () => {
    const c = generateChallenge(5);
    const full = gradeAnswer(c, c.plaintext.toLowerCase() + ' extra');
    expect(full.solved).toBe(true);
    expect(full.correct).toBe(c.plaintext.length);
    const part = gradeAnswer(c, c.plaintext.slice(0, 10));
    expect(part.solved).toBe(false);
    expect(part.correct).toBe(10);
    expect(part.marks.slice(0, 10).every(Boolean)).toBe(true);
    expect(part.marks[10]).toBe(false);
  });

  it('the Bombe solves a generated challenge', () => {
    const c = generateChallenge(2024, { message: 0 });
    const offset = c.plaintext.indexOf(c.crib);
    const menu = buildMenu(c.ciphertext, c.crib, offset);
    const run = runBombe({ menu, reflector: 'B', rotorOrders: [c.settings.rotors] });
    const e = new Enigma(c.settings);
    for (let i = 0; i <= offset; i++) e.step();
    const hit = run.stops.find((s) => s.positions === e.positions);
    expect(hit).toBeDefined();
    expect(hit!.checked).toBe(true);
    const cfg = stopToConfig(c.settings.rotors, 'B', hit!.positions, offset, hit!.hypotheses[0].steckers);
    expect(cfg.positions).toBe(c.settings.positions);
    const plain = encipher(cfg, c.ciphertext);
    // Every crib letter decrypts; the rest depends on plugs the menu did not touch.
    expect(plain.slice(offset, offset + c.crib.length)).toBe(c.crib);
  });
});

describe('winding back to the message start', () => {
  it('finds the start position across a middle-rotor step', () => {
    // Rotor III (right) notch V: from AAU, pressing steps U->V, then V->W moves the middle.
    const rotors = ['I', 'II', 'III'] as const;
    const e = new Enigma({ rotors: [...rotors], reflector: 'B', rings: 'AAA', positions: 'AAU', plugboard: '' });
    for (let i = 0; i < 3; i++) e.step();
    expect(e.positions).toBe('ABX');
    expect(inferStartPositions([...rotors], 'B', 'ABX', 2)).toBe('AAU');
  });

  it('handles a double step and plain cases', () => {
    const rotors = ['I', 'II', 'III'] as const;
    const e = new Enigma({ rotors: [...rotors], reflector: 'B', rings: 'AAA', positions: 'ADU', plugboard: '' });
    for (let i = 0; i < 4; i++) e.step();
    expect(e.positions).toBe('BFY');
    expect(inferStartPositions([...rotors], 'B', 'BFY', 3)).toBe('ADU');
    expect(inferStartPositions([...rotors], 'B', 'AAB', 0)).toBe('AAA');
    expect(inferStartPositions([...rotors], 'B', 'AAA', 0)).toBe('AAZ');
  });

  it('stopToConfig keeps implied plugs and leaves unknowns straight', () => {
    const steckers = new Array(26).fill(-1);
    steckers[0] = 1;
    steckers[1] = 0;
    steckers[4] = 4;
    const cfg = stopToConfig(['I', 'II', 'III'], 'B', 'AAB', 0, steckers);
    expect(cfg.plugboard).toBe('AB');
    expect(cfg.rings).toBe('AAA');
    expect(cfg.positions).toBe('AAA');
  });
});
