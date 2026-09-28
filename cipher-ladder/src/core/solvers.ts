/**
 * Deterministic attackers for each cipher. They stand in for the idea's
 * "AI debrief": after a student solves a rung, the solver's step-by-step
 * attempt on the same ciphertext is shown, including where it went wrong.
 * Every step records what was tried and what the evidence said, so the log
 * reads like a worked example rather than an oracle.
 */
import { column, frequencyOrder, icByPeriod, kasiski, symbolFrequencies, ENGLISH_ORDER } from './analysis.js';
import { columnLengths, homophonicSymbols, partialDecrypt, type CipherType, type StudentKey } from './ciphers.js';
import { englishModel, type LanguageModel } from './ngram.js';
import { makeRng } from './rng.js';
import { ALPHABET, AFFINE_MULTIPLIERS, ENGLISH_FREQ, ENGLISH_IC, chiSquared, indexLetter, letterIndex, modInverse26, onlyLetters } from './text.js';

export interface SolverStep {
  title: string;
  detail: string;
}

export interface SolverResult {
  cipher: CipherType;
  steps: SolverStep[];
  key: StudentKey;
  plaintext: string;
  /** Solver's own confidence in [0, 1], from the evidence it saw. */
  confidence: number;
}

function fmt(n: number, digits = 3): string {
  return n.toFixed(digits);
}

/**
 * Maps a per-letter model score to [0, 1]. Under the bundled model fluent
 * English scores about -12.6 per letter, shuffled English about -16.4 and
 * random letters about -18.7, so -16 is "no better than shuffled".
 */
export function englishness(perLetter: number): number {
  return Math.min(1, Math.max(0, (perLetter + 16) / 3.2));
}

/**
 * A climb over a short text can make garbage look fluent by overfitting the
 * common trigrams, so confidence is scaled down below 200 letters.
 */
export function lengthFactor(letters: number): number {
  return Math.min(1, letters / 200);
}

// ------------------------------------------------------------------ caesar

export function solveCaesar(cipher: string): SolverResult {
  const c = onlyLetters(cipher);
  const steps: SolverStep[] = [];
  const top = frequencyOrder(c)[0];
  const guess = (letterIndex(top) - letterIndex('E') + 26) % 26;
  steps.push({
    title: 'Guess from the most frequent letter',
    detail: `The most common ciphertext letter is ${top}. If it stands for E, the shift is ${guess}.`,
  });
  const scored = [];
  for (let s = 0; s < 26; s++) scored.push({ shift: s, chi: chiSquared(partialDecrypt(c, { type: 'caesar', shift: s })) });
  scored.sort((a, b) => a.chi - b.chi);
  const best = scored[0];
  const runner = scored[1];
  steps.push({
    title: 'Check every shift against English',
    detail: `Chi-squared against English letter frequencies for all 26 shifts. Best: shift ${best.shift} (${fmt(best.chi, 1)}); runner-up: shift ${runner.shift} (${fmt(runner.chi, 1)}).`,
  });
  if (best.shift !== guess) {
    steps.push({
      title: 'The frequency guess was wrong',
      detail: `Shift ${guess} scored ${fmt(scored.find((x) => x.shift === guess)!.chi, 1)}, so ${top} is not E here. The full comparison overrules the one-letter guess.`,
    });
  }
  const confidence = Math.min(1, Math.max(0, 1 - best.chi / runner.chi));
  return { cipher: 'caesar', steps, key: { type: 'caesar', shift: best.shift }, plaintext: partialDecrypt(c, { type: 'caesar', shift: best.shift }), confidence };
}

// ------------------------------------------------------------------ affine

export function solveAffine(cipher: string): SolverResult {
  const c = onlyLetters(cipher);
  const steps: SolverStep[] = [];
  const order = frequencyOrder(c);
  steps.push({
    title: 'Two equations from two letters',
    detail: `Most frequent ciphertext letters: ${order[0]} then ${order[1]}. If they are E and T, then a*4+b = ${letterIndex(order[0])} and a*19+b = ${letterIndex(order[1])} (mod 26), which pins a and b. Rather than trust that pairing, try all 312 valid (a, b) keys.`,
  });
  const scored = [];
  for (const a of AFFINE_MULTIPLIERS) for (let b = 0; b < 26; b++) scored.push({ a, b, chi: chiSquared(partialDecrypt(c, { type: 'affine', a, b })) });
  scored.sort((x, y) => x.chi - y.chi);
  const best = scored[0];
  const runner = scored[1];
  steps.push({
    title: 'Rank all 312 keys by chi-squared',
    detail: `Best: a = ${best.a}, b = ${best.b} (${fmt(best.chi, 1)}); runner-up: a = ${runner.a}, b = ${runner.b} (${fmt(runner.chi, 1)}). a must be coprime with 26, so only 12 multipliers are possible (inverse of ${best.a} is ${modInverse26(best.a)}).`,
  });
  const confidence = Math.min(1, Math.max(0, 1 - best.chi / runner.chi));
  return { cipher: 'affine', steps, key: { type: 'affine', a: best.a, b: best.b }, plaintext: partialDecrypt(c, { type: 'affine', a: best.a, b: best.b }), confidence };
}

// ---------------------------------------------------------------- vigenere

/** Best Caesar shift for one column, by chi-squared. */
function bestShift(col: string): number {
  let best = 0;
  let bestChi = Infinity;
  for (let s = 0; s < 26; s++) {
    const chi = chiSquared(partialDecrypt(col, { type: 'caesar', shift: s }));
    if (chi < bestChi) {
      bestChi = chi;
      best = s;
    }
  }
  return best;
}

export function solveVigenere(cipher: string, maxPeriod = 12): SolverResult {
  const c = onlyLetters(cipher);
  const steps: SolverStep[] = [];
  const k = kasiski(c, 3, maxPeriod);
  const kasiskiTop = k.factorCounts.slice().sort((a, b) => b.count - a.count || a.period - b.period)[0];
  steps.push({
    title: 'Kasiski examination',
    detail:
      k.repeats.length === 0
        ? 'No repeated trigram in the ciphertext, so Kasiski gives no evidence.'
        : `${k.repeats.length} repeated trigrams (for example ${k.repeats
            .slice(0, 3)
            .map((r) => `${r.gram} at distance ${r.distances[0]}`)
            .join(', ')}). The period dividing the most distances is ${kasiskiTop.period} (${kasiskiTop.count} of them).`,
  });
  const ic = icByPeriod(c, maxPeriod);
  // The true period and its multiples all look English; pick the smallest
  // period whose IC is close to English, else the best available.
  const threshold = ENGLISH_IC - 0.008;
  let chosen = ic.find((r) => r.ic >= threshold)?.period;
  const bestIc = ic.slice().sort((a, b) => b.ic - a.ic)[0];
  if (!chosen) chosen = bestIc.period;
  steps.push({
    title: 'Index of coincidence per period',
    detail: `Mean column IC: ${ic.map((r) => `${r.period}: ${fmt(r.ic)}`).join(', ')}. English is about ${ENGLISH_IC}, random text ${fmt(1 / 26)}. Smallest period at or above ${fmt(threshold)} is ${chosen}.`,
  });
  if (k.repeats.length > 0 && kasiskiTop.period !== chosen && kasiskiTop.period % chosen !== 0) {
    steps.push({
      title: 'Kasiski and IC disagree',
      detail: `Kasiski favoured ${kasiskiTop.period} but IC favoured ${chosen}. IC is trusted because Kasiski counts chance repeats too; a wrong period shows up as a keyword that decrypts to gibberish.`,
    });
  }
  const shifts = [];
  for (let o = 0; o < chosen; o++) shifts.push(bestShift(column(c, chosen, o)));
  const keyword = shifts.map(indexLetter).join('');
  steps.push({
    title: `Solve ${chosen} Caesar columns`,
    detail: `Each column is a Caesar cipher; the shift with the lowest chi-squared gives keyword letter by letter: ${keyword}.`,
  });
  const plaintext = partialDecrypt(c, { type: 'vigenere', keyword });
  const model = englishModel();
  const perLetter = model.scorePerLetter(plaintext);
  const confidence = englishness(perLetter);
  return { cipher: 'vigenere', steps, key: { type: 'vigenere', keyword }, plaintext, confidence };
}

// ------------------------------------------------------------ substitution

function applyMap(c: string, map: string[]): string {
  let out = '';
  for (let i = 0; i < c.length; i++) out += map[letterIndex(c[i])];
  return out;
}

/**
 * Hill climb over cipher->plain mappings scored by the n-gram model, with a
 * few restarts from a frequency-ordered seed. Works reliably above roughly
 * 300 letters; below that the log says so when the best text is still weak.
 */
export function solveSubstitution(cipher: string, restarts = 6, model: LanguageModel = englishModel()): SolverResult {
  const c = onlyLetters(cipher);
  const steps: SolverStep[] = [];
  const order = frequencyOrder(c);
  const seed: string[] = new Array(26).fill('A');
  order.forEach((ch, i) => (seed[letterIndex(ch)] = ENGLISH_ORDER[i]));
  const seedText = applyMap(c, seed);
  steps.push({
    title: 'Start from frequency order',
    detail: `Pair the ciphertext letters by frequency (${order.slice(0, 6).join(' ')} ...) with English's (${ENGLISH_ORDER.slice(0, 6).join(' ')} ...). First 60 letters read: ${seedText.slice(0, 60)}`,
  });
  const rng = makeRng(c);
  let bestMap = seed.slice();
  let bestScore = model.score(seedText);
  let improvedRestarts = 0;
  for (let r = 0; r < restarts; r++) {
    const map = r === 0 ? seed.slice() : rng.shuffle(bestMap);
    let score = model.score(applyMap(c, map));
    let stale = 0;
    while (stale < 1200) {
      const i = rng.int(26);
      const j = rng.int(26);
      if (i === j) continue;
      [map[i], map[j]] = [map[j], map[i]];
      const s = model.score(applyMap(c, map));
      if (s > score) {
        score = s;
        stale = 0;
      } else {
        [map[i], map[j]] = [map[j], map[i]];
        stale++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMap = map.slice();
      improvedRestarts++;
    }
  }
  const plaintext = applyMap(c, bestMap);
  steps.push({
    title: 'Swap pairs while the text gets more English',
    detail: `${restarts} hill-climbing runs, each swapping two mapping entries at random and keeping the swap only if the trigram score improves. ${improvedRestarts} run(s) beat the previous best. Result reads: ${plaintext.slice(0, 60)}`,
  });
  const perLetter = model.scorePerLetter(plaintext);
  const confidence = englishness(perLetter) * lengthFactor(c.length);
  if (confidence < 0.6) {
    steps.push({
      title: 'Low confidence',
      detail: `The best text scores ${fmt(perLetter, 2)} per letter, weaker than fluent English. With only ${c.length} letters the statistics are thin; some rare letters are probably swapped.`,
    });
  }
  const map: Record<string, string> = {};
  for (let i = 0; i < 26; i++) map[ALPHABET[i]] = bestMap[i];
  return { cipher: 'substitution', steps, key: { type: 'substitution', map }, plaintext, confidence };
}

// ---------------------------------------------------------------- columnar

function* permutations(n: number): Generator<number[]> {
  const arr = Array.from({ length: n }, (_, i) => i);
  const c = new Array<number>(n).fill(0);
  yield arr.slice();
  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      if (i % 2 === 0) [arr[0], arr[i]] = [arr[i], arr[0]];
      else [arr[c[i]], arr[i]] = [arr[i], arr[c[i]]];
      yield arr.slice();
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
}

export function solveColumnar(cipher: string, maxCols = 9, model: LanguageModel = englishModel()): SolverResult {
  const c = onlyLetters(cipher);
  const steps: SolverStep[] = [];
  const ic = chiSquared(c);
  steps.push({
    title: 'Recognise a transposition',
    detail: `The letter frequencies are already English-like (chi-squared ${fmt(ic, 1)}), so the letters were moved, not replaced. The unknowns are the number of columns and their read order.`,
  });
  let best = { order: [0], score: -Infinity };
  const perLength: string[] = [];
  for (let cols = 2; cols <= maxCols; cols++) {
    let localBest = { order: [0], score: -Infinity };
    if (cols <= 7) {
      for (const order of permutations(cols)) {
        const s = model.score(partialDecrypt(c, { type: 'columnar', order }));
        if (s > localBest.score) localBest = { order: order.slice(), score: s };
      }
    } else {
      // Too many permutations to enumerate: hill-climb on swaps from a few starts.
      const rng = makeRng(c + cols);
      for (let r = 0; r < 4; r++) {
        const order = rng.shuffle(Array.from({ length: cols }, (_, i) => i));
        let s = model.score(partialDecrypt(c, { type: 'columnar', order }));
        let stale = 0;
        while (stale < 300) {
          const i = rng.int(cols);
          const j = rng.int(cols);
          if (i === j) continue;
          [order[i], order[j]] = [order[j], order[i]];
          const t = model.score(partialDecrypt(c, { type: 'columnar', order }));
          if (t > s) {
            s = t;
            stale = 0;
          } else {
            [order[i], order[j]] = [order[j], order[i]];
            stale++;
          }
        }
        if (s > localBest.score) localBest = { order: order.slice(), score: s };
      }
    }
    perLength.push(`${cols}: ${fmt(localBest.score / c.length, 2)}`);
    if (localBest.score > best.score) best = localBest;
  }
  steps.push({
    title: 'Try every column count',
    detail: `For 2 to 7 columns every read order was tried (${fmt(5040, 0)} for seven); for 8 and 9, swap hill-climbing. Best per-letter score by column count: ${perLength.join(', ')}. Chosen: ${best.order.length} columns read in order ${best.order.map((x) => x + 1).join(' ')} (column lengths ${columnLengths(c.length, best.order.length).join('/')}).`,
  });
  const plaintext = partialDecrypt(c, { type: 'columnar', order: best.order });
  const perLetter = model.scorePerLetter(plaintext);
  const confidence = englishness(perLetter);
  return { cipher: 'columnar', steps, key: { type: 'columnar', order: best.order }, plaintext, confidence };
}

// -------------------------------------------------------------- homophonic

const CHI_WEIGHT = 4;
const ANNEAL_STEPS = 40000;
const ANNEAL_T0 = 30;

/**
 * Incremental fitness for the homophonic climb: n-gram log-probability of the
 * rendered text minus a chi-squared penalty on its letter histogram (the
 * n-gram score alone is happiest mapping everything to T, H and E). Changing
 * one symbol only touches the n-grams around its occurrences, so a move is
 * scored from those windows rather than the whole text.
 */
class HomophonicScorer {
  private text: number[];
  private counts = new Array<number>(26).fill(0);
  private positions: number[][];
  private map: number[] = [];
  private expected: number[];

  constructor(private codes: number[], symbolCount: number, private model: LanguageModel) {
    this.text = new Array<number>(codes.length).fill(0);
    this.positions = Array.from({ length: symbolCount }, () => []);
    codes.forEach((c, i) => this.positions[c].push(i));
    this.expected = ALPHABET.split('').map((ch) => (ENGLISH_FREQ[ch] / 100) * codes.length);
  }

  /** Installs a full mapping and returns its fitness. */
  reset(map: number[]): number {
    this.map = map.slice();
    this.counts.fill(0);
    for (let i = 0; i < this.codes.length; i++) {
      this.text[i] = map[this.codes[i]];
      this.counts[this.text[i]]++;
    }
    let s = 0;
    for (let i = 0; i + 1 < this.text.length; i++) s += this.term(i);
    return s - CHI_WEIGHT * this.chi();
  }

  private chi(): number {
    let sum = 0;
    for (let i = 0; i < 26; i++) {
      const d = this.counts[i] - this.expected[i];
      sum += (d * d) / this.expected[i];
    }
    return sum;
  }

  /** Bigram starting at i plus the trigram starting at i, if they exist. */
  private term(i: number): number {
    const t = this.text;
    if (i + 1 >= t.length) return 0;
    let s = this.model.bigramLog[t[i] * 26 + t[i + 1]];
    if (i + 2 < t.length) s += this.model.trigramLog[(t[i] * 26 + t[i + 1]) * 26 + t[i + 2]];
    return s;
  }

  private affected(symbol: number): number[] {
    const set = new Set<number>();
    for (const p of this.positions[symbol]) for (let d = -2; d <= 0; d++) if (p + d >= 0) set.add(p + d);
    return [...set];
  }

  /** Fitness change if `symbol` were remapped to `letter`, without applying it. */
  delta(symbol: number, letter: number): number {
    const old = this.map[symbol];
    const windows = this.affected(symbol);
    let before = 0;
    for (const w of windows) before += this.term(w);
    const chiBefore = this.chi();
    for (const p of this.positions[symbol]) this.text[p] = letter;
    const n = this.positions[symbol].length;
    this.counts[old] -= n;
    this.counts[letter] += n;
    let after = 0;
    for (const w of windows) after += this.term(w);
    const chiAfter = this.chi();
    for (const p of this.positions[symbol]) this.text[p] = old;
    this.counts[old] += n;
    this.counts[letter] -= n;
    return after - before - CHI_WEIGHT * (chiAfter - chiBefore);
  }

  apply(symbol: number, letter: number): void {
    const old = this.map[symbol];
    const n = this.positions[symbol].length;
    for (const p of this.positions[symbol]) this.text[p] = letter;
    this.counts[old] -= n;
    this.counts[letter] += n;
    this.map[symbol] = letter;
  }
}

/**
 * Homophonic ciphers flatten the symbol frequencies, so the frequency seed is
 * weak. The climb assigns letters to symbols and scores with the n-gram model;
 * it is the rung where a solver most often gets stuck, which the log reports.
 */
export function solveHomophonic(cipher: string, restarts = 8, model: LanguageModel = englishModel()): SolverResult {
  const symbols = homophonicSymbols(cipher);
  const steps: SolverStep[] = [];
  const freq = symbolFrequencies(cipher);
  const distinct = freq.map((r) => r.gram);
  steps.push({
    title: 'Count the symbols',
    detail: `${symbols.length} symbols, ${distinct.length} distinct. The most common (${freq
      .slice(0, 5)
      .map((r) => `${r.gram} x${r.count}`)
      .join(', ')}) are each far rarer than E's 12.7%, so several symbols share each common letter and the flat histogram gives little away.`,
  });
  const index = new Map<string, number>();
  distinct.forEach((s, i) => index.set(s, i));
  const codes = symbols.map((s) => index.get(s)!);
  const rng = makeRng(cipher);
  // Seed: walk the symbols from most to least common and deal them to the
  // English letters in frequency order, so E, T, A each start with several.
  const seed: number[] = distinct.map((_, i) => letterIndex(ENGLISH_ORDER[i % 26]));
  const render = (m: number[]): string => codes.map((k) => ALPHABET[m[k]]).join('');
  const scorer = new HomophonicScorer(codes, distinct.length, model);
  let bestMap = seed.slice();
  let bestScore = scorer.reset(seed);
  for (let r = 0; r < restarts; r++) {
    const map = r === 0 ? seed.slice() : bestMap.map((v) => (rng.next() < 0.25 ? rng.int(26) : v));
    let score = scorer.reset(map);
    // Simulated annealing: early on a worse assignment is sometimes kept so
    // the search can leave a local optimum; the temperature then cools.
    for (let iter = 0; iter < ANNEAL_STEPS; iter++) {
      const temp = ANNEAL_T0 * (1 - iter / ANNEAL_STEPS);
      const i = rng.int(map.length);
      const next = rng.int(26);
      if (next === map[i]) continue;
      const delta = scorer.delta(i, next);
      if (delta > 0 || rng.next() < Math.exp(delta / Math.max(temp, 1e-6))) {
        scorer.apply(i, next);
        map[i] = next;
        score += delta;
        if (score > bestScore) {
          bestScore = score;
          bestMap = map.slice();
        }
      }
    }
  }
  const plaintext = render(bestMap);
  steps.push({
    title: 'Reassign one symbol at a time',
    detail: `${restarts} climbs, each reassigning one symbol at random, with simulated annealing on the trigram score plus a letter-histogram penalty. Result reads: ${plaintext.slice(0, 60)}`,
  });
  const perLetter = model.scorePerLetter(plaintext);
  const confidence = englishness(perLetter) * lengthFactor(symbols.length);
  if (confidence < 0.6) {
    steps.push({
      title: 'Stuck',
      detail: `Per-letter score ${fmt(perLetter, 2)}: the text is only partly readable. Symbols that occur once or twice carry almost no evidence, and the climb cannot tell two symbols for the same letter apart from two different letters. A human would now guess words from the readable fragments; this solver stops here.`,
    });
  }
  const map: Record<string, string> = {};
  distinct.forEach((s, i) => (map[s] = ALPHABET[bestMap[i]]));
  return { cipher: 'homophonic', steps, key: { type: 'homophonic', map }, plaintext, confidence };
}

export function solve(type: CipherType, cipher: string): SolverResult {
  switch (type) {
    case 'caesar':
      return solveCaesar(cipher);
    case 'affine':
      return solveAffine(cipher);
    case 'substitution':
      return solveSubstitution(cipher);
    case 'vigenere':
      return solveVigenere(cipher);
    case 'columnar':
      return solveColumnar(cipher);
    case 'homophonic':
      return solveHomophonic(cipher);
  }
}

/** Fraction of positions where two letter strings agree (0 when lengths differ). */
export function accuracy(a: string, b: string): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  return same / a.length;
}
