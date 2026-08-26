import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/core/examples';
import { detectConcepts } from '../src/core/detect';
import { CONCEPTS, getConcept } from '../src/core/corpus/index';

describe('bundled examples', () => {
  it('has unique ids and labels', () => {
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length);
    expect(new Set(EXAMPLES.map((e) => e.label)).size).toBe(EXAMPLES.length);
  });

  it('references only concepts that exist in the corpus', () => {
    for (const ex of EXAMPLES) {
      expect(getConcept(ex.highlights), ex.id).toBeDefined();
    }
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))(
    'example %s is ranked first as its intended concept',
    (_id, ex) => {
      const detections = detectConcepts(ex.code);
      expect(detections.length).toBeGreaterThan(0);
      expect(detections[0].conceptId).toBe(ex.highlights);
    },
  );

  it('covers every corpus concept exactly once, in corpus order', () => {
    expect(EXAMPLES.map((e) => e.highlights)).toEqual(CONCEPTS.map((c) => c.id));
  });
});
