import { SqlError, type Table, type Value } from './types';

/**
 * Parse CSV text (first line = column names) into a Table. Handles quoted
 * fields with embedded commas, quotes, and newlines. Cell types are inferred:
 * numbers, true/false, empty or NULL as SQL NULL, everything else text.
 */
export function parseCsv(name: string, text: string): Table {
  const records = splitCsv(text);
  if (records.length === 0) throw new SqlError(`Table "${name}" is empty; the first CSV line must name the columns`);
  const columns = records[0].map((c, i) => {
    const t = c.trim();
    if (!t) throw new SqlError(`Table "${name}": column ${i + 1} has no name`);
    return t;
  });
  const lower = columns.map((c) => c.toLowerCase());
  for (let i = 0; i < lower.length; i++) {
    if (lower.indexOf(lower[i]) !== i) {
      throw new SqlError(`Table "${name}": duplicate column name "${columns[i]}"`);
    }
  }
  const rows: Value[][] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    if (rec.length === 1 && rec[0].trim() === '') continue;
    if (rec.length !== columns.length) {
      throw new SqlError(`Table "${name}": row ${r} has ${rec.length} values but there are ${columns.length} columns`);
    }
    rows.push(rec.map(inferValue));
  }
  return { name, columns, rows };
}

function splitCsv(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  const push = () => { record.push(field); field = ''; };
  const endRecord = () => { push(); records.push(record); record = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { inQuotes = true; i++; continue; }
    if (c === ',') { push(); i++; continue; }
    if (c === '\n') { endRecord(); i++; continue; }
    if (c === '\r') { if (text[i + 1] === '\n') i++; endRecord(); i++; continue; }
    field += c; i++;
  }
  if (field !== '' || record.length > 0) endRecord();
  return records;
}

function inferValue(raw: string): Value {
  const t = raw.trim();
  if (t === '' || t.toUpperCase() === 'NULL') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  return raw.trim();
}

/** Serialize a Table back to CSV (used by the share link round trip). */
export function toCsv(table: Table): string {
  const escape = (v: Value): string => {
    if (v === null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [table.columns.join(',')];
  for (const row of table.rows) lines.push(row.map(escape).join(','));
  return lines.join('\n');
}

/** A table name must be usable in SQL: letters, digits, underscores. */
export function validTableName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}
