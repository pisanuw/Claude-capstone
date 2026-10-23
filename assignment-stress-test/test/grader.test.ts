import { describe, expect, it } from 'vitest';
import {
  JUDGE_SYSTEM,
  buildJudgePrompt,
  firstJsonObject,
  judgePacket,
  judgeRows,
  orderScores,
  parseJudgeReply,
  testRowScores,
} from '../src/core/grader.js';
import { parseRubric } from '../src/core/rubric.js';
import { sample } from '../src/core/samples.js';
import type { TestRun } from '../src/core/types.js';

const code = sample('rle');
const rows = parseRubric(code.rubricText).rows;
const memo = sample('memo');

describe('judge rows and prompt', () => {
  it('leaves {tests} rows to the autograder only when tests exist', () => {
    expect(judgeRows(rows, code).map((r) => r.id)).toEqual(['r3', 'r4', 'r5']);
    const noTests = { ...code, code: { ...code.code!, tests: [] } };
    expect(judgeRows(rows, noTests)).toHaveLength(5);
  });

  it('lists ids, maxima and the submission', () => {
    const p = buildJudgePrompt(code, judgeRows(rows, code), 'my answer');
    expect(p).toContain('- id r3: Code quality (max 15): Clear names');
    expect(p).toContain('<<<\nmy answer\n>>>');
    expect(p).toContain('exactly these ids: r3, r4, r5');
    expect(judgePacket(code, rows, 'x').startsWith(JUDGE_SYSTEM)).toBe(true);
  });
});

describe('firstJsonObject', () => {
  it('skips prose and fences and respects braces in strings', () => {
    expect(firstJsonObject('Sure! ```json\n{"a":"}{","b":{"c":1}}\n``` done')).toBe('{"a":"}{","b":{"c":1}}');
    expect(firstJsonObject('{"a":"\\"}"}')).toBe('{"a":"\\"}"}');
    expect(firstJsonObject('no json')).toBeNull();
    expect(firstJsonObject('{"open": 1')).toBeNull();
  });
});

describe('parseJudgeReply', () => {
  const mrows = parseRubric(memo.rubricText).rows;

  it('reads, clamps and flags missing rows', () => {
    const text = JSON.stringify({
      rows: [
        { id: 'r1', points: 30, reason: 'strong' },
        { id: 'r2', points: '12', reason: 'ok' },
        { id: 'r3', points: -2 },
        { id: 'r4', points: 'lots' },
      ],
    });
    const { scores, warnings } = parseJudgeReply(text, mrows);
    expect(scores.map((s) => s.points)).toEqual([25, 12, 0, null, null]);
    expect(scores[2].reason).toBe('');
    expect(warnings.join(' ')).toMatch(/r1 score 30 was clamped/);
    expect(warnings.join(' ')).toMatch(/r4 had no numeric points/);
    expect(warnings.join(' ')).toMatch(/skipped row r5/);
  });

  it('reports unusable replies', () => {
    expect(parseJudgeReply('nothing', mrows).warnings).toEqual(['The judge reply had no JSON object.']);
    expect(parseJudgeReply('{"rows": 3}', mrows).warnings[0]).toMatch(/no "rows" array/);
    expect(parseJudgeReply('{bad json}', mrows).warnings[0]).toMatch(/did not parse/);
    expect(parseJudgeReply('{"rows":[null, 1]}', mrows).scores.every((s) => s.points === null)).toBe(true);
  });
});

describe('testRowScores', () => {
  const run = (results: TestRun['results'], status: TestRun['status'] = 'ok'): TestRun => ({ status, results, log: '' });
  const t = (name: string, outcome: 'passed' | 'failed' | 'skipped' = 'passed') => ({ name, outcome, message: '' });

  it('scores by pass share, with globs per row and skips ignored', () => {
    const s = testRowScores(
      rows,
      code,
      run([t('test_basic_encode'), t('test_empty_encode', 'failed'), t('test_single_char'), t('test_x', 'skipped')]),
    );
    expect(s.map((x) => [x.id, x.points, x.reason])).toEqual([
      ['r1', 26.67, '2 of 3 tests passed.'],
      ['r2', 7.5, '1 of 2 tests passed.'],
    ]);
  });

  it('gives zero when no code or no run, and null when nothing matches', () => {
    expect(testRowScores(rows, code, null)[0].points).toBe(0);
    expect(testRowScores(rows, code, run([], 'no-code'))[0].reason).toMatch(/No code/);
    expect(testRowScores(rows, code, run([], 'timeout'))[0].reason).toMatch(/timeout/);
    expect(testRowScores(rows, code, run([t('test_basic_encode')]))[1].points).toBeNull();
    expect(testRowScores(rows, memo, null)).toEqual([]);
  });

  it('orders scores and fills gaps', () => {
    const o = orderScores(rows, [{ id: 'r2', points: 1, reason: '', source: 'judge' }]);
    expect(o.map((s) => s.points)).toEqual([null, 1, null, null, null]);
  });
});
