import type { ChangeType, DiffResult, Region } from './types';
import { buildOverlaySvg, TYPE_COLORS, TYPE_LABELS } from './svg';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Count regions per change type, omitting zero counts. */
export function summarize(regions: Region[]): Partial<Record<ChangeType, number>> {
  const counts: Partial<Record<ChangeType, number>> = {};
  for (const r of regions) counts[r.type] = (counts[r.type] ?? 0) + 1;
  return counts;
}

const TYPE_PLURALS: Record<ChangeType, string> = {
  layout: 'layout shifts',
  spacing: 'spacing changes',
  color: 'color changes',
  text: 'text edits',
  visibility: 'visibility changes',
  'element-added': 'added',
  'element-removed': 'removed',
};

/** One-line human summary, e.g. "5 changes: 2 added, 1 color, 2 text edits". */
export function summaryLine(result: DiffResult): string {
  if (result.identical) return 'No differences found.';
  const counts = summarize(result.regions);
  const parts = Object.entries(counts).map(([type, n]) =>
    n === 1
      ? `1 ${TYPE_LABELS[type as ChangeType].toLowerCase()}`
      : `${n} ${TYPE_PLURALS[type as ChangeType]}`,
  );
  const total = result.regions.length;
  const head = `${total} change${total === 1 ? '' : 's'}`;
  return parts.length > 0 ? `${head}: ${parts.join(', ')}` : head;
}

/**
 * Self-contained HTML diff report: both screenshots inline as data URLs, the
 * annotated overlay, and the region table. No external requests, so the file
 * can be attached to a PR or an audit as-is.
 */
export function buildHtmlReport(
  result: DiffResult,
  dataUrlA: string,
  dataUrlB: string,
  generatedOn: string,
): string {
  const overlay = buildOverlaySvg(result.width, result.height, result.regions);
  const rows = result.regions
    .map((r, i) => {
      const c = TYPE_COLORS[r.type];
      return (
        `<tr><td class="num">${i + 1}</td>` +
        `<td><span class="chip" style="background:${c}"></span>${TYPE_LABELS[r.type]}</td>` +
        `<td class="mono">${r.box.x},${r.box.y} ${r.box.w}×${r.box.h}</td>` +
        `<td class="mono">${Math.round(r.confidence * 100)}%</td>` +
        `<td>${esc(r.reason)}</td></tr>`
      );
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI diff report</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #1e293b; background: #f8fafc; }
  h1 { font-size: 1.3rem; } h2 { font-size: 1.05rem; margin-top: 2rem; }
  .meta { color: #64748b; font-size: 0.85rem; }
  .pair { display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 1rem; }
  .shot { flex: 1 1 320px; min-width: 280px; }
  .shot figcaption { font-size: 0.8rem; color: #64748b; margin-bottom: 0.3rem; }
  .frame { position: relative; border: 1px solid #cbd5e1; background: #fff; }
  .frame img, .frame svg { display: block; width: 100%; height: auto; }
  .frame svg { position: absolute; inset: 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.5rem; font-size: 0.85rem; background: #fff; }
  th, td { border: 1px solid #e2e8f0; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; }
  .num { text-align: right; color: #64748b; }
  .mono { font-family: ui-monospace, monospace; white-space: nowrap; }
  .chip { display: inline-block; width: 0.7em; height: 0.7em; border-radius: 2px; margin-right: 0.4em; }
</style>
</head>
<body>
<h1>UI diff report</h1>
<p class="meta">${esc(summaryLine(result))} · ${(result.changedRatio * 100).toFixed(2)}% of pixels changed` +
    `${result.sizeMismatch ? ' · the screenshots had different dimensions (padded to match)' : ''}` +
    ` · generated ${esc(generatedOn)} by ui-diff-lens (deterministic, client-side)</p>
<div class="pair">
  <figure class="shot"><figcaption>Before</figcaption>
    <div class="frame"><img src="${dataUrlA}" alt="Before screenshot">${overlay}</div>
  </figure>
  <figure class="shot"><figcaption>After</figcaption>
    <div class="frame"><img src="${dataUrlB}" alt="After screenshot">${overlay}</div>
  </figure>
</div>
<h2>Changes</h2>
<table>
<thead><tr><th>#</th><th>Type</th><th>Box (x,y w×h)</th><th>Confidence</th><th>Evidence</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>
`;
}
