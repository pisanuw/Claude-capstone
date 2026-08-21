import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv, validTableName } from '../src/core/csv';
import { SqlError } from '../src/core/types';

describe('parseCsv', () => {
  it('parses a simple table with inferred types', () => {
    const t = parseCsv('t', 'id,name,active,score\n1,Ada,true,9.5\n2,Grace,false,8');
    expect(t.columns).toEqual(['id', 'name', 'active', 'score']);
    expect(t.rows).toEqual([
      [1, 'Ada', true, 9.5],
      [2, 'Grace', false, 8],
    ]);
  });

  it('treats empty cells and NULL as SQL NULL', () => {
    const t = parseCsv('t', 'a,b\n,NULL\nnull,x');
    expect(t.rows).toEqual([[null, null], [null, 'x']]);
  });

  it('handles quoted fields with commas, quotes, and newlines', () => {
    const t = parseCsv('t', 'a,b\n"x, y","he said ""hi"""\n"line1\nline2",2');
    expect(t.rows[0]).toEqual(['x, y', 'he said "hi"']);
    expect(t.rows[1][0]).toBe('line1\nline2');
    expect(t.rows[1][1]).toBe(2);
  });

  it('accepts CRLF line endings and skips blank lines', () => {
    const t = parseCsv('t', 'a,b\r\n1,2\r\n\r\n3,4\n');
    expect(t.rows).toEqual([[1, 2], [3, 4]]);
  });

  it('keeps negative and decimal numbers numeric', () => {
    const t = parseCsv('t', 'x\n-3\n-0.5\n007');
    expect(t.rows).toEqual([[-3], [-0.5], [7]]);
  });

  it('rejects empty input, unnamed columns, duplicates, and ragged rows', () => {
    expect(() => parseCsv('t', '')).toThrow(SqlError);
    expect(() => parseCsv('t', 'a,,c\n1,2,3')).toThrow(/column 2 has no name/);
    expect(() => parseCsv('t', 'a,A\n1,2')).toThrow(/duplicate column/i);
    expect(() => parseCsv('t', 'a,b\n1')).toThrow(/row 1 has 1 value/);
  });
});

describe('toCsv', () => {
  it('round-trips through parseCsv, quoting what needs quoting', () => {
    const t = parseCsv('t', 'a,b\n"x, y",2\n"say ""hi""",');
    const csv = toCsv(t);
    expect(csv).toContain('"x, y"');
    expect(csv).toContain('"say ""hi"""');
    const back = parseCsv('t', csv);
    expect(back).toEqual(t);
  });

  it('writes NULL as an empty cell', () => {
    expect(toCsv({ name: 't', columns: ['a'], rows: [[null]] })).toBe('a\n');
  });
});

describe('validTableName', () => {
  it('accepts identifiers and rejects everything else', () => {
    expect(validTableName('orders')).toBe(true);
    expect(validTableName('_x2')).toBe(true);
    expect(validTableName('2fast')).toBe(false);
    expect(validTableName('my table')).toBe(false);
    expect(validTableName('')).toBe(false);
  });
});
