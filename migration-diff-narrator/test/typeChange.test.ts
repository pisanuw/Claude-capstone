import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/analyze.js';
import type { Severity } from '../src/core/types.js';

/** Runs a single-column type change through the whole pipeline. */
function verdict(beforeType: string, afterType: string): { severity: Severity; note: string } {
  const changes = analyze(
    `CREATE TABLE t (x ${beforeType});`,
    `CREATE TABLE t (x ${afterType});`,
    'sql',
  ).result.changes.filter((c) => c.kind === 'type-changed');
  expect(changes).toHaveLength(1);
  return { severity: changes[0].severity, note: changes[0].note };
}

describe('integer width changes', () => {
  it('widening is safe', () => {
    expect(verdict('INT', 'BIGINT').severity).toBe('safe');
    expect(verdict('SMALLINT', 'INT').severity).toBe('safe');
  });
  it('narrowing is breaking', () => {
    expect(verdict('BIGINT', 'INT').severity).toBe('breaking');
    expect(verdict('INT', 'TINYINT').severity).toBe('breaking');
  });
});

describe('string length changes', () => {
  it('longer limit is safe', () => {
    expect(verdict('VARCHAR(50)', 'VARCHAR(100)').severity).toBe('safe');
  });
  it('shorter limit is breaking and names the new limit', () => {
    const v = verdict('VARCHAR(100)', 'VARCHAR(50)');
    expect(v.severity).toBe('breaking');
    expect(v.note).toContain('50');
  });
  it('bounded to unbounded is safe, unbounded to bounded is breaking', () => {
    expect(verdict('VARCHAR(100)', 'TEXT').severity).toBe('safe');
    expect(verdict('TEXT', 'VARCHAR(100)').severity).toBe('breaking');
  });
});

describe('decimal precision changes', () => {
  it('growing precision and scale is safe', () => {
    expect(verdict('DECIMAL(8,2)', 'DECIMAL(10,2)').severity).toBe('safe');
    expect(verdict('DECIMAL(8,2)', 'DECIMAL(12,4)').severity).toBe('safe');
  });
  it('shrinking precision or scale is breaking', () => {
    expect(verdict('DECIMAL(10,2)', 'DECIMAL(8,2)').severity).toBe('breaking');
    expect(verdict('DECIMAL(10,4)', 'DECIMAL(10,2)').severity).toBe('breaking');
  });
  it('raising precision while cutting integer digits is breaking', () => {
    // DECIMAL(10,2) holds 8 integer digits; DECIMAL(11,6) holds only 5.
    expect(verdict('DECIMAL(10,2)', 'DECIMAL(11,6)').severity).toBe('breaking');
  });
});

describe('enum member changes', () => {
  it('adding members is caution', () => {
    expect(verdict("ENUM('a','b')", "ENUM('a','b','c')").severity).toBe('caution');
  });
  it('removing members is breaking and names them', () => {
    const v = verdict("ENUM('a','b','c')", "ENUM('a')");
    expect(v.severity).toBe('breaking');
    expect(v.note).toContain("'b'");
    expect(v.note).toContain("'c'");
  });
});

describe('cross-family changes', () => {
  it('int to numeric/float is safe', () => {
    expect(verdict('INT', 'DECIMAL(12,2)').severity).toBe('safe');
    expect(verdict('INT', 'DOUBLE PRECISION').severity).toBe('safe');
  });
  it('numeric to text is caution', () => {
    expect(verdict('INT', 'TEXT').severity).toBe('caution');
  });
  it('date to timestamp is safe, timestamp to date is breaking', () => {
    expect(verdict('DATE', 'TIMESTAMP').severity).toBe('safe');
    expect(verdict('TIMESTAMP', 'DATE').severity).toBe('breaking');
  });
  it('float or decimal to integer is breaking', () => {
    expect(verdict('DECIMAL(8,2)', 'INT').severity).toBe('breaking');
    expect(verdict('REAL', 'BIGINT').severity).toBe('breaking');
  });
  it('text to structured types is breaking with a USING hint', () => {
    const v = verdict('TEXT', 'UUID');
    expect(v.severity).toBe('breaking');
    expect(v.note.toLowerCase()).toContain('using');
  });
  it('anything else defaults to breaking', () => {
    expect(verdict('JSONB', 'BYTEA').severity).toBe('breaking');
  });
});

describe('TypeScript type changes', () => {
  function tsVerdict(beforeType: string, afterType: string): Severity {
    const changes = analyze(
      `interface T { x: ${beforeType} }`,
      `interface T { x: ${afterType} }`,
      'typescript',
    ).result.changes.filter((c) => c.kind === 'type-changed');
    expect(changes).toHaveLength(1);
    return changes[0].severity;
  }

  it('number to string is caution, string to number is breaking', () => {
    expect(tsVerdict('number', 'string')).toBe('caution');
    expect(tsVerdict('string', 'number')).toBe('breaking');
  });

  it('union member changes on string literal enums follow enum rules', () => {
    expect(tsVerdict("'a' | 'b'", "'a' | 'b' | 'c'")).toBe('caution');
    expect(tsVerdict("'a' | 'b'", "'a'")).toBe('breaking');
  });
});
