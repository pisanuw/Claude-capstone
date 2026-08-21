import { describe, expect, it } from 'vitest';
import * as narrate from '../src/core/narrate';

describe('narrator', () => {
  it('narrates FROM with counts and correct plurals', () => {
    expect(narrate.from('orders', 1, 1)).toContain('all 1 row is laid');
    expect(narrate.from('orders', 5, 4)).toContain('5 rows');
  });

  it('narrates joins by kind and match outcome', () => {
    expect(narrate.join('inner', 'customers', 5, 4, 4, 1)).toContain('discarded');
    expect(narrate.join('inner', 'customers', 5, 4, 4, 0)).toContain('nothing is discarded');
    expect(narrate.join('left', 'customers', 5, 4, 4, 2)).toContain('NULL filling');
    expect(narrate.join('left', 'customers', 5, 4, 5, 0)).toContain('behaves like an inner join');
    expect(narrate.join('left', 'customers', 5, 4, 4, 1)).toContain('1 row with no partner is kept');
  });

  it('narrates WHERE outcomes: all pass, none pass, mixed', () => {
    expect(narrate.where('x > 1', 4, 4, 0)).toContain('every one of them passes');
    expect(narrate.where('x > 1', 4, 0, 4)).toContain('already empty');
    const mixed = narrate.where('x > 1', 4, 3, 1);
    expect(mixed).toContain('3 rows pass');
    expect(mixed).toContain('1 row fails and is removed');
    expect(narrate.where('x > 1', 4, 1, 3)).toContain('1 row passes');
  });

  it('narrates grouping, implicit groups, and HAVING', () => {
    expect(narrate.group(6, 3, ['city'])).toContain('3 groups');
    expect(narrate.group(6, 1, [])).toContain('implicit group');
    expect(narrate.having('COUNT(*) > 1', 3, 3)).toContain('all 3 groups pass');
    expect(narrate.having('COUNT(*) > 1', 3, 1)).toContain('discarding 2 groups');
  });

  it('narrates select, distinct, order, limit, result', () => {
    expect(narrate.select(['name', 'total'], 4)).toContain('2 requested columns');
    expect(narrate.distinct(5, 5)).toContain('finds none');
    expect(narrate.distinct(5, 3)).toContain('2 duplicates are removed');
    expect(narrate.distinct(5, 4)).toContain('1 duplicate is removed');
    expect(narrate.order(['city', 'name descending'], 4)).toContain('then by name descending');
    expect(narrate.limit(10, 3, 3, 0)).toContain('first 3 rows');
    expect(narrate.limit(10, 3, 3, 2)).toContain('OFFSET skips the first 2 rows');
    expect(narrate.limit(2, 2, 5, 0)).toContain('nothing is trimmed');
    expect(narrate.result(4, 2)).toContain('4 rows');
    expect(narrate.result(0, 2)).toContain('empty');
  });
});
