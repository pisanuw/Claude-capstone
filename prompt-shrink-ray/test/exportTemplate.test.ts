import { describe, expect, it } from 'vitest';
import { toPromptTemplate, toTemplateJson } from '../src/core/exportTemplate.js';
import type { CompressedSection } from '../src/core/types.js';

const SECTIONS: CompressedSection[] = [
  { kind: 'system', before: 'Please be terse.', after: 'Be terse.', rulesApplied: ['filler-words'] },
  { kind: 'user', before: 'Summarize this.', after: 'Summarize this.', rulesApplied: [] },
];

describe('toPromptTemplate', () => {
  it('maps each section to its kind and compressed text', () => {
    expect(toPromptTemplate(SECTIONS)).toEqual({
      sections: [
        { kind: 'system', text: 'Be terse.' },
        { kind: 'user', text: 'Summarize this.' },
      ],
    });
  });

  it('produces an empty sections array for no input', () => {
    expect(toPromptTemplate([])).toEqual({ sections: [] });
  });
});

describe('toTemplateJson', () => {
  it('serializes to indented, parseable JSON', () => {
    const json = toTemplateJson(SECTIONS);
    expect(JSON.parse(json)).toEqual(toPromptTemplate(SECTIONS));
    expect(json).toContain('\n');
  });
});
