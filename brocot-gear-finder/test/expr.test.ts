import { describe, expect, it } from 'vitest';
import { parseExpression } from '../src/core/expr';

const value = (s: string) => {
  const r = parseExpression(s);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('parseExpression', () => {
  it('reads numbers, decimals and scientific notation', () => {
    expect(value('12')).toBe(12);
    expect(value(' 29.530589 ')).toBeCloseTo(29.530589, 12);
    expect(value('.5')).toBe(0.5);
    expect(value('1e3')).toBe(1000);
  });

  it('respects precedence, parentheses, unary signs and right-associative powers', () => {
    expect(value('24*60')).toBe(1440);
    expect(value('1 + 2 * 3')).toBe(7);
    expect(value('(1 + 2) * 3')).toBe(9);
    expect(value('10 - 4 - 3')).toBe(3);
    expect(value('2^3^2')).toBe(512);
    expect(value('-2 * -3')).toBe(6);
    expect(value('+4')).toBe(4);
    expect(value('6 × 7 ÷ 2')).toBe(21);
  });

  it('treats a top-level colon as a ratio', () => {
    expect(value('365.2422/366.2422')).toBeCloseTo(0.99727, 5);
    expect(value('44:16')).toBe(2.75);
    expect(value('(2+2):2')).toBe(2);
  });

  it('reports errors instead of throwing', () => {
    expect(parseExpression('')).toEqual({ ok: false, error: expect.stringContaining('Enter a ratio') });
    expect(parseExpression('1/0')).toEqual({ ok: false, error: 'Division by zero' });
    expect(parseExpression('3:0')).toEqual({ ok: false, error: 'Ratio denominator is zero' });
    expect(parseExpression('(1+2')).toEqual({ ok: false, error: 'Missing )' });
    expect(parseExpression('2 3')).toEqual({ ok: false, error: "Unexpected '3' at 3" });
    expect(parseExpression('alert(1)')).toEqual({ ok: false, error: "Unexpected 'a' at 1" });
    expect(parseExpression('2*')).toEqual({ ok: false, error: 'Unexpected end of input' });
    expect(parseExpression('10^400')).toEqual({ ok: false, error: 'The value is not finite' });
  });
});
