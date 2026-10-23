import { describe, expect, it } from 'vitest';
import demoRuns from '../src/data/demo-runs.json';
import { parseLibrary } from '../src/core/history.js';
import { headline } from '../src/core/report.js';
import { SAMPLES } from '../src/core/samples.js';

describe('recorded demo', () => {
  const lib = parseLibrary(JSON.stringify({ version: 1, runs: demoRuns }));

  it('has one full run per sample', () => {
    expect(lib.runs.map((r) => r.assignment.title)).toEqual(SAMPLES.map((s) => s.assignment.title));
    for (const r of lib.runs) {
      expect(r.source).toBe('demo');
      expect(r.cells).toHaveLength(9);
      expect(r.cells.filter((c) => c.status === 'error')).toEqual([]);
      expect(headline(r).best).not.toBeNull();
    }
  });

  it('holds chat replies, not leaked agent context', () => {
    const text = JSON.stringify(demoRuns);
    expect(text).not.toMatch(/<invoke|<parameter name=|\/home\/user|scratchpad/);
  });
});
