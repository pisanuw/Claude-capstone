import { describe, expect, it } from 'vitest';
import { escapeHtml, renderFileNotes, renderResults, renderTool, standaloneReport, totals, verdict } from '../src/core/report.js';
import { SAMPLES } from '../src/core/samples.js';
import { buildReport, scan } from '../src/core/scan.js';

describe('report rendering', () => {
  const result = scan(SAMPLES);

  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('totals active tools, levels, secrets, and shell-capable tools', () => {
    const t = totals(result);
    expect(t.tools).toBe(result.tools.length);
    expect(t.byLevel.critical + t.byLevel.high + t.byLevel.medium + t.byLevel.low).toBe(t.tools);
    expect(t.plaintextSecrets).toBe(2);
    expect(t.shellCapable).toBeGreaterThanOrEqual(3);
  });

  it('writes a one-line verdict', () => {
    expect(verdict(result.tools[0] as (typeof result.tools)[number])).toMatch(/\.$/);
    expect(verdict(buildReport('f', 'n', 'mcp-config', 's', [], []))).toBe('Nothing risky declared.');
    const multi = buildReport('f', 'n', 'mcp-config', 's', [
      { dimension: 'shell', weight: 90, label: 'Runs commands', explain: '', evidence: '' },
      { dimension: 'network', weight: 40, label: 'Net', explain: '', evidence: '' },
    ], []);
    expect(verdict(multi)).toBe('Runs commands; also reaches network egress.');
  });

  it('renders cards with escaped user content and open details for risky tools', () => {
    const evil = buildReport('<f>', '<img src=x onerror=alert(1)>', 'mcp-config', '<cmd>', [{ dimension: 'shell', weight: 95, label: '<b>', explain: '<i>', evidence: '<e>' }], [{ severity: 'high', message: '<m>', evidence: '<v>' }], true);
    const html = renderTool(evil);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('(disabled)');
    expect(html).toContain('<details open>');
    expect(html).toContain('1 capability, 1 finding');
    const quiet = renderTool(buildReport('f', 'n', 'mcp-config', 's', [], [{ severity: 'info', message: 'm' }]));
    expect(quiet).toContain('<details>');
    expect(quiet).not.toContain('What it can reach');
  });

  it('renders file notes only when present', () => {
    expect(renderFileNotes([{ file: 'a', kind: 'mcp-config', tools: [] }])).toBe('');
    expect(renderFileNotes([{ file: 'a<', kind: 'error', message: 'bad', tools: [] }])).toContain('a&lt;');
  });

  it('renders nothing before any file is added', () => {
    expect(renderResults({ files: [], tools: [] })).toBe('');
    const html = renderResults(scan([{ name: 'one.json', text: JSON.stringify({ mcpServers: { a: { command: 'uvx', args: ['mcp-server-time==1'] } } }) }]));
    expect(html).toContain('<strong>1</strong> active tool scanned');
    expect(html).toContain('<strong>0</strong> plaintext secrets');
  });

  it('shows the disabled count in the summary', () => {
    const html = renderResults(scan([{ name: 'x.json', text: JSON.stringify({ mcpServers: { a: { command: 'x', disabled: true }, b: { command: 'y' } } }) }]));
    expect(html).toContain('(+1 disabled)');
  });

  it('produces a standalone document with inlined CSS', () => {
    const doc = standaloneReport(result, 'body{color:red}', new Date('2026-09-25T12:00:00Z'));
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain('<style>body{color:red}</style>');
    expect(doc).toContain('2026-09-25T12:00:00.000Z');
    expect(doc).toContain(`from ${SAMPLES.length} files`);
    expect(standaloneReport(scan([SAMPLES[0] as (typeof SAMPLES)[number]]), '', new Date(0))).toContain('from 1 file.');
  });
});
