import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/core/examples';
import { detectConcepts } from '../src/core/detect';
import { getConcept } from '../src/core/corpus/index';

describe('bundled examples', () => {
  it('ships exactly ten examples with unique ids and labels', () => {
    expect(EXAMPLES).toHaveLength(10);
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(10);
    expect(new Set(EXAMPLES.map((e) => e.label)).size).toBe(10);
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

  it('covers ten distinct concepts', () => {
    expect(new Set(EXAMPLES.map((e) => e.highlights)).size).toBe(10);
  });
});
