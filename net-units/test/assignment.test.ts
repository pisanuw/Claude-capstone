import { describe, expect, it } from 'vitest';
import { analyzeSolution } from '../src/core/analyze';
import {
  annotationMarkdown,
  codename,
  codenames,
  parseAssignment,
  reveal,
  shuffled,
  stripCommonRoot,
} from '../src/core/assignment';
import { SAMPLE } from '../src/core/sample';

describe('parseAssignment', () => {
  it('round-trips the sample', () => {
    expect(parseAssignment(JSON.stringify(SAMPLE))).toEqual(SAMPLE);
  });

  it('fills defaults and de-duplicates ids', () => {
    const a = parseAssignment(
      JSON.stringify({
        solutions: [
          { id: 'x', files: [{ path: './a.py', content: '' }] },
          { id: 'x', author: 'robot', testsPassed: 99, files: [] },
        ],
        testsTotal: 5,
      }),
    );
    expect(a.title).toBe('Untitled assignment');
    expect(a.starter).toEqual([]);
    expect(a.solutions.map((s) => [s.id, s.label, s.author, s.testsPassed])).toEqual([
      ['x', 'Solution 1', 'unknown', null],
      ['x-2', 'Solution 2', 'unknown', 5],
    ]);
    expect(a.solutions[0]?.files[0]?.path).toBe('a.py');
  });

  it('rejects malformed input with a reason', () => {
    expect(() => parseAssignment('{')).toThrow('not valid JSON');
    expect(() => parseAssignment('null')).toThrow('expected an object');
    expect(() => parseAssignment('{"solutions": 1}')).toThrow('solutions must be a list');
    expect(() => parseAssignment('{"solutions": [], "testsTotal": -1}')).toThrow('testsTotal');
    expect(() => parseAssignment('{"solutions": [{"files": [{"path": 1}]}]}')).toThrow('needs a string path');
    expect(() => parseAssignment('{"solutions": [{"files": {}}]}')).toThrow('must be a list of files');
    expect(() => parseAssignment('{"solutions": [{"testsPassed": "x", "files": []}]}')).toThrow('bad testsPassed');
  });
});

describe('stripCommonRoot', () => {
  it('removes a shared folder only when every file has it', () => {
    const f = (path: string) => ({ path, content: '' });
    expect(stripCommonRoot([f('sub/a.py'), f('sub/x/b.py')]).map((x) => x.path)).toEqual(['a.py', 'x/b.py']);
    expect(stripCommonRoot([f('sub/a.py'), f('other/b.py')]).map((x) => x.path)).toEqual(['sub/a.py', 'other/b.py']);
    expect(stripCommonRoot([f('a.py'), f('sub/b.py')]).map((x) => x.path)).toEqual(['a.py', 'sub/b.py']);
  });
});

describe('codenames and voting', () => {
  it('shuffles deterministically and keeps every item', () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect(shuffled(items, 7)).toEqual(shuffled(items, 7));
    expect([...shuffled(items, 7)].sort()).toEqual(items);
    expect(shuffled(items, 7)).not.toEqual(shuffled(items, 8));
  });

  it('assigns letters, then numbers', () => {
    expect(codename(0)).toBe('Solution A');
    expect(codename(30)).toBe('Solution 31');
    const names = codenames(SAMPLE.solutions, 1);
    expect(new Set(names.values()).size).toBe(SAMPLE.solutions.length);
  });

  it('scores the class against the real authors', () => {
    const rows = reveal(SAMPLE.solutions.slice(0, 5), {
      reference: { ai: 1, human: 3 },
      'ai-terse': { ai: 4, human: 0 },
      'student-a': { ai: 2, human: 2 },
    });
    expect(rows.map((r) => [r.id, r.actual, r.correct])).toEqual([
      ['reference', 'human', 0.75],
      ['student-a', 'human', 0.5],
      ['student-b', 'human', null],
      ['student-c', 'human', null],
      ['ai-terse', 'ai', 1],
    ]);
    const unknown = reveal([{ ...SAMPLE.solutions[0]!, author: 'unknown' }], { reference: { ai: 1, human: 1 } });
    expect(unknown[0]?.correct).toBeNull();
  });
});

describe('annotationMarkdown', () => {
  const stats = SAMPLE.solutions.map((s) => analyzeSolution(SAMPLE.starter, s));
  const names = codenames(SAMPLE.solutions, 3);

  it('hides authors until revealed and leaves a slot per hunk', () => {
    const md = annotationMarkdown(SAMPLE, stats, names, false);
    expect(md).not.toMatch(/Instructor|Student|AI baseline/);
    expect(md).toContain('## Solution A\n');
    expect(md).toContain('> Annotation: ');
    expect(md).toContain('```diff\n- ');
    expect(md).toContain('tests: 7/7');
    expect(annotationMarkdown(SAMPLE, stats, names, true)).toMatch(/## Solution [A-G] \(AI\)/);
  });

  it('notes files without changes and missing test counts', () => {
    const s = { ...SAMPLE.solutions[0]!, testsPassed: null, files: [SAMPLE.starter[0]!] };
    const md = annotationMarkdown({ ...SAMPLE, solutions: [s] }, [analyzeSolution(SAMPLE.starter, s)], names, false);
    expect(md).toContain('_wordfreq.py: no changes_');
    expect(md).toContain('tests: not entered');
  });
});
