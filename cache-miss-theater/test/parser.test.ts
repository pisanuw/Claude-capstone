import { describe, expect, it } from 'vitest';
import { lex, parse, ParseError } from '../src/core/parser';

describe('lexer', () => {
  it('turns #define into a define token and skips other preprocessor lines', () => {
    const toks = lex('#include <stdio.h>\n#define N 64 // size\nint x;');
    expect(toks.map((t) => t.kind + ':' + t.value)).toEqual(['define:N', 'num:64', 'op:;', 'id:int', 'id:x', 'op:;', 'eof:']);
    expect(toks[0]?.line).toBe(2);
  });

  it('reads hex, float and suffixed numbers and tracks lines through comments', () => {
    const toks = lex('0x40 1.5e2 10UL .5f /* a\nb */ x');
    expect(toks.slice(0, 4).map((t) => t.value)).toEqual(['64', '150', '10', '0.5']);
    expect(toks[4]?.line).toBe(2);
  });

  it('rejects bad input', () => {
    expect(() => lex('int $x;')).toThrow(ParseError);
    expect(() => lex('/* open')).toThrow(/unterminated comment/);
    expect(() => lex('#define\n')).toThrow(/needs a name/);
  });
});

describe('parser', () => {
  it('parses declarations with dimensions, addresses and several declarators', () => {
    const [d] = parse('static const double A[4][8] @ 0x8000, B[2];');
    expect(d?.k).toBe('decl');
    if (d?.k !== 'decl') return;
    expect(d.elemSize).toBe(8);
    expect(d.vars.map((v) => [v.name, v.dims.length, !!v.at])).toEqual([
      ['A', 2, true],
      ['B', 1, false],
    ]);
  });

  it('knows type sizes including long long and unsigned', () => {
    const size = (src: string) => {
      const s = parse(src)[0];
      return s?.k === 'decl' ? s.elemSize : -1;
    };
    expect(size('long long a[1];')).toBe(8);
    expect(size('unsigned a[1];')).toBe(4);
    expect(size('unsigned char a[1];')).toBe(1);
    expect(size('short int a[1];')).toBe(2);
    expect(size('uint64_t a[1];')).toBe(8);
  });

  it('unwraps a function and parses loops, if/else and casts', () => {
    const prog = parse(`void kernel(int n, double *p) {
      for (int i = 0; i < 4; i += 2) { if (i == 0) x = (double) i; else ; }
      while (0) y++;
      return;
    }`);
    expect(prog).toHaveLength(1);
    expect(prog[0]?.k).toBe('block');
  });

  it('parses for loops with empty parts and comma expressions', () => {
    const [f] = parse('for (;;) ;');
    expect(f?.k === 'for' && f.init === null && f.cond === null && f.step === null).toBe(true);
    const [g] = parse('for (i = 0, j = 1; i < 3; i++, j++) ;');
    expect(g?.k === 'for' && g.step?.k === 'binary').toBe(true);
  });

  it('parses ternaries, min/max/abs and prefix increments', () => {
    const [s] = parse('x = a ? min(1, 2) : abs(-3) + ++y;');
    expect(s?.k).toBe('expr');
  });

  it('gives useful errors', () => {
    expect(() => parse('int *p;')).toThrow(/pointers/);
    expect(() => parse('double A[];')).toThrow(/needs a size/);
    expect(() => parse('int x @ 4;')).toThrow(/only applies to arrays/);
    expect(() => parse('int A[2] = 0;')).toThrow(/initialisers/);
    expect(() => parse('foo(1);')).toThrow(/function calls/);
    expect(() => parse('x = min(1);')).toThrow(/takes 2 arguments/);
    expect(() => parse('x = abs(1, 2);')).toThrow(/takes 1 argument$/);
    expect(() => parse('do { } while (1);')).toThrow(/'do' is not supported/);
    expect(() => parse('3 = x;')).toThrow(/cannot assign/);
    expect(() => parse('x = &y;')).toThrow(/address-of/);
    expect(() => parse('x = *y;')).toThrow(/dereference/);
    expect(() => parse('5++;')).toThrow(/needs a variable/);
    expect(() => parse('++5;')).toThrow(/needs a variable/);
    expect(() => parse('{ x = 1;')).toThrow(/missing '}'/);
    expect(() => parse('x = (1;')).toThrow(/expected '\)'/);
    expect(() => parse('x = ;')).toThrow(/unexpected ';'/);
    expect(() => parse('x = 1')).toThrow(/end of input/);
    expect(() => parse('int 3;')).toThrow(/expected a name/);
  });

  it('does not mistake a prototype-like call for a function', () => {
    expect(() => parse('int f(')).toThrow(ParseError);
    expect(() => parse('int f(int a);')).toThrow(ParseError);
  });
});
