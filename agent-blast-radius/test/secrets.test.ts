import { describe, expect, it } from 'vitest';
import { inlineCredentialUrl, isReference, looksLikeSecretName, mask, tokenKind } from '../src/core/secrets.js';

// Built at runtime so the source never contains a string shaped like a real token.
const fake = (prefix: string, n: number) => prefix + 'a1B2'.repeat(Math.ceil(n / 4)).slice(0, n);

describe('secret detection', () => {
  it('recognizes secret-looking variable names', () => {
    for (const n of ['GITHUB_PERSONAL_ACCESS_TOKEN', 'OPENAI_API_KEY', 'DB_PASSWORD', 'CLIENT_SECRET', 'AWS_SECRET_ACCESS_KEY', 'SIGNING_KEY']) {
      expect(looksLikeSecretName(n), n).toBe(true);
    }
    for (const n of ['NODE_ENV', 'LOG_LEVEL', 'ALLOWED_DIRS']) expect(looksLikeSecretName(n), n).toBe(false);
  });

  it('treats env references and placeholders as references, not secrets', () => {
    for (const v of ['${GITHUB_TOKEN}', '${env:TOKEN}', '${input:pat}', '$TOKEN', '%TOKEN%', '<your-token>', 'your-api-key', 'xxxxxxxx', 'REPLACE_ME', '']) {
      expect(isReference(v), v).toBe(true);
    }
    expect(isReference('Bearer ${input:token}')).toBe(true);
    expect(isReference('s3cr3t-value-123')).toBe(false);
    expect(isReference('Bearer s3cr3t-value-123')).toBe(false);
  });

  it('names known token families', () => {
    expect(tokenKind(fake('ghp_', 36))).toBe('GitHub token');
    expect(tokenKind(fake('github_pat_', 40))).toBe('GitHub fine-grained token');
    expect(tokenKind(fake('glpat-', 20))).toBe('GitLab token');
    expect(tokenKind(fake('sk-ant-', 40))).toBe('Anthropic API key');
    expect(tokenKind(fake('sk-proj-', 40))).toBe('OpenAI-style API key');
    expect(tokenKind(fake('xoxb-', 30))).toBe('Slack token');
    expect(tokenKind('AKIA' + 'ABCDEFGHIJKLMNOP')).toBe('AWS access key id');
    expect(tokenKind(fake('AIza', 35))).toBe('Google API key');
    expect(tokenKind(fake('sk_live_', 24))).toBe('Stripe live key');
    expect(tokenKind(fake('ntn_', 30))).toBe('Notion token');
    expect(tokenKind('hello')).toBeUndefined();
  });

  it('finds inline passwords in connection strings', () => {
    expect(inlineCredentialUrl('postgresql://admin:pw123@db.example.com:5432/prod')).toBe('db.example.com');
    expect(inlineCredentialUrl('mongodb+srv://u:p@cluster0.example.net/x')).toBe('cluster0.example.net');
    expect(inlineCredentialUrl('postgresql://admin:${PGPASS}@db/x')).toBeUndefined();
    expect(inlineCredentialUrl('postgresql://localhost/x')).toBeUndefined();
  });

  it('masks secrets', () => {
    expect(mask('short')).toBe('••••');
    expect(mask('abcdefghijklmnop')).toBe('abcd…(16 chars)');
  });
});
