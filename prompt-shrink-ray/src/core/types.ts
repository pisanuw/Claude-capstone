export type SectionKind = 'system' | 'context' | 'example' | 'user';

export interface Section {
  kind: SectionKind;
  /** Original text of this block, including its label line if it had one. */
  text: string;
}

export type Aggressiveness = 'light' | 'medium' | 'aggressive';

export interface CompressedSection {
  kind: SectionKind;
  before: string;
  after: string;
  rulesApplied: string[];
}

export interface CompressionResult {
  sections: CompressedSection[];
  originalText: string;
  compressedText: string;
}

export interface ModelPricing {
  id: string;
  label: string;
  /** USD per 1,000,000 input tokens. Static reference figures; verify current pricing before relying on them. */
  inputPerMillion: number;
}

export interface TokenEstimate {
  characters: number;
  words: number;
  estimatedTokens: number;
}

export interface RetentionReport {
  /** 0-100: share of extracted salient terms from the original still present in the compressed text. */
  score: number;
  totalTerms: number;
  retainedTerms: number;
  missing: string[];
}

export type DiffOpKind = 'equal' | 'insert' | 'delete';

export interface DiffOp {
  kind: DiffOpKind;
  text: string;
}
