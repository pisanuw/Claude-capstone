/**
 * The one-page report as a standalone HTML file: inline CSS, no scripts, so a
 * CTL or curriculum committee can open it anywhere or print it to PDF.
 */
import { modelName } from './anthropic.js';
import { styleSpec } from './prompts.js';
import { BUCKETS, LOWER_BOUND_NOTE, headline, matrix, pct, rowStats, verdict, type Bucket } from './report.js';
import type { Run } from './types.js';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

const SOURCE_NAMES: Record<Run['source'], string> = {
  api: 'Claude API, run from the instructor\'s browser',
  paste: 'Replies pasted in by the instructor',
  demo: 'Bundled sample run',
};

function shade(f: number | null): string {
  if (f === null) return '#eee';
  if (f >= 0.85) return '#f7c6c0';
  if (f >= 0.5) return '#fbe3b4';
  return '#cfe8cf';
}

export function reportHtml(run: Run): string {
  const h = headline(run);
  const m = matrix(run);
  const stats = rowStats(run);
  const a = run.assignment;
  const matrixRows = m.models
    .map((model) => {
      const tds = m.styles
        .map((st) => {
          const v = m.value(model, st);
          const label = !v ? '' : v.status === 'refused' ? 'refused' : v.status === 'error' ? 'error' : pct(v.fraction);
          return `<td style="background:${shade(v?.fraction ?? null)}">${label}</td>`;
        })
        .join('');
      return `<tr><th>${esc(modelName(model))}</th>${tds}</tr>`;
    })
    .join('');
  const rowTr = stats
    .map(
      (s) =>
        `<tr><td>${esc(s.row.label)}${s.row.tests ? ' <small>(tests)</small>' : ''}</td><td>${s.row.points}</td>` +
        `<td>${pct(s.lazy)}</td><td>${pct(s.mean)}</td><td style="background:${shade(s.best)}">${pct(s.best)}</td>` +
        `<td>${BUCKETS[s.bucket].name}</td></tr>`,
    )
    .join('');
  const used = (Object.keys(BUCKETS) as Bucket[]).filter((b) => stats.some((s) => s.bucket === b));
  const advice = used
    .map((b) => {
      const names = stats.filter((s) => s.bucket === b).map((s) => esc(s.row.label));
      return `<li><b>${BUCKETS[b].name}</b> (${names.join(', ')}): ${esc(BUCKETS[b].advice)}</li>`;
    })
    .join('');
  const styles = m.styles.map((st) => `<li><b>${esc(styleSpec(st).name)}</b>: ${esc(styleSpec(st).blurb)}</li>`).join('');
  const title = esc(a.title || 'Untitled assignment');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stress test: ${title}</title>
<style>
body{font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d232b;background:#fff;max-width:760px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px;border-bottom:1px solid #ccd;padding-bottom:2px}
.meta{color:#4a5563;margin:0 0 10px}.verdict{font-size:15px;background:#f3f5f8;border-left:4px solid #3b5bdb;padding:8px 12px}
table{border-collapse:collapse;width:100%;margin:4px 0}th,td{border:1px solid #ccd;padding:4px 6px;text-align:left}td{text-align:center}td:first-child{text-align:left}
.note{font-size:12px;color:#4a5563;border:1px solid #ccd;padding:6px 10px}ul{margin:4px 0;padding-left:20px}
@media print{body{margin:0}h2{break-after:avoid}}
</style></head><body>
<h1>Assignment stress test: ${title}</h1>
<p class="meta">${esc([a.course, run.term].filter(Boolean).join(' · '))}${a.course || run.term ? ' · ' : ''}${esc(run.createdAt.slice(0, 10))} · ${esc(SOURCE_NAMES[run.source])} · judge: ${esc(modelName(run.judge))}</p>
<p class="verdict">${esc(verdict(h))}</p>
<h2>Score by model and prompt style</h2>
<table><tr><th>Model</th>${m.styles.map((st) => `<th>${esc(styleSpec(st).name)}</th>`).join('')}</tr>${matrixRows}</table>
<h2>Rubric rows</h2>
<table><tr><th>Row</th><th>Max</th><th>Lazy best</th><th>Mean</th><th>Best</th><th>Verdict</th></tr>${rowTr}</table>
<h2>What this means</h2><ul>${advice}</ul>
<h2>Method</h2><ul>${styles}<li>${h.attempts} attempts${h.refused ? `, ${h.refused} refused` : ''}${h.failed ? `, ${h.failed} failed to run` : ''}. Rows marked (tests) were scored by running the instructor's pytest suite; the rest by the judge model with the instructor's rubric.</li></ul>
${run.note ? `<p>${esc(run.note)}</p>` : ''}
<p class="note">${esc(LOWER_BOUND_NOTE)}</p>
</body></html>
`;
}
