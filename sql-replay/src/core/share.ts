import { parseCsv, toCsv, validTableName } from './csv';
import { SqlError, type Table } from './types';

export interface Workspace {
  sql: string;
  tables: Table[];
}

/**
 * Encode a workspace (query + sample data) into a URL-hash-safe string, so a
 * replay can be shared as a plain link with no server involved.
 */
export function encodeShare(ws: Workspace): string {
  const payload = {
    v: 1,
    sql: ws.sql,
    tables: ws.tables.map((t) => ({ name: t.name, csv: toCsv(t) })),
  };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode a share string produced by encodeShare. Throws SqlError if invalid. */
export function decodeShare(hash: string): Workspace {
  const cleaned = hash.replace(/^#/, '').trim();
  if (!cleaned) throw new SqlError('Empty share link');
  let json: string;
  try {
    const b64 = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    json = new TextDecoder().decode(bytes);
  } catch {
    throw new SqlError('This share link is damaged and cannot be decoded');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    throw new SqlError('This share link does not contain a valid replay');
  }
  if (typeof payload !== 'object' || payload === null) throw new SqlError('This share link does not contain a valid replay');
  const p = payload as { v?: unknown; sql?: unknown; tables?: unknown };
  if (p.v !== 1 || typeof p.sql !== 'string' || !Array.isArray(p.tables)) {
    throw new SqlError('This share link was made by an incompatible version');
  }
  const tables: Table[] = [];
  for (const t of p.tables as { name?: unknown; csv?: unknown }[]) {
    if (typeof t?.name !== 'string' || typeof t?.csv !== 'string' || !validTableName(t.name)) {
      throw new SqlError('This share link contains an invalid table');
    }
    tables.push(parseCsv(t.name, t.csv));
  }
  return { sql: p.sql, tables };
}
