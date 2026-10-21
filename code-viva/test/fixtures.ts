import type { Question, Viva } from '../src/core/types';

export const Q: Question = {
  id: 'recursion-_sort-56',
  kind: 'recursion',
  prompt: '`_sort` calls itself on line 56. What is the base case?',
  anchor: null,
  identifiers: ['_sort', 'head'],
  concepts: [['base case', 'base', 'stop'], ['smaller', 'half']],
  followUps: { specifics: 'Point to the line.', concept: 'What gets smaller?', depth: 'Sketch the calls.' },
};

export function viva(questions: Question[] = [Q, { ...Q, id: 'q2', prompt: 'Second?' }], extra: Partial<Viva> = {}): Viva {
  return { v: 1, course: 'CS', assignment: 'A4', student: 'Ana', submissionId: 's1', minutes: 10, timeMultiplier: 1, maxFollowUps: 2, questions, ...extra };
}
