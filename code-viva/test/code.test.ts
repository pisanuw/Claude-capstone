import { describe, expect, it } from 'vitest';
import { allFunctions, codeLines, crypticNames, functionsIn, isCode, langOf, magicNumbers, mask, snippet } from '../src/core/code';

const PY = `class LinkedList:
    def __init__(self):
        self.head = None  # comment with def fake(x):

    def merge_sort(self, head):
        """Docstring with "quotes" and def nope():"""
        if head is None or head.next is None:
            return head
        t2 = self.split(head)
        seen = set()
        for x in range(10):
            pass
        return self.merge(self.merge_sort(head), self.merge_sort(t2))
`;

const JAVA = `public class Sorter {
  // comment { with a brace
  public static int[] mergeSort(int[] arr) throws Exception {
    if (arr.length < 2) { return arr; }
    Map<String, Integer> counts = new HashMap<>();
    for (int i = 0; i < arr.length; i++) { counts.put("{", i); }
    int[] left = mergeSort(Arrays.copyOf(arr, 5));
    return left;
  }
}`;

describe('language detection', () => {
  it('maps extensions and rejects non-code', () => {
    expect(langOf('a/b.PY')).toBe('python');
    expect(langOf('x.tsx')).toBe('javascript');
    expect(langOf('X.java')).toBe('java');
    expect(langOf('m.cpp')).toBe('c');
    expect(langOf('README.md')).toBe('other');
    expect(isCode('Makefile')).toBe(false);
  });
});

describe('mask', () => {
  it('blanks comments and string contents but keeps length and newlines', () => {
    const src = 'x = "a#b" # note\ny = 1';
    const m = mask(src, 'python');
    expect(m.length).toBe(src.length);
    expect(m).toBe('x = "   "       \ny = 1');
  });
  it('handles block comments, escapes and template strings', () => {
    const m = mask('a /* { */ b "q\\"{" `t{`\nc', 'javascript');
    expect(m).not.toContain('{');
    expect(m.split('\n')).toHaveLength(2);
  });
  it('survives unterminated comments and strings', () => {
    expect(mask('/* open', 'c')).toBe('       ');
    expect(mask('"""open', 'python').startsWith('"""')).toBe(true);
    expect(mask('// tail', 'java').trim()).toBe('');
  });
});

describe('functionsIn: python', () => {
  const fns = functionsIn({ path: 'll.py', text: PY });
  const ms = fns.find((f) => f.name === 'merge_sort')!;
  it('finds methods, ignoring defs inside comments and docstrings', () => {
    expect(fns.map((f) => f.name)).toEqual(['__init__', 'merge_sort']);
    expect(ms.startLine).toBe(5);
    expect(ms.endLine).toBe(13);
    expect(ms.params).toEqual(['head']);
  });
  it('records loops, guards, recursion, structures and locals', () => {
    expect(ms.loops.map((l) => l.line)).toEqual([11]);
    expect(ms.conditionals[0]!.text).toBe('if head is None or head.next is None:');
    expect(ms.recursion?.line).toBe(13);
    expect(ms.structures).toEqual([{ kind: 'set', line: 10, text: 'seen = set()', name: 'seen' }]);
    expect(ms.locals).toEqual(expect.arrayContaining(['t2', 'seen', 'x']));
    expect(ms.complexity).toBe(4);
    expect(crypticNames(ms)).toEqual(['t2']);
    expect(magicNumbers(ms).map((g) => g.line)).toEqual([11]);
  });
});

describe('functionsIn: brace languages', () => {
  it('finds Java methods with throws clauses and ignores braces in comments and strings', () => {
    const [fn] = functionsIn({ path: 'S.java', text: JAVA });
    expect(fn!.name).toBe('mergeSort');
    expect([fn!.startLine, fn!.endLine]).toEqual([3, 9]);
    expect(fn!.recursion?.line).toBe(7);
    expect(fn!.structures[0]).toMatchObject({ kind: 'map', name: 'counts' });
    expect(fn!.locals).toEqual(expect.arrayContaining(['counts', 'i', 'left']));
  });
  it('finds JS arrow functions, one-line bodies and declarations, but not calls', () => {
    const src = `const f = (a, b) => { while (a > 7) { a--; } return a; };
function g(x) {
  if (!x) return 0;
  return f(x, 1) + g(x - 1);
}
foo(bar);
items.map((x) => { return x; });`;
    const fns = functionsIn({ path: 'x.js', text: src });
    expect(fns.map((f) => f.name)).toEqual(['f', 'g']);
    expect(fns[0]!.loops).toHaveLength(1);
    expect(fns[1]!.recursion?.line).toBe(4);
    expect(fns[1]!.calls).toEqual(['f']);
  });
  it('treats this.method() calls as recursion', () => {
    const [fn] = functionsIn({ path: 'a.ts', text: 'class A {\n  walk(n: number): number {\n    if (n <= 0) { return 0; }\n    return this.walk(n - 1);\n  }\n}' });
    expect(fn!.name).toBe('walk');
    expect(fn!.recursion?.line).toBe(4);
  });
  it('returns nothing for non-code files', () => {
    expect(functionsIn({ path: 'notes.txt', text: 'def x(): pass' })).toEqual([]);
  });
});

describe('helpers', () => {
  const big = functionsIn({ path: 'b.py', text: `def big(n):\n${Array.from({ length: 30 }, (_, i) => `    v${i} = ${i}`).join('\n')}\n` })[0]!;
  it('caps snippets around the focus line', () => {
    const s = snippet(big, 20);
    expect(s.text.split('\n')).toHaveLength(14);
    expect(s.line).toBeLessThanOrEqual(20);
    expect(s.line + 13).toBeGreaterThanOrEqual(20);
    expect(snippet(big, 31).line).toBe(31 - 13);
    expect(snippet(big).line).toBe(1);
  });
  it('skips tests and vendored files and counts code lines', () => {
    const files = [
      { path: 'src/a.py', text: 'def a():\n    if x:\n        return 1\n\n' },
      { path: 'tests/test_a.py', text: 'def test_a():\n    pass' },
      { path: 'a_test.go', text: 'func TestA(t *T) {\n}' },
      { path: 'README.md', text: 'hello' },
    ];
    expect(allFunctions(files).map((f) => f.name)).toEqual(['a']);
    expect(codeLines(files)).toBe(7);
  });
  it('flags vague and opaque names but not loop counters', () => {
    const [fn] = functionsIn({ path: 'n.py', text: 'def f(items):\n    tmp1 = 0\n    i = 0\n    qq = 3\n    thing = 2\n    ok = 1\n' });
    expect(crypticNames(fn!)).toEqual(['tmp1', 'qq', 'thing']);
  });
});
