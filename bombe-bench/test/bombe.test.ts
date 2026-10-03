import { describe, expect, it } from 'vitest';
import { closure, cribMatches, createBombeRun, loopsThrough, nodeLabel, positionString, runBombe, scramblerTable, scramblersAt, sortStops, traceHypothesis, wireMenu } from '../src/core/bombe';
import { buildMenu } from '../src/core/crib';
import { Enigma, chr, encipher, idx, type EnigmaConfig, type RotorName } from '../src/core/enigma';

const TRUE: EnigmaConfig = { rotors: ['II', 'IV', 'I'], reflector: 'B', rings: 'AAA', positions: 'KQZ', plugboard: 'AB CD EF GH IJ KL' };
const PLAIN = 'WETTERVORHERSAGEBISKAYA';
const CRIB = 'WETTERVORHERSAGE';
const CT = encipher(TRUE, PLAIN);
const MENU = buildMenu(CT, CRIB, 0);
const TRUE_AT_CRIB = 'KQA'; // window after the first step

describe('scrambler tables', () => {
  it('agree with the machine at ring setting A', () => {
    const table = scramblerTable(['I', 'II', 'III'], 'B');
    for (const pos of ['AAA', 'QEV', 'ZZZ', 'MCK']) {
      const e = new Enigma({ rotors: ['I', 'II', 'III'], reflector: 'B', rings: 'AAA', positions: pos, plugboard: '' });
      const s = e.scrambler();
      const base = ((idx(pos[0]) * 26 + idx(pos[1])) * 26 + idx(pos[2])) * 26;
      for (let x = 0; x < 26; x++) expect(table[base + x]).toBe(s[x]);
    }
  });

  it('scramblersAt advances only the right rotor', () => {
    const table = scramblerTable(['I', 'II', 'III'], 'C');
    const scr = scramblersAt(table, 'ABY', 3);
    const e = new Enigma({ rotors: ['I', 'II', 'III'], reflector: 'C', rings: 'AAA', positions: 'ABY', plugboard: '' });
    expect([...scr[0]]).toEqual([...e.scrambler()]);
    e.setPositions('ABZ');
    expect([...scr[1]]).toEqual([...e.scrambler()]);
    e.setPositions('ABA');
    expect([...scr[2]]).toEqual([...e.scrambler()]);
  });

  it('positionString inverts the index', () => {
    expect(positionString(0)).toBe('AAA');
    expect(positionString(26 * 26 * 26 - 1)).toBe('ZZZ');
    expect(positionString((2 * 26 + 3) * 26 + 4)).toBe('CDE');
  });
});

describe('menu wiring', () => {
  it('lists each edge from both ends', () => {
    const w = wireMenu(MENU);
    expect(w.adjStart[26]).toBe(MENU.edges.length * 2);
    for (const e of MENU.edges) {
      let found = false;
      for (let k = w.adjStart[e.a]; k < w.adjStart[e.a + 1]; k++) if (w.adjTo[k] === e.b && w.adjI[k] === e.i) found = true;
      expect(found).toBe(true);
    }
  });

  it('rotates loops to start at the test letter', () => {
    const loops = loopsThrough(MENU, MENU.testLetter);
    expect(loops.length).toBeGreaterThan(0);
    const table = scramblerTable(TRUE.rotors, 'B');
    const scr = scramblersAt(table, TRUE_AT_CRIB, CRIB.length);
    // Around a loop from T, the true plug partner of T is a fixed point.
    const T = MENU.testLetter;
    const partner = new Enigma(TRUE).plug[T];
    for (const path of loops) {
      let c = partner;
      for (const i of path) c = scr[i][c];
      expect(c).toBe(partner);
    }
    expect(loopsThrough(MENU, 25)).toEqual([]);
  });
});

describe('the Bombe', () => {
  it('finds the true rotor order and position with consistent plugs', () => {
    const orders: [RotorName, RotorName, RotorName][] = [['I', 'II', 'III'], ['II', 'IV', 'I'], ['V', 'III', 'II']];
    const run = runBombe({ menu: MENU, reflector: 'B', rotorOrders: orders });
    expect(run.total).toBe(3 * 17576);
    expect(run.configsDone).toBe(run.total);
    const hit = run.stops.find((s) => s.rotors.join() === 'II,IV,I' && s.positions === TRUE_AT_CRIB);
    expect(hit).toBeDefined();
    expect(hit!.checked).toBe(true);
    const h = hit!.hypotheses[0];
    expect(chr(hit!.testLetter) + chr(h.stecker)).toBe('EF');
    expect(h.contradictions).toEqual([]);
    expect(h.cribMatches).toBe(CRIB.length - 1); // V sits in a one-edge component that cannot be pinned
    // Implied plugs agree with the real plugboard wherever they are implied.
    const plug = new Enigma(TRUE).plug;
    for (let x = 0; x < 26; x++) if (h.steckers[x] >= 0) expect(h.steckers[x]).toBe(plug[x]);
    // The true stop sorts first.
    expect(sortStops(run.stops)[0]).toBe(hit);
    expect(run.stopCount).toBeGreaterThanOrEqual(run.stops.length);
  });

  it('steps one rotor order at a time and honours maxStops', () => {
    const run = createBombeRun({ menu: MENU, reflector: 'B', rotorOrders: [['II', 'IV', 'I'], ['I', 'II', 'III']], maxStops: 0 });
    expect(run.ordersDone).toBe(0);
    expect(run.next()).toBe(true);
    expect(run.ordersDone).toBe(1);
    expect(run.configsDone).toBe(17576);
    expect(run.next()).toBe(false);
    expect(run.next()).toBe(false);
    expect(run.stops).toEqual([]);
    expect(run.stopCount).toBeGreaterThan(0);
  });

  it('tests the other components and records failures', () => {
    // A tiny menu with two components: crib "AB" + "CD" style. Build from a real encipherment so the truth exists.
    const cfg: EnigmaConfig = { rotors: ['I', 'II', 'III'], reflector: 'B', rings: 'AAA', positions: 'AAA', plugboard: '' };
    const pt = 'ABCDABEF';
    const ct = encipher(cfg, pt);
    const menu = buildMenu(ct, pt, 0);
    const run = runBombe({ menu, reflector: 'B', rotorOrders: [['I', 'II', 'III']], maxStops: 2000 });
    const hit = run.stops.find((s) => s.positions === 'AAB');
    expect(hit).toBeDefined();
    expect(hit!.otherComponentsOk).toBe(hit!.otherComponents);
    // Weak menus stop a lot; some stops fail the checking machine.
    expect(run.stops.some((s) => !s.checked) || run.stops.length === 1).toBe(true);
  });

  it('uses an explicit test letter', () => {
    const run = runBombe({ menu: MENU, reflector: 'B', rotorOrders: [['II', 'IV', 'I']], testLetter: idx('T') });
    const hit = run.stops.find((s) => s.positions === TRUE_AT_CRIB);
    expect(hit?.testLetter).toBe(idx('T'));
    expect(hit?.hypotheses[0].stecker).toBe(idx('T')); // T is unplugged in TRUE
  });
});

describe('closure and traces', () => {
  const table = scramblerTable(TRUE.rotors, 'B');
  const scr = scramblersAt(table, TRUE_AT_CRIB, CRIB.length);
  const wiring = wireMenu(MENU);
  const T = MENU.testLetter;

  it('closure of the true hypothesis has no contradictions and reproduces the crib', () => {
    const c = closure(scr, wiring, T, idx('F'));
    expect(c.contradictions).toEqual([]);
    expect(c.steckers[T]).toBe(idx('F'));
    expect(c.steckers[idx('F')]).toBe(T);
    expect(cribMatches(scr, MENU.edges, c.steckers)).toBe(CRIB.length - 1); // closure alone: V sits in another component
    expect(c.nodes.length).toBeGreaterThan(2);
  });

  it('closure of a wrong hypothesis piles up contradictions', () => {
    const c = closure(scr, wiring, T, idx('A'));
    expect(c.contradictions.length).toBeGreaterThan(0);
  });

  it('traceHypothesis survives the truth and refutes the rest', () => {
    const good = traceHypothesis(scr, wiring, T, idx('F'));
    expect(good.refuted).toBe(false);
    expect(good.lit).toEqual([idx('F')]);
    let refuted = 0;
    for (let a = 0; a < 26; a++) if (traceHypothesis(scr, wiring, T, a).refuted) refuted++;
    expect(refuted).toBe(25);
    const bad = traceHypothesis(scr, wiring, T, idx('A'));
    expect(bad.refuted).toBe(true);
    expect(bad.steps.at(-1)!.contradiction).toBe(true);
    expect(bad.steps.some((s) => s.via === 'diagonal')).toBe(true);
    expect(bad.steps.filter((s) => s.via === 'edge').every((s) => s.edge !== undefined)).toBe(true);
  });

  it('without the diagonal board only loops refute', () => {
    const withDiag = traceHypothesis(scr, wiring, T, idx('A'), true);
    const noDiag = traceHypothesis(scr, wiring, T, idx('A'), false);
    expect(noDiag.steps.every((s) => s.via === 'edge')).toBe(true);
    expect(noDiag.refuted).toBe(true);
    expect(noDiag.steps.length).toBeGreaterThanOrEqual(withDiag.steps.length - 50);
  });

  it('a wrong position refutes every hypothesis', () => {
    const wrong = scramblersAt(table, 'AAA', CRIB.length);
    let survivors = 0;
    for (let a = 0; a < 26; a++) if (!traceHypothesis(wrong, wiring, T, a).refuted) survivors++;
    expect(survivors).toBe(0);
  });

  it('labels nodes', () => {
    expect(nodeLabel(idx('E') * 26 + idx('F'))).toBe('E→F');
  });
});
