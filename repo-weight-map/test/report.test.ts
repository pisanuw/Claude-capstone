import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/analyze.js';
import { categoryRows, escapeHtml, findingsHtml, largestHtml, standaloneReport } from '../src/core/report.js';
import { SAMPLE_GITIGNORE, sampleRepo } from '../src/core/sample.js';

const a = analyze(sampleRepo(), { existingGitignore: SAMPLE_GITIGNORE });

describe('report', () => {
  it('escapes html', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
  it('renders category rows largest first', () => {
    const rows = categoryRows(a);
    expect(rows.indexOf('Git internals')).toBeLessThan(rows.indexOf('Dependencies'));
    expect(rows).not.toContain('Binaries'); // no binaries in the sample
  });
  it('renders findings with toggles when interactive', () => {
    const html = findingsHtml(a, new Set(['python-venv']), true);
    expect(html).toContain('class="rule-toggle" data-rule="python-venv" ');
    expect(html).toContain('kind-ignore off');
    expect(html).toContain('and ');
    expect(html).toContain('<pre class="lines">');
    expect(findingsHtml(a)).not.toContain('rule-toggle');
    expect(findingsHtml(analyze([{ path: 'src/a.ts', size: 1 }]))).toContain('No junk detected');
  });
  it('renders the largest table and a standalone report', () => {
    expect(largestHtml(a)).toContain('pack-8f1c.pack');
    const html = standaloneReport(a, 'my <proj>');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('my &lt;proj&gt;');
    expect(html).toContain('venv/');
    expect(html).toContain('Already in .gitignore');
    expect(html).not.toContain('type="checkbox"');
    const empty = standaloneReport(analyze([{ path: 'src/a.ts', size: 1 }]), '');
    expect(empty).toContain('Nothing to add');
    expect(empty).toContain('(unnamed)');
  });
});
