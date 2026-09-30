/**
 * Sentence segmentation over a parsed document. Sentences never cross block
 * boundaries; headings, list items and table rows are one unit each unless
 * they contain several full sentences.
 */

import type { Block, ParsedDoc } from './docs.js';

export interface Sentence {
  docId: string;
  /** Index into the document's blocks. */
  block: number;
  start: number;
  end: number;
}

const ABBREVIATIONS = new Set(
  [
    'e.g', 'i.e', 'etc', 'vs', 'cf', 'al', 'approx', 'dept', 'est', 'min', 'max', 'no', 'nos', 'fig', 'figs', 'eq', 'sec',
    'ch', 'pp', 'p', 'vol', 'ed', 'dr', 'mr', 'mrs', 'ms', 'prof', 'st', 'jr', 'sr', 'inc', 'ltd', 'co', 'a.m', 'p.m',
    'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'mon', 'tue', 'tues', 'wed',
    'thu', 'thur', 'thurs', 'fri', 'sat', 'sun', 'u.s', 'ph.d', 'b.s', 'm.s', 'hr', 'hrs', 'wk', 'wks', 'pt', 'pts',
  ].map((a) => a.toLowerCase()),
);

/** The word (with inner dots) ending just before position `dot`. */
function wordBefore(text: string, dot: number): string {
  let i = dot;
  while (i > 0 && /[\p{L}\p{N}.]/u.test(text[i - 1])) i--;
  return text.slice(i, dot);
}

/** True if the full stop at `dot` ends a sentence rather than an abbreviation or a number. */
function isBoundary(text: string, dot: number): boolean {
  if (text[dot] !== '.') return true;
  const w = wordBefore(text, dot).replace(/^\.+/, '');
  if (!w) return true;
  if (ABBREVIATIONS.has(w.toLowerCase())) return false;
  // A single capital is an initial ("J. Smith"), not the end of a sentence.
  return !/^[A-Z]$/.test(w);
}

/** Splits one block's text into sentence spans. */
export function splitBlock(text: string, start: number, end: number): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  let s = start;
  for (let i = start; i < end; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    let j = i + 1;
    // Closing quotes and brackets belong to the sentence that just ended.
    while (j < end && /["'\u2019\u201D)\]]/.test(text[j])) j++;
    if (j >= end) break;
    if (!/\s/.test(text[j])) continue;
    let k = j;
    while (k < end && /\s/.test(text[k])) k++;
    // The next sentence starts with a capital, digit, quote or bracket.
    if (k >= end || !/[\p{Lu}\p{N}"'\u2018\u201C([]/u.test(text[k])) continue;
    if (!isBoundary(text, i)) continue;
    spans.push({ start: s, end: j });
    s = k;
  }
  if (s < end) spans.push({ start: s, end });
  return spans.filter((x) => text.slice(x.start, x.end).trim().length > 0);
}

/** All sentences of a document, in order. */
export function sentencesOf(doc: ParsedDoc): Sentence[] {
  const out: Sentence[] = [];
  doc.blocks.forEach((b: Block, bi) => {
    for (const sp of splitBlock(doc.text, b.start, b.end)) out.push({ docId: doc.id, block: bi, start: sp.start, end: sp.end });
  });
  return out;
}
