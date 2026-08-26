import type { Analogy, Concept } from '../types';
import { basics } from './basics';
import { dataStructures } from './dataStructures';
import { algorithms } from './algorithms';
import { paradigms } from './paradigms';
import { systems } from './systems';
import { practice } from './practice';
import { structures2 } from './structures2';
import { language } from './language';
import { web } from './web';
import { craft } from './craft';

export interface ConceptGroup {
  label: string;
  concepts: Concept[];
}

/** The corpus, grouped the way the browse and example menus present it. */
export const CONCEPT_GROUPS: ConceptGroup[] = [
  { label: 'Basics', concepts: basics },
  { label: 'Data structures', concepts: dataStructures },
  { label: 'Algorithms', concepts: algorithms },
  { label: 'Paradigms', concepts: paradigms },
  { label: 'Systems', concepts: systems },
  { label: 'Practice', concepts: practice },
  { label: 'More structures', concepts: structures2 },
  { label: 'Language', concepts: language },
  { label: 'Web and data', concepts: web },
  { label: 'The craft', concepts: craft },
];

/** Every concept in the forge, in browse order. */
export const CONCEPTS: Concept[] = CONCEPT_GROUPS.flatMap((g) => g.concepts);

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
