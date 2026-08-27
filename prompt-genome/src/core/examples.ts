/**
 * Bundled sample prompts. Each demonstrates a different genome shape; the
 * "messy" one exists to show the lint rules firing.
 */

export interface Example {
  id: string;
  label: string;
  text: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'code-review',
    label: 'Code review assistant',
    text: [
      'You are a senior software engineer reviewing a pull request from a junior teammate.',
      '',
      'Context: our team maintains a TypeScript web service; reviews focus on correctness first, style second.',
      '',
      'Review the diff I paste and identify bugs, risky edge cases, and naming problems.',
      '',
      'Do not comment on formatting; the linter owns that. Limit yourself to 5 findings.',
      '',
      'Respond in Markdown with one bullet per finding, each starting with the file and line.',
      '',
      'Keep the tone direct but encouraging.',
    ].join('\n'),
  },
  {
    id: 'json-extract',
    label: 'JSON extractor',
    text: [
      'Extract every person mentioned in the article below.',
      '',
      'Return only valid JSON: an array of objects with keys "name", "role", and "organization".',
      '',
      'Example:',
      'Input: "CEO Jane Park told reporters..."',
      'Output: [{"name": "Jane Park", "role": "CEO", "organization": null}]',
      '',
      'Never invent a person who is not named in the text. Use null for unknown fields.',
    ].join('\n'),
  },
  {
    id: 'lesson-plan',
    label: 'Lesson plan (labeled sections)',
    text: [
      'Role: an experienced high-school computer science teacher.',
      '',
      'Context:',
      'The class has 50-minute periods and has just finished loops; recursion is next.',
      '',
      'Task:',
      'Design one lesson introducing recursion with a warm-up, a worked example, and an exit ticket.',
      '',
      'Constraints:',
      '- Must fit in 50 minutes',
      '- No slides; whiteboard and handouts only',
      '',
      'Format:',
      'A numbered agenda with minute estimates per item.',
    ].join('\n'),
  },
  {
    id: 'messy',
    label: 'Messy prompt (watch the lint fire)',
    text: [
      'Please write something engaging about our product, keep it brief but also make it comprehensive and detailed, covering various things like features, pricing, etc. Make it really good and high-quality. Thank you!',
    ].join('\n'),
  },
];

export function getExample(id: string): Example | undefined {
  return EXAMPLES.find((e) => e.id === id);
}
