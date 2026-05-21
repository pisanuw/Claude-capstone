import { useState } from 'react';
import type { DisabilityProfile, Report } from '../lib/types.js';
import { PROFILES, profileMeta } from '../lib/profiles.js';
import { IssueCard } from './IssueCard.js';
import { ReadingOrderView } from './ReadingOrderView.js';
import { LowVisionSim, ColorBlindnessSim, KeyboardSim } from './SimViews.js';

interface ProfilePanelProps {
  report: Report;
}

function Simulation({
  profile,
  report,
}: {
  profile: DisabilityProfile;
  report: Report;
}): JSX.Element {
  switch (profile) {
    case 'screen-reader':
      return <ReadingOrderView nodes={report.readingOrder} />;
    case 'low-vision':
      return <LowVisionSim />;
    case 'color-blindness':
      return <ColorBlindnessSim />;
    case 'keyboard-only':
      return <KeyboardSim report={report} />;
  }
}

/**
 * Tabbed view, one tab per disability profile. Implements the WAI-ARIA tabs
 * pattern with arrow-key navigation so the component itself is keyboard
 * accessible.
 */
export function ProfilePanel({ report }: ProfilePanelProps): JSX.Element {
  const [active, setActive] = useState<DisabilityProfile>('screen-reader');

  function onKeyDown(e: React.KeyboardEvent): void {
    const idx = PROFILES.findIndex((p) => p.id === active);
    if (e.key === 'ArrowRight') {
      setActive(PROFILES[(idx + 1) % PROFILES.length].id);
    } else if (e.key === 'ArrowLeft') {
      setActive(PROFILES[(idx - 1 + PROFILES.length) % PROFILES.length].id);
    }
  }

  const meta = profileMeta(active);
  const issues = report.issues.filter((i) => i.profiles.includes(active));

  return (
    <section aria-labelledby="profiles-heading" className="mt-8">
      <h2 id="profiles-heading" className="mb-4 font-display text-2xl font-semibold text-ink">
        Experience it as each user
      </h2>

      <div role="tablist" aria-label="Disability profiles" onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
        {PROFILES.map((p) => {
          const selected = p.id === active;
          return (
            <button
              key={p.id}
              role="tab"
              id={`tab-${p.id}`}
              aria-selected={selected}
              aria-controls={`panel-${p.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(p.id)}
              className={`rounded-t-lg border-b-2 px-4 py-2 font-semibold transition ${
                selected
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        className="rounded-b-xl rounded-tr-xl border border-line bg-panel p-6 shadow-card"
      >
        <p className="mb-6 italic text-muted">{meta.blurb}</p>

        <Simulation profile={active} report={report} />

        <h3 className="mb-3 mt-8 font-display text-xl font-semibold text-ink">
          {issues.length === 0
            ? 'No detected issues for this group'
            : `${issues.length} issue${issues.length === 1 ? '' : 's'} affecting this group`}
        </h3>
        <div className="space-y-4">
          {issues.map((issue, i) => (
            <IssueCard key={`${issue.ruleId}-${i}`} issue={issue} />
          ))}
        </div>
      </div>
    </section>
  );
}
