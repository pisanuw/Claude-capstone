/** The typed anatomy of a prompt. Order matters: it is the canonical display
 *  order for a freshly sequenced genome (genes keep the order they appeared
 *  in the source prompt; this order is used for grouping in Markdown export). */
export const GENE_TYPES = [
  'role',
  'persona',
  'context',
  'task',
  'constraint',
  'format',
  'example',
] as const;

export type GeneType = (typeof GENE_TYPES)[number];

export interface Gene {
  id: string;
  type: GeneType;
  text: string;
  /** Human-readable evidence for why the classifier chose this type. */
  cues: string[];
}

export interface GeneMeta {
  label: string;
  /** One-line description shown in the UI legend. */
  blurb: string;
  /** CSS color token; the UI maps it to a swatch. */
  color: string;
}

export const GENE_META: Record<GeneType, GeneMeta> = {
  role: {
    label: 'Role',
    blurb: 'Who the model should be: expertise, job, perspective.',
    color: 'var(--g-role)',
  },
  persona: {
    label: 'Persona',
    blurb: 'Voice and tone: how the answer should sound.',
    color: 'var(--g-persona)',
  },
  context: {
    label: 'Context',
    blurb: 'Background facts the answer should rest on.',
    color: 'var(--g-context)',
  },
  task: {
    label: 'Task',
    blurb: 'The actual instruction: what to produce.',
    color: 'var(--g-task)',
  },
  constraint: {
    label: 'Constraint',
    blurb: 'Rules and limits: musts, nevers, boundaries.',
    color: 'var(--g-constraint)',
  },
  format: {
    label: 'Format',
    blurb: 'Output shape: JSON, bullets, tables, structure.',
    color: 'var(--g-format)',
  },
  example: {
    label: 'Example',
    blurb: 'Few-shot demonstrations of input and expected output.',
    color: 'var(--g-example)',
  },
};

export function isGeneType(x: unknown): x is GeneType {
  return typeof x === 'string' && (GENE_TYPES as readonly string[]).includes(x);
}

/** A gene saved to the personal library. */
export interface SavedGene {
  id: string;
  type: GeneType;
  text: string;
  tags: string[];
  savedAt: string;
}

/** One deterministic rewrite suggestion for a gene. */
export interface Mutation {
  id: string;
  label: string;
  rationale: string;
  text: string;
}

export type Severity = 'issue' | 'warning' | 'note';

export interface Finding {
  severity: Severity;
  /** Stable rule identifier, e.g. 'no-task'. */
  rule: string;
  message: string;
  /** Ids of the genes this finding points at (empty = whole genome). */
  geneIds: string[];
}
