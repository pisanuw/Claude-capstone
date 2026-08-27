import type { Gene } from './types';
import { GENE_META, GENE_TYPES, isGeneType } from './types';
import { makeGene } from './segment';

/**
 * Reassemble a genome into prompt text and the three export formats
 * (plain text, Markdown, JSON). Genes keep their user-arranged order in
 * plain text; Markdown groups by type in canonical order for readability.
 */

export function assemble(genes: Gene[]): string {
  return genes.map((g) => g.text.trim()).join('\n\n');
}

export function toMarkdown(genes: Gene[]): string {
  const lines: string[] = ['# Prompt genome', ''];
  for (const type of GENE_TYPES) {
    const ofType = genes.filter((g) => g.type === type);
    if (ofType.length === 0) continue;
    lines.push(`## ${GENE_META[type].label}`, '');
    for (const g of ofType) {
      lines.push(g.text.trim(), '');
    }
  }
  lines.push('---', '', '## Assembled prompt', '', '```text', assemble(genes), '```', '');
  return lines.join('\n');
}

export interface GenomeJSON {
  version: 1;
  tool: 'prompt-genome';
  genes: { type: string; text: string }[];
}

export function toJSON(genes: Gene[]): string {
  const doc: GenomeJSON = {
    version: 1,
    tool: 'prompt-genome',
    genes: genes.map((g) => ({ type: g.type, text: g.text })),
  };
  return JSON.stringify(doc, null, 2);
}

/** Parse an exported genome back into genes; null when the shape is wrong. */
export function parseGenomeJSON(raw: string): Gene[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const doc = parsed as Record<string, unknown>;
  if (doc.version !== 1 || !Array.isArray(doc.genes)) return null;
  const genes: Gene[] = [];
  for (const entry of doc.genes) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { type, text } = entry as Record<string, unknown>;
    if (!isGeneType(type) || typeof text !== 'string' || text.trim() === '') return null;
    genes.push(makeGene(type, text, ['imported']));
  }
  return genes;
}
