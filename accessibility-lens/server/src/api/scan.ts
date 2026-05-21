import type { AiProvider } from '../ai/provider.js';
import { fetchPage, type FetchImpl } from '../engine/fetchPage.js';
import { analyzeHtml } from '../engine/analyze.js';
import type { Report } from '../engine/types.js';

export interface ScanDeps {
  ai: AiProvider;
  /** Injectable fetch, for tests. */
  fetchImpl?: FetchImpl;
  /** Max issues to enrich via the AI provider. */
  aiEnrichLimit?: number;
}

/**
 * The application-level use case: fetch a URL, analyze it, and enrich the most
 * severe issues with the AI provider. Composition only; all the hard logic
 * lives in independently tested units.
 */
export async function scanUrl(url: string, deps: ScanDeps): Promise<Report> {
  const page = await fetchPage(url, deps.fetchImpl);
  const report = analyzeHtml(page.html, page.finalUrl, page.fetchedAt);

  if (deps.ai.enabled && report.issues.length > 0) {
    const limit = deps.aiEnrichLimit ?? 5;
    const context = { url: report.url, pageTitle: report.pageTitle };
    const targets = report.issues.slice(0, limit);
    await Promise.all(
      targets.map(async (issue) => {
        issue.suggestedFix = await deps.ai.enrichFix(issue, context);
      }),
    );
  }

  return report;
}
