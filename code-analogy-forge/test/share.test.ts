import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare } from '../src/core/share';

describe('share links', () => {
  it('round-trips an analogy id and audience', () => {
    const hash = encodeShare({ analogyId: 'recursion--cooking', audience: 'child' });
    const decoded = decodeShare(`#${hash}`);
    expect(decoded).toEqual({ analogyId: 'recursion--cooking', audience: 'child' });
  });

  it('round-trips a note, including non-ASCII text', () => {
    const note = 'For Tuesday’s CS1 lecture: emphasize the base case! éü❤';
    const hash = encodeShare({ analogyId: 'stack--cooking', audience: 'adult', note });
    expect(decodeShare(hash)?.note).toBe(note);
  });

  it('produces URL-safe output', () => {
    const hash = encodeShare({
      analogyId: 'binary-search--library',
      audience: 'undergrad',
      note: 'lots?of&unsafe=chars// and spaces',
    });
    expect(hash).toMatch(/^share=[A-Za-z0-9_-]+$/);
  });

  it('truncates very long notes', () => {
    const hash = encodeShare({ analogyId: 'queue--travel', audience: 'adult', note: 'x'.repeat(2000) });
    expect(decodeShare(hash)?.note?.length).toBe(500);
  });

  it('omits empty notes', () => {
    const hash = encodeShare({ analogyId: 'queue--travel', audience: 'adult', note: '   ' });
    expect(decodeShare(hash)?.note).toBeUndefined();
  });

  it('returns null when there is no share parameter', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('#other=thing')).toBeNull();
  });

  it('returns null for malformed base64 or JSON', () => {
    expect(decodeShare('#share=!!!not-base64!!!')).toBeNull();
    expect(decodeShare('#share=aGVsbG8')).toBeNull();
  });

  it('returns null for unknown analogies or audiences', () => {
    const unknownAnalogy = btoa(JSON.stringify({ v: 1, a: 'recursion--nope', u: 'child' }));
    expect(decodeShare(`#share=${unknownAnalogy}`)).toBeNull();
    const unknownAudience = btoa(JSON.stringify({ v: 1, a: 'recursion--cooking', u: 'wizard' }));
    expect(decodeShare(`#share=${unknownAudience}`)).toBeNull();
  });

  it('returns null for other payload versions', () => {
    const v2 = btoa(JSON.stringify({ v: 2, a: 'recursion--cooking', u: 'child' }));
    expect(decodeShare(`#share=${v2}`)).toBeNull();
  });

  it('finds the share parameter among other hash parameters', () => {
    const hash = encodeShare({ analogyId: 'tree--sports', audience: 'highschool' });
    expect(decodeShare(`#foo=1&${hash}`)?.analogyId).toBe('tree--sports');
  });
});
