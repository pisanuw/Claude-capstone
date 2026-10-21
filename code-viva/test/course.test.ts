import { describe, expect, it } from 'vitest';
import {
  acceptTranscript,
  emptyCourse,
  flagQueue,
  generateAll,
  linksCsv,
  parseCourse,
  replaceQuestion,
  resultsCsv,
  retime,
  rows,
  toCsv,
  type Course,
} from '../src/core/course';
import { vivaId } from '../src/core/pack';
import { SAMPLE_SPEC, SAMPLE_SUBMISSIONS, sampleCourse } from '../src/core/sample';
import { Session } from '../src/core/session';

const base = (): Course => ({ ...emptyCourse({ course: 'CS 143', assignment: 'A4', spec: SAMPLE_SPEC }), submissions: SAMPLE_SUBMISSIONS });

describe('course workflow', () => {
  it('generates vivas with settings and accommodations', () => {
    const c = generateAll({ ...base(), accommodations: { 'a4-dana-kim': 1.5 } });
    expect(Object.keys(c.vivas)).toHaveLength(4);
    expect(c.vivas['a4-dana-kim']!.timeMultiplier).toBe(1.5);
    expect(c.vivas['a4-ana-ruiz']).toMatchObject({ course: 'CS 143', minutes: 20, maxFollowUps: 2 });
    expect(rows(c).map((r) => r.status)).toEqual(['not answered', 'not answered', 'not answered', 'not answered']);
    expect(rows(base())[0]!.status).toBe('no viva');
  });
  it('regenerates only the requested students and keeps answered vivas', () => {
    let c = generateAll(base());
    const s = new Session(c.vivas['a4-ana-ruiz']!, () => 0);
    s.finish();
    const res = acceptTranscript(c, s.transcript());
    expect(res.ok && !res.mismatch).toBe(true);
    if (!res.ok) return;
    c = { ...res.course, settings: { ...res.course.settings, questions: 4 } };
    const again = generateAll(c);
    expect(again.vivas['a4-ana-ruiz']).toBe(c.vivas['a4-ana-ruiz']);
    expect(again.vivas['a4-ben-okafor']!.questions).toHaveLength(4);
    const one = generateAll(c, ['a4-chen-wei']);
    expect(one.vivas['a4-chen-wei']!.questions).toHaveLength(4);
    expect(one.vivas['a4-dana-kim']!.questions).toHaveLength(5);
  });
  it('retimes and edits without changing other questions', () => {
    let c = generateAll(base());
    const before = c.vivas['a4-chen-wei']!;
    c = retime({ ...c, accommodations: { 'a4-chen-wei': 2 } }, 'a4-chen-wei');
    expect(c.vivas['a4-chen-wei']!.timeMultiplier).toBe(2);
    expect(c.vivas['a4-chen-wei']!.questions).toEqual(before.questions);
    expect(retime(c, 'nobody')).toBe(c);
    const edited = replaceQuestion(c, 'a4-chen-wei', 0, { ...before.questions[0]!, prompt: 'New wording' });
    expect(edited.vivas['a4-chen-wei']!.questions[0]!.prompt).toBe('New wording');
    expect(edited.vivas['a4-chen-wei']!.questions[1]).toEqual(before.questions[1]);
    expect(replaceQuestion(c, 'a4-chen-wei', 99, before.questions[0]!)).toBe(c);
  });
  it('rejects transcripts for unknown submissions and flags edited questions', () => {
    const c = generateAll(base());
    const v = c.vivas['a4-ben-okafor']!;
    const t = new Session(v, () => 0).transcript();
    expect(acceptTranscript(c, { ...t, submissionId: 'ghost' })).toMatchObject({ ok: false });
    const edited = replaceQuestion(c, 'a4-ben-okafor', 0, { ...v.questions[0]!, prompt: 'changed' });
    const res = acceptTranscript(edited, t);
    expect(res.ok && res.mismatch).toBe(true);
    expect(vivaId(edited.vivas['a4-ben-okafor']!)).not.toBe(t.vivaId);
  });
});

describe('demo course and review', () => {
  const c = sampleCourse();
  it('has three answered students and puts Ben first in the flag queue', () => {
    const r = rows(c);
    expect(r.map((x) => x.status)).toEqual(['to review', 'to review', 'to review', 'not answered']);
    const queue = flagQueue(c);
    expect(queue[0]!.student).toBe('Ben Okafor');
    expect(queue[0]!.score!.flags.map((f) => f.kind)).toEqual(expect.arrayContaining(['commit-unexplained', 'paste', 'focus']));
    const ana = r.find((x) => x.student === 'Ana Ruiz')!;
    expect(ana.score!.percent).toBeGreaterThanOrEqual(0.8);
    expect(ana.score!.flags).toEqual([]);
    expect(r.find((x) => x.student === 'Ben Okafor')!.commitEvents).toBeGreaterThan(0);
  });
  it('applies instructor overrides, approval, and exports CSV', () => {
    const ben = c.vivas['a4-ben-okafor']!;
    const scores = Object.fromEntries(ben.questions.map((q) => [q.id, 3]));
    const reviewed: Course = { ...c, reviews: { 'a4-ben-okafor': { scores, approved: true, note: 'Saw him in office hours, fine' } } };
    const row = rows(reviewed).find((x) => x.id === 'a4-ben-okafor')!;
    expect(row.final).toBe(1);
    expect(row.status).toBe('approved');
    expect(flagQueue(reviewed).map((x) => x.id)).not.toContain('a4-ben-okafor');
    const csv = resultsCsv(reviewed);
    expect(csv.split('\n')[0]).toBe('submission,student,status,proposed_pct,final_pct,approved,flags,note');
    expect(csv).toContain('a4-ben-okafor,Ben Okafor,approved,');
    expect(csv).toContain(',100,yes,');
    expect(csv).toContain('"Saw him in office hours, fine"');
    expect(csv).toMatch(/a4-dana-kim,Dana Kim,not answered,,,no,,\n/);
    const links = linksCsv(c, (v) => `https://x/#${v.submissionId}`);
    expect(links.split('\n')).toHaveLength(6);
    expect(links).toContain('a4-dana-kim,Dana Kim,1.5,https://x/#a4-dana-kim');
  });
  it('round-trips through JSON and rejects other files', () => {
    expect(parseCourse(JSON.stringify(c))).toEqual(c);
    expect(parseCourse('{"v":2}')).toBeNull();
    expect(parseCourse('not json')).toBeNull();
    const partial = parseCourse(JSON.stringify({ v: 1, settings: { course: 'X' }, submissions: [], vivas: {} }))!;
    expect(partial.settings.minutes).toBe(20);
    expect(partial.reviews).toEqual({});
  });
  it('quotes CSV cells that need it', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', 'x\ny', 3]])).toBe('a,"b,c","say ""hi""","x\ny",3\n');
  });
});
