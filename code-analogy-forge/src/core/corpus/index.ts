import type { Analogy, Concept } from '../types';
import { basics } from './basics';
import { dataStructures } from './dataStructures';
import { algorithms } from './algorithms';
import { paradigms } from './paradigms';
import { systems } from './systems';
import { practice } from './practice';

/** Every concept in the forge, in browse order. */
export const CONCEPTS: Concept[] = [
  ...basics,
  ...dataStructures,
  ...algorithms,
  ...paradigms,
  ...systems,
  ...practice,
];

const conceptById = new Map(CONCEPTS.map((c) => [c.id, c]));

const analogyById = new Map<string, { concept: Concept; analogy: Analogy }>();
for (const concept of CONCEPTS) {
  for (const analogy of concept.analogies) {
    analogyById.set(analogy.id, { concept, analogy });
  }
}

export function getConcept(id: string): Concept | undefined {
  return conceptById.get(id);
}

export function getAnalogy(id: string): { concept: Concept; analogy: Analogy } | undefined {
  return analogyById.get(id);
}
