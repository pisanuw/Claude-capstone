import type { Issue } from '../engine/types.js';

/**
 * Abstraction over "explain this issue and suggest a fix in context". The
 * engine always produces a deterministic rule-based fix; a provider can
 * optionally enrich it. Keeping this behind an interface means:
 *   - the app works with no API key (HeuristicProvider),
 *   - tests never call a real network (mock the interface),
 *   - swapping Claude for another model is a one-file change.
 */
export interface AiProvider {
  /** Stable name for diagnostics and the /health endpoint. */
  readonly name: string;
  /** True when this provider can make real model calls. */
  readonly enabled: boolean;
  /**
   * Return an improved, context-aware fix suggestion for one issue. Must never
   * throw: on any failure it should fall back to the issue's existing fix.
   */
  enrichFix(issue: Issue, pageContext: PageContext): Promise<string>;
}

export interface PageContext {
  url: string;
  pageTitle: string | null;
}
