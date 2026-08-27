import { beforeEach, describe, expect, it } from 'vitest';
import { decodeShare, encodeShare } from '../src/core/share';
import { makeGene, resetGeneIds } from '../src/core/segment';

beforeEach(() => resetGeneIds());

describe('share links', () => {
  it('round-trips a genome through the URL hash', () => {
    const genes = [
      makeGene('role', 'You are a poet.', []),
      makeGene('task', 'Write a haiku about naïve café rêves 🌧️.', []),
    ];
    const hash = encodeShare(genes);
    expect(hash.startsWith('#genome=')).toBe(true);
    const decoded = decodeShare(hash);
    expect(decoded?.map((g) => [g.type, g.text])).toEqual(genes.map((g) => [g.type, g.text]));
    expect(decoded?.[0].cues).toEqual(['from share link']);
  });

  it('produces URL-safe base64 (no +, /, =)', () => {
    const genes = [makeGene('task', '???>>>~~~ø∂ƒ', [])];
    const hash = encodeShare(genes);
    const payload = hash.slice('#genome='.length);
    expect(payload).not.toMatch(/[+/=]/);
  });

  it('rejects hashes that are not genome links', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('#')).toBeNull();
    expect(decodeShare('#other=abc')).toBeNull();
    expect(decodeShare('#genome=')).toBeNull();
  });

  it('rejects tampered payloads', () => {
    expect(decodeShare('#genome=!!!not-base64!!!')).toBeNull();
    const validJson = btoa(JSON.stringify({ v: 9, g: [] }));
    expect(decodeShare(`#genome=${validJson}`)).toBeNull();
    const wrongShape = btoa(JSON.stringify({ v: 1, g: [{ t: 'alien', x: 'hi' }] }));
    expect(decodeShare(`#genome=${wrongShape}`)).toBeNull();
    const emptyText = btoa(JSON.stringify({ v: 1, g: [{ t: 'task', x: ' ' }] }));
    expect(decodeShare(`#genome=${emptyText}`)).toBeNull();
  });

  it('rejects oversized payloads', () => {
    expect(decodeShare(`#genome=${'a'.repeat(30_000)}`)).toBeNull();
  });

  it('accepts the hash with or without the leading #', () => {
    const hash = encodeShare([makeGene('task', 'Do the thing.', [])]);
    expect(decodeShare(hash.slice(1))).not.toBeNull();
  });
});
