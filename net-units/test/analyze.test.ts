import { describe, expect, it } from 'vitest';
import { type Solution, DUP_WINDOW, analyzeSolution, duplicatedTokens, normalizePath } from '../src/core/analyze';
import { tokenize, isUnit } from '../src/core/lexer';
import { SAMPLE } from '../src/core/sample';

const sol = (files: Record<string, string>, id = 's'): Solution => ({
  id,
  label: id,
  author: 'student',
  note: '',
  testsPassed: null,
  files: Object.entries(files).map(([path, content]) => ({ path, content })),
});

describe('analyzeSolution', () => {
  const starter = [{ path: 'm.py', content: 'def f(x):\n    return 0\n' }];

  it('subtracts deleted units from added ones', () => {
    const r = analyzeSolution(starter, sol({ 'm.py': 'def f(x):\n    if x:\n        return 1\n    return 0\n' }));
    expect(r.added).toBe(4); // if x return 1
    expect(r.deleted).toBe(0);
    expect(r.net).toBe(4);
    expect(r.netLines).toBe(2);
    expect(r.addedBranches).toBe(1);
    expect(r.maxComplexity).toBe(2);
    expect(r.functions).toEqual([
      { file: 'm.py', name: 'f', added: 4, deleted: 0, net: 4, complexity: 2, starterComplexity: 1 },
    ]);
  });

  it('can be negative when a solution removes code', () => {
    const r = analyzeSolution(starter, sol({ 'm.py': 'def f(x):\n    pass\n' }));
    expect(r.net).toBe(-1); // -return -0 +pass
    expect(r.files[0]?.status).toBe('modified');
  });

  it('is the same whether code is crammed or spread out', () => {
    const spread = analyzeSolution(starter, sol({ 'm.py': 'def f(x):\n    y = x + 1\n    return y\n' }));
    const crammed = analyzeSolution(starter, sol({ 'm.py': 'def f(x):\n    y = x + 1; return y\n' }));
    expect(spread.net).toBe(crammed.net);
    expect(spread.netLines).toBeGreaterThan(crammed.netLines);
  });

  it('treats new files as added, unchanged files as zero and skips non-code', () => {
    const r = analyzeSolution(
      starter,
      sol({ './m.py': starter[0]!.content, 'lib/util.js': 'export const k = 1;\n', 'notes.txt': 'hi' }),
    );
    expect(r.files.map((f) => [f.path, f.status, f.net])).toEqual([
      ['m.py', 'unchanged', 0],
      ['lib/util.js', 'added', 5],
    ]);
    expect(r.skipped).toEqual(['notes.txt']);
    expect(r.functions.find((f) => f.name === '(top level)')?.complexity).toBeNull();
  });

  it('produces highlight spans per line on both sides', () => {
    const r = analyzeSolution(starter, sol({ 'm.py': 'def f(x):\n    return x  # same\n' }));
    const f = r.files[0]!;
    expect(f.newSpans.get(2)).toEqual([
      [4, 10],
      [11, 12],
    ]);
    expect(f.oldSpans.get(2)).toEqual([
      [4, 10],
      [11, 12],
    ]);
  });

  it('ranks the bundled sample as the lesson intends', () => {
    const stats = new Map(SAMPLE.solutions.map((s) => [s.id, analyzeSolution(SAMPLE.starter, s)]));
    const net = (id: string) => stats.get(id)!.net;
    expect(net('ai-terse')).toBeLessThan(net('reference'));
    expect(net('ai-defensive')).toBeGreaterThan(3 * net('reference'));
    // Cramming wins on lines but not on units.
    expect(stats.get('student-b')!.netLines).toBeLessThan(stats.get('reference')!.netLines);
    expect(net('student-b')).toBeGreaterThan(net('reference'));
    expect(stats.get('student-c')!.duplication).toBeGreaterThan(0.4);
    expect(stats.get('reference')!.duplication).toBe(0);
  });
});

describe('duplicatedTokens', () => {
  it('matches copies with renamed identifiers', () => {
    const body = (v: string) => `for ${v} in range(10):\n    total = total + ${v} * ${v} - 1\n`;
    const units = tokenize(body('i') + body('j'), 'python').filter(isUnit);
    expect(units.length).toBe(2 * 14);
    expect(duplicatedTokens([units]).size).toBe(units.length);
  });

  it('ignores runs of one repeated token and short code', () => {
    const run = tokenize('x '.repeat(DUP_WINDOW + 3), 'python').filter(isUnit);
    expect(duplicatedTokens([run]).size).toBe(0);
    const short = tokenize('a = 1\nb = 2', 'python').filter(isUnit);
    expect(duplicatedTokens([short]).size).toBe(0);
  });

  it('finds copies across files', () => {
    const code = 'if a > b and c < d:\n    print(a, b, c, d)\n    total += 1\n';
    const f1 = tokenize(code, 'python').filter(isUnit);
    const f2 = tokenize(code, 'python').filter(isUnit);
    expect(duplicatedTokens([f1, f2]).size).toBe(f1.length + f2.length);
  });
});

describe('normalizePath', () => {
  it('strips ./ and leading slashes and uses forward slashes', () => {
    expect(normalizePath('.\\src\\a.py')).toBe('src/a.py');
    expect(normalizePath('/x/y.js')).toBe('x/y.js');
  });
});
