/**
 * Backups. The ledger, the policy, the private key and every attachment go
 * into one file, so a professor can move browsers or recover from cleared
 * site data. Without a passphrase it is plain JSON; with one it is sealed
 * (see seal.ts), which is the sensible choice since it holds the private key.
 */

import { packBytes, unpackBytes } from './codec';
import { parseLedger } from './ledger';
import { isSealedBackup, sealWithPassphrase, unsealWithPassphrase, BACKUP_ITERATIONS } from './seal';
import type { Ledger, Policy } from './types';

export interface Backup {
  v: 1;
  kind: 'letter-ledger-backup';
  exportedAt: string;
  policy: Policy;
  privateKey: JsonWebKey | null;
  ledger: Ledger;
  /** Attachment key to base64 bytes. */
  files: Record<string, string>;
}

export async function writeBackup(b: Omit<Backup, 'v' | 'kind'>, passphrase = '', iterations = BACKUP_ITERATIONS): Promise<Uint8Array> {
  const full: Backup = { v: 1, kind: 'letter-ledger-backup', ...b };
  if (passphrase) return sealWithPassphrase(passphrase, packBytes(full), iterations);
  return new TextEncoder().encode(JSON.stringify(full));
}

export function backupNeedsPassphrase(bytes: Uint8Array): boolean {
  return isSealedBackup(bytes);
}

export async function readBackup(bytes: Uint8Array, passphrase = ''): Promise<Backup> {
  let value: unknown;
  if (isSealedBackup(bytes)) {
    if (!passphrase) throw new Error('This backup is encrypted; enter its passphrase.');
    value = unpackBytes(await unsealWithPassphrase(passphrase, bytes));
  } else {
    try {
      value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error('Not a Letter Ledger backup file.');
    }
  }
  const b = value as Backup;
  if (b?.kind !== 'letter-ledger-backup' || b.v !== 1 || !b.policy) throw new Error('Not a Letter Ledger backup file.');
  const ledger = parseLedger(JSON.stringify(b.ledger));
  if (!ledger) throw new Error('The backup file is damaged: its ledger does not parse.');
  return { ...b, ledger, files: b.files ?? {} };
}
