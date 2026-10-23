import { describe, expect, it } from 'vitest';
import { extractPoints, globMatch, parseRubric } from '../src/core/rubric.js';

describe('parseRubric (lines)', () => {
  it('reads point formats, descriptions and tests tags', () => {
    const r = parseRubric(`Correctness (40 pts) {tests}
  Passes the hidden tests
  and the visible ones
- Edge cases [10] {tests: test_empty*, test_neg*}
2. Reflection - 20 points
Style: 5`);
    expect(r.rows.map((x) => [x.id, x.label, x.points])).toEqual([
      ['r1', 'Correctness', 40],
      ['r2', 'Edge cases', 10],
      ['r3', 'Reflection', 20],
      ['r4', 'Style', 5],
    ]);
    expect(r.rows[0].description).toBe('Passes the hidden tests and the visible ones');
    expect(r.rows[0].tests).toEqual([]);
    expect(r.rows[1].tests).toEqual(['test_empty*', 'test_neg*']);
    expect(r.rows[2].tests).toBeNull();
    expect(r.total).toBe(75);
    expect(r.warnings).toEqual([]);
  });

  it('warns about lines without points', () => {
    const r = parseRubric('Intro text with no score\nThesis (10)\nmore words here\n(5)');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].description).toBe('more words here');
    expect(r.warnings).toHaveLength(3);
    expect(r.warnings[0]).toMatch(/ignored/);
    expect(r.warnings[1]).toMatch(/description/);
    expect(r.warnings[2]).toMatch(/no criterion name/);
  });

  it('handles empty input and rubrics with no rows', () => {
    expect(parseRubric('  \n').warnings).toEqual(['The rubric is empty.']);
    expect(parseRubric('just words').warnings.at(-1)).toMatch(/No rubric rows/);
  });

  it('accepts decimals and the first bracketed value', () => {
    expect(extractPoints('Uses 3 sources (12.5)')?.points).toBe(12.5);
    expect(extractPoints('nothing here')).toBeNull();
  });
});

describe('parseRubric (Markdown table)', () => {
  it('finds the label, points and description columns', () => {
    const r = parseRubric(`| Criterion | Points | Description |
|---|---|---|
| Correctness {tests} | 30 | passes tests |
| Writeup | 20 pts | clear |
| | | |`);
    expect(r.rows.map((x) => [x.label, x.points, x.description, x.tests])).toEqual([
      ['Correctness', 30, 'passes tests', []],
      ['Writeup', 20, 'clear', null],
    ]);
    expect(r.warnings).toHaveLength(1);
  });

  it('falls back when columns are unnamed and reports a missing points column', () => {
    const r = parseRubric('| Points | What |\n| 5 | Thesis |');
    expect(r.rows[0].label).toBe('Thesis');
    expect(parseRubric('| A | B |\n| x | y |').warnings[0]).toMatch(/no points column/);
  });
});

describe('globMatch', () => {
  it('matches * and ? and escapes the rest', () => {
    expect(globMatch('test_empty*', 'test_empty_decode')).toBe(true);
    expect(globMatch('test_?', 'test_a')).toBe(true);
    expect(globMatch('test.a', 'testXa')).toBe(false);
    expect(globMatch('test_a', 'test_ab')).toBe(false);
  });
});
