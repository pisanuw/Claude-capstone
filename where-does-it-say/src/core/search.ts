/**
 * Retrieval: BM25 over sentences, with each sentence's section headings and
 * document title as a weaker field, plus a coverage test that decides whether
 * the best passage actually addresses the question or the documents are
 * silent.
 */

import type { ParsedDoc } from './docs.js';
import { sentencesOf, type Sentence } from './sentences.js';
import { MODAL, WEAK, kindStem, numberedItems, terms } from './terms.js';

export interface Unit extends Sentence {
  /** Weighted term frequencies (sentence terms 1, heading terms 0.6, title terms 0.3). */
  tf: Map<string, number>;
  /** Terms that appear in the sentence itself. */
  own: Set<string>;
  /** Terms of the section headings above the sentence. */
  head: Set<string>;
  /** Numbered items named in the sentence ("lab#3"). */
  items: Set<string>;
  len: number;
  isHeading: boolean;
}

export interface Index {
  docs: ParsedDoc[];
  units: Unit[];
  df: Map<string, number>;
  avgLen: number;
}

const HEADING_WEIGHT = 0.6;
const TITLE_WEIGHT = 0.3;
const CONCEPT_WEIGHT = 0.7;
const K1 = 1.2;
const B = 0.6;

function add(tf: Map<string, number>, t: string, w: number): void {
  tf.set(t, (tf.get(t) ?? 0) + w);
}

/** Builds the sentence index over a set of parsed documents. */
export function buildIndex(docs: ParsedDoc[]): Index {
  const units: Unit[] = [];
  const df = new Map<string, number>();
  let total = 0;
  for (const doc of docs) {
    const titleTerms = terms(doc.title);
    for (const s of sentencesOf(doc)) {
      const block = doc.blocks[s.block];
      const text = doc.text.slice(s.start, s.end);
      const own = terms(text);
      const tf = new Map<string, number>();
      for (const t of own) add(tf, t, t.startsWith('~') ? CONCEPT_WEIGHT : 1);
      const headingTerms = block.section.flatMap((h) => terms(h));
      for (const t of headingTerms) add(tf, t, HEADING_WEIGHT * (t.startsWith('~') ? CONCEPT_WEIGHT : 1));
      for (const t of titleTerms) add(tf, t, TITLE_WEIGHT);
      for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
      const len = own.length + 0.5 * headingTerms.length;
      total += len;
      units.push({
        ...s,
        tf,
        own: new Set(own),
        head: new Set(headingTerms),
        items: new Set(numberedItems(text)),
        len,
        isHeading: block.kind === 'heading',
      });
    }
  }
  return { docs, units, df, avgLen: units.length ? total / units.length : 1 };
}

/** Inverse document frequency, BM25+ style so it is never negative; unseen terms get the maximum. */
export function idf(ix: Index, t: string): number {
  const n = ix.units.length;
  const d = ix.df.get(t) ?? 0;
  return Math.log(1 + (n - d + 0.5) / (d + 0.5));
}

export interface QueryTerm {
  term: string;
  /** Importance in the coverage test: idf, discounted for weak words, boosted for numbered items. */
  weight: number;
  /** Appears somewhere in the documents (as itself or its concept). */
  known: boolean;
  /** The synonym concept ("~ai" for "chatgpt"), if any. */
  concept?: string;
}

/** Parses a question into its distinct content terms. */
export function queryTerms(ix: Index, question: string): QueryTerm[] {
  const raw = terms(question);
  const seen = new Set<string>();
  const out: QueryTerm[] = [];
  raw.forEach((t, i) => {
    if (t.startsWith('~') || seen.has(t)) return;
    seen.add(t);
    const next = raw[i + 1];
    const c = next?.startsWith('~') ? next : undefined;
    let w = idf(ix, t);
    if (c) w = Math.max(w, idf(ix, c) * 0.9);
    if (WEAK.has(t)) w *= 0.3;
    // "Is X allowed/required?" is about X; the modal word only shapes the question.
    else if (c && MODAL.has(c)) w *= 0.5;
    // A numbered item matters as much as its kind, a little more; an unseen number ("project 1") must not dominate.
    if (t.includes('#')) w = 1.3 * idf(ix, kindStem(t));
    const known = ix.df.has(t) || (c !== undefined && ix.df.has(c));
    out.push(c ? { term: t, weight: w, known, concept: c } : { term: t, weight: w, known });
  });
  return out;
}

export interface Hit {
  unit: Unit;
  score: number;
  /** Fraction of the question's weight this passage covers (0-1). */
  coverage: number;
  /** Question terms the passage matched. */
  matched: string[];
  /** A numbered item in the question ("lab 3") that the passage contradicts by naming other numbers of the same kind. */
  conflict?: string;
}

function bm25(ix: Index, u: Unit, t: string): number {
  const f = u.tf.get(t);
  if (!f) return 0;
  return (idf(ix, t) * f * (K1 + 1)) / (f + K1 * (1 - B + (B * u.len) / ix.avgLen));
}

/** Scores every sentence against the question; best first. */
export function search(ix: Index, question: string, limit = 10): Hit[] {
  const qt = queryTerms(ix, question);
  if (!qt.length) return [];
  const totalWeight = qt.reduce((a, q) => a + q.weight, 0) || 1;
  const hits: Hit[] = [];
  for (const u of ix.units) {
    let score = 0;
    let covered = 0;
    const matched: string[] = [];
    let conflict: string | undefined;
    for (const q of qt) {
      const c = q.concept;
      const direct = bm25(ix, u, q.term);
      const viaConcept = c ? bm25(ix, u, c) : 0;
      score += Math.max(direct, viaConcept) + 0.25 * Math.min(direct, viaConcept);
      let credit = 0;
      if (u.own.has(q.term)) credit = 1;
      else if (c && u.own.has(c)) credit = 0.85;
      else if (u.head.has(q.term) || (c && u.head.has(c))) credit = 0.7;
      // Only the document title mentions it: weak support.
      else if (u.tf.has(q.term) || (c && u.tf.has(c))) credit = 0.35;
      if (q.term.includes('#') && credit === 0) {
        const kind = q.term.split('#')[0];
        // Names other numbers of the same kind ("labs 5-8" for lab 3): a contradiction.
        if ([...u.items].some((it) => it.startsWith(kind + '#'))) conflict = q.term;
        // Names the kind in general ("all labs", "both projects"): it covers this one.
        else if (u.own.has(kindStem(q.term))) credit = 0.6;
      }
      if (credit > 0) matched.push(q.term);
      covered += credit * q.weight;
    }
    if (score <= 0) continue;
    let coverage = covered / totalWeight;
    if (conflict) {
      coverage *= 0.4;
      score *= 0.4;
    }
    // Headings name a topic but never answer it.
    if (u.isHeading) score *= 0.5;
    hits.push({ unit: u, score, coverage, matched, ...(conflict ? { conflict } : {}) });
  }
  // Coverage decides whether a passage answers; it also dominates the order, so a focused sentence beats a wordy one.
  const rank = (h: Hit) => h.score * h.coverage ** 1.5;
  hits.sort((a, b) => rank(b) - rank(a));
  return hits.slice(0, limit);
}
