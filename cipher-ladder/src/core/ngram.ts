/**
 * A small English language model built from the bundled corpus. The solvers
 * use it to rank candidate decryptions: the higher the log-probability of a
 * text under the model, the more it reads like English.
 *
 * Trigrams with add-k smoothing and a bigram back-off. The corpus is about
 * eleven thousand letters, which is thin for 17,576 trigrams, so the two
 * orders are blended rather than trusting trigrams alone.
 */
import { corpusLetters } from './corpus.js';
import { letterIndex, onlyLetters } from './text.js';

export interface LanguageModel {
  /** Total log-probability of the text's letters; higher is more English. */
  score(text: string): number;
  /** Per-letter average so texts of different lengths can be compared. */
  scorePerLetter(text: string): number;
  bigramLog: Float64Array;
  trigramLog: Float64Array;
}

const K2 = 0.5;
const K3 = 0.05;

export function buildModel(letters: string): LanguageModel {
  const bi = new Float64Array(26 * 26);
  const tri = new Float64Array(26 * 26 * 26);
  for (let i = 0; i + 1 < letters.length; i++) {
    const a = letterIndex(letters[i]);
    const b = letterIndex(letters[i + 1]);
    bi[a * 26 + b]++;
    if (i + 2 < letters.length) tri[(a * 26 + b) * 26 + letterIndex(letters[i + 2])]++;
  }
  const biTotal = Math.max(1, letters.length - 1);
  const triTotal = Math.max(1, letters.length - 2);
  const bigramLog = new Float64Array(26 * 26);
  for (let i = 0; i < bigramLog.length; i++) bigramLog[i] = Math.log((bi[i] + K2) / (biTotal + K2 * 676));
  const trigramLog = new Float64Array(26 * 26 * 26);
  for (let i = 0; i < trigramLog.length; i++) trigramLog[i] = Math.log((tri[i] + K3) / (triTotal + K3 * 17576));

  const score = (text: string): number => {
    const t = onlyLetters(text);
    let s = 0;
    for (let i = 0; i + 1 < t.length; i++) {
      const a = letterIndex(t[i]);
      const b = letterIndex(t[i + 1]);
      s += bigramLog[a * 26 + b];
      if (i + 2 < t.length) s += trigramLog[(a * 26 + b) * 26 + letterIndex(t[i + 2])];
    }
    return s;
  };
  return {
    score,
    scorePerLetter: (text) => {
      const n = onlyLetters(text).length;
      return n === 0 ? -Infinity : score(text) / n;
    },
    bigramLog,
    trigramLog,
  };
}

let cached: LanguageModel | null = null;

/** The model trained on the bundled corpus, built once on first use. */
export function englishModel(): LanguageModel {
  if (!cached) cached = buildModel(corpusLetters());
  return cached;
}
