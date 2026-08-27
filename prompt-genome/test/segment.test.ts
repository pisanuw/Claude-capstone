import { beforeEach, describe, expect, it } from 'vitest';
import { classifySentence, resetGeneIds, segmentPrompt, splitSentences } from '../src/core/segment';

beforeEach(() => resetGeneIds());

describe('classifySentence', () => {
  const cases: [string, string][] = [
    ['You are a senior software engineer.', 'role'],
    ['Act as a travel agent for budget trips.', 'role'],
    ['Keep the tone warm and encouraging.', 'persona'],
    ['Write in a formal voice.', 'persona'],
    ['We are a small nonprofit running a food bank.', 'context'],
    ['Background: the service went down twice last week.', 'context'],
    ['Summarize the article in three sentences.', 'task'],
    ['I want you to plan a study schedule.', 'task'],
    ['Do not mention competitors.', 'constraint'],
    ['Use at most 200 words.', 'constraint'],
    ['Respond in valid JSON.', 'format'],
    ['Use bullet points with bold headings.', 'format'],
    ['For example, "cat" becomes "chat".', 'example'],
    ['Input: 4, Output: 16', 'example'],
  ];
  for (const [sentence, expected] of cases) {
    it(`classifies "${sentence}" as ${expected}`, () => {
      expect(classifySentence(sentence).type).toBe(expected);
    });
  }

  it('reports the cue that fired', () => {
    const { cues } = classifySentence('Never include personal data.');
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0]).toContain('forbids');
  });

  it('falls back to context with an honest cue', () => {
    const { type, cues } = classifySentence('The sky was gray over the harbor.');
    expect(type).toBe('context');
    expect(cues[0]).toContain('no strong signal');
  });
});

describe('splitSentences', () => {
  it('splits on sentence enders', () => {
    expect(splitSentences('One thing. Another thing! A third?')).toHaveLength(3);
  });

  it('keeps list items whole', () => {
    const parts = splitSentences('- Must fit. In one lesson.\n- No slides');
    expect(parts).toEqual(['- Must fit. In one lesson.', '- No slides']);
  });

  it('drops blank lines', () => {
    expect(splitSentences('\n\n  \n')).toEqual([]);
  });
});

describe('segmentPrompt', () => {
  it('returns an empty genome for empty input', () => {
    expect(segmentPrompt('')).toEqual([]);
    expect(segmentPrompt('   \n \n ')).toEqual([]);
  });

  it('segments a multi-part prompt into typed genes in order', () => {
    const genes = segmentPrompt(
      [
        'You are a code reviewer.',
        '',
        'Review the diff I paste and list the bugs.',
        '',
        'Do not comment on formatting. Limit yourself to 5 findings.',
        '',
        'Respond in Markdown bullets.',
      ].join('\n'),
    );
    expect(genes.map((g) => g.type)).toEqual(['role', 'task', 'constraint', 'format']);
    expect(genes.every((g) => g.cues.length > 0)).toBe(true);
    expect(new Set(genes.map((g) => g.id)).size).toBe(genes.length);
  });

  it('honors explicit section labels', () => {
    const genes = segmentPrompt(
      ['Constraints:', '- Must fit in 50 minutes', '- No slides', '', 'Format:', 'A numbered agenda.'].join('\n'),
    );
    expect(genes.map((g) => g.type)).toEqual(['constraint', 'format']);
    expect(genes[0].cues[0]).toContain('labeled section');
    expect(genes[0].text).toContain('No slides');
  });

  it('treats an input/output block as one example gene', () => {
    const genes = segmentPrompt('Input: "hello"\nOutput: "HELLO"');
    expect(genes).toHaveLength(1);
    expect(genes[0].type).toBe('example');
  });

  it('merges adjacent same-type sentences into one gene', () => {
    const genes = segmentPrompt('Do not use jargon. Never exceed 100 words.');
    expect(genes).toHaveLength(1);
    expect(genes[0].type).toBe('constraint');
    expect(genes[0].text).toBe('Do not use jargon. Never exceed 100 words.');
  });

  it('does not treat a full sentence starting with "You are" as a label', () => {
    const genes = segmentPrompt('You are given a CSV file with two columns.');
    expect(genes).toHaveLength(1);
    // Sentence-level classification decides (role cue), not the label pass.
    expect(genes[0].cues[0]).not.toContain('labeled section');
  });

  it('normalizes Windows line endings', () => {
    const genes = segmentPrompt('You are a poet.\r\n\r\nWrite a haiku about rain.');
    expect(genes.map((g) => g.type)).toEqual(['role', 'task']);
  });
});
