import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/core/csv';
import { decodeShare, encodeShare } from '../src/core/share';
import { SqlError } from '../src/core/types';

describe('share links', () => {
  it('round-trips a workspace through encode/decode', () => {
    const ws = {
      sql: "SELECT name FROM people WHERE city = 'Seattle' -- with a comment",
      tables: [
        parseCsv('people', 'id,name,city\n1,Ada,Seattle\n2,Grace,'),
        parseCsv('pets', 'id,owner_id,species\n1,1,"cat, tabby"'),
      ],
    };
    const hash = encodeShare(ws);
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/); // URL-hash safe, no padding
    const back = decodeShare(`#${hash}`);
    expect(back.sql).toBe(ws.sql);
    expect(back.tables).toEqual(ws.tables);
  });

  it('survives unicode in queries and data', () => {
    const ws = {
      sql: "SELECT * FROM t WHERE name = 'Łukasz 🎬'",
      tables: [parseCsv('t', 'name\nŁukasz 🎬')],
    };
    expect(decodeShare(encodeShare(ws))).toEqual(ws);
  });

  it('rejects garbage, wrong versions, and invalid tables', () => {
    expect(() => decodeShare('#')).toThrow(SqlError);
    expect(() => decodeShare('!!!not-base64!!!')).toThrow(/damaged/);
    expect(() => decodeShare(btoa('not json at all'))).toThrow(/valid replay/);
    expect(() => decodeShare(btoa('42'))).toThrow(/valid replay/);
    expect(() => decodeShare(btoa(JSON.stringify({ v: 99, sql: '', tables: [] })))).toThrow(/incompatible version/);
    expect(() => decodeShare(btoa(JSON.stringify({ v: 1, sql: 'x', tables: [{ name: 'bad name', csv: 'a\n1' }] }))))
      .toThrow(/invalid table/);
    expect(() => decodeShare(btoa(JSON.stringify({ v: 1, sql: 'x', tables: [{ name: 't' }] })))).toThrow(/invalid table/);
  });
});
