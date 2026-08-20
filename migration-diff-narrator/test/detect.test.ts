import { describe, expect, it } from 'vitest';
import { detectKind } from '../src/core/parse/detect.js';
import { analyze } from '../src/core/analyze.js';

describe('detectKind', () => {
  it('detects SQL DDL', () => {
    expect(detectKind(`CREATE TABLE users (id INT PRIMARY KEY);`)).toBe('sql');
    expect(detectKind(`alter table t add column x varchar(10) not null`)).toBe('sql');
  });

  it('detects TypeScript', () => {
    expect(detectKind(`export interface User { id: number }`)).toBe('typescript');
    expect(detectKind(`type Point = { x: number; y: number }`)).toBe('typescript');
  });

  it('defaults to SQL when nothing matches', () => {
    expect(detectKind(`hello world`)).toBe('sql');
  });
});

describe('analyze', () => {
  it('auto-detects from the after side by preference', () => {
    const analysis = analyze(
      `interface T { x: number }`,
      `interface T { x: number; y?: string }`,
      'auto',
    );
    expect(analysis.kind).toBe('typescript');
    expect(analysis.result.changes).toHaveLength(1);
  });

  it('falls back to the before side when after is empty', () => {
    const analysis = analyze(`interface T { x: number }`, ``, 'auto');
    expect(analysis.kind).toBe('typescript');
    expect(analysis.result.changes[0].kind).toBe('entity-removed');
  });

  it('counts severities', () => {
    const analysis = analyze(
      `CREATE TABLE t (a INT, b TEXT);`,
      `CREATE TABLE t (a BIGINT, c TEXT NOT NULL);`,
      'sql',
    );
    const { counts, changes } = analysis.result;
    expect(counts.safe + counts.caution + counts.breaking).toBe(changes.length);
    expect(counts.breaking).toBeGreaterThan(0);
  });
});
