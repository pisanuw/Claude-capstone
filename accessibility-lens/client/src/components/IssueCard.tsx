import type { Issue } from '../lib/types.js';
import { SEVERITY_META } from '../lib/profiles.js';

interface IssueCardProps {
  issue: Issue;
}

export function IssueCard({ issue }: IssueCardProps): JSX.Element {
  const sev = SEVERITY_META[issue.severity];
  return (
    <article className="rounded-lg border border-line bg-panel p-5 shadow-card">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-display text-lg font-semibold text-ink">{issue.title}</h4>
        <span className={`text-sm font-bold uppercase tracking-wide ${sev.className}`}>
          {/* A non-color cue: the word itself, not just a colored dot. */}
          {sev.label}
        </span>
      </header>

      <p className="mb-3 text-sm text-muted">
        <span className="font-semibold text-ink">WCAG {issue.wcagCriterion}</span> (Level{' '}
        {issue.wcagLevel})
      </p>

      <p className="mb-4 text-ink">{issue.impact}</p>

      <div className="mb-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Where ({issue.selector})
        </p>
        <pre className="overflow-x-auto rounded border border-line bg-paper p-3 font-mono text-xs text-ink">
          <code>{issue.snippet}</code>
        </pre>
      </div>

      <details className="group">
        <summary className="cursor-pointer font-semibold text-accent underline-offset-2 hover:underline">
          Suggested fix
        </summary>
        <div className="mt-2 whitespace-pre-wrap rounded border border-accent/30 bg-accent/5 p-3 text-sm text-ink">
          {issue.suggestedFix}
        </div>
      </details>
    </article>
  );
}
