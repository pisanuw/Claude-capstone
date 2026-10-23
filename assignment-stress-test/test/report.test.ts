import { describe, expect, it } from 'vitest';
import { diffRuns, lineDiff, normLabel } from '../src/core/diff.js';
import { esc, reportHtml } from '../src/core/export.js';
import { addRun, assignmentKey, emptyLibrary, histories, mergeLibraries, newRunId, parseLibrary, removeRun } from '../src/core/history.js';
import { pastedCell, pasteInstructions, scorePasted } from '../src/core/paste.js';
import { bucketFor, cellFraction, headline, matrix, overrideScore, pct, rowStats, runRows, verdict } from '../src/core/report.js';
import { sample } from '../src/core/samples.js';
import type { Cell, Run, StyleId } from '../src/core/types.js';

const memo = sample('memo');

/** A memo cell scoring the given points per row (r1..r5, maxima 25/20/20/15/20). */
function cell(model: string, style: StyleId, pts: (number | null)[], status: Cell['status'] = 'done'): Cell {
  return {
    model,
    style,
    status,
    error: '',
    transcript: [],
    output: 'x',
    tests: null,
    scores: pts.map((p, i) => ({ id: `r${i + 1}`, points: p, reason: '', source: 'judge' })),
  };
}

function run(cells: Cell[], over: Partial<Run> = {}): Run {
  return { id: 'run-1', createdAt: '2026-10-23T10:00:00Z', term: 'Autumn 2026', source: 'api', judge: 'claude-opus-5-5', assignment: memo, cells, note: '', ...over };
}

const r = run([
  cell('claude-opus-5-5', 'lazy', [20, 16, 0, 12, 18]),
  cell('claude-opus-5-5', 'careful', [25, 20, 4, 15, 20]),
  cell('claude-haiku-5-5', 'lazy', [10, 8, 0, 6, 10]),
  cell('claude-haiku-5-5', 'careful', [null, null, null, null, null], 'error'),
  cell('claude-haiku-5-5', 'student', [0, 0, 0, 0, 0], 'refused'),
]);

describe('report', () => {
  it('computes cell fractions over scored rows only', () => {
    const rows = runRows(r);
    expect(cellFraction(r.cells[0], rows)).toBeCloseTo(66 / 100);
    expect(cellFraction(cell('m', 'lazy', [25, null, null, null, null]), rows)).toBe(1);
    expect(cellFraction(r.cells[3], rows)).toBeNull();
    expect(cellFraction(cell('m', 'lazy', [null, null, null, null, null]), rows)).toBeNull();
  });

  it('buckets rows on the best attempt', () => {
    const s = rowStats(r);
    expect(s.map((x) => x.bucket)).toEqual(['easy', 'easy', 'holds', 'easy', 'easy']);
    expect(s[2].best).toBeCloseTo(0.2);
    expect(s[0].bestCell).toBe('Claude Opus 5.5, careful multi-turn');
    expect(s[0].lazy).toBeCloseTo(0.8);
    expect(s[0].mean).toBeCloseTo((0.8 + 1 + 0.4 + 0) / 4);
    expect([bucketFor(null), bucketFor(0.6), bucketFor(0.49)]).toEqual(['unscored', 'partial', 'holds']);
    expect(rowStats(run([]))[0]).toMatchObject({ mean: null, best: null, lazy: null, bucket: 'unscored' });
  });

  it('headlines and verdicts', () => {
    const h = headline(r);
    expect(h).toMatchObject({ attempts: 5, refused: 1, failed: 1, bestCell: 'Claude Opus 5.5, careful multi-turn' });
    expect(pct(h.best)).toBe('84%');
    expect(pct(h.lazy)).toBe('66%');
    expect(verdict(h)).toBe('A lazy copy-paste earns 66%. The best attempt (Claude Opus 5.5, careful multi-turn) earns 84%. AI gets a passing share but not full marks.');
    expect(verdict(headline(run([])))).toMatch(/No attempt was scored/);
    expect(verdict({ ...h, best: 0.9, lazy: null })).toMatch(/^The best.*AI can complete/);
    expect(verdict({ ...h, best: 0.1 })).toMatch(/No attempt reached half/);
  });

  it('builds the model x style matrix in style order', () => {
    const m = matrix(r);
    expect(m.models).toEqual(['claude-opus-5-5', 'claude-haiku-5-5']);
    expect(m.styles).toEqual(['lazy', 'student', 'careful']);
    expect(m.value('claude-haiku-5-5', 'student')?.status).toBe('refused');
    expect(m.value('claude-opus-5-5', 'student')).toBeNull();
  });

  it('applies clamped instructor overrides without touching the original', () => {
    const o = overrideScore(r, 0, 'r3', 50);
    expect(o.cells[0].scores[2]).toMatchObject({ points: 20, source: 'instructor' });
    expect(r.cells[0].scores[2].points).toBe(0);
    expect(overrideScore(r, 0, 'r3', null).cells[0].scores[2].points).toBeNull();
    expect(overrideScore(r, 0, 'r3', -1).cells[0].scores[2].points).toBe(0);
    expect(() => overrideScore(r, 0, 'r9', 1)).toThrow();
  });
});

describe('reportHtml', () => {
  it('is a standalone page with the verdict, matrix, rows, advice and caveat', () => {
    const html = reportHtml({ ...r, note: 'Pilot <run>' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<script/);
    expect(html).toContain('Memo 2: Facial recognition on campus');
    expect(html).toContain('CSS 301 · Autumn 2026 · 2026-10-23');
    expect(html).toContain('>refused<');
    expect(html).toContain('>error<');
    expect(html).toContain('<b>Holds up</b> (Connection to the October 14 debate)');
    expect(html).toContain('lower bound');
    expect(html).toContain('Pilot &lt;run&gt;');
    expect(html).toContain('5 attempts, 1 refused, 1 failed to run');
    const bare = reportHtml(run([cell('m', 'lazy', [1, 1, 1, 1, 1])], { term: '', assignment: { ...memo, title: '', course: '' } }));
    expect(bare).toContain('Untitled assignment');
    expect(bare).not.toContain(' · 2026-10-23');
  });

  it('marks test-scored rows', () => {
    const code = sample('rle');
    expect(reportHtml(run([], { assignment: code }))).toContain('Correctness <small>(tests)</small>');
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('diff', () => {
  it('diffs lines', () => {
    expect(lineDiff('a\nb\nc', 'a\nc\nd')).toEqual([
      { op: 'same', text: 'a' },
      { op: 'del', text: 'b' },
      { op: 'same', text: 'c' },
      { op: 'add', text: 'd' },
    ]);
    expect(lineDiff('x', '').map((l) => l.op)).toEqual(['del', 'add']);
    expect(normLabel(' Use of  Course-Readings ')).toBe('use of course readings');
  });

  it('compares runs row by row, matching rows by label', () => {
    const edited = {
      ...memo,
      prompt: memo.prompt + '\nBring a printed draft to class.',
      rubricText: memo.rubricText.replace('Writing (20)', 'In-class draft (20)'),
    };
    const after = run([cell('claude-opus-5-5', 'lazy', [10, 10, 0, 5, 0])], { assignment: edited });
    const d = diffRuns(r, after);
    expect(d.changedText).toBe(true);
    expect(d.best.before).toBeCloseTo(0.84);
    expect(d.best.after).toBeCloseTo(0.25);
    expect(d.rows[0].delta).toBeCloseTo(0.4 - 1);
    expect(d.rows.find((x) => x.label === 'In-class draft')).toMatchObject({ before: null, delta: null });
    expect(d.rows.find((x) => x.label === 'Writing')).toMatchObject({ after: null });
    expect(d.prompt.filter((l) => l.op === 'add')).toEqual([{ op: 'add', text: 'Bring a printed draft to class.' }]);
    expect(diffRuns(r, r).changedText).toBe(false);
  });
});

describe('history', () => {
  const t1 = run([cell('m', 'lazy', [10, 10, 10, 10, 10])], { id: 'a', term: 'Autumn 2025', createdAt: '2025-10-01T00:00:00Z' });
  const t2 = run([cell('m', 'lazy', [20, 15, 15, 12, 18])], { id: 'b', term: 'Autumn 2026', createdAt: '2026-10-01T00:00:00Z' });
  const other = run([], { id: 'c', term: '', assignment: { ...memo, title: 'Other' } });

  it('groups by assignment and flags assignments that aged badly', () => {
    let lib = addRun(addRun(addRun(emptyLibrary(), t2), t1), other);
    lib = addRun(lib, { ...t2, note: 'replaced' });
    expect(lib.runs).toHaveLength(3);
    const hs = histories(lib);
    expect(hs).toHaveLength(2);
    const h = hs.find((x) => x.title.startsWith('Memo'))!;
    expect(h.terms.map((t) => [t.term, pct(t.best)])).toEqual([
      ['Autumn 2025', '50%'],
      ['Autumn 2026', '80%'],
    ]);
    expect(h.aged).toBe(true);
    expect(hs.find((x) => x.title === 'Other')).toMatchObject({ aged: false, terms: [{ term: 'No term', best: null, runs: 1 }] });
    expect(removeRun(lib, 'a').runs.map((x) => x.id)).toEqual(['c', 'b']);
    expect(assignmentKey(t1)).toBe('css 301|memo 2 facial recognition on campus');
  });

  it('round-trips, merges and validates exports', () => {
    const lib = addRun(emptyLibrary(), t1);
    expect(parseLibrary(JSON.stringify(lib))).toEqual(lib);
    expect(parseLibrary(JSON.stringify(t2)).runs).toHaveLength(1);
    expect(() => parseLibrary('nope')).toThrow(/not JSON/);
    expect(() => parseLibrary('{"version":2}')).toThrow(/not an Assignment Stress Test/);
    expect(() => parseLibrary('{"version":1,"runs":[{"id":1}]}')).toThrow(/1 run\(s\)/);
    const { lib: merged, added } = mergeLibraries(lib, { version: 1, runs: [t1, t2] });
    expect([merged.runs.length, added]).toEqual([2, 1]);
    expect(newRunId(new Date('2026-10-23T01:02:03Z'), () => 0.5)).toBe('run-20261023010203-' + (500000).toString(36));
  });
});

describe('paste mode', () => {
  it('hands out the turns with instructions', () => {
    expect(pasteInstructions('lazy', memo)).toMatch(/^Lazy paste: .*send this one message/);
    const careful = pasteInstructions('careful', memo);
    expect(careful).toMatch(/send these 3 messages in order/);
    expect(careful).toContain('----- message 3 of 3 -----');
  });

  it('builds and scores pasted cells', async () => {
    const rows = runRows(r);
    const c = pastedCell({ modelLabel: '  ', style: 'student', reply: 'my memo', refused: false }, memo);
    expect([c.model, c.output, c.transcript.at(-1)?.role]).toEqual(['Pasted model', 'my memo', 'assistant']);
    const judged = await scorePasted(c, memo, rows, '{"rows":[{"id":"r1","points":20,"reason":"ok"}]}', null);
    expect(judged.cell.scores[0].points).toBe(20);
    expect(judged.warnings).toHaveLength(4);
    const refused = pastedCell({ modelLabel: 'ChatGPT', style: 'lazy', reply: 'ignored', refused: true }, memo);
    expect(refused.status).toBe('refused');
    expect((await scorePasted(refused, memo, rows, '', null)).cell.scores.every((s) => s.points === 0)).toBe(true);
    const code = sample('rle');
    const codeCell = pastedCell({ modelLabel: 'Gemini', style: 'lazy', reply: 'no code', refused: false }, code);
    const scored = await scorePasted(codeCell, code, runRows(run([], { assignment: code })), '{"rows":[]}', null);
    expect(scored.cell.tests?.status).toBe('no-code');
    const allTests = { ...code, rubricText: 'Correctness (10) {tests}' };
    expect((await scorePasted(codeCell, allTests, runRows(run([], { assignment: allTests })), '', null)).warnings).toEqual([]);
  });
});
