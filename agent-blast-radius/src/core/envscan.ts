import { inlineCredentialUrl, isReference, looksLikeSecretName, mask, tokenKind } from './secrets.js';
import type { Capability, Finding } from './types.js';

/**
 * Credentials handed to a tool through its `env` block (or HTTP headers).
 * Every secret-looking key is a credential the tool holds; a literal value
 * (rather than a `${VAR}` reference) is also a hygiene finding, because the
 * secret now sits in plain text in a config file that other tools can read.
 */
export function scanSecrets(
  entries: Record<string, string>,
  where: 'env' | 'header',
): { capabilities: Capability[]; findings: Finding[] } {
  const capabilities: Capability[] = [];
  const findings: Finding[] = [];
  for (const [key, value] of Object.entries(entries)) {
    const kind = tokenKind(value);
    const credUrlHost = inlineCredentialUrl(value);
    const secretName = looksLikeSecretName(key) || (where === 'header' && /^(authorization|x-api-key|cookie)$/i.test(key));
    if (!secretName && !kind && !credUrlHost) continue;

    const label = kind ?? (credUrlHost ? `connection string for ${credUrlHost}` : key);
    capabilities.push({
      dimension: 'credentials',
      weight: credUrlHost ? 55 : 45,
      label: `Holds ${label}`,
      explain: `The tool is given ${where === 'env' ? `the ${key} environment variable` : `a ${key} header`}. Anything it can do with that credential, an attacker who controls the tool can do too.`,
      evidence: `${where}.${key}`,
    });
    const literal = !isReference(value) && (kind !== undefined || credUrlHost !== undefined || value.trim().length >= 8);
    if (literal) {
      findings.push({
        severity: 'high',
        message: `Plaintext secret in config (${where}.${key}). Store it in a secret manager or reference an environment variable instead.`,
        evidence: credUrlHost ? `${value.split('@')[0]?.replace(/:[^:]*$/, ':••••')}@${credUrlHost}` : mask(value),
      });
    }
  }
  return { capabilities, findings };
}

/** Command-line arguments that embed a connection string with a password. */
export function scanArgSecrets(args: string[]): { capabilities: Capability[]; findings: Finding[] } {
  const capabilities: Capability[] = [];
  const findings: Finding[] = [];
  for (const arg of args) {
    const host = inlineCredentialUrl(arg);
    const kind = tokenKind(arg);
    if (!host && !kind) continue;
    capabilities.push({
      dimension: 'credentials',
      weight: 55,
      label: host ? `Holds a database/service login for ${host}` : `Holds a ${kind as string}`,
      explain: 'A credential is passed on the command line. The tool can use it directly, and command lines are visible to every process on the machine.',
      evidence: host ? `…@${host}` : mask(arg),
    });
    findings.push({
      severity: 'high',
      message: 'Secret passed as a command-line argument: visible in process listings and stored in plain text in this file.',
      evidence: host ? `…@${host}` : mask(arg),
    });
  }
  return { capabilities, findings };
}
