import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv, toCsv } from '../src/core/csv';

describe('csv', () => {
  it('parses quotes, doubled quotes, embedded commas and newlines, CRLF', () => {
    const t = parseCsv('a,b,c\r\n"x, y","he said ""hi""","two\nlines"\r\n\r\n1,2,3');
    expect(t).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'he said "hi"', 'two\nlines'],
      ['1', '2', '3'],
    ]);
  });

  it('handles a BOM, a missing final newline, a trailing delimiter and old Mac line ends', () => {
    expect(parseCsv('\uFEFFa,b\n1,')).toEqual([['a', 'b'], ['1', '']]);
    expect(parseCsv('a\rb\r')).toEqual([['a'], ['b']]);
  });

  it('detects tabs and semicolons from the header', () => {
    expect(detectDelimiter('a\tb\tc\n1,2\t3')).toBe('\t');
    expect(detectDelimiter('a;b;c')).toBe(';');
    expect(detectDelimiter('a,b')).toBe(',');
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('round-trips through toCsv', () => {
    const rows = [['name', 'note'], ['O"Neil, Pat', 'line\nbreak'], ['x', 3]];
    expect(parseCsv(toCsv(rows))).toEqual(rows.map((r) => r.map(String)));
  });
});
