import { describe, expect, it } from 'vitest';
import { parseDoc } from '../src/core/docs.js';
import { cleanQuote, closestPassage, extractQuotes, similarity, verifyQuote, wordDiff } from '../src/core/verify.js';

const syllabus = parseDoc({
  title: 'Syllabus',
  format: 'markdown',
  source:
    '## Late work\n\nLate submissions lose 10% of the available points per day, up to three days. Work more than three days late receives a zero.\n\n' +
    '## Exams\n\nExams are closed book. You may bring one letter‑size sheet of “handwritten” notes.',
});
const policy = parseDoc({ title: 'Policy', format: 'text', source: 'AI tools are not allowed on quizzes or exams. Late submissions lose 10% of the available points per day, up to three days.' }, 1);
const docs = [syllabus, policy];

describe('verifyQuote', () => {
  it('accepts an exact substring and reports every occurrence', () => {
    const v = verifyQuote(docs, 'Late submissions lose 10% of the available points per day');
    expect(v).toMatchObject({ ok: true, kind: 'exact', docId: syllabus.id, occurrences: 2 });
    if (v.ok) expect(syllabus.text.slice(v.start, v.end)).toBe('Late submissions lose 10% of the available points per day');
  });

  it('accepts whitespace and typography differences as normalized', () => {
    const v = verifyQuote(docs, '"You may bring one letter-size   sheet of "handwritten" notes."');
    expect(v).toMatchObject({ ok: true, kind: 'normalized' });
    if (v.ok) expect(syllabus.text.slice(v.start, v.end)).toBe('You may bring one letter‑size sheet of “handwritten” notes.');
  });

  it('accepts a capitalization change and labels it', () => {
    expect(verifyQuote(docs, 'exams are closed book')).toMatchObject({ ok: true, kind: 'case' });
  });

  it('accepts ellipses joining fragments that appear in order nearby', () => {
    const v = verifyQuote(docs, 'Late submissions lose 10% ... up to three days');
    expect(v).toMatchObject({ ok: true, kind: 'elided' });
    if (v.ok) expect(v.parts).toHaveLength(2);
    expect(verifyQuote(docs, 'late submissions lose [...] up to three days')).toMatchObject({ ok: true, kind: 'elided' });
  });

  it('rejects fragments out of order, and fragments too short to check', () => {
    expect(verifyQuote(docs, 'up to three days ... Late submissions lose 10%')).toMatchObject({ ok: false });
    expect(verifyQuote(docs, 'Late ... zero and more words here')).toMatchObject({ ok: false });
  });

  it('rejects a paraphrase and shows the closest passage with a diff', () => {
    const v = verifyQuote(docs, 'Late submissions lose 10% of the points per week, up to three days.');
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.reason).toBe('not-found');
    expect(v.closest?.similarity).toBeGreaterThan(0.6);
    const ops = v.closest!.diff;
    expect(ops).toContainEqual({ op: 'quote-only', text: 'week,' });
    expect(ops).toContainEqual({ op: 'source-only', text: 'day,' });
    expect(ops[0]).toEqual({ op: 'same', text: 'Late submissions lose 10% of the' });
    expect(ops).toContainEqual({ op: 'source-only', text: 'available' });
  });

  it('rejects empty and very short quotes', () => {
    expect(verifyQuote(docs, ' "" ')).toEqual({ ok: false, reason: 'empty' });
    expect(verifyQuote(docs, 'late work')).toEqual({ ok: false, reason: 'too-short' });
  });

  it('rejects unrelated text with no close passage', () => {
    expect(verifyQuote(docs, 'Parking permits are sold at the front desk')).toEqual({ ok: false, reason: 'not-found' });
  });
});

describe('helpers', () => {
  it('cleans wrapping quote marks, blockquote markers and ellipses', () => {
    expect(cleanQuote('> “...Exams are closed book...” ')).toBe('Exams are closed book');
  });

  it('diffs words and measures similarity', () => {
    const ops = wordDiff('a b c d', 'a x c d e');
    expect(ops).toEqual([
      { op: 'same', text: 'a' },
      { op: 'quote-only', text: 'b' },
      { op: 'source-only', text: 'x' },
      { op: 'same', text: 'c d' },
      { op: 'source-only', text: 'e' },
    ]);
    expect(similarity(ops)).toBeCloseTo(3 / 5);
    expect(similarity([])).toBe(0);
    expect(wordDiff('a b', '')).toEqual([{ op: 'quote-only', text: 'a b' }]);
    expect(wordDiff('Late, work -- ok', 'late work ok.')).toEqual([{ op: 'same', text: 'late work ok.' }]);
  });

  it('finds the closest multi-sentence passage', () => {
    const c = closestPassage(docs, 'Late submissions lose 10% of the available points per day, up to three days. Work more than three days late gets a zero.');
    expect(c?.docId).toBe(syllabus.id);
    expect(syllabus.text.slice(c!.start, c!.end)).toContain('receives a zero');
  });
});

describe('extractQuotes', () => {
  it('pulls quoted strings', () => {
    expect(extractQuotes('The syllabus says “late work loses 10% per day” and "exams are closed book". Also "ok".')).toEqual([
      'late work loses 10% per day',
      'exams are closed book',
    ]);
  });

  it('joins consecutive blockquote lines into one quote', () => {
    expect(extractQuotes('Here:\n> Exams are closed\n> book always.\nAnd:\n> Second quote here now')).toEqual([
      'Exams are closed book always.',
      'Second quote here now',
    ]);
  });

  it('falls back to every sentence of the answer', () => {
    expect(extractQuotes('Exams are closed book. Yes. You may bring one sheet of notes.')).toEqual([
      'Exams are closed book.',
      'You may bring one sheet of notes.',
    ]);
  });
});
