import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/core/csv';
import {
  buildGradebook,
  DEFAULT_THRESHOLDS,
  gradebookFromCsv,
  level,
  parseHeader,
  parseScore,
  planColumns,
  profiles,
  topicMeans,
  topicsOf,
} from '../src/core/gradebook';

describe('headers and cells', () => {
  it('reads topic and maximum from common header styles', () => {
    expect(parseHeader('Q3 [Recursion] /5')).toEqual({ label: 'Q3', topic: 'recursion', max: 5 });
    expect(parseHeader('HW2 (Graphs) out of 10')).toEqual({ label: 'HW2', topic: 'graphs', max: 10 });
    expect(parseHeader('Sorting: Q1 (max 4)')).toEqual({ label: 'Q1', topic: 'sorting', max: 4 });
    expect(parseHeader('Exam 1 Big-O pts: 12')).toEqual({ label: 'Exam 1 Big-O', topic: null, max: 12 });
    expect(parseHeader('Linked  Lists')).toEqual({ label: 'Linked Lists', topic: null, max: null });
  });

  it('parses scores, percentages, fractions and blanks', () => {
    expect(parseScore(' 4.5 ')).toBe(4.5);
    expect(parseScore('80%')).toBe(0.8);
    expect(parseScore('3/5')).toBe(3);
    expect(parseScore('')).toBeNull();
    expect(parseScore('EX')).toBeNull();
    expect(parseScore('n/a')).toBeNull();
    expect(parseScore('-')).toBeNull();
    expect(parseScore('abc')).toBe('bad');
  });
});

describe('column plan', () => {
  it('finds id, name, score and ignored columns', () => {
    const t = parseCsv('Student ID,Name,Section,Q1 [recursion] /5,Q2 [graphs] /5,Total,Comment\ns1,Ann,A,5,2,7,good\ns2,Bo,A,1,5,6,ok');
    const plan = planColumns(t);
    expect(plan.map((p) => p.role)).toEqual(['id', 'name', 'ignore', 'item', 'item', 'ignore', 'ignore']);
    expect(plan[3]).toMatchObject({ topic: 'recursion', max: 5 });
  });

  it('treats an unlabelled text first column as names, and plain headers as topics', () => {
    const plan = planColumns(parseCsv('Who,Recursion,Graphs\nAnn,5,2\nBo,1,5'));
    expect(plan.map((p) => p.role)).toEqual(['name', 'item', 'item']);
    expect(plan[1]?.topic).toBe('recursion');
  });
});

describe('gradebook and mastery', () => {
  const csv = `id,name,Q1 [recursion] /5,Q2 [recursion] /5,HW [graphs],Q3 [sorting] /4
s1,Ann,5,4,8,
s2,Bo,1,,10,4
s1,Cy,abc,2,2,9`;

  it('builds items, infers missing maxima and warns about odd cells', () => {
    const { book } = gradebookFromCsv(csv);
    expect(book.items.map((i) => [i.topic, i.max])).toEqual([
      ['recursion', 5],
      ['recursion', 5],
      ['graphs', 10],
      ['sorting', 4],
    ]);
    expect(book.students.map((s) => s.id)).toEqual(['s1', 's2', 's1 (2)']);
    const w = book.warnings.join('\n');
    expect(w).toMatch(/"HW \[graphs\]" has no maximum/);
    expect(w).toMatch(/Duplicate student "s1"/);
    expect(w).toMatch(/"abc" is not a number/);
    expect(w).toMatch(/9 is well above the maximum 4/);
  });

  it('computes mastery over attempted items only, capped at the maximum', () => {
    const { book } = gradebookFromCsv(csv);
    const ps = profiles(book);
    expect(topicsOf(book)).toEqual(['recursion', 'graphs', 'sorting']);
    expect(ps[0]?.mastery.get('recursion')).toBeCloseTo(0.9);
    expect(ps[0]?.mastery.get('sorting')).toBeNull();
    expect(ps[1]?.mastery.get('recursion')).toBeCloseTo(0.2);
    expect(ps[2]?.mastery.get('sorting')).toBe(1);
    const means = topicMeans(ps, topicsOf(book));
    expect(means.get('graphs')).toBeCloseTo((0.8 + 1 + 0.2) / 3);
    expect(means.get('sorting')).toBeCloseTo(1);
  });

  it('classifies levels against the thresholds', () => {
    expect(level(0.8, DEFAULT_THRESHOLDS)).toBe('strong');
    expect(level(0.7, DEFAULT_THRESHOLDS)).toBe('shaky');
    expect(level(0.59, DEFAULT_THRESHOLDS)).toBe('gap');
    expect(level(null, DEFAULT_THRESHOLDS)).toBe('none');
  });

  it('uses 1 as the maximum for fractional scores, skips columns with no positive score, and names unnamed rows', () => {
    const t = parseCsv('Q [a],Q [b],Q [c]\n0.5,0,0.2\n0.9,0,');
    const plan = planColumns(t);
    const book = buildGradebook(t, plan);
    expect(book.items.map((i) => [i.topic, i.max])).toEqual([
      ['a', 1],
      ['c', 1],
    ]);
    expect(book.warnings.join(' ')).toMatch(/"Q \[b\]" has no positive scores/);
    expect(book.students.map((s) => s.name)).toEqual(['row 2', 'row 3']);
  });

  it('rejects tables without students or score columns', () => {
    expect(() => gradebookFromCsv('id,name')).toThrow(/header row and at least one student/);
    expect(() => gradebookFromCsv('id,name\ns1,Ann')).toThrow(/No score columns/);
  });

  it('ignores score columns whose topic is cleared', () => {
    const t = parseCsv('n,Q [a] /2\nAnn,1');
    const plan = planColumns(t);
    (plan[1] as { topic: string }).topic = '  ';
    expect(buildGradebook(t, plan).items).toHaveLength(0);
  });
});
