import { beforeEach, describe, expect, it } from 'vitest';
import { assemble, parseGenomeJSON, toJSON, toMarkdown } from '../src/core/assemble';
import { makeGene, resetGeneIds } from '../src/core/segment';

beforeEach(() => resetGeneIds());

const sample = () => [
  makeGene('constraint', 'No jargon.', []),
  makeGene('role', 'You are a coach.', []),
  makeGene('task', 'Plan a workout.', []),
];

describe('assemble', () => {
  it('joins genes with blank lines in user order', () => {
    expect(assemble(sample())).toBe('No jargon.\n\nYou are a coach.\n\nPlan a workout.');
  });

  it('yields an empty string for an empty genome', () => {
    expect(assemble([])).toBe('');
  });
});

describe('toMarkdown', () => {
  it('groups genes by type in canonical order with headings', () => {
    const md = toMarkdown(sample());
    const roleAt = md.indexOf('## Role');
    const taskAt = md.indexOf('## Task');
    const constraintAt = md.indexOf('## Constraint');
    expect(roleAt).toBeGreaterThan(-1);
    expect(roleAt).toBeLessThan(taskAt);
    expect(taskAt).toBeLessThan(constraintAt);
    expect(md).toContain('## Assembled prompt');
    expect(md).toContain('```text');
  });

  it('omits headings for absent types', () => {
    const md = toMarkdown([makeGene('task', 'Plan a workout.', [])]);
    expect(md).not.toContain('## Role');
  });
});

describe('toJSON / parseGenomeJSON', () => {
  it('round-trips a genome', () => {
    const genes = sample();
    const parsed = parseGenomeJSON(toJSON(genes));
    expect(parsed).not.toBeNull();
    expect(parsed?.map((g) => [g.type, g.text])).toEqual(genes.map((g) => [g.type, g.text]));
  });

  it('rejects malformed JSON', () => {
    expect(parseGenomeJSON('{nope')).toBeNull();
    expect(parseGenomeJSON('"a string"')).toBeNull();
    expect(parseGenomeJSON('null')).toBeNull();
  });

  it('rejects wrong versions and shapes', () => {
    expect(parseGenomeJSON(JSON.stringify({ version: 2, genes: [] }))).toBeNull();
    expect(parseGenomeJSON(JSON.stringify({ version: 1, genes: 'x' }))).toBeNull();
    expect(parseGenomeJSON(JSON.stringify({ version: 1, genes: [{ type: 'alien', text: 'hi' }] }))).toBeNull();
    expect(parseGenomeJSON(JSON.stringify({ version: 1, genes: [{ type: 'task', text: '  ' }] }))).toBeNull();
    expect(parseGenomeJSON(JSON.stringify({ version: 1, genes: [null] }))).toBeNull();
  });
});
