import { describe, expect, it } from 'vitest';
import { answer, ask, passageFor, sectionOf } from '../src/core/answer.js';
import { parseDoc } from '../src/core/docs.js';
import { parsePack } from '../src/core/pack.js';
import { SAMPLE_PACK, SAMPLE_QUESTIONS } from '../src/core/sample.js';
import { buildIndex, idf, queryTerms, search } from '../src/core/search.js';
import { verifyQuote } from '../src/core/verify.js';

const docs = parsePack(SAMPLE_PACK);
const ix = buildIndex(docs);

function first(q: string): string {
  const a = answer(ix, q);
  expect(a.status, q).toBe('found');
  return a.quotes[0].text;
}

describe('answers from the sample course', () => {
  it.each([
    ['Can I use ChatGPT on lab 3?', /allowed on labs 1 to 4 for explaining error messages/],
    ['Can I use ChatGPT on lab 6?', /From lab 5 onward/],
    ['Can I use the collections module in lab 3?', /may not import the collections module/],
    ['Can I bring a calculator to the final?', /Calculators, phones and laptops are not allowed during exams/],
    ['Is there a make-up midterm?', /There is no make-up midterm/],
    ['Can I drop my lowest quiz?', /lowest two quiz scores are dropped/],
    ['Can I use late days on the midterm?', /Late days cannot be used for quizzes or exams/],
    ['How are ties broken in lab 3?', /Break ties in count alphabetically/],
    ['Can I post my code on the forum?', /do not post your own solution code/],
    ['Is attendance required?', /attendance/],
    ['Do I need a textbook?', /no required textbook/],
    ['Can I work with a partner on lab 3?', /Lab 3 may be done with one partner/],
    ['Can I use Copilot on project 1?', /on both projects, you may also use AI tools/],
  ])('%s', (q, re) => {
    expect(first(q)).toMatch(re);
  });

  it('lists the per-day penalty among the late-work quotes', () => {
    const a = answer(ix, 'Is the late penalty per day?');
    expect(a.quotes.some((q) => /lose 10% of the available points per day/.test(q.text))).toBe(true);
  });

  it('extends a sentence ending in a colon with the list after it', () => {
    const d = parseDoc({ title: 'Rules', format: 'markdown', source: 'The following are banned during exams:\n\n- phones\n- smart watches\n\nOther text.' });
    const a = ask([d], 'What is banned during exams?');
    expect(a.quotes[0].text).toBe('The following are banned during exams:\n\nphones\n\nsmart watches');
  });

  it('extends a sentence with a continuation that follows it', () => {
    const d = parseDoc({ title: 'Rules', format: 'text', source: 'Quizzes are held every Friday in lecture. This includes the first week. Bring a pencil.' });
    const a = ask([d], 'When are quizzes held?');
    expect(a.quotes[0].text).toBe('Quizzes are held every Friday in lecture. This includes the first week.');
  });

  it('only verified quotes come back, each with a location', () => {
    for (const q of SAMPLE_QUESTIONS) {
      for (const quote of answer(ix, q).quotes) {
        const doc = docs.find((d) => d.id === quote.docId)!;
        expect(doc.text.slice(quote.start, quote.end)).toBe(quote.text);
        expect(verifyQuote(docs, quote.text).ok).toBe(true);
        expect(quote.location).not.toBe('');
      }
    }
  });
});

describe('refusals', () => {
  it.each(['Will there be extra credit?', 'What is the parking policy?', 'Is the final exam cumulative?'])('%s', (q) => {
    const a = answer(ix, q);
    expect(a.status).toBe('not-found');
    expect(a.quotes).toEqual([]);
  });

  it('names the words the documents never use', () => {
    const a = answer(ix, 'What is the parking policy?');
    expect(a.unknownTerms).toEqual(['park']);
    expect(a.nearest.length).toBeGreaterThan(0);
  });

  it('refuses when the only passage is about a different lab number', () => {
    const d = parseDoc({ title: 'Labs', format: 'text', source: 'Labs 5 to 8 may be done in pairs. Lab 1 is solo.' });
    const a = ask([d], 'Can lab 3 be done in pairs?');
    expect(a.status).toBe('not-found');
  });

  it('treats an empty or stop-word question as empty', () => {
    expect(answer(ix, '   ').status).toBe('empty');
    expect(answer(ix, 'what is it?').status).toBe('empty');
    expect(search(ix, 'the and of')).toEqual([]);
  });

  it('respects a stricter coverage threshold', () => {
    expect(answer(ix, 'Is attendance required?', { minCoverage: 0.99 }).status).toBe('not-found');
  });

  it('can cap the number of quotes', () => {
    expect(answer(ix, 'When is the final exam?', { maxQuotes: 1 }).quotes).toHaveLength(1);
  });
});

describe('index internals', () => {
  it('scores unseen terms highest', () => {
    expect(idf(ix, 'zebra')).toBeGreaterThan(idf(ix, 'lab'));
  });

  it('weights numbered items by their kind and discounts weak words', () => {
    const qt = queryTerms(ix, 'Can I use AI on project 7 in this course?');
    const by = Object.fromEntries(qt.map((t) => [t.term, t]));
    expect(by['project#7'].known).toBe(false);
    expect(by['project#7'].weight).toBeCloseTo(1.3 * idf(ix, 'project'));
    expect(by.cours.weight).toBeLessThan(idf(ix, 'cours'));
    expect(by.ai.concept).toBe('~ai');
  });

  it('reports sections and passage bounds', () => {
    const d = docs[0];
    const hit = search(ix, 'textbook')[0];
    expect(passageFor(d, hit).start).toBe(hit.unit.start);
    expect(sectionOf(d, hit.unit.start)).toContain('Textbook and software');
    expect(sectionOf(d, -5)).toEqual([]);
  });
});
