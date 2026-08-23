/** Markdown export of a full analysis, suitable for pasting into an issue or PR. */

import type { Analysis, Entry } from './types';
import { formatBytes, formatMs } from './format';

function findingEntryList(indexes: number[], entries: Entry[], max = 6): string {
  const lines = indexes.slice(0, max).map((i) => {
    const e = entries[i];
    return `  - \`${e.method} ${e.url}\` — ${e.status || 'no response'}, ${formatBytes(e.transferSize)}, ${formatMs(e.time)}`;
  });
  if (indexes.length > max) lines.push(`  - …and ${indexes.length - max} more`);
  return lines.join('\n');
}

export function toMarkdown(analysis: Analysis, entries: Entry[], sourceName: string): string {
  const { stats, findings } = analysis;
  const lines: string[] = [];
  lines.push(`# HAR Detective report — ${sourceName}`);
  lines.push('');
  lines.push(analysis.narrative);
  lines.push('');
  lines.push('## Session at a glance');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Requests | ${stats.requestCount} |`);
  lines.push(`| Origins | ${stats.originCount} |`);
  lines.push(`| Transferred | ${formatBytes(stats.totalTransfer)} |`);
  lines.push(`| Decoded | ${formatBytes(stats.totalDecoded)} |`);
  lines.push(`| Duration | ${formatMs(stats.duration)} |`);
  lines.push(`| Failed requests | ${stats.errorCount} |`);
  lines.push(`| Cache hits / 304s | ${stats.cachedCount} |`);
  lines.push('');

  if (findings.length === 0) {
    lines.push('## Findings');
    lines.push('');
    lines.push('No issues detected.');
  } else {
    lines.push(`## Findings (${findings.length})`);
    findings.forEach((f, rank) => {
      lines.push('');
      lines.push(`### ${rank + 1}. [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push('');
      lines.push(f.explanation);
      lines.push('');
      const impact: string[] = [];
      if (f.wastedBytes) impact.push(`~${formatBytes(f.wastedBytes)} avoidable transfer`);
      if (f.wastedMs) impact.push(`~${formatMs(f.wastedMs)} avoidable latency`);
      if (impact.length > 0) lines.push(`**Estimated impact:** ${impact.join(', ')}`);
      lines.push(`**Fix:** ${f.remediation}`);
      lines.push('');
      lines.push('- Affected requests:');
      lines.push(findingEntryList(f.entries, entries));
    });
  }
  lines.push('');
  lines.push('---');
  lines.push('_Generated locally by HAR Detective. The HAR file never left the browser._');
  lines.push('');
  return lines.join('\n');
}
