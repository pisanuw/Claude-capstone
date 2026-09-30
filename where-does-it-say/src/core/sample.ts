/** The bundled demo course: a fictional intro programming course with a syllabus, a lab spec and an AI policy. */

import syllabus from '../samples/syllabus.md?raw';
import lab3 from '../samples/lab3.md?raw';
import aiPolicy from '../samples/ai-policy.md?raw';
import type { CoursePack } from './pack.js';

export const SAMPLE_PACK: CoursePack = {
  v: 1,
  title: 'CS 142: Introduction to Programming (sample course)',
  docs: [
    { title: 'Syllabus', format: 'markdown', source: syllabus },
    { title: 'Lab 3 spec', format: 'markdown', source: lab3 },
    { title: 'Collaboration and AI policy', format: 'markdown', source: aiPolicy },
  ],
};

/** Questions that show off both answers and refusals in the demo. */
export const SAMPLE_QUESTIONS = [
  'Can I use ChatGPT on lab 3?',
  'Is the late penalty per day?',
  'Can I bring a calculator to the final?',
  'Is there a make-up midterm?',
  'Can I use the collections module in lab 3?',
  'Will there be extra credit?',
];
