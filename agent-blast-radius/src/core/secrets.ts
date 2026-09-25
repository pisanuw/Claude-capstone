/** Environment variable names that almost always carry a credential. */
const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIAL|AUTH|COOKIE|SESSION|PAT\b|_KEY$)/i;

/** Well-known token prefixes, so a pasted secret is recognized even under an innocent name. */
const TOKEN_PATTERNS: Array<[RegExp, string]> = [
  [/^gh[pousr]_[A-Za-z0-9]{20,}/, 'GitHub token'],
  [/^github_pat_[A-Za-z0-9_]{20,}/, 'GitHub fine-grained token'],
  [/^glpat-[A-Za-z0-9_-]{16,}/, 'GitLab token'],
  [/^sk-ant-[A-Za-z0-9_-]{16,}/, 'Anthropic API key'],
  [/^sk-(proj-)?[A-Za-z0-9_-]{20,}/, 'OpenAI-style API key'],
  [/^xox[abposr]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/^AKIA[0-9A-Z]{16}$/, 'AWS access key id'],
  [/^AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/^(sk|rk)_live_[A-Za-z0-9]{16,}/, 'Stripe live key'],
  [/^ntn_[A-Za-z0-9]{20,}|^secret_[A-Za-z0-9]{30,}/, 'Notion token'],
];

export function looksLikeSecretName(name: string): boolean {
  return SECRET_NAME.test(name);
}

/**
 * True when a value is a reference to a secret stored elsewhere rather than
 * the secret itself: `${VAR}`, `${env:VAR}`, `${input:id}`, `$VAR`, `%VAR%`,
 * or an obvious placeholder such as `<your-token>`.
 */
export function isReference(value: string): boolean {
  // An auth scheme in front of a reference ("Bearer ${TOKEN}") is still a reference.
  const v = value.trim().replace(/^(Bearer|Basic|Token)\s+/i, '');
  if (v === '') return true;
  if (/^\$\{[^}]+\}$/.test(v) || /^\$[A-Z_][A-Z0-9_]*$/i.test(v) || /^%[A-Z_][A-Z0-9_]*%$/i.test(v)) {
    return true;
  }
  return /^<[^>]+>$/.test(v) || /^(your|my)[-_ ]/i.test(v) || /^x{6,}$/i.test(v) || /REPLACE|CHANGEME|TODO/i.test(v);
}

/** Name of the token family a literal value belongs to, if recognizable. */
export function tokenKind(value: string): string | undefined {
  const v = value.trim();
  for (const [re, kind] of TOKEN_PATTERNS) if (re.test(v)) return kind;
  return undefined;
}

/**
 * A connection string with an inline password, e.g.
 * `postgres://app:hunter2@db.example.com/prod`. Returns the host when found.
 */
export function inlineCredentialUrl(value: string): string | undefined {
  const m = /^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:([^\s/@]+)@([^\s/:?#]+)/i.exec(value.trim());
  if (!m || isReference(m[1] as string)) return undefined;
  return m[2];
}

/** Mask a secret for display: keep a short prefix, hide the rest. */
export function mask(value: string): string {
  const v = value.trim();
  if (v.length <= 8) return '••••';
  return `${v.slice(0, 4)}…(${v.length} chars)`;
}
