/**
 * Quote-or-refuse answering.
 *
 * A proposer suggests candidate passages; every candidate then goes through
 * the verifier, and only verified spans are shown. The built-in proposer is
 * the deterministic retriever in search.ts, but anything that returns text
 * (a language model, a TA pasting a sentence) can propose: the verifier does
 * not trust the proposer, it only checks the words against the documents.
 */

import { blockAt, locationLabel, type ParsedDoc } from './docs.js';
import { buildIndex, queryTerms, search, type Hit, type Index } from './search.js';
import { splitBlock } from './sentences.js';
import { verifyQuote, type Verified } from './verify.js';

export interface Quote {
  docId: string;
  docTitle: string;
  start: number;
  end: number;
  text: string;
  location: string;
  verdict: Verified;
  /** Question terms the passage matched. */
  matched: string[];
  coverage: number;
  score: number;
}

export interface Answer {
  question: string;
  status: 'found' | 'not-found' | 'empty';
  quotes: Quote[];
  /** Question terms that appear nowhere in the documents (useful gap signal). */
  unknownTerms: string[];
  /** Closest passages when nothing qualified, shown as "nearest, not an answer". */
  nearest: Quote[];
  /** Candidates the proposer offered that failed verification (should be none for the built-in proposer). */
  rejected: number;
}

export interface AnswerOptions {
  /** Minimum share of the question a passage must cover. */
  minCoverage?: number;
  /** Maximum number of quotes to return. */
  maxQuotes?: number;
}

export const DEFAULT_MIN_COVERAGE = 0.55;

/** Words that make a sentence continue the one before it ("This applies to..."). */
const CONTINUATION = /^(this|these|that|those|it|such|however|otherwise|unless|except|exceptions?|in (that|this|such) case|if so|after that|beyond that|note)\b/i;

/** A passage from a hit: the sentence, plus a following list when it ends in a colon, plus a continuing sentence. */
export function passageFor(doc: ParsedDoc, hit: Hit): { start: number; end: number } {
  const u = hit.unit;
  let end = u.end;
  const blockIdx = u.block;
  const block = doc.blocks[blockIdx];
  const sents = splitBlock(doc.text, block.start, block.end);
  const k = sents.findIndex((s) => s.start === u.start);
  const tail = doc.text.slice(u.start, u.end).trimEnd();
  if (tail.endsWith(':')) {
    // Take the list or rows that follow ("The following are not allowed:").
    let j = blockIdx + 1;
    let taken = 0;
    while (j < doc.blocks.length && taken < 8 && (doc.blocks[j].kind === 'item' || doc.blocks[j].kind === 'row')) {
      end = doc.blocks[j].end;
      j++;
      taken++;
    }
    if (!taken && k >= 0 && k + 1 < sents.length) end = sents[k + 1].end;
  } else if (k >= 0 && k + 1 < sents.length && CONTINUATION.test(doc.text.slice(sents[k + 1].start, sents[k + 1].end))) {
    end = sents[k + 1].end;
  }
  return { start: u.start, end };
}

function toQuote(ix: Index, hit: Hit): Quote | null {
  const doc = ix.docs.find((d) => d.id === hit.unit.docId);
  if (!doc) return null;
  const span = passageFor(doc, hit);
  const text = doc.text.slice(span.start, span.end);
  // Verify against the documents like any other proposer's candidate.
  const verdict = verifyQuote([doc], text);
  if (!verdict.ok) return null;
  return {
    docId: doc.id,
    docTitle: doc.title,
    start: span.start,
    end: span.end,
    text,
    location: locationLabel(doc, span.start),
    verdict,
    matched: hit.matched,
    coverage: hit.coverage,
    score: hit.score,
  };
}

function overlaps(a: { docId: string; start: number; end: number }, b: { docId: string; start: number; end: number }): boolean {
  return a.docId === b.docId && a.start < b.end && b.start < a.end;
}

/** Answers a question from an index: verified quotes, or an explicit "not in the documents". */
export function answer(ix: Index, question: string, opts: AnswerOptions = {}): Answer {
  const minCoverage = opts.minCoverage ?? DEFAULT_MIN_COVERAGE;
  const maxQuotes = opts.maxQuotes ?? 3;
  const q = question.trim();
  const qt = queryTerms(ix, q);
  const unknownTerms = qt.filter((t) => !t.known && !t.term.includes('#')).map((t) => t.term);
  const base = { question: q, unknownTerms, rejected: 0 };
  if (!q || !qt.length) return { ...base, status: 'empty', quotes: [], nearest: [] };
  const hits = search(ix, q, 30);
  const strong = qt.filter((t) => t.weight > 0.5);
  const quotes: Quote[] = [];
  let rejected = 0;
  const top = hits[0];
  for (const h of hits) {
    if (quotes.length >= maxQuotes) break;
    if (h.unit.isHeading || h.conflict) continue;
    if (h.coverage < minCoverage) continue;
    // Something specific must match, not only "course" or "policy".
    if (strong.length && !h.matched.some((m) => strong.some((s) => s.term === m))) continue;
    // Later quotes must be nearly as good as the first.
    if (quotes.length && (h.score < top.score * 0.6 || h.coverage < quotes[0].coverage - 0.2)) continue;
    const quote = toQuote(ix, h);
    if (!quote) {
      rejected++;
      continue;
    }
    if (quotes.some((x) => overlaps(x, quote))) continue;
    quotes.push(quote);
  }
  if (quotes.length) return { ...base, status: 'found', quotes, nearest: [], rejected };
  const nearest: Quote[] = [];
  for (const h of hits) {
    if (nearest.length >= 2) break;
    if (h.unit.isHeading || h.matched.length === 0) continue;
    const quote = toQuote(ix, h);
    if (quote && !nearest.some((x) => overlaps(x, quote))) nearest.push(quote);
  }
  return { ...base, status: 'not-found', quotes: [], nearest, rejected };
}

/** Builds an index and answers in one call (tests, one-off use). */
export function ask(docs: ParsedDoc[], question: string, opts?: AnswerOptions): Answer {
  return answer(buildIndex(docs), question, opts);
}

/** The heading path of a quote's block, for display. */
export function sectionOf(doc: ParsedDoc, offset: number): string[] {
  return blockAt(doc, offset)?.section ?? [];
}
