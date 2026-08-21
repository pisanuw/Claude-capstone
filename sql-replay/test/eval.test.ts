import { describe, expect, it } from 'vitest';
import { aggregate, compare, evalExpr, fmt, hasAggregate, likeMatch, truthOf, type Env } from '../src/core/eval';
import { parse } from '../src/core/parse';
import { SqlError, type Expr, type Value } from '../src/core/types';

function expr(sql: string): Expr {
  const q = parse(`SELECT * FROM t WHERE ${sql}`);
  return q.where!.expr;
}

function env(vars: Record<string, Value>): Env {
  return {
    col: (_t, n) => {
      if (!(n in vars)) throw new SqlError(`Unknown column "${n}"`);
      return vars[n];
    },
  };
}

describe('evalExpr', () => {
  it('evaluates arithmetic and comparisons', () => {
    expect(evalExpr(expr('1 + 2 * 3 = 7'), env({}))).toBe(true);
    expect(evalExpr(expr('10 % 3 = 1'), env({}))).toBe(true);
    expect(evalExpr(expr('(1 + 2) * 3'), env({}))).toBe(9);
    expect(evalExpr(expr('10 / 4'), env({}))).toBe(2.5);
  });

  it('treats division and modulo by zero as NULL', () => {
    expect(evalExpr(expr('1 / 0'), env({}))).toBeNull();
    expect(evalExpr(expr('1 % 0'), env({}))).toBeNull();
  });

  it('propagates NULL through comparisons and arithmetic', () => {
    expect(evalExpr(expr('a = 1'), env({ a: null }))).toBeNull();
    expect(evalExpr(expr('a + 1'), env({ a: null }))).toBeNull();
    expect(evalExpr(expr('NOT a = 1'), env({ a: null }))).toBeNull();
  });

  it('implements Kleene AND/OR', () => {
    expect(evalExpr(expr('a = 1 AND b = 2'), env({ a: null, b: 3 }))).toBe(false);
    expect(evalExpr(expr('a = 1 AND b = 2'), env({ a: null, b: 2 }))).toBeNull();
    expect(evalExpr(expr('a = 1 OR b = 2'), env({ a: null, b: 2 }))).toBe(true);
    expect(evalExpr(expr('a = 1 OR b = 3'), env({ a: null, b: 2 }))).toBeNull();
  });

  it('evaluates IS NULL and IS NOT NULL', () => {
    expect(evalExpr(expr('a IS NULL'), env({ a: null }))).toBe(true);
    expect(evalExpr(expr('a IS NOT NULL'), env({ a: null }))).toBe(false);
    expect(evalExpr(expr('a IS NULL'), env({ a: 0 }))).toBe(false);
  });

  it('evaluates IN with SQL NULL semantics', () => {
    expect(evalExpr(expr('a IN (1, 2)'), env({ a: 2 }))).toBe(true);
    expect(evalExpr(expr('a IN (1, 2)'), env({ a: 3 }))).toBe(false);
    expect(evalExpr(expr('a IN (1, NULL)'), env({ a: 3 }))).toBeNull();
    expect(evalExpr(expr('a NOT IN (1, 2)'), env({ a: 3 }))).toBe(true);
    expect(evalExpr(expr('a IN (1)'), env({ a: null }))).toBeNull();
  });

  it('evaluates LIKE and NOT LIKE case-insensitively', () => {
    expect(evalExpr(expr("name LIKE 'a%'"), env({ name: 'Ada' }))).toBe(true);
    expect(evalExpr(expr("name LIKE '_d_'"), env({ name: 'Ada' }))).toBe(true);
    expect(evalExpr(expr("name NOT LIKE 'z%'"), env({ name: 'Ada' }))).toBe(true);
    expect(evalExpr(expr("name LIKE 'a%'"), env({ name: null }))).toBeNull();
  });

  it('evaluates BETWEEN inclusively', () => {
    expect(evalExpr(expr('a BETWEEN 1 AND 5'), env({ a: 5 }))).toBe(true);
    expect(evalExpr(expr('a BETWEEN 1 AND 5'), env({ a: 6 }))).toBe(false);
    expect(evalExpr(expr('a NOT BETWEEN 1 AND 5'), env({ a: 6 }))).toBe(true);
    expect(evalExpr(expr('a BETWEEN 1 AND NULL'), env({ a: 3 }))).toBeNull();
  });

  it('compares text and mixed types deterministically', () => {
    expect(evalExpr(expr("name = 'Ada'"), env({ name: 'Ada' }))).toBe(true);
    expect(evalExpr(expr("name < 'Bob'"), env({ name: 'Ada' }))).toBe(true);
    expect(evalExpr(expr('flag = TRUE'), env({ flag: true }))).toBe(true);
  });

  it('rejects arithmetic on non-numeric text', () => {
    expect(() => evalExpr(expr('name + 1'), env({ name: 'Ada' }))).toThrow(/Cannot apply/);
    // Numeric-looking strings are coerced.
    expect(evalExpr(expr('name + 1'), env({ name: '41' }))).toBe(42);
  });

  it('refuses aggregates without an aggregate-capable environment', () => {
    expect(() => evalExpr(expr('COUNT(*) > 1'), env({}))).toThrow(/GROUP BY/);
  });
});

describe('helpers', () => {
  it('truthOf follows SQL-ish truthiness', () => {
    expect(truthOf(null)).toBeNull();
    expect(truthOf(true)).toBe(true);
    expect(truthOf(0)).toBe(false);
    expect(truthOf(2)).toBe(true);
    expect(truthOf('')).toBe(false);
    expect(truthOf('x')).toBe(true);
  });

  it('compare sorts numbers numerically and text lexically', () => {
    expect(compare(2, 10)).toBeLessThan(0);
    expect(compare('2', '10')).toBeGreaterThan(0);
    expect(compare(true, false)).toBeGreaterThan(0);
    expect(compare('a', 'a')).toBe(0);
  });

  it('likeMatch escapes regex metacharacters in patterns', () => {
    expect(likeMatch('a.c', 'a.c')).toBe(true);
    expect(likeMatch('abc', 'a.c')).toBe(false);
    expect(likeMatch('50% off', '%% off')).toBe(true);
  });

  it('fmt renders NULL, strings, and rounded floats', () => {
    expect(fmt(null)).toBe('NULL');
    expect(fmt('x')).toBe("'x'");
    expect(fmt(1 / 3)).toBe('0.33');
    expect(fmt(42)).toBe('42');
    expect(fmt(false)).toBe('false');
  });

  it('aggregate computes count, sum, avg, min, max and empty-set NULLs', () => {
    expect(aggregate('count', [1, 2, 3])).toBe(3);
    expect(aggregate('sum', [1, 2, 3])).toBe(6);
    expect(aggregate('avg', [1, 2, 3])).toBe(2);
    expect(aggregate('min', ['b', 'a', 'c'])).toBe('a');
    expect(aggregate('max', [5, 9, 1])).toBe(9);
    expect(aggregate('sum', [])).toBeNull();
    expect(aggregate('count', [])).toBe(0);
  });

  it('hasAggregate finds aggregates at any depth', () => {
    expect(hasAggregate(expr('COUNT(*) + 1 > 2'))).toBe(true);
    expect(hasAggregate(expr('a IN (1, SUM(b))'))).toBe(true);
    expect(hasAggregate(expr("a LIKE 'x' AND b BETWEEN 1 AND 2"))).toBe(false);
    expect(hasAggregate(expr('a IS NULL'))).toBe(false);
  });
});
