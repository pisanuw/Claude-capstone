import { describe, expect, it } from 'vitest';
import { parse } from '../src/core/parse';
import { tokenize } from '../src/core/tokenize';
import { SqlError, type Expr } from '../src/core/types';

describe('tokenize', () => {
  it('splits idents, numbers, strings, operators', () => {
    const t = tokenize("SELECT a, 'x''y', 3.5 FROM t WHERE a <> 2");
    expect(t.map((x) => x.type)).toContain('string');
    expect(t.find((x) => x.type === 'string')!.text).toBe("x'y");
    expect(t.find((x) => x.text === '!=')).toBeTruthy(); // <> normalized
    expect(t[t.length - 1].type).toBe('eof');
  });

  it('skips -- comments and semicolons', () => {
    const t = tokenize('SELECT a -- trailing comment\nFROM t;');
    expect(t.filter((x) => x.type === 'ident').map((x) => x.text)).toEqual(['select', 'a', 'from', 't']);
  });

  it('rejects unterminated strings and stray characters', () => {
    expect(() => tokenize("SELECT 'oops")).toThrow(SqlError);
    expect(() => tokenize('SELECT a ~ b')).toThrow(/Unexpected character/);
  });

  it('reads decimal numbers starting with a dot', () => {
    const t = tokenize('SELECT .5');
    expect(t.find((x) => x.type === 'number')!.text).toBe('.5');
  });
});

describe('parse', () => {
  it('parses a full query with every clause', () => {
    const q = parse(`SELECT DISTINCT c.city, COUNT(*) AS n
      FROM orders o JOIN customers c ON o.customer_id = c.id
      WHERE o.amount > 50 GROUP BY c.city HAVING COUNT(*) > 1
      ORDER BY n DESC, c.city LIMIT 5 OFFSET 2`);
    expect(q.distinct).toBe(true);
    expect(q.items).toHaveLength(2);
    expect(q.items[1].alias).toBe('n');
    expect(q.from).toEqual({ table: 'orders', alias: 'o' });
    expect(q.joins).toHaveLength(1);
    expect(q.joins[0].kind).toBe('inner');
    expect(q.where?.text).toBe('o.amount > 50');
    expect(q.groupBy?.texts).toEqual(['c.city']);
    expect(q.having?.text).toBe('COUNT(*) > 1');
    expect(q.orderBy).toHaveLength(2);
    expect(q.orderBy[0].desc).toBe(true);
    expect(q.orderBy[1].desc).toBe(false);
    expect(q.limit).toEqual({ count: 5, offset: 2 });
  });

  it('supports INNER JOIN and LEFT OUTER JOIN spellings', () => {
    expect(parse('SELECT * FROM a INNER JOIN b ON a.x = b.x').joins[0].kind).toBe('inner');
    expect(parse('SELECT * FROM a LEFT JOIN b ON a.x = b.x').joins[0].kind).toBe('left');
    expect(parse('SELECT * FROM a LEFT OUTER JOIN b ON a.x = b.x').joins[0].kind).toBe('left');
  });

  it('parses * and table.* select items', () => {
    const q = parse('SELECT *, o.*, o.id FROM orders o');
    expect(q.items[0].expr).toEqual({ k: 'star', table: null });
    expect(q.items[1].expr).toEqual({ k: 'star', table: 'o' });
    expect(q.items[2].expr).toEqual({ k: 'col', table: 'o', name: 'id' });
  });

  it('parses implicit aliases (FROM t x, SELECT a b)', () => {
    const q = parse('SELECT amount total FROM orders x');
    expect(q.from.alias).toBe('x');
    expect(q.items[0].alias).toBe('total');
  });

  it('parses IN, LIKE, BETWEEN, IS NULL and their negations', () => {
    const q = parse(`SELECT * FROM t WHERE a IN (1, 2) AND b NOT LIKE 'x%'
      AND c BETWEEN 1 AND 5 AND d IS NOT NULL AND NOT e = 1 AND f NOT IN (3)`);
    const text = JSON.stringify(q.where!.expr);
    expect(text).toContain('"k":"in"');
    expect(text).toContain('"k":"like"');
    expect(text).toContain('"k":"between"');
    expect(text).toContain('"k":"isnull"');
    expect(text).toContain('"k":"not"');
  });

  it('honors precedence: OR < AND < NOT < comparison < + < *', () => {
    const q = parse('SELECT * FROM t WHERE a = 1 OR b = 2 AND c = 1 + 2 * 3');
    const e = q.where!.expr;
    expect(e.k).toBe('bin');
    if (e.k === 'bin') {
      expect(e.op).toBe('or');
      expect(e.r.k).toBe('bin');
      if (e.r.k === 'bin') expect(e.r.op).toBe('and');
    }
    const cmp = JSON.stringify(q.where!.expr);
    // 1 + 2 * 3 groups as 1 + (2 * 3)
    expect(cmp).toContain('{"k":"bin","op":"+","l":{"k":"lit","v":1},"r":{"k":"bin","op":"*"');
  });

  it('folds negative number literals', () => {
    const q = parse('SELECT * FROM t WHERE a > -5');
    const e = q.where!.expr as Extract<Expr, { k: 'bin' }>;
    expect(e.r).toEqual({ k: 'lit', v: -5 });
  });

  it('parses NULL, TRUE, FALSE literals and unary minus on columns', () => {
    const q = parse('SELECT NULL, TRUE, FALSE, -a FROM t');
    expect(q.items[0].expr).toEqual({ k: 'lit', v: null });
    expect(q.items[1].expr).toEqual({ k: 'lit', v: true });
    expect(q.items[2].expr).toEqual({ k: 'lit', v: false });
    expect(q.items[3].expr.k).toBe('bin');
  });

  it('parses aggregate calls', () => {
    const q = parse('SELECT COUNT(*), SUM(amount), AVG(a + b) FROM t');
    expect(q.items[0].expr).toEqual({ k: 'agg', fn: 'count', arg: '*' });
    expect(q.items[1].expr).toMatchObject({ k: 'agg', fn: 'sum' });
    expect(q.items[2].expr).toMatchObject({ k: 'agg', fn: 'avg' });
  });

  it('rejects malformed queries with useful messages', () => {
    expect(() => parse('')).toThrow(/Type a SELECT/);
    expect(() => parse('SELECT FROM t')).toThrow(SqlError);
    expect(() => parse('SELECT a t')).toThrow(/Expected FROM/);
    expect(() => parse('SELECT a FROM t WHERE')).toThrow(SqlError);
    expect(() => parse('SELECT a FROM t GROUP a')).toThrow(/Expected BY/);
    expect(() => parse('SELECT a FROM t LIMIT x')).toThrow(/LIMIT expects a whole number/);
    expect(() => parse('SELECT a FROM t LIMIT 2.5')).toThrow(/LIMIT expects a whole number/);
    expect(() => parse('SELECT a FROM t 5')).toThrow(/after end of query/);
    expect(() => parse('SELECT a FROM t WHERE a NOT 5')).toThrow(/Unexpected "NOT"/);
    expect(() => parse('SELECT SUM(*) FROM t')).toThrow(/only COUNT\(\*\)/);
    expect(() => parse('SELECT a FROM select')).toThrow(/Expected table name/);
    expect(() => parse('SELECT (a FROM t')).toThrow(/Expected "\)"/);
  });
});
