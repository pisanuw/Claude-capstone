import { beforeEach, describe, expect, it } from 'vitest';
import { mutations, soften, strengthen } from '../src/core/mutate';
import { makeGene, resetGeneIds } from '../src/core/segment';
import { GENE_TYPES } from '../src/core/types';

beforeEach(() => resetGeneIds());

describe('strengthen / soften', () => {
  it('strengthen swaps softeners for musts', () => {
    expect(strengthen('You should avoid jargon.')).toBe('You must never use jargon.');
  });

  it('strengthen preserves leading capitalization', () => {
    expect(strengthen('Should include a summary.')).toMatch(/^Must include/);
  });

  it('soften downgrades musts and nevers', () => {
    expect(soften('You must never repeat yourself.')).toBe('You should avoid repeat yourself.');
  });

  it('soften handles do not and contractions', () => {
    expect(soften("Don't speculate. Do not guess.")).toBe('Prefer not to speculate. Prefer not to guess.');
  });
});

describe('mutations', () => {
  it('yields exactly three labeled mutations for every gene type', () => {
    for (const type of GENE_TYPES) {
      const gene = makeGene(type, 'Keep answers under 100 words.', []);
      const muts = mutations(gene);
      expect(muts).toHaveLength(3);
      for (const m of muts) {
        expect(m.label).not.toBe('');
        expect(m.rationale).not.toBe('');
        expect(m.text).not.toBe('');
        expect(m.text).not.toBe(gene.text);
      }
      expect(new Set(muts.map((m) => m.id)).size).toBe(3);
    }
  });

  it('is deterministic: same gene, same mutations', () => {
    const a = mutations(makeGene('task', 'Summarize the report.', []));
    const b = mutations(makeGene('task', 'Summarize the report.', []));
    expect(a.map((m) => m.text)).toEqual(b.map((m) => m.text));
  });

  it('constraint hardening appends the hard-requirement sentence', () => {
    const [hard] = mutations(makeGene('constraint', 'You should avoid jargon', []));
    expect(hard.text).toContain('must');
    expect(hard.text).toContain('hard requirement');
  });

  it('task deliverable mutation lowercases the spliced instruction', () => {
    const muts = mutations(makeGene('task', 'Write a haiku.', []));
    const deliverable = muts.find((m) => m.label === 'One deliverable');
    expect(deliverable?.text).toBe('Your single deliverable: write a haiku.');
  });

  it('does not double punctuation when the gene already ends a sentence', () => {
    const [first] = mutations(makeGene('format', 'Respond in JSON.', []));
    expect(first.text).not.toContain('..');
  });

  it('example labeling prefixes rather than appends', () => {
    const [label] = mutations(makeGene('example', 'Input: 2\nOutput: 4', []));
    expect(label.text.startsWith('Example (input first')).toBe(true);
  });
});
