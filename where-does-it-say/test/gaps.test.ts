import { describe, expect, it } from 'vitest';
import { cluster, gapReport, logCsv, markUnhelpful, mergeEntries, newEntry, parseLogFile, reportMarkdown, weekOf } from '../src/core/gaps.js';

const d = (s: string) => new Date(s);
const entries = [
  newEntry('Is there extra credit?', 'not-found', ['extra'], d('2026-09-28T10:00:00Z')),
  newEntry('Will there be any extra credit?', 'not-found', ['extra'], d('2026-09-29T11:00:00Z')),
  newEntry('Where do I park?', 'not-found', ['park'], d('2026-09-30T09:00:00Z')),
  newEntry('Is the late penalty per day?', 'answered', [], d('2026-09-30T12:00:00Z'), ['Syllabus: Late work']),
  newEntry('Can I use AI on lab 3?', 'answered', [], d('2026-10-06T12:00:00Z')),
];

describe('log entries', () => {
  it('creates entries with ids, trimming the question', () => {
    const e = newEntry('  Hi there?  ', 'answered', [], d('2026-09-30T00:00:00Z'), []);
    expect(e.question).toBe('Hi there?');
    expect(e.cited).toBeUndefined();
    expect(e.id).toMatch(/^[0-9a-f]{8}/);
    expect(entries[3].cited).toEqual(['Syllabus: Late work']);
  });

  it('marks only answered entries unhelpful', () => {
    const out = markUnhelpful(entries, entries[4].id);
    expect(out[4].outcome).toBe('unhelpful');
    expect(markUnhelpful(entries, entries[0].id)[0].outcome).toBe('not-found');
  });

  it('merges without duplicates, oldest first', () => {
    const m = mergeEntries([entries[2], entries[0]], [entries[0], entries[1]]);
    expect(m.map((e) => e.question)).toEqual([entries[0].question, entries[1].question, entries[2].question]);
  });
});

describe('weekOf', () => {
  it('returns the Monday of the week', () => {
    expect(weekOf('2026-09-30T12:00:00Z')).toBe('2026-09-28');
    expect(weekOf('2026-10-04T23:00:00Z')).toBe('2026-09-28');
    expect(weekOf('2026-09-28T00:00:00Z')).toBe('2026-09-28');
  });
});

describe('gap report', () => {
  const log = markUnhelpful(entries, entries[4].id);
  const r = gapReport(log);

  it('counts and groups gaps by week and wording', () => {
    expect(r).toMatchObject({ total: 5, answered: 1, gaps: 4 });
    expect(r.weeks.map((w) => w.week)).toEqual(['2026-10-05', '2026-09-28']);
    const sep = r.weeks[1];
    expect(sep.clusters[0].label).toBe('Is there extra credit?');
    expect(sep.clusters[0].questions).toHaveLength(2);
    expect(sep.clusters[1].label).toBe('Where do I park?');
    expect(r.missingWords).toEqual([
      { word: 'extra', count: 2 },
      { word: 'park', count: 1 },
    ]);
  });

  it('writes Markdown', () => {
    const md = reportMarkdown(r, 'CS 142');
    expect(md).toContain('# Syllabus gaps: CS 142');
    expect(md).toContain('extra (2), park (1)');
    expect(md).toContain('- Is there extra credit? (asked 2 times)');
    expect(md).toContain('  - Will there be any extra credit?');
    expect(md).toContain('[answer marked unhelpful]');
    expect(reportMarkdown(gapReport([]), 'X')).toContain('No gaps logged yet.');
  });

  it('writes CSV with quoting', () => {
    const csv = logCsv([newEntry('Is it "late", or not?', 'not-found', ['a', 'b'], d('2026-09-30T00:00:00Z'), ['S: x', 'T: y'])]);
    expect(csv.split('\n')[0]).toBe('time,outcome,question,unknown_words,cited');
    expect(csv).toContain('"Is it ""late"", or not?"');
    expect(csv).toContain(',a b,S: x | T: y');
  });

  it('clusters identical empty-term questions together', () => {
    expect(cluster([entries[0], entries[0]])).toHaveLength(1);
    expect(cluster([newEntry('???', 'not-found', [], d('2026-09-30T00:00:00Z')), newEntry('!!', 'not-found', [], d('2026-09-30T00:00:00Z'))])).toHaveLength(1);
  });
});

describe('parseLogFile', () => {
  it('reads a valid export and drops malformed entries', () => {
    const file = {
      kind: 'where-does-it-say-log',
      v: 1,
      packId: 'abc',
      packTitle: 'CS',
      entries: [
        entries[0],
        { ...entries[3], cited: ['x', 3] },
        { id: 'x', at: 'not a date', question: 'q', outcome: 'answered' },
        { id: 'y', at: '2026-09-30T00:00:00Z', question: 'q', outcome: 'maybe' },
        { id: 'z', at: '2026-09-30T00:00:00Z', question: 'q', outcome: 'answered', unknownTerms: ['ok', 5] },
        null,
      ],
    };
    const out = parseLogFile(JSON.stringify(file));
    expect('error' in out).toBe(false);
    if ('error' in out) return;
    expect(out.entries.map((e) => e.id)).toEqual([entries[0].id, entries[3].id, 'z']);
    expect(out.entries[1].cited).toEqual(['x']);
    expect(out.entries[2].unknownTerms).toEqual(['ok']);
    expect(parseLogFile(JSON.stringify({ ...file, packId: 3, packTitle: null, entries: [{ id: 'w', at: '2026-09-30T00:00:00Z', question: 'q', outcome: 'not-found' }] }))).toMatchObject({
      packId: '',
      packTitle: '',
      entries: [{ unknownTerms: [] }],
    });
  });

  it('rejects other files', () => {
    expect(parseLogFile('{')).toEqual({ error: 'Not valid JSON.' });
    expect(parseLogFile('{"kind":"other"}')).toEqual({ error: 'Not a Where Does It Say question log.' });
    expect(parseLogFile('null')).toEqual({ error: 'Not a Where Does It Say question log.' });
  });
});
