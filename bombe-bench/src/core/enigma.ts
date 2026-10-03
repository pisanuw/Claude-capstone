/**
 * Enigma I (Wehrmacht/Luftwaffe) model: rotors I-V, reflectors A/B/C, ring
 * settings, plugboard, and the stepping mechanism including the famous
 * double step of the middle rotor. Every keypress returns the complete
 * signal path so the UI can light it up component by component.
 */

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const N = 26;

export type RotorName = 'I' | 'II' | 'III' | 'IV' | 'V';
export type ReflectorName = 'A' | 'B' | 'C';

export interface RotorSpec {
  name: RotorName;
  wiring: string;
  /** Letter shown in the window when the pawl will engage on the next step. */
  notch: string;
}

export const ROTORS: Record<RotorName, RotorSpec> = {
  I: { name: 'I', wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', notch: 'Q' },
  II: { name: 'II', wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE', notch: 'E' },
  III: { name: 'III', wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO', notch: 'V' },
  IV: { name: 'IV', wiring: 'ESOVPZJAYQUIRHXLNFTGKDCMWB', notch: 'J' },
  V: { name: 'V', wiring: 'VZBRGITYUPSDNHLXAWMJQOFECK', notch: 'Z' },
};

export const REFLECTORS: Record<ReflectorName, string> = {
  A: 'EJMZALYXVBWFCRQUONTSPIKHGD',
  B: 'YRUHQSLDPXNGOKMIEBFZCWVJAT',
  C: 'FVPJIAOYEDRZXWGCTKUQSBNMHL',
};

export const ROTOR_NAMES: RotorName[] = ['I', 'II', 'III', 'IV', 'V'];
export const REFLECTOR_NAMES: ReflectorName[] = ['A', 'B', 'C'];

/** Machine settings. Rotor arrays are left to right (slow, middle, fast). */
export interface EnigmaConfig {
  rotors: [RotorName, RotorName, RotorName];
  reflector: ReflectorName;
  /** Ring settings as letters, left to right (A = 01). */
  rings: string;
  /** Window positions as letters, left to right. */
  positions: string;
  /** Plugboard pairs, e.g. "AM FI NV". Empty string = no plugs. */
  plugboard: string;
}

export const DEFAULT_CONFIG: EnigmaConfig = {
  rotors: ['I', 'II', 'III'],
  reflector: 'B',
  rings: 'AAA',
  positions: 'AAA',
  plugboard: '',
};

export function idx(ch: string): number {
  return ch.charCodeAt(0) - 65;
}

export function chr(i: number): string {
  return ALPHABET[((i % N) + N) % N];
}

export function mod(a: number): number {
  return ((a % N) + N) % N;
}

/** Keeps only A-Z, upper-casing on the way. */
export function normalizeText(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '');
}

/** Groups text in blocks of five, the way Enigma traffic was written down. */
export function groupFives(s: string): string {
  return s.replace(/(.{5})(?=.)/g, '$1 ');
}

/** Parses "AM FI NV" (also accepts "AMFINV" or "A-M, F-I") into a 26-entry involution. */
export function parsePlugboard(spec: string): { map: number[]; pairs: [string, string][]; error?: string } {
  const map = Array.from({ length: N }, (_, i) => i);
  const pairs: [string, string][] = [];
  const letters = normalizeText(spec);
  if (letters.length % 2 !== 0) return { map, pairs, error: 'Plugboard needs pairs of letters.' };
  const used = new Set<string>();
  for (let i = 0; i < letters.length; i += 2) {
    const a = letters[i];
    const b = letters[i + 1];
    if (a === b) return { map, pairs, error: `A plug cannot connect ${a} to itself.` };
    if (used.has(a) || used.has(b)) return { map, pairs, error: `Letter ${used.has(a) ? a : b} is plugged twice.` };
    used.add(a);
    used.add(b);
    map[idx(a)] = idx(b);
    map[idx(b)] = idx(a);
    pairs.push([a, b]);
  }
  if (pairs.length > 13) return { map, pairs, error: 'At most 13 plug pairs.' };
  return { map, pairs };
}

export function formatPlugboard(map: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < N; i++) if (map[i] > i) out.push(chr(i) + chr(map[i]));
  return out.join(' ');
}

/** Validates a config; returns a list of human readable problems (empty = fine). */
export function validateConfig(c: EnigmaConfig): string[] {
  const problems: string[] = [];
  if (new Set(c.rotors).size !== 3) problems.push('Each rotor can be used only once.');
  if (!/^[A-Z]{3}$/.test(c.rings)) problems.push('Ring settings must be three letters.');
  if (!/^[A-Z]{3}$/.test(c.positions)) problems.push('Positions must be three letters.');
  const pb = parsePlugboard(c.plugboard);
  if (pb.error) problems.push(pb.error);
  return problems;
}

export interface RotorState {
  spec: RotorSpec;
  /** Window position 0-25. */
  pos: number;
  /** Ring setting 0-25 (A = 0). */
  ring: number;
  fwd: Int8Array;
  bwd: Int8Array;
}

function makeRotor(name: RotorName, pos: number, ring: number): RotorState {
  const spec = ROTORS[name];
  const fwd = new Int8Array(N);
  const bwd = new Int8Array(N);
  for (let i = 0; i < N; i++) {
    const o = idx(spec.wiring[i]);
    fwd[i] = o;
    bwd[o] = i;
  }
  return { spec, pos, ring, fwd, bwd };
}

/** One hop of the signal through a component. */
export interface Hop {
  component: 'plugboard-in' | 'rotor-R' | 'rotor-M' | 'rotor-L' | 'reflector' | 'rotor-L-back' | 'rotor-M-back' | 'rotor-R-back' | 'plugboard-out';
  from: number;
  to: number;
}

export interface Trace {
  input: number;
  output: number;
  hops: Hop[];
  /** Window positions after the step that preceded this keypress. */
  positions: string;
  /** Which rotors moved on this keypress: [left, middle, right]. */
  stepped: [boolean, boolean, boolean];
}

export class Enigma {
  readonly left: RotorState;
  readonly middle: RotorState;
  readonly right: RotorState;
  readonly reflector: Int8Array;
  readonly reflectorName: ReflectorName;
  readonly plug: number[];
  readonly config: EnigmaConfig;

  constructor(config: EnigmaConfig) {
    const problems = validateConfig(config);
    if (problems.length) throw new Error(problems.join(' '));
    this.config = { ...config, rotors: [...config.rotors] as [RotorName, RotorName, RotorName] };
    this.left = makeRotor(config.rotors[0], idx(config.positions[0]), idx(config.rings[0]));
    this.middle = makeRotor(config.rotors[1], idx(config.positions[1]), idx(config.rings[1]));
    this.right = makeRotor(config.rotors[2], idx(config.positions[2]), idx(config.rings[2]));
    this.reflectorName = config.reflector;
    const r = REFLECTORS[config.reflector];
    this.reflector = new Int8Array(N);
    for (let i = 0; i < N; i++) this.reflector[i] = idx(r[i]);
    this.plug = parsePlugboard(config.plugboard).map;
  }

  get positions(): string {
    return chr(this.left.pos) + chr(this.middle.pos) + chr(this.right.pos);
  }

  setPositions(p: string): void {
    this.left.pos = idx(p[0]);
    this.middle.pos = idx(p[1]);
    this.right.pos = idx(p[2]);
  }

  /**
   * Advances the rotors as the keypress does, before the signal flows.
   * The right rotor always steps. The middle rotor steps when the right
   * rotor is at its notch, or when the middle rotor itself is at its notch
   * (the double step, because its pawl then also pushes the left rotor).
   */
  step(): [boolean, boolean, boolean] {
    const rightAtNotch = this.right.pos === idx(this.right.spec.notch);
    const middleAtNotch = this.middle.pos === idx(this.middle.spec.notch);
    const stepL = middleAtNotch;
    const stepM = rightAtNotch || middleAtNotch;
    if (stepL) this.left.pos = mod(this.left.pos + 1);
    if (stepM) this.middle.pos = mod(this.middle.pos + 1);
    this.right.pos = mod(this.right.pos + 1);
    return [stepL, stepM, true];
  }

  /** Would the middle rotor move on any of the next `n` keypresses? */
  turnoverWithin(n: number): boolean {
    const copy = new Enigma({ ...this.config, positions: this.positions });
    for (let i = 0; i < n; i++) {
      const [, m] = copy.step();
      if (m) return true;
    }
    return false;
  }

  /** The current rotor-stack permutation (plugboard excluded), without stepping. */
  scrambler(): Int8Array {
    const out = new Int8Array(N);
    for (let c = 0; c < N; c++) out[c] = this.throughRotors(c);
    return out;
  }

  private throughRotors(c: number): number {
    c = rotorFwd(this.right, c);
    c = rotorFwd(this.middle, c);
    c = rotorFwd(this.left, c);
    c = this.reflector[c];
    c = rotorBwd(this.left, c);
    c = rotorBwd(this.middle, c);
    c = rotorBwd(this.right, c);
    return c;
  }

  /** Presses one key: steps, then returns the full path. */
  press(ch: string): Trace {
    const stepped = this.step();
    const input = idx(ch);
    const hops: Hop[] = [];
    let c = input;
    let d = this.plug[c];
    hops.push({ component: 'plugboard-in', from: c, to: d });
    c = d;
    d = rotorFwd(this.right, c);
    hops.push({ component: 'rotor-R', from: c, to: d });
    c = d;
    d = rotorFwd(this.middle, c);
    hops.push({ component: 'rotor-M', from: c, to: d });
    c = d;
    d = rotorFwd(this.left, c);
    hops.push({ component: 'rotor-L', from: c, to: d });
    c = d;
    d = this.reflector[c];
    hops.push({ component: 'reflector', from: c, to: d });
    c = d;
    d = rotorBwd(this.left, c);
    hops.push({ component: 'rotor-L-back', from: c, to: d });
    c = d;
    d = rotorBwd(this.middle, c);
    hops.push({ component: 'rotor-M-back', from: c, to: d });
    c = d;
    d = rotorBwd(this.right, c);
    hops.push({ component: 'rotor-R-back', from: c, to: d });
    c = d;
    d = this.plug[c];
    hops.push({ component: 'plugboard-out', from: c, to: d });
    return { input, output: d, hops, positions: this.positions, stepped };
  }

  /** Enciphers a whole string (non-letters dropped), returning the text and every trace. */
  encipher(text: string): { text: string; traces: Trace[] } {
    const traces: Trace[] = [];
    let out = '';
    for (const ch of normalizeText(text)) {
      const t = this.press(ch);
      traces.push(t);
      out += chr(t.output);
    }
    return { text: out, traces };
  }
}

export function rotorFwd(r: RotorState, c: number): number {
  const shift = r.pos - r.ring;
  return mod(r.fwd[mod(c + shift)] - shift);
}

export function rotorBwd(r: RotorState, c: number): number {
  const shift = r.pos - r.ring;
  return mod(r.bwd[mod(c + shift)] - shift);
}

/** Convenience: enciphers text with a config without keeping the machine around. */
export function encipher(config: EnigmaConfig, text: string): string {
  return new Enigma(config).encipher(text).text;
}

/**
 * Cycle decomposition of a permutation given as an array, e.g. the rotor
 * wiring at a given offset or the full scrambler (whose cycles are all
 * 2-cycles, which is exactly why Enigma never maps a letter to itself).
 */
export function cycles(perm: ArrayLike<number>): number[][] {
  const seen = new Uint8Array(N);
  const out: number[][] = [];
  for (let s = 0; s < N; s++) {
    if (seen[s]) continue;
    const cyc: number[] = [];
    let c = s;
    while (!seen[c]) {
      seen[c] = 1;
      cyc.push(c);
      c = perm[c];
    }
    out.push(cyc);
  }
  return out;
}

export function formatCycles(cs: number[][]): string {
  return cs.map((c) => '(' + c.map(chr).join('') + ')').join('');
}

/** Rotor wiring as a permutation when the rotor shows `pos` with ring `ring`. */
export function rotorPermutation(name: RotorName, pos: number, ring: number): number[] {
  const r = makeRotor(name, pos, ring);
  return Array.from({ length: N }, (_, c) => rotorFwd(r, c));
}

/** All 60 ordered choices of three distinct rotors from I-V. */
export function allRotorOrders(names: RotorName[] = ROTOR_NAMES): [RotorName, RotorName, RotorName][] {
  const out: [RotorName, RotorName, RotorName][] = [];
  for (const a of names) for (const b of names) for (const c of names) if (a !== b && b !== c && a !== c) out.push([a, b, c]);
  return out;
}
