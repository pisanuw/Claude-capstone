import type { Report } from '../lib/types.js';
import { profileMeta, scoreBand } from '../lib/profiles.js';

interface ScoreSummaryProps {
  report: Report;
}

/** A horizontal score bar that conveys value with width AND a number, never
 *  color alone. */
function ScoreBar({ score }: { score: number }): JSX.Element {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
      <div className="h-full rounded-full bg-accent" style={{ width: `${score}%` }} />
    </div>
  );
}

export function ScoreSummary({ report }: ScoreSummaryProps): JSX.Element {
  const overall = scoreBand(report.score);
  return (
    <section aria-labelledby="score-heading" className="rounded-xl border border-line bg-panel p-6 shadow-card">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="score-heading" className="font-display text-2xl font-semibold text-ink">
            Overall accessibility score
          </h2>
          <p className="mt-1 text-sm text-muted">
            Scanned{' '}
            <span className="font-mono">{report.url}</span>
          </p>
        </div>
        <div className="text-right">
          <p className={`font-display text-5xl font-bold ${overall.tone}`}>{report.score}</p>
          <p className={`text-sm font-semibold uppercase tracking-wide ${overall.tone}`}>
            {overall.label}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {report.profileScores.map((ps) => {
          const meta = profileMeta(ps.profile);
          const band = scoreBand(ps.score);
          return (
            <div key={ps.profile} className="rounded-lg border border-line bg-paper p-4">
              <div className="mb-2 flex items-center justify-between">
                <dt className="font-semibold text-ink">{meta.label}</dt>
                <dd className={`font-mono text-lg font-bold ${band.tone}`}>{ps.score}</dd>
              </div>
              <ScoreBar score={ps.score} />
              <p className="mt-2 text-sm text-muted">
                {ps.issueCount === 0
                  ? 'No issues detected.'
                  : `${ps.issueCount} issue${ps.issueCount === 1 ? '' : 's'} affecting this group.`}
              </p>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
