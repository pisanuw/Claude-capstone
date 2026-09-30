/**
 * The verifier: the only way text reaches a student as a quote.
 *
 * A quote is accepted only if it is a substring of one course document after
 * folding whitespace and typography (see text.ts). Two relaxations are
 * allowed and labelled: a capitalization change (quoting "late work loses..."
 * from "Late work loses...") and an elision, where "..." joins fragments that
 * each appear, in order, close together in the same document. Anything else
 * is rejected, and the closest passage is reported with a word diff so the
 * reader can see exactly what the quoter changed.
 */

import type { ParsedDoc } from './docs.js';
import { splitBlock } from './sentences.js';
import { fold, unfoldRange, words, type Folded } from './text.js';

export type MatchKind = 'exact' | 'normalized' | 'case' | 'elided';

export interface Span {
  start: number;
  end: number;
}

export interface Verified {
  ok: true;
  docId: string;
  start: number;
  end: number;
  kind: MatchKind;
  /** For an elided quote, the fragments that were found. */
  parts?: Span[];
  /** How many places in the documents contain the quote. */
  occurrences: number;
}

export type DiffOp = { op: 'same' | 'quote-only' | 'source-only'; text: string };

export interface Rejected {
  ok: false;
  reason: 'empty' | 'too-short' | 'not-found';
  closest?: { docId: string; start: number; end: number; similarity: number; diff: DiffOp[] };
}

export type Verdict = Verified | Rejected;

/** Quotes shorter than this many words (and characters) match too much to count as evidence. */
export const MIN_WORDS = 4;
export const MIN_CHARS = 20;
/** Largest gap allowed between elided fragments. */
export const MAX_ELISION_GAP = 600;

const foldCache = new WeakMap<ParsedDoc, { f: Folded; lower: string | null }>();

function folded(doc: ParsedDoc): { f: Folded; lower: string | null } {
  let c = foldCache.get(doc);
  if (!c) {
    const f = fold(doc.text);
    const lower = f.text.toLowerCase();
    // Case-insensitive search needs offsets to line up; skip it for the rare scripts where lower-casing changes length.
    c = { f, lower: lower.length === f.text.length ? lower : null };
    foldCache.set(doc, c);
  }
  return c;
}

/** Strips wrapping quote marks, leading/trailing ellipses and a citation tail from a candidate quote. */
export function cleanQuote(q: string): string {
  let s = fold(q).text;
  for (;;) {
    const before = s;
    s = s.replace(/^["'>\s]+|["'\s]+$/g, '');
    s = s.replace(/^(\.\.\.|\[\.\.\.\])\s*/, '').replace(/\s*(\.\.\.|\[\.\.\.\])$/, '');
    if (s === before) break;
  }
  return s;
}

function countOccurrences(hay: string, needle: string): number {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i >= 0) {
    n++;
    i = hay.indexOf(needle, i + 1);
  }
  return n;
}

function findIn(docs: ParsedDoc[], q: string, caseless: boolean): { doc: ParsedDoc; at: number; occurrences: number } | null {
  let best: { doc: ParsedDoc; at: number; occurrences: number } | null = null;
  let total = 0;
  const needle = caseless ? q.toLowerCase() : q;
  for (const doc of docs) {
    const { f, lower } = folded(doc);
    const hay = caseless ? lower : f.text;
    if (hay === null) continue;
    const at = hay.indexOf(needle);
    if (at < 0) continue;
    total += countOccurrences(hay, needle);
    best ??= { doc, at, occurrences: 0 };
  }
  return best ? { ...best, occurrences: total } : null;
}

const ELLIPSIS = /\s*(?:\[\s*\.\.\.\s*\]|\.\.\.)\s*/;

function findElided(docs: ParsedDoc[], q: string): Verified | null {
  const frags = q.split(ELLIPSIS).map((s) => s.trim()).filter(Boolean);
  if (frags.length < 2 || frags.some((f) => words(f).length < 2)) return null;
  for (const doc of docs) {
    const { f, lower } = folded(doc);
    for (const caseless of [false, true]) {
      const hay = caseless ? lower : f.text;
      if (hay === null) continue;
      let from = 0;
      const parts: Span[] = [];
      let prevEnd = -1;
      for (const frag of frags) {
        const needle = caseless ? frag.toLowerCase() : frag;
        const at = hay.indexOf(needle, from);
        if (at < 0 || (prevEnd >= 0 && at - prevEnd > MAX_ELISION_GAP)) {
          parts.length = 0;
          break;
        }
        parts.push({ start: at, end: at + needle.length });
        prevEnd = at + needle.length;
        from = prevEnd;
      }
      if (parts.length === frags.length) {
        const orig = parts.map((p) => unfoldRange(f, p.start, p.end));
        return { ok: true, docId: doc.id, start: orig[0].start, end: orig[orig.length - 1].end, kind: 'elided', parts: orig, occurrences: 1 };
      }
    }
  }
  return null;
}

/** Comparison key of a whitespace token: lower case, surrounding punctuation dropped. */
function tokenKey(t: string): string {
  return t.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%]+$/gu, '');
}

/**
 * Word-level diff (LCS) between a quote and a source passage. Tokens keep
 * their punctuation for display ("10%,") but compare case- and
 * punctuation-insensitively, so only real word changes show up.
 */
export function wordDiff(quote: string, source: string): DiffOp[] {
  const a = fold(quote).text.split(' ').filter((t) => tokenKey(t));
  const b = fold(source).text.split(' ').filter((t) => tokenKey(t));
  const al = a.map(tokenKey);
  const bl = b.map(tokenKey);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = al[i] === bl[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: DiffOp[] = [];
  const push = (op: DiffOp['op'], w: string) => {
    const last = ops[ops.length - 1];
    if (last && last.op === op) last.text += ' ' + w;
    else ops.push({ op, text: w });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (al[i] === bl[j]) {
      push('same', b[j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push('quote-only', a[i++]);
    else push('source-only', b[j++]);
  }
  while (i < n) push('quote-only', a[i++]);
  while (j < m) push('source-only', b[j++]);
  return ops;
}

/** Similarity of two word sequences: LCS length over the longer length. */
export function similarity(ops: DiffOp[]): number {
  let same = 0;
  let q = 0;
  let s = 0;
  for (const o of ops) {
    const n = o.text.split(' ').length;
    if (o.op === 'same') {
      same += n;
      q += n;
      s += n;
    } else if (o.op === 'quote-only') q += n;
    else s += n;
  }
  return same / Math.max(q, s, 1);
}

/** Finds the passage (one to three consecutive sentences) most like the quote. */
export function closestPassage(docs: ParsedDoc[], q: string): Rejected['closest'] {
  const qWords = new Set(words(q).map((w) => w.toLowerCase()));
  const target = words(q).length;
  let best: Rejected['closest'];
  for (const doc of docs) {
    const sents = doc.blocks.flatMap((b) => splitBlock(doc.text, b.start, b.end));
    for (let i = 0; i < sents.length; i++) {
      for (let span = 1; span <= 3 && i + span <= sents.length; span++) {
        const start = sents[i].start;
        const end = sents[i + span - 1].end;
        const text = doc.text.slice(start, end);
        const w = words(text);
        if (span > 1 && w.length > target * 2 + 8) break;
        // Cheap prefilter: shared vocabulary.
        let shared = 0;
        for (const x of w) if (qWords.has(x.toLowerCase())) shared++;
        if (shared < Math.min(3, qWords.size) || (best && shared / Math.max(w.length, target) < best.similarity * 0.8)) continue;
        const diff = wordDiff(q, text);
        const sim = similarity(diff);
        if (!best || sim > best.similarity) best = { docId: doc.id, start, end, similarity: sim, diff };
      }
    }
  }
  return best;
}

/** Verifies one candidate quote against the documents. */
export function verifyQuote(docs: ParsedDoc[], quote: string): Verdict {
  const q = cleanQuote(quote);
  if (!q) return { ok: false, reason: 'empty' };
  if (words(q).length < MIN_WORDS && q.length < MIN_CHARS) return { ok: false, reason: 'too-short' };
  const exact = findIn(docs, q, false);
  if (exact) {
    const { f } = folded(exact.doc);
    const span = unfoldRange(f, exact.at, exact.at + q.length);
    const raw = exact.doc.text.slice(span.start, span.end);
    return { ok: true, docId: exact.doc.id, ...span, kind: raw === q ? 'exact' : 'normalized', occurrences: exact.occurrences };
  }
  const caseless = findIn(docs, q, true);
  if (caseless) {
    const { f } = folded(caseless.doc);
    const span = unfoldRange(f, caseless.at, caseless.at + q.length);
    return { ok: true, docId: caseless.doc.id, ...span, kind: 'case', occurrences: caseless.occurrences };
  }
  const elided = findElided(docs, q);
  if (elided) return elided;
  const closest = closestPassage(docs, q);
  return closest ? { ok: false, reason: 'not-found', closest } : { ok: false, reason: 'not-found' };
}

/**
 * Pulls candidate quotes out of a pasted answer (for example a chatbot's):
 * text in double quotes and Markdown blockquote lines. If there are none,
 * every sentence of the answer is treated as a claimed quote.
 */
export function extractQuotes(answer: string): string[] {
  const out: string[] = [];
  const f = fold(answer.replace(/\r\n?/g, '\n')).text;
  const block = answer
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => /^\s*>/.test(l))
    .map((l) => l.replace(/^\s*>\s?/, ''));
  if (block.length) {
    // Consecutive blockquote lines form one quote.
    const joined = answer
      .replace(/\r\n?/g, '\n')
      .split(/\n(?!\s*>)/)
      .map((chunk) => chunk.split('\n').filter((l) => /^\s*>/.test(l)).map((l) => l.replace(/^\s*>\s?/, '')).join(' '))
      .filter((s) => s.trim());
    out.push(...joined);
  }
  for (const m of f.matchAll(/"([^"]{8,}?)"/g)) if (words(m[1]).length >= 3) out.push(m[1]);
  if (out.length) return [...new Set(out.map((s) => s.trim()))];
  return splitBlock(f, 0, f.length)
    .map((s) => f.slice(s.start, s.end).trim())
    .filter((s) => words(s).length >= MIN_WORDS);
}
