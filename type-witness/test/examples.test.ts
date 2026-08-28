import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/analyze';
import { examples, findExample } from '../src/core/examples';

describe('bundled examples', () => {
  it('have unique ids and non-empty content', () => {
    const ids = examples.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of examples) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.blurb.length).toBeGreaterThan(0);
      expect(e.code.trim().length).toBeGreaterThan(0);
    }
  });

  it('findExample resolves ids and rejects unknowns', () => {
    expect(findExample('generic-inference')?.title).toBe('Generic function inference');
    expect(findExample('nope')).toBeUndefined();
  });

  it('every example analyzes cleanly except the deliberate error story', () => {
    for (const e of examples) {
      const { diagnostics } = analyze(e.code);
      if (e.id === 'inference-gone-astray') {
        expect(diagnostics.length, e.id).toBeGreaterThan(0);
      } else {
        expect(diagnostics, e.id).toEqual([]);
      }
    }
  });

  it('each example demonstrates the step kind it advertises', () => {
    const kindsOf = (id: string) =>
      new Set(analyze(findExample(id)!.code).steps.map((s) => s.kind));
    expect(kindsOf('literal-widening').has('widen')).toBe(true);
    expect(kindsOf('literal-widening').has('var-infer')).toBe(true);
    expect(kindsOf('generic-inference').has('call')).toBe(true);
    expect(kindsOf('contextual-callback').has('param')).toBe(true);
    expect(kindsOf('typeof-narrowing').has('narrow')).toBe(true);
    expect(kindsOf('discriminated-union').has('narrow')).toBe(true);
    expect(kindsOf('inference-gone-astray').has('error')).toBe(true);
    expect(kindsOf('return-inference').has('return-infer')).toBe(true);
    expect(kindsOf('truthiness-narrowing').has('narrow')).toBe(true);
  });

  it('the generic example shows a type-argument binding', () => {
    const { steps } = analyze(findExample('generic-inference')!.code);
    const calls = steps.filter((s) => s.kind === 'call');
    expect(calls.some((c) => c.details.includes('inferred: T = string'))).toBe(true);
  });
});
