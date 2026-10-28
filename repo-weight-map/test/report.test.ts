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
  it('marks a covered finding as already ignored instead of accusing it', () => {
    const covered = analyze([{ path: 'node_modules/react/index.js', size: 9_000_000 }], { existingGitignore: 'node_modules/\n' });
    const html = findingsHtml(covered);
    expect(html).toContain('class="finding kind-ignore covered"');
    expect(html).toContain('<span class="status covered">Already ignored</span>');
    expect(html).toContain('already excludes all 1 of these');
    expect(html).not.toContain('<pre class="lines">'); // nothing left to suggest

    const partial = analyze(
      [
        { path: 'venv/pyvenv.cfg', size: 100 },
        { path: 'venv/lib/__pycache__/m.pyc', size: 900 },
      ],
      { existingGitignore: '__pycache__/\n' },
    );
    const phtml = findingsHtml(partial);
    expect(phtml).toContain('class="status partial">1 of 2 already ignored<');
    expect(phtml).toContain('is not covered by your <code>.gitignore</code> yet');
    expect(phtml).toContain('<pre class="lines">');
    // The file still needing action is listed before the one already ignored.
    expect(phtml.indexOf('venv/pyvenv.cfg')).toBeLessThan(phtml.indexOf('venv/lib/__pycache__/m.pyc'));
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
