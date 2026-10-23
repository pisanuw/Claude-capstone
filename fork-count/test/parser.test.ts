import { describe, expect, it } from 'vitest';
import { lex, parse, ParseError, unescape } from '../src/core/parser';

describe('lex', () => {
  it('skips preprocessor lines and comments, and tracks lines', () => {
    const toks = lex('#include <stdio.h>\n// hi\n/* a\n b */ x');
    expect(toks[0]).toMatchObject({ kind: 'id', value: 'x', line: 4 });
  });

  it('reads numbers, hex, chars and concatenates adjacent strings', () => {
    const toks = lex(`10 0x1F 'A' "ab" "cd" 3u`);
    expect(toks.map((t) => t.value)).toEqual(['10', '31', '65', 'abcd', '3', '']);
  });

  it('reads multi-character operators greedily', () => {
    expect(lex('a += b++ && c').map((t) => t.value)).toEqual(['a', '+=', 'b', '++', '&&', 'c', '']);
  });

  it('rejects bad input', () => {
    expect(() => lex('/* open')).toThrow(ParseError);
    expect(() => lex('"open')).toThrow(/unterminated/);
    expect(() => lex('"a\nb"')).toThrow(/newline/);
    expect(() => lex("'ab'")).toThrow(/one character/);
    expect(() => lex('@')).toThrow(/unexpected character/);
  });
});

describe('unescape', () => {
  it('handles the common escapes', () => {
    expect(unescape('a\\n\\t\\\\\\"\\0', 1)).toBe('a\n\t\\"\0');
  });
  it('rejects unknown or dangling escapes', () => {
    expect(() => unescape('\\q', 1)).toThrow(/unsupported escape/);
    expect(() => unescape('\\', 1)).toThrow(/dangling/);
  });
});

describe('parse', () => {
  it('unwraps main and keeps statements', () => {
    const p = parse('int main(void) { int x = 1; return x; }');
    expect(p.body).toHaveLength(1);
    expect(p.body[0]).toMatchObject({ k: 'block' });
  });

  it('accepts bare statements without main', () => {
    expect(parse('fork(); printf("x");').body).toHaveLength(2);
  });

  it('parses every statement form', () => {
    const p = parse(`
      int a, b = 2;
      for (;;) break;
      for (a = 0; a < 3; a++) continue;
      while (a) a--;
      do { a++; } while (a < 2);
      if (a) ; else { }
      return;
    `);
    expect(p.body.map((s) => s.k)).toEqual(['decl', 'for', 'for', 'while', 'do', 'if', 'return']);
  });

  it('respects precedence and short-circuit grouping', () => {
    const p = parse('fork() && fork() || fork();');
    const s = p.body[0];
    expect(s).toMatchObject({ k: 'expr', e: { k: 'logic', op: '||', a: { k: 'logic', op: '&&' } } });
    const q = parse('x = 1 + 2 * 3 == 7 ? 1 : 0;').body[0];
    expect(q).toMatchObject({ e: { k: 'assign', e: { k: 'cond', c: { k: 'binary', op: '==' } } } });
  });

  it('parses casts, address-of, NULL and the comma operator', () => {
    const p = parse('(void) wait(&s); (int) x; waitpid(-1, NULL, 0); a = 1, b = 2;');
    expect(p.body[0]).toMatchObject({ e: { k: 'call', name: 'wait', args: [{ k: 'addr', name: 's' }] } });
    expect(p.body[1]).toMatchObject({ e: { k: 'var', name: 'x' } });
    expect(p.body[2]).toMatchObject({ e: { args: [{ k: 'unary', op: '-' }, { k: 'null' }, { k: 'num' }] } });
    expect(p.body[3]).toMatchObject({ e: { k: 'binary', op: ',' } });
  });

  it('reports unsupported constructs with line numbers', () => {
    expect(() => parse('int f(void) { return 1; }')).toThrow(/only main/);
    expect(() => parse('int *p;')).toThrow(/pointers/);
    expect(() => parse('int a[3];')).toThrow(/arrays/);
    expect(() => parse('switch (x) {}')).toThrow(/not supported/);
    expect(() => parse('(int *) x;')).toThrow(/pointer casts/);
    expect(() => parse('\n\nx = ;')).toThrow(/line 3/);
    expect(() => parse('{ x;')).toThrow(/missing '}'/);
    expect(() => parse('do x; until (1);')).toThrow(/expected 'while'/);
    expect(() => parse('int main( { }')).toThrow(/unbalanced/);
    expect(() => parse('x = (1;')).toThrow(/expected '\)'/);
    expect(() => parse('x')).toThrow(/end of input/);
    expect(() => parse('int 3;')).toThrow(/expected a name/);
  });
});
