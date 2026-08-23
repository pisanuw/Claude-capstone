import { describe, expect, it } from 'vitest';
import { sampleHarText } from '../src/core/sample';
import { parseHar } from '../src/core/har';
import { analyze } from '../src/core/analyze';

describe('sample session end to end', () => {
  const parsed = parseHar(sampleHarText());
  const analysis = analyze(parsed.entries);

  it('parses cleanly', () => {
    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.entries.length).toBeGreaterThan(25);
    expect(parsed.creator).toContain('HAR Detective sample');
  });

  it('trips every detector at least once', () => {
    const detectors = new Set(analysis.findings.map((f) => f.detector));
    for (const expected of [
      'failed-requests',
      'repeated-calls',
      'sequential-chain',
      'redirect-chain',
      'missing-cache-headers',
      'uncompressed-responses',
      'duplicate-requests',
      'large-payloads',
      'large-json',
      'slow-ttfb',
      'http1-connection-churn',
    ]) {
      expect(detectors, `expected detector ${expected} to fire`).toContain(expected);
    }
  });

  it('is deterministic', () => {
    expect(sampleHarText()).toBe(sampleHarText());
    const again = analyze(parseHar(sampleHarText()).entries);
    expect(again.narrative).toBe(analysis.narrative);
    expect(again.findings.map((f) => f.title)).toEqual(analysis.findings.map((f) => f.title));
  });

  it('ranks high-severity findings first', () => {
    const severities = analysis.findings.map((f) => f.severity);
    const firstMedium = severities.indexOf('medium');
    const lastHigh = severities.lastIndexOf('high');
    expect(lastHigh).toBeLessThan(firstMedium === -1 ? severities.length : firstMedium);
  });
});
