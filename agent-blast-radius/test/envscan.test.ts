import { describe, expect, it } from 'vitest';
import { scanArgSecrets, scanSecrets } from '../src/core/envscan.js';

describe('scanSecrets', () => {
  it('records credentials and flags only literal values', () => {
    const r = scanSecrets({ GITHUB_TOKEN: '${GH}', OPENAI_API_KEY: 'literal-secret-value', PORT: '3000', SHORT_TOKEN: 'abc' }, 'env');
    expect(r.capabilities.map((c) => c.evidence)).toEqual(['env.GITHUB_TOKEN', 'env.OPENAI_API_KEY', 'env.SHORT_TOKEN']);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.evidence).toBe('lite…(20 chars)');
  });

  it('recognizes a token under an innocent name and masks connection-string passwords', () => {
    const token = 'ghp_' + 'x'.repeat(36);
    const r = scanSecrets({ SETTING: token, DATABASE_URL: 'postgres://app:pw@db.example.com/x' }, 'env');
    expect(r.capabilities.map((c) => c.label)).toEqual(['Holds GitHub token', 'Holds connection string for db.example.com']);
    expect(r.findings.map((f) => f.evidence)).toEqual(['ghp_…(40 chars)', 'postgres://app:••••@db.example.com']);
  });

  it('treats auth headers as credentials', () => {
    const r = scanSecrets({ Authorization: 'Bearer ${input:token}', 'Content-Type': 'application/json' }, 'header');
    expect(r.capabilities).toHaveLength(1);
    expect(r.capabilities[0]?.explain).toMatch(/Authorization header/);
    expect(r.findings).toEqual([]);
  });
});

describe('scanArgSecrets', () => {
  it('flags connection strings and tokens on the command line', () => {
    const token = 'sk-ant-' + 'y'.repeat(40);
    const r = scanArgSecrets(['--db', 'mysql://root:pw@10.0.0.5/app', token, '--flag']);
    expect(r.capabilities.map((c) => c.label)).toEqual(['Holds a database/service login for 10.0.0.5', 'Holds a Anthropic API key']);
    expect(r.findings).toHaveLength(2);
  });
});
