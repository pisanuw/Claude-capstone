import { describe, expect, it } from 'vitest';
import { MODEL_PRICING, estimateCost, findPricing } from '../src/core/pricing.js';

describe('pricing', () => {
  it('lists at least one model', () => {
    expect(MODEL_PRICING.length).toBeGreaterThan(0);
  });

  it('computes cost proportional to tokens and rate', () => {
    const pricing = { id: 'test', label: 'Test', inputPerMillion: 10 };
    expect(estimateCost(1_000_000, pricing)).toBeCloseTo(10);
    expect(estimateCost(500_000, pricing)).toBeCloseTo(5);
    expect(estimateCost(0, pricing)).toBe(0);
  });

  it('finds a known model by id', () => {
    expect(findPricing('claude-sonnet').label).toBe('Claude Sonnet');
  });

  it('falls back to the first model for an unknown id', () => {
    expect(findPricing('does-not-exist')).toBe(MODEL_PRICING[0]);
  });
});
