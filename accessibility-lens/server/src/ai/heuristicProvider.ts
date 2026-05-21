import type { AiProvider, PageContext } from './provider.js';
import type { Issue } from '../engine/types.js';

/**
 * The zero-dependency fallback. It does not call any model; it simply returns
 * the deterministic fix the rule already produced. This guarantees the product
 * is fully functional with no API key, which is a hard requirement: the LLM is
 * an enhancement, never a dependency.
 */
export class HeuristicProvider implements AiProvider {
  readonly name = 'heuristic';
  readonly enabled = false;

  async enrichFix(issue: Issue, _pageContext: PageContext): Promise<string> {
    return issue.suggestedFix;
  }
}
