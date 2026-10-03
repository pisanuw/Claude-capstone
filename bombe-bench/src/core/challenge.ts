/**
 * Instructor challenges: a message enciphered with hidden settings, a crib,
 * and a link that carries all of it. The settings travel inside the link
 * (lightly obfuscated, not encrypted) so the page can grade an answer and
 * reveal the solution without a server.
 */
import { Enigma, ROTOR_NAMES, allRotorOrders, chr, formatPlugboard, idx, mod, normalizeText, type EnigmaConfig, type ReflectorName, type RotorName } from './enigma';

export interface Challenge {
  v: 1;
  ciphertext: string;
  crib: string;
  /** Offset of the crib in the message when the challenge tells the student; -1 = slide it yourself. */
  offset: number;
  settings: EnigmaConfig;
  plaintext: string;
  title: string;
}

export interface ChallengeOptions {
  plugPairs?: number; // default 10
  randomRings?: boolean; // default false (rings AAA)
  revealOffset?: boolean; // default false
  reflector?: ReflectorName; // default B
  /** Index into the message bank; random when omitted. */
  message?: number;
}

/** Deterministic PRNG (mulberry32) so tests and seeded links are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Message bank. Each has a stereotyped phrase a cryptanalyst could guess
 * (the crib) somewhere inside. Spelling follows Enigma practice: X as a
 * full stop or separator, no umlauts, numbers written out.
 */
export const MESSAGES: { title: string; text: string; crib: string }[] = [
  { title: 'Weather report', text: 'WETTERVORHERSAGEBISKAYAXNORDWESTVIERXREGENSCHAUERXSICHTGUT', crib: 'WETTERVORHERSAGE' },
  { title: 'Nothing to report', text: 'ANXGRUPPEXKEINEBESONDERENEREIGNISSEXSTELLUNGUNVERAENDERT', crib: 'KEINEBESONDERENEREIGNISSE' },
  { title: 'Convoy sighted', text: 'FEINDLICHERGELEITZUGGESICHTETXKURSNORDOSTXZWOELFKNOTEN', crib: 'GELEITZUGGESICHTET' },
  { title: 'High command', text: 'OBERKOMMANDODERWEHRMACHTXBEFIEHLTXSOFORTIGENRUECKZUG', crib: 'OBERKOMMANDODERWEHRMACHT' },
  { title: 'Daily weather', text: 'XWETTERBERICHTXMORGENSXNEBELXNACHMITTAGSXAUFKLAREND', crib: 'WETTERBERICHT' },
  { title: 'Position report', text: 'STANDORTXQUADRATXANTONXDREIXSIEBENXTREIBSTOFFXKNAPP', crib: 'STANDORTXQUADRAT' },
  { title: 'Fuel and water', text: 'ERBITTEXTREIBSTOFFUNDWASSERXANKUNFTXMORGENXFRUEH', crib: 'TREIBSTOFFUNDWASSER' },
  { title: 'Weather, Biscay', text: 'VONXUBOOTXWETTERVORHERSAGEBISKAYAXSEEGANGXSTARK', crib: 'WETTERVORHERSAGE' },
];

export function randomPlugboard(random: () => number, pairs: number): string {
  const letters = Array.from({ length: 26 }, (_, i) => chr(i));
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  const out: string[] = [];
  for (let i = 0; i < Math.min(13, Math.max(0, pairs)); i++) out.push(letters[2 * i] + letters[2 * i + 1]);
  return out.join(' ');
}

export function randomConfig(random: () => number, opts: ChallengeOptions = {}): EnigmaConfig {
  const orders = allRotorOrders(ROTOR_NAMES);
  const rotors = orders[Math.floor(random() * orders.length)];
  const letters = () => chr(Math.floor(random() * 26)) + chr(Math.floor(random() * 26)) + chr(Math.floor(random() * 26));
  return {
    rotors: [...rotors] as [RotorName, RotorName, RotorName],
    reflector: opts.reflector ?? 'B',
    rings: opts.randomRings ? letters() : 'AAA',
    positions: letters(),
    plugboard: randomPlugboard(random, opts.plugPairs ?? 10),
  };
}

/**
 * Makes a challenge whose middle rotor does not turn over while the crib is
 * being enciphered (the Bombe's standing assumption); positions are redrawn
 * until that holds.
 */
export function generateChallenge(seed: number, opts: ChallengeOptions = {}): Challenge {
  const random = rng(seed);
  const m = MESSAGES[opts.message ?? Math.floor(random() * MESSAGES.length)];
  const offset = m.text.indexOf(m.crib);
  let settings = randomConfig(random, opts);
  for (let tries = 0; tries < 200; tries++) {
    const e = new Enigma(settings);
    for (let i = 0; i < offset; i++) e.step();
    if (!e.turnoverWithin(m.crib.length)) break;
    settings = { ...settings, positions: randomConfig(random, opts).positions };
  }
  const ciphertext = new Enigma(settings).encipher(m.text).text;
  return { v: 1, ciphertext, crib: m.crib, offset: opts.revealOffset ? offset : -1, settings, plaintext: m.text, title: m.title };
}

/** Student-facing view: everything except the answer. */
export function publicView(c: Challenge): { ciphertext: string; crib: string; offset: number; title: string } {
  return { ciphertext: c.ciphertext, crib: c.crib, offset: c.offset, title: c.title };
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Obfuscates the answer so it is not readable at a glance in the URL. Not a secret. */
function veil(s: string): string {
  return toBase64Url([...s].reverse().join(''));
}

function unveil(s: string): string {
  return [...fromBase64Url(s)].reverse().join('');
}

export function encodeChallenge(c: Challenge): string {
  const pub = { t: c.title, c: c.ciphertext, k: c.crib, o: c.offset };
  const secret = { s: c.settings, p: c.plaintext };
  return toBase64Url(JSON.stringify(pub)) + '.' + veil(JSON.stringify(secret));
}

export function decodeChallenge(s: string): Challenge | null {
  try {
    const [a, b] = s.split('.');
    const pub = JSON.parse(fromBase64Url(a)) as { t: string; c: string; k: string; o: number };
    const secret = JSON.parse(unveil(b)) as { s: EnigmaConfig; p: string };
    if (typeof pub.c !== 'string' || typeof pub.k !== 'string' || !secret.s || typeof secret.p !== 'string') return null;
    return { v: 1, ciphertext: pub.c, crib: pub.k, offset: pub.o ?? -1, settings: secret.s, plaintext: secret.p, title: pub.t ?? 'Challenge' };
  } catch {
    return null;
  }
}

/** Grades a decryption attempt letter by letter. */
export function gradeAnswer(c: Challenge, answer: string): { correct: number; total: number; marks: boolean[]; solved: boolean } {
  const a = normalizeText(answer);
  const p = c.plaintext;
  const marks = [...p].map((ch, i) => a[i] === ch);
  const correct = marks.filter(Boolean).length;
  return { correct, total: p.length, marks, solved: correct === p.length };
}

/**
 * The Bombe reports the window during the first crib letter (ring A). To
 * decrypt from the start of the message the rotors must be wound back
 * `offset + 1` keypresses; the right rotor is certain, the middle and left
 * may or may not have stepped, so the candidates are tried forward.
 */
export function inferStartPositions(rotors: [RotorName, RotorName, RotorName], reflector: ReflectorName, cribPositions: string, offset: number): string {
  const l = idx(cribPositions[0]);
  const m = idx(cribPositions[1]);
  const r = idx(cribPositions[2]);
  const back = offset + 1;
  const candidates: string[] = [];
  for (const dm of [0, 1, 2]) for (const dl of [0, 1]) candidates.push(chr(l - dl) + chr(m - dm) + chr(mod(r - back)));
  for (const cand of candidates) {
    const e = new Enigma({ rotors, reflector, rings: 'AAA', positions: cand, plugboard: '' });
    for (let i = 0; i < back; i++) e.step();
    if (e.positions === cribPositions) return cand;
  }
  return candidates[0];
}

/** Builds the machine settings a stop implies, with unknown plugs left straight. */
export function stopToConfig(rotors: [RotorName, RotorName, RotorName], reflector: ReflectorName, cribPositions: string, offset: number, steckers: number[]): EnigmaConfig {
  const map = Array.from({ length: 26 }, (_, i) => i);
  for (let x = 0; x < 26; x++) {
    const y = steckers[x];
    if (y >= 0 && y !== x) {
      map[x] = y;
      map[y] = x;
    }
  }
  return { rotors, reflector, rings: 'AAA', positions: inferStartPositions(rotors, reflector, cribPositions, offset), plugboard: formatPlugboard(map) };
}
