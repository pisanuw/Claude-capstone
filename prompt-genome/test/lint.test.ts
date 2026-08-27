import { beforeEach, describe, expect, it } from 'vitest';
import { healthScore, lintGenome } from '../src/core/lint';
import { makeGene, resetGeneIds, segmentPrompt } from '../src/core/segment';
import type { Gene } from '../src/core/types';

beforeEach(() => resetGeneIds());

const rules = (genes: Gene[]) => lintGenome(genes).map((f) => f.rule);

describe('lintGenome', () => {
  it('returns nothing for an empty genome', () => {
    expect(lintGenome([])).toEqual([]);
  });

  it('flags a genome with no task as an issue', () => {
    const genes = [makeGene('role', 'You are a helpful librarian.', [])];
    const findings = lintGenome(genes);
    const noTask = findings.find((f) => f.rule === 'no-task');
    expect(noTask?.severity).toBe('issue');
  });

  it('flags competing tasks', () => {
    const genes = [
      makeGene('task', 'Write a poem.', []),
      makeGene('task', 'Draft an essay.', []),
      makeGene('task', 'Compose a song.', []),
    ];
    expect(rules(genes)).toContain('many-tasks');
  });

  it('notes missing format and example genes', () => {
    const genes = [makeGene('task', 'Write a limerick about tea.', [])];
    const r = rules(genes);
    expect(r).toContain('no-format');
    expect(r).toContain('no-example');
  });

  it('flags vague language and points at the gene', () => {
    const genes = [makeGene('task', 'Write about various things like features etc.', [])];
    const finding = lintGenome(genes).find((f) => f.rule === 'vague-language');
    expect(finding).toBeDefined();
    expect(finding?.geneIds).toEqual([genes[0].id]);
  });

  it('flags subjective quality words', () => {
    const genes = [makeGene('task', 'Write an engaging, high-quality post.', [])];
    expect(rules(genes)).toContain('subjective-quality');
  });

  it('flags politeness filler as a note', () => {
    const genes = [makeGene('task', 'Please summarize the memo.', [])];
    const f = lintGenome(genes).find((x) => x.rule === 'politeness-filler');
    expect(f?.severity).toBe('note');
  });

  it('flags brevity vs depth conflicts across genes', () => {
    const genes = [
      makeGene('constraint', 'Keep it brief.', []),
      makeGene('constraint', 'Must be comprehensive.', []),
      makeGene('task', 'Describe the API.', []),
    ];
    expect(rules(genes)).toContain('length-conflict');
  });

  it('notes constraints that only say what to avoid', () => {
    const genes = [
      makeGene('constraint', 'Do not use jargon.', []),
      makeGene('constraint', 'Never mention pricing.', []),
      makeGene('task', 'Explain the feature.', []),
    ];
    expect(rules(genes)).toContain('only-negative-constraints');
  });

  it('stays quiet about negative constraints when a positive one exists', () => {
    const genes = [
      makeGene('constraint', 'Do not use jargon.', []),
      makeGene('constraint', 'Use plain words a customer would say.', []),
      makeGene('task', 'Explain the feature.', []),
    ];
    expect(rules(genes)).not.toContain('only-negative-constraints');
  });

  it('flags duplicate genes', () => {
    const genes = [
      makeGene('constraint', 'Cite every claim.', []),
      makeGene('constraint', 'cite every claim.', []),
      makeGene('task', 'Review the essay.', []),
    ];
    const dup = lintGenome(genes).find((f) => f.rule === 'duplicate-gene');
    expect(dup?.geneIds).toHaveLength(2);
  });

  it('flags an overlong gene and an overlong genome', () => {
    const long = Array.from({ length: 160 }, (_, i) => `word${i}`).join(' ');
    const genes = [
      makeGene('context', long, []),
      makeGene('context', `${long} extra`, []),
      makeGene('context', long.replace('word0', 'other'), []),
      makeGene('context', long.replace('word1', 'again'), []),
      makeGene('task', 'Summarize everything above.', []),
    ];
    const r = rules(genes);
    expect(r).toContain('gene-too-long');
    expect(r).toContain('genome-long');
  });

  it('the messy example prompt fires several rules', () => {
    const genes = segmentPrompt(
      'Please write something engaging about our product, keep it brief but also make it comprehensive, covering various things like features, pricing, etc.',
    );
    const found = rules(genes);
    expect(found).toContain('vague-language');
    expect(found).toContain('subjective-quality');
    expect(found).toContain('length-conflict');
  });
});

describe('healthScore', () => {
  it('gives 100 for no findings', () => {
    expect(healthScore([])).toBe(100);
  });

  it('weights issues over warnings over notes', () => {
    const base = { rule: 'x', message: 'm', geneIds: [] as string[] };
    expect(healthScore([{ ...base, severity: 'issue' as const }])).toBe(75);
    expect(healthScore([{ ...base, severity: 'warning' as const }])).toBe(90);
    expect(healthScore([{ ...base, severity: 'note' as const }])).toBe(97);
  });

  it('never goes below zero', () => {
    const many = Array.from({ length: 10 }, () => ({
      severity: 'issue' as const,
      rule: 'x',
      message: 'm',
      geneIds: [],
    }));
    expect(healthScore(many)).toBe(0);
  });
});
