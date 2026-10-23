/**
 * The three student-style attempts. Each style is a fixed script of user
 * turns; the runner sends them in order and keeps the model's replies, so the
 * same script works against the API and in paste mode.
 */
import type { Assignment, StyleId } from './types.js';

export interface StyleSpec {
  id: StyleId;
  name: string;
  blurb: string;
  /** Claude effort level the style runs at (a hurried student vs a careful one). */
  effort: 'low' | 'medium' | 'high';
}

export const STYLES: StyleSpec[] = [
  {
    id: 'lazy',
    name: 'Lazy paste',
    blurb: 'The assignment text pasted as is, nothing else, one turn.',
    effort: 'low',
  },
  {
    id: 'student',
    name: 'Rubric-aware',
    blurb: 'Assignment plus rubric, asking for full marks on every row, one turn.',
    effort: 'medium',
  },
  {
    id: 'careful',
    name: 'Careful multi-turn',
    blurb: 'Plan against the rubric, write, then self-check and revise: three turns.',
    effort: 'high',
  },
];

export function styleSpec(id: StyleId): StyleSpec {
  const s = STYLES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown style ${id}`);
  return s;
}

function starterBlock(a: Assignment): string {
  if (!a.code || a.code.starter.length === 0) return '';
  return (
    '\n\nStarter files:\n' +
    a.code.starter.map((f) => `\n--- ${f.name} ---\n\`\`\`\n${f.content.trimEnd()}\n\`\`\``).join('\n')
  );
}

function deliverable(a: Assignment): string {
  return a.code
    ? ` Give me the complete ${a.code.solutionFile} in a single Python code block.`
    : '';
}

/** The user turns for one style. The lazy style sends the assignment verbatim. */
export function styleTurns(style: StyleId, a: Assignment): string[] {
  const body = a.prompt.trim() + starterBlock(a);
  const rubric = a.rubricText.trim();
  switch (style) {
    case 'lazy':
      return [body];
    case 'student':
      return [
        'I have this assignment for my class. Here is the assignment and the grading rubric. ' +
          'Please do it so it gets full marks on every rubric row.' +
          deliverable(a) +
          `\n\nASSIGNMENT:\n${body}\n\nRUBRIC:\n${rubric}`,
      ];
    case 'careful':
      return [
        'I am working on this assignment for my class. Before writing anything, go through the rubric ' +
          'row by row, say what each row requires, and plan how the submission will meet it. ' +
          `Do not write the submission yet.\n\nASSIGNMENT:\n${body}\n\nRUBRIC:\n${rubric}`,
        'Good. Now write the complete submission, following your plan.' + deliverable(a),
        'Check your submission against every rubric row and every requirement in the assignment' +
          (a.code ? ', and trace through the examples and edge cases by hand' : '') +
          '. Fix anything that falls short, then give me only the final, complete version.' +
          deliverable(a),
      ];
  }
}

/**
 * Pull the Python solution out of a reply: the longest fenced block tagged
 * python/py (or untagged). A reply with no fences counts as code only if it
 * starts like a module.
 */
export function extractCode(output: string): string | null {
  const blocks: string[] = [];
  const re = /```([\w+-]*)[^\n]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(output))) {
    const lang = m[1].toLowerCase();
    if (lang === '' || lang === 'python' || lang === 'py' || lang === 'python3') blocks.push(m[2]);
  }
  if (blocks.length > 0) return blocks.reduce((a, b) => (b.length > a.length ? b : a));
  if (/^\s*(?:import |from |def |class |#)/.test(output)) return output;
  return null;
}
