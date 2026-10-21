import { describe, expect, it } from 'vitest';
import { assess } from '../src/core/assess';
import { vivaId } from '../src/core/pack';
import { Session } from '../src/core/session';
import { coversConcept, hash, mentions, sentences, words } from '../src/core/text';
import { Q, viva } from './fixtures';

const GOOD = 'The base case is when head is None or a single node, because that list is already sorted. Each call to _sort gets a half of the list, so it gets smaller and must stop.';

describe('text helpers', () => {
  it('hashes deterministically to 14 hex digits', () => {
    expect(hash('abc')).toMatch(/^[0-9a-f]{14}$/);
    expect(hash('abc')).toBe(hash('abc'));
    expect(hash('abc')).not.toBe(hash('abd'));
  });
  it('matches identifiers in several spellings', () => {
    expect(mentions('I call `mergeSort` here', 'mergeSort')).toBe(true);
    expect(mentions('the merge sort function', 'mergeSort')).toBe(true);
    expect(mentions('merge_sort splits', 'merge_sort')).toBe(true);
    expect(mentions('the head pointer', 'he')).toBe(false);
    expect(mentions('anything', '')).toBe(false);
  });
  it('matches concepts by stem or phrase', () => {
    expect(coversConcept('it terminates', ['terminat'])).toBe(true);
    expect(coversConcept('the base case', ['base case'])).toBe(true);
    expect(coversConcept('nothing here', ['loop'])).toBe(false);
    expect(words('O(n log n) time')).toContain('o(n log n)');
    expect(sentences('One. Two!\nThree')).toEqual(['One.', 'Two!', 'Three']);
  });
});

describe('assess', () => {
  it('accepts a specific, complete, explained answer', () => {
    const a = assess(Q, GOOD);
    expect(a).toMatchObject({ specific: true, causal: true, vague: false, missing: null, dontKnow: false });
    expect(a.identifiersHit).toEqual(['_sort', 'head']);
  });
  it('names what a vague answer is missing', () => {
    expect(assess(Q, 'It is recursion and the list gets smaller and smaller until the base case stops it eventually.').missing).toBe('specifics');
    expect(assess(Q, 'In _sort the head is split into two parts and then each part is sorted again and merged together.').missing).toBe('concept');
    expect(assess(Q, 'line 56: base case, half, smaller list').missing).toBe('depth');
    expect(assess(Q, "I don't know, maybe the base case of _sort is when it gets smaller by half, I think.").dontKnow).toBe(true);
  });
  it('treats line references as specific when no identifiers are expected', () => {
    expect(assess({ ...Q, identifiers: [] }, 'x').specific).toBe(true);
    expect(assess(Q, 'See line 12').pointsAtCode).toBe(true);
  });
});

describe('Session', () => {
  it('asks follow-ups on vague answers, never repeating one, then moves on', () => {
    let now = 0;
    const s = new Session(viva(), () => now);
    expect(s.current()).toMatchObject({ kind: 'question', index: 0 });
    now = 10_000;
    const f1 = s.answer('no idea');
    expect(f1).toMatchObject({ kind: 'followup', followUps: 1, prompt: 'Point to the line.' });
    const f2 = s.answer('still no idea');
    expect(f2).toMatchObject({ kind: 'followup', followUps: 2 });
    expect(f2.kind !== 'done' && f2.prompt).not.toBe('Point to the line.');
    const next = s.answer('nope');
    expect(next).toMatchObject({ kind: 'question', index: 1, prompt: 'Second?' });
    expect(s.answer('   ')).toMatchObject({ kind: 'question', index: 1 });
    expect(s.answer(GOOD, 50)).toEqual({ kind: 'done' });
    expect(s.done).toBe(true);
    const t = s.transcript();
    expect(t.vivaId).toBe(vivaId(s.viva));
    expect(t.questions[0]!.turns.map((x) => x.role)).toEqual(['question', 'answer', 'followup', 'answer', 'followup', 'answer']);
    expect(t.questions[1]!.turns[1]!.pasted).toBe(50);
    expect(t.questions[0]!.turns[1]!.at).toBe(10_000);
    expect(s.answer('late')).toEqual({ kind: 'done' });
  });
  it('moves straight on after a good answer, and respects maxFollowUps = 0', () => {
    const s = new Session(viva(undefined, { maxFollowUps: 0 }), () => 0);
    expect(s.answer('vague')).toMatchObject({ kind: 'question', index: 1 });
    const g = new Session(viva(), () => 0);
    expect(g.answer(GOOD)).toMatchObject({ kind: 'question', index: 1 });
  });
  it('times out, applying the accommodation multiplier', () => {
    let now = 0;
    const s = new Session(viva(undefined, { minutes: 10, timeMultiplier: 1.5 }), () => now, 1);
    expect(s.limitMs).toBe(900_000);
    now = 600_000;
    expect(s.tick()).toBe(false);
    expect(s.remainingMs()).toBe(300_000);
    now = 900_001;
    expect(s.answer(GOOD)).toEqual({ kind: 'done' });
    const t = s.transcript();
    expect(t).toMatchObject({ timedOut: true, durationMs: 900_000, restarts: 1 });
  });
  it('skips, finishes early and counts blurs', () => {
    const s = new Session(viva(), () => 0);
    s.blur();
    expect(s.skip()).toMatchObject({ kind: 'question', index: 1 });
    s.finish();
    s.blur();
    expect(s.skip()).toEqual({ kind: 'done' });
    expect(s.current()).toEqual({ kind: 'done' });
    expect(s.transcript().blurs).toBe(1);
    expect(s.transcript().restarts).toBeUndefined();
  });
  it('is done immediately with no questions', () => {
    expect(new Session(viva([]), () => 0).done).toBe(true);
  });
});
