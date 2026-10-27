// RFC 4180 CSV parsing: quoted fields, doubled quotes, embedded commas and
// newlines, CRLF or LF line ends. Tab-separated text (pasted from a
// spreadsheet) is detected from the header line.

export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const tabs = (first.match(/\t/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  const semis = (first.match(/;/g) ?? []).length;
  if (tabs > commas && tabs >= semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const src = text.replace(/^\uFEFF/, '');
  while (i < src.length) {
    const c = src[i] as string;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      quoted = true;
      i++;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\n' || c === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += c === '\r' && src[i + 1] === '\n' ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines.
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const needsQuotes = /[",\n\r]/;

export function toCsv(rows: (string | number)[][]): string {
  return (
    rows
      .map((r) =>
        r
          .map((v) => {
            const s = String(v);
            return needsQuotes.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(','),
      )
      .join('\n') + '\n'
  );
}
