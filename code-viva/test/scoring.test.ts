import { describe, expect, it } from 'vitest';
import { scoreQuestion, scoreViva } from '../src/core/scoring';
import type { QuestionTranscript, Transcript, Turn } from '../src/core/types';
import { Q, viva } from './fixtures';

const turns = (...answers: (string | [string, number, number?])[]): QuestionTranscript => {
  const out: Turn[] = [{ role: 'question', text: Q.prompt, at: 0 }];
  let at = 0;
  for (const a of answers) {
    const [text, pasted, dt] = typeof a === 'string' ? [a, 0, 60_000] : [a[0], a[1], a[2] ?? 60_000];
    at += dt;
    out.push({ role: 'answer', text, at, ...(pasted ? { pasted } : {}) });
  }
  return { questionId: Q.id, turns: out };
};

const GOOD = 'The base case is when head is None or a single node, because that list is already sorted. Each call to _sort gets a half of the list, so it gets smaller and must stop.';

function transcript(qs: QuestionTranscript[], extra: Partial<Transcript> = {}): Transcript {
  return { v: 1, vivaId: 'x', student: 'Ana', submissionId: 's1', startedAt: '2026-10-06T15:00:00Z', durationMs: 1, timedOut: false, blurs: 0, questions: qs, ...extra };
}

describe('scoreQuestion', () => {
  it('gives 3 with quoted evidence for a specific, complete, explained answer', () => {
    const s = scoreQuestion(Q, turns(GOOD));
    expect(s.score).toBe(3);
    expect(s.evidence[0]).toMatch(/^The base case is when head/);
    expect(s.notes[0]).toBe('Names `_sort`, `head`.');
    expect(s.wpm).toBeGreaterThan(20);
  });
  it('scores general and partial answers lower and explains why', () => {
    const general = scoreQuestion(Q, turns('Recursion works by calling itself until a base case is reached and then it stops.'));
    expect(general.score).toBe(1);
    expect(general.notes.join(' ')).toContain('Does not name `_sort`');
    expect(general.notes.join(' ')).toContain('Misses: smaller');
    const partial = scoreQuestion(Q, turns('_sort stops at the base case when head is None.'));
    expect(partial.score).toBe(2);
    expect(partial.notes).toContain('States what happens without saying why.');
  });
  it('scores "I don\'t know" 0 and notes pasting and follow-ups', () => {
    const dk = scoreQuestion(Q, turns("I don't know, the base case of _sort maybe"));
    expect(dk.score).toBe(0);
    expect(dk.notes).toContain('Says they do not know or remember.');
    const qt = turns(['Pasted base case text about _sort being smaller because reasons, quite long indeed here.', 90, 2000]);
    qt.turns.splice(1, 0, { role: 'followup', text: 'f', at: 0 });
    const p = scoreQuestion(Q, qt);
    expect(p.score).toBe(0);
    expect(p.pastedShare).toBeGreaterThan(0.9);
    expect(p.notes.join(' ')).toMatch(/Needed 1 follow-up\. .*% of this answer was pasted/);
  });
  it('handles unanswered questions and questions without identifiers', () => {
    expect(scoreQuestion(Q, undefined)).toMatchObject({ score: 0, answered: false, notes: ['Not answered.'] });
    const open = scoreQuestion({ ...Q, identifiers: [] }, turns('The base case stops it and the list gets smaller.'));
    expect(open.score).toBe(2);
    expect(scoreQuestion({ ...Q, identifiers: [] }, turns('Line 3 is the base case, it gets smaller.')).score).toBe(2);
  });
  it('credits only the typed replies when some were pasted', () => {
    const mixed = scoreQuestion(Q, turns(['Pasted: the base case stops recursion because the input gets smaller each call, a textbook line.', 95, 3000], GOOD));
    expect(mixed.score).toBe(3);
    expect(mixed.notes).toContain('1 of 2 replies were mostly pasted and not credited.');
    expect(mixed.evidence.every((e) => !e.startsWith('Pasted'))).toBe(true);
  });
  it('reports no evidence when nothing matches', () => {
    expect(scoreQuestion(Q, turns('Pizza is good.')).evidence).toEqual([]);
  });
});

describe('scoreViva', () => {
  const v = viva([Q, { ...Q, id: 'c1', kind: 'commit' }]);
  it('raises no flags for a strong transcript', () => {
    const s = scoreViva(v, transcript([turns(GOOD), { ...turns(GOOD), questionId: 'c1' }]), 'x');
    expect(s).toMatchObject({ total: 6, max: 6, percent: 1, flags: [], priority: 0, needsFollowUp: false });
  });
  it('flags low scores, zeros, pasting, the commit question, timeouts, focus, speed, restarts and mismatches', () => {
    const fast = turns([GOOD + ' ' + GOOD, 0, 5_000]);
    const pasted = { ...turns(["I don't know", 0], ['A very long pasted explanation that does not mention any of the names at all, honestly, nothing.', 95]), questionId: 'c1' };
    const s = scoreViva(v, transcript([fast, pasted], { timedOut: true, blurs: 4, restarts: 2 }), 'other-id');
    const kinds = s.flags.map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(['mismatch', 'commit-unexplained', 'zero', 'focus', 'fast', 'restart']));
    expect(s.flags[0]!.severity).toBe(3);
    expect(s.needsFollowUp).toBe(true);
    const empty = scoreViva(v, transcript([], { timedOut: true }));
    expect(empty.flags.map((f) => f.kind)).toEqual(['low-score', 'commit-unexplained', 'timeout']);
    expect(empty.flags[0]!.message).toContain('0%');
    const paste = scoreViva(viva([Q]), transcript([turns([GOOD, GOOD.length, 2000])]));
    expect(paste.flags.map((f) => f.kind)).toEqual(['low-score', 'zero', 'paste']);
    expect(paste.questions[0]!.notes).toContain('The answer was mostly pasted and not credited.');
  });
  it('rates 34 to 49 percent as a medium low-score flag', () => {
    const mid = scoreViva(viva([Q, { ...Q, id: 'q2' }]), transcript([turns('_sort stops at the base case when head is None, smaller'), { ...turns('x'), questionId: 'q2' }]));
    expect(mid.percent).toBeCloseTo(0.33, 1);
  });
});
