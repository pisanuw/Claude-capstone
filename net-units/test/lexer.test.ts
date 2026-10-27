import { describe, expect, it } from 'vitest';
import { countUnits, detectLang, tokenize } from '../src/core/lexer';

const kinds = (src: string, lang: Parameters<typeof tokenize>[1]) =>
  tokenize(src, lang).map((t) => `${t.kind}:${t.text}`);

describe('detectLang', () => {
  it('maps extensions and ignores other files', () => {
    expect(detectLang('src/a.py')).toBe('python');
    expect(detectLang('App.TSX')).toBe('javascript');
    expect(detectLang('Main.java')).toBe('java');
    expect(detectLang('x/y.hpp')).toBe('cpp');
    expect(detectLang('README.md')).toBeNull();
    expect(detectLang('Makefile')).toBeNull();
  });
});

describe('tokenize', () => {
  it('splits Python into units, punctuation and comments', () => {
    expect(kinds('x = f(a, 1)  # note', 'python')).toEqual([
      'ident:x',
      'op:=',
      'ident:f',
      'punct:(',
      'ident:a',
      'punct:,',
      'number:1',
      'punct:)',
      'comment:# note',
    ]);
  });

  it('handles Python string prefixes and triple quotes across lines', () => {
    const t = tokenize('s = f"a{b}"\nd = """one\ntwo"""\nz = rb\'\\x00\'', 'python');
    expect(t.filter((x) => x.kind === 'string').map((x) => x.text)).toEqual(['f"a{b}"', '"""one\ntwo"""', "rb'\\x00'"]);
    expect(t.find((x) => x.text === 'z')?.line).toBe(4);
  });

  it('lexes C-family comments, operators and template literals', () => {
    const src = '/* a\n b */ let y = x >>> 2 ?? `t\n${x}`; // end';
    expect(kinds(src, 'javascript')).toEqual([
      'comment:/* a\n b */',
      'keyword:let',
      'ident:y',
      'op:=',
      'ident:x',
      'op:>>>',
      'number:2',
      'op:??',
      'string:`t\n${x}`',
      'punct:;',
      'comment:// end',
    ]);
  });

  it('reads numbers in several notations', () => {
    const nums = tokenize('a = 0x1F + 1_000 + .5 + 3e-2 + 10L + 2.5f', 'java')
      .filter((t) => t.kind === 'number')
      .map((t) => t.text);
    expect(nums).toEqual(['0x1F', '1_000', '.5', '3e-2', '10L', '2.5f']);
  });

  it('keeps C++ scope operators and escapes in strings', () => {
    expect(kinds('std::cout << "a\\"b";', 'cpp')).toEqual([
      'ident:std',
      'op:::',
      'ident:cout',
      'op:<<',
      'string:"a\\"b"',
      'punct:;',
    ]);
  });

  it('ends an unterminated string at the newline', () => {
    const t = tokenize('x = "oops\ny = 1', 'javascript');
    expect(t.find((x) => x.text === 'y')?.line).toBe(2);
  });

  it('skips stray characters instead of failing', () => {
    expect(kinds('a ` b', 'python')).toEqual(['ident:a', 'ident:b']);
  });
});

describe('countUnits', () => {
  it('does not change when code is reformatted or commented', () => {
    const loose = 'def f(x):\n    # double it\n    y = x * 2\n    return y\n';
    const tight = 'def f(x): y = x * 2; return y';
    expect(countUnits(loose, 'python')).toBe(countUnits(tight, 'python'));
    expect(countUnits(loose, 'python')).toBe(10); // def f x y = x * 2 return y
  });
});
