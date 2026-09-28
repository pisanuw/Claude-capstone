import { describe, expect, it } from 'vitest';
import {
  currentRung,
  dashboardRows,
  formatDuration,
  markSolved,
  newProgress,
  noteTool,
  parseProgress,
  rungSummary,
  secondsOnRung,
} from '../src/core/progress.js';

describe('progress', () => {
  it('starts with the first rung open and the rest locked', () => {
    const p = newProgress('id', 'Ladder', 3, 'Ada');
    expect(p.rungs.map((r) => r.status)).toEqual(['open', 'locked', 'locked']);
    expect(p.rungs[0].startedAt).toBeTypeOf('number');
    expect(currentRung(p)).toBe(0);
    expect(p.student).toBe('Ada');
  });

  it('marks solved and unlocks the next rung; solving twice is a no-op', () => {
    const p = newProgress('id', 'Ladder', 2);
    markSolved(p, 0, 1000);
    expect(p.rungs[0].status).toBe('solved');
    expect(p.rungs[0].solvedAt).toBe(1000);
    expect(p.rungs[1].status).toBe('open');
    expect(p.rungs[1].startedAt).toBe(1000);
    markSolved(p, 0, 2000);
    expect(p.rungs[0].solvedAt).toBe(1000);
    markSolved(p, 1, 3000);
    expect(currentRung(p)).toBe(2);
    markSolved(p, 5, 3000);
  });

  it('records each tool once per rung', () => {
    const p = newProgress('id', 'L', 1);
    noteTool(p, 0, 'frequency');
    noteTool(p, 0, 'frequency');
    noteTool(p, 0, 'period');
    noteTool(p, 9, 'period');
    expect(p.rungs[0].toolsUsed).toEqual(['frequency', 'period']);
  });

  it('measures time on a rung and formats durations', () => {
    expect(secondsOnRung({ status: 'locked', hintsUsed: 0, attempts: 0, toolsUsed: [] })).toBe(0);
    expect(secondsOnRung({ status: 'open', startedAt: 0, hintsUsed: 0, attempts: 0, toolsUsed: [] }, 65_000)).toBe(65);
    expect(secondsOnRung({ status: 'solved', startedAt: 0, solvedAt: 5_000, hintsUsed: 0, attempts: 0, toolsUsed: [] }, 65_000)).toBe(5);
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(65)).toBe('1m 05s');
    expect(formatDuration(3725)).toBe('1h 02m');
  });

  it('parses exported progress and rejects other JSON', () => {
    const p = newProgress('id', 'L', 2, 'Bob');
    p.rungs[0].key = { type: 'caesar', shift: 3 };
    p.rungs[0].notes = 'hi';
    const back = parseProgress(JSON.parse(JSON.stringify(p)));
    expect(back).toEqual(p);
    expect(parseProgress(null)).toBeNull();
    expect(parseProgress({ version: 2 })).toBeNull();
    expect(parseProgress({ version: 1, ladderId: 'x', rungs: [{ status: 'weird' }] })).toBeNull();
    expect(parseProgress({ version: 1, ladderId: 'x', rungs: [null] })).toBeNull();
    const loose = parseProgress({ version: 1, ladderId: 'x', rungs: [{ status: 'open', toolsUsed: ['a', 1] }] });
    expect(loose?.rungs[0]).toEqual({ status: 'open', startedAt: undefined, solvedAt: undefined, hintsUsed: 0, attempts: 0, toolsUsed: ['a'], key: undefined, notes: undefined });
    expect(loose?.student).toBe('');
  });

  it('builds dashboard rows and per-rung summaries', () => {
    const a = newProgress('id', 'L', 3, 'Ada');
    a.rungs[0].startedAt = 0;
    markSolved(a, 0, 60_000);
    a.rungs[1].hintsUsed = 2;
    noteTool(a, 1, 'period');
    noteTool(a, 0, 'period');
    const b = newProgress('id', 'L', 3);
    b.rungs[0].startedAt = 0;
    markSolved(b, 0, 120_000);
    markSolved(b, 1, 180_000);
    const c = newProgress('id', 'L', 3);
    c.rungs[0].startedAt = 0;
    const rows = dashboardRows([a, b, c], 200_000);
    expect(rows[0]).toMatchObject({ student: 'Ada', stuckOn: 'rung 2', solved: 1, total: 3, hints: 2, tools: 'period x2' });
    expect(rows[0].perRung).toEqual([60, 140, 0]);
    expect(rows[1].student).toBe('(unnamed)');
    expect(rows[1].perRung).toEqual([120, 60, 20]);
    const summary = rungSummary([a, b, c], 3, 200_000);
    expect(summary[0]).toEqual({ rung: 1, stuck: 1, solved: 2, medianSeconds: 90 });
    expect(summary[1]).toEqual({ rung: 2, stuck: 1, solved: 1, medianSeconds: 60 });
    expect(summary[2]).toEqual({ rung: 3, stuck: 1, solved: 0, medianSeconds: 0 });
    const done = newProgress('id', 'L', 1);
    markSolved(done, 0);
    expect(dashboardRows([done])[0].stuckOn).toBe('done');
    expect(rungSummary([{ ...done, rungs: [] }], 1)[0].solved).toBe(0);
  });
});
