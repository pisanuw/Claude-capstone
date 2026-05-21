/**
 * Core domain types for the Accessibility Lens engine.
 *
 * The engine is intentionally pure: it takes HTML in and produces a structured
 * report out, with no I/O. This keeps every rule deterministic and trivially
 * unit-testable. Side effects (fetching pages, calling an LLM) live elsewhere.
 */

/** The four lived-experience profiles the tool reasons about. */
export type DisabilityProfile =
  | 'low-vision'
  | 'color-blindness'
  | 'keyboard-only'
  | 'screen-reader';

export const ALL_PROFILES: DisabilityProfile[] = [
  'low-vision',
  'color-blindness',
  'keyboard-only',
  'screen-reader',
];

/** WCAG conformance level a success criterion belongs to. */
export type WcagLevel = 'A' | 'AA' | 'AAA';

/**
 * Severity ranking, ordered. Higher index == more severe. Kept as a const
 * tuple so we can sort and compare without a separate lookup table.
 */
export const SEVERITY_ORDER = ['minor', 'moderate', 'serious', 'critical'] as const;
export type Severity = (typeof SEVERITY_ORDER)[number];

/** A single accessibility problem found on the page. */
export interface Issue {
  /** Stable identifier of the rule that produced this issue. */
  ruleId: string;
  /** Human-readable rule title. */
  title: string;
  severity: Severity;
  wcagCriterion: string;
  wcagLevel: WcagLevel;
  /** Which lived-experience profiles this issue degrades. */
  profiles: DisabilityProfile[];
  /** Plain-language description of the real-world impact. */
  impact: string;
  /** A CSS-ish selector or location hint for the offending element. */
  selector: string;
  /** The offending markup, truncated for display. */
  snippet: string;
  /**
   * A deterministic, rule-based suggested fix. May be replaced or enriched by
   * an AI provider downstream, but is always present so the tool is useful
   * even with no API key configured.
   */
  suggestedFix: string;
}

/** Metadata describing a rule, independent of any particular page. */
export interface RuleMeta {
  id: string;
  title: string;
  wcagCriterion: string;
  wcagLevel: WcagLevel;
  defaultSeverity: Severity;
  profiles: DisabilityProfile[];
}

/**
 * A rule inspects a parsed document and returns zero or more issues.
 * Rules receive a `Document` (from jsdom) and never touch the network.
 */
export interface Rule extends RuleMeta {
  evaluate(doc: Document): Issue[];
}

/** One node in the linearized screen-reader reading order. */
export interface ReadingOrderNode {
  /** What a screen reader announces this element as (role). */
  role: string;
  /** The text a screen reader would speak. */
  text: string;
  /** Heading level, when role === 'heading'. */
  level?: number;
}

/** Aggregate score for a single disability profile. */
export interface ProfileScore {
  profile: DisabilityProfile;
  /** 0-100, where 100 means no detected issues for this profile. */
  score: number;
  issueCount: number;
}

/** The full result of analyzing one page. */
export interface Report {
  url: string;
  fetchedAt: string;
  pageTitle: string | null;
  lang: string | null;
  issues: Issue[];
  /** Counts keyed by severity. */
  summary: Record<Severity, number>;
  profileScores: ProfileScore[];
  /** Linearized content as a screen reader would encounter it. */
  readingOrder: ReadingOrderNode[];
  /** Overall score 0-100. */
  score: number;
}
