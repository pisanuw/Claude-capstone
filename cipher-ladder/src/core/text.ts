/** Alphabet helpers and English letter statistics shared by every tool. */

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Relative letter frequencies of English text, in percent (Lewand 2000). */
export const ENGLISH_FREQ: Record<string, number> = {
  A: 8.167, B: 1.492, C: 2.782, D: 4.253, E: 12.702, F: 2.228, G: 2.015, H: 6.094,
  I: 6.966, J: 0.153, K: 0.772, L: 4.025, M: 2.406, N: 6.749, O: 7.507, P: 1.929,
  Q: 0.095, R: 5.987, S: 6.327, T: 9.056, U: 2.758, V: 0.978, W: 2.36, X: 0.15,
  Y: 1.974, Z: 0.074,
};

/** Index of coincidence of English text; random text sits near 1/26 = 0.0385. */
export const ENGLISH_IC = 0.0667;

/** Upper-cases and strips everything except A-Z. */
export function onlyLetters(text: string): string {
  return text.toUpperCase().replace(/[^A-Z]/g, '');
}

/** Groups a letter string into blocks of five, the classic ciphertext layout. */
export function group5(letters: string): string {
  return letters.replace(/(.{5})/g, '$1 ').trim();
}

export function letterIndex(ch: string): number {
  return ch.charCodeAt(0) - 65;
}

export function indexLetter(i: number): string {
  return ALPHABET[((i % 26) + 26) % 26];
}

/** Counts of each letter A-Z in the text (non-letters ignored). */
export function letterCounts(text: string): number[] {
  const counts = new Array<number>(26).fill(0);
  for (const ch of onlyLetters(text)) counts[letterIndex(ch)]++;
  return counts;
}

/**
 * Chi-squared distance between the text's letter distribution and English.
 * Lower is more English-like; a correctly shifted Caesar decryption usually
 * scores an order of magnitude below every wrong shift.
 */
export function chiSquared(text: string): number {
  const counts = letterCounts(text);
  const n = counts.reduce((a, b) => a + b, 0);
  if (n === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < 26; i++) {
    const expected = (ENGLISH_FREQ[ALPHABET[i]] / 100) * n;
    const diff = counts[i] - expected;
    sum += (diff * diff) / expected;
  }
  return sum;
}

/** Index of coincidence: probability that two random letters of the text match. */
export function indexOfCoincidence(text: string): number {
  const counts = letterCounts(text);
  const n = counts.reduce((a, b) => a + b, 0);
  if (n < 2) return 0;
  let sum = 0;
  for (const c of counts) sum += c * (c - 1);
  return sum / (n * (n - 1));
}

/** Modular inverse of a mod 26, or -1 when a is not coprime with 26. */
export function modInverse26(a: number): number {
  const x = ((a % 26) + 26) % 26;
  for (let i = 1; i < 26; i++) if ((x * i) % 26 === 1) return i;
  return -1;
}

/** The twelve multipliers that make an affine cipher invertible. */
export const AFFINE_MULTIPLIERS = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];

/**
 * Re-applies the spacing and punctuation of `template` to `letters`, so a
 * decryption of a spaced ciphertext reads as words. Letters are consumed in
 * order; if `letters` runs out the remainder of the template is dropped.
 */
export function reflow(letters: string, template: string): string {
  let out = '';
  let i = 0;
  for (const ch of template) {
    if (/[A-Za-z]/.test(ch)) {
      if (i >= letters.length) break;
      out += letters[i++];
    } else {
      out += ch;
    }
  }
  return out;
}
