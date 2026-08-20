import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/analyze.js';
import { changeLine, toMarkdown } from '../src/core/markdown.js';

describe('toMarkdown', () => {
  it('renders an empty diff', () => {
    const { result } = analyze(`CREATE TABLE t (a INT);`, `CREATE TABLE t (a INT);`, 'sql');
    const md = toMarkdown(result);
    expect(md).toContain('No structural changes detected.');
  });

  it('groups changes by severity with checkboxes and counts', () => {
    const { result } = analyze(
      `CREATE TABLE t (a INT, b TEXT, c INT);`,
      `CREATE TABLE t (a BIGINT, c INT, d TEXT);`,
      'sql',
    );
    const md = toMarkdown(result);
    expect(md).toContain('## Migration diff');
    expect(md).toMatch(/\d+ changes?: \d+ breaking, \d+ caution, \d+ safe\./);
    expect(md).toContain('### 🟥 breaking');
    expect(md).toContain('### 🟩 safe');
    expect(md).toContain('- [ ] **t**.b — Column b removed');
    // Every change appears exactly once.
    const boxCount = (md.match(/- \[ \]/g) ?? []).length;
    expect(boxCount).toBe(result.changes.length);
  });

  it('omits empty severity sections', () => {
    const { result } = analyze(
      `CREATE TABLE t (a INT);`,
      `CREATE TABLE t (a INT); CREATE TABLE u (x INT);`,
      'sql',
    );
    const md = toMarkdown(result);
    expect(md).not.toContain('### 🟥');
    expect(md).toContain('### 🟩 safe');
  });
});

describe('changeLine', () => {
  it('formats a compact one-liner', () => {
    const { result } = analyze(`CREATE TABLE t (a INT);`, `CREATE TABLE t (a BIGINT);`, 'sql');
    expect(changeLine(result.changes[0])).toBe(
      '[safe] t.a: Column a type changed: INT -> BIGINT',
    );
  });
});
