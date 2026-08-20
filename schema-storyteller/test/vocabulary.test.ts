import { describe, it, expect } from 'vitest';
import {
  splitWords,
  expandWord,
  singularize,
  humanizeField,
  humanizeEntity,
  humanizeEntityPlural,
  suggestRename,
} from '../src/core/vocabulary.js';

describe('splitWords', () => {
  it('splits snake, camel, pascal and kebab case', () => {
    expect(splitWords('user_id')).toEqual(['user', 'id']);
    expect(splitWords('createdAt')).toEqual(['created', 'at']);
    expect(splitWords('OrderItem')).toEqual(['order', 'item']);
    expect(splitWords('tbl-usr-acct')).toEqual(['tbl', 'usr', 'acct']);
    expect(splitWords('HTTPStatus')).toEqual(['http', 'status']);
    expect(splitWords('')).toEqual([]);
  });
});

describe('expandWord', () => {
  it('expands known abbreviations and passes through others', () => {
    expect(expandWord('acct')).toBe('account');
    expect(expandWord('banana')).toBe('banana');
  });
});

describe('singularize', () => {
  it('handles common plural endings', () => {
    expect(singularize('categories')).toBe('category');
    expect(singularize('boxes')).toBe('box');
    expect(singularize('users')).toBe('user');
    expect(singularize('status')).toBe('status'); // -us stays
    expect(singularize('at')).toBe('at'); // stop word
  });
});

describe('humanize', () => {
  it('humanizes fields and entities', () => {
    expect(humanizeField('usr_acct_id')).toBe('user account identifier');
    expect(humanizeEntity('order_items')).toBe('order item');
    expect(humanizeEntity('customers')).toBe('customer');
    expect(humanizeEntityPlural('customer')).toBe('customers');
    expect(humanizeEntityPlural('category')).toBe('categories');
  });

  it('returns the original when nothing splits', () => {
    expect(humanizeField('')).toBe('');
    expect(humanizeEntity('')).toBe('');
  });
});

describe('suggestRename', () => {
  it('suggests a rename only when abbreviations are present', () => {
    expect(suggestRename('acct_no')).toBe('account_number');
    expect(suggestRename('email')).toBeNull();
    expect(suggestRename('id')).toBeNull(); // id alone is conventional
  });
});
