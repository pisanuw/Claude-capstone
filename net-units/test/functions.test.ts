import { describe, expect, it } from 'vitest';
import { TOP_LEVEL, isDecision, scope } from '../src/core/functions';
import { type Lang, tokenize } from '../src/core/lexer';

function ownersOf(src: string, lang: Lang): Record<string, string> {
  const tokens = tokenize(src, lang);
  const { owners } = scope(tokens, src, lang);
  const out: Record<string, string> = {};
  tokens.forEach((t, i) => {
    if (t.kind === 'ident' && /^v\d$/.test(t.text)) out[t.text] = owners[i] as string;
  });
  return out;
}

describe('python scopes', () => {
  it('follows indentation, nesting and classes', () => {
    const src = [
      'v0 = 1',
      'class Box:',
      '    v1 = 2',
      '    def put(self, x):',
      '        v2 = [x,',
      '  x]',
      '        def inner():',
      '            v3 = 3',
      '        v4 = 4',
      'async def go():',
      '    v5 = 5',
      'v6 = 6',
    ].join('\n');
    expect(ownersOf(src, 'python')).toEqual({
      v0: TOP_LEVEL,
      v1: TOP_LEVEL,
      v2: 'Box.put',
      v3: 'Box.put.inner',
      v4: 'Box.put',
      v5: 'go',
      v6: TOP_LEVEL,
    });
    expect(scope(tokenize(src, 'python'), src, 'python').functions.map((f) => f.name)).toEqual([
      'Box.put',
      'Box.put.inner',
      'go',
    ]);
  });
});

describe('brace scopes', () => {
  it('recognises Java methods, throws clauses and anonymous classes', () => {
    const src = `class A {
  int v0 = 1;
  public static int run(int x) throws IOException {
    if (x > 0) { int v1 = 2; }
    Runnable r = new Runnable() { public void run() { int v2 = 3; } };
    return x;
  }
}`;
    expect(ownersOf(src, 'java')).toEqual({ v0: TOP_LEVEL, v1: 'A.run', v2: 'A.run.Runnable.run' });
  });

  it('names JavaScript arrows, function expressions and methods', () => {
    const src = `const f = async (a) => { let v0 = a; };
const g = function () { let v1 = 1; };
const h = x => { let v2 = x; };
class C { m(): string { let v3 = ''; return v3; } }
function plain() { const o = { v4: 1 }; }
[1].map(function () { let v5 = 0; });
(() => { let v6 = 0; })();
let v7 = 0;`;
    expect(ownersOf(src, 'javascript')).toEqual({
      v0: 'f',
      v1: 'g',
      v2: 'h',
      v3: 'C.m',
      v4: 'plain',
      v5: '<anonymous>',
      v6: '<arrow>',
      v7: TOP_LEVEL,
    });
  });

  it('treats control blocks and C++ lambdas as plain blocks', () => {
    const src = `namespace ns {
int add(int a, int b) const noexcept {
  for (int i = 0; i < 2; i++) { int v0 = i; }
  auto l = [&](int z) { int v1 = z; };
  return a + b;
}
}`;
    expect(ownersOf(src, 'cpp')).toEqual({ v0: 'ns.add', v1: 'ns.add' });
  });

  it('attributes the header to the function', () => {
    const src = 'int f(int v0) { return v0; }';
    expect(ownersOf(src, 'cpp')).toEqual({ v0: 'f' });
  });
});

describe('isDecision', () => {
  it('counts branches per language', () => {
    const py = tokenize('if a and b or c: pass\nelif d: pass', 'python').filter((t) => isDecision(t, 'python'));
    expect(py.map((t) => t.text)).toEqual(['if', 'and', 'or', 'elif']);
    const js = tokenize('x = a ? b : c ?? d; if (p && q || r) {}', 'javascript').filter((t) =>
      isDecision(t, 'javascript'),
    );
    expect(js.map((t) => t.text)).toEqual(['?', '??', 'if', '&&', '||']);
    expect(tokenize('a?.b', 'javascript').some((t) => isDecision(t, 'javascript'))).toBe(false);
  });
});
