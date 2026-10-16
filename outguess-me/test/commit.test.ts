import { describe, expect, it } from 'vitest';
import { commit, commitmentMessage, randomNonce, sha256Hex, verify } from '../src/core/commit';

describe('commitments', () => {
  it('hashes with SHA-256', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('makes random hex nonces', () => {
    const a = randomNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(randomNonce(4)).toMatch(/^[0-9a-f]{8}$/);
    expect(randomNonce()).not.toBe(a);
  });

  it('commits and verifies, and rejects a changed prediction or nonce', async () => {
    expect(commitmentMessage(1, 'ab')).toBe('outguess-me:J:ab');
    const c = await commit(1, 'deadbeef');
    expect(c.hash).toBe(await sha256Hex('outguess-me:J:deadbeef'));
    expect(await verify(c.hash, 1, 'deadbeef')).toBe(true);
    expect(await verify(c.hash, 0, 'deadbeef')).toBe(false);
    expect(await verify(c.hash, 1, 'deadbeee')).toBe(false);
    const r = await commit(0);
    expect(r.nonce).toHaveLength(32);
  });
});
