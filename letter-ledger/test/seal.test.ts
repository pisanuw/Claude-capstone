import { describe, expect, it } from 'vitest';
import { concat, fromBase64, fromBase64Url, newId, own, packText, sha256Hex, toBase64, toBase64Url, unpackText, utf8 } from '../src/core/codec';
import { fingerprint, generateKeyPair, isSealedBackup, isSealedPacket, seal, sealWithPassphrase, unseal, unsealWithPassphrase } from '../src/core/seal';

describe('codec', () => {
  it('round-trips base64 and base64url, including large buffers', () => {
    const big = new Uint8Array(100_000).map((_, i) => i * 7);
    expect(fromBase64(toBase64(big))).toEqual(big);
    const b = new Uint8Array([251, 255, 0, 62, 63]);
    const s = toBase64Url(b);
    expect(s).not.toMatch(/[+/=]/);
    expect(fromBase64Url(s)).toEqual(b);
  });

  it('packs JSON compactly', () => {
    const v = { a: 'x'.repeat(1000), b: [1, 2, 3] };
    const t = packText(v);
    expect(t.length).toBeLessThan(100);
    expect(unpackText(t)).toEqual(v);
  });

  it('hashes, makes ids and joins bytes', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(newId()).toMatch(/^[0-9a-f]{16}$/);
    expect(newId()).not.toBe(newId());
    expect(concat(utf8('ab'), utf8('c'))).toEqual(utf8('abc'));
    const shared = new Uint8Array(new SharedArrayBuffer(2));
    expect(own(shared).buffer).toBeInstanceOf(ArrayBuffer);
  });
});

describe('packet sealing', () => {
  it('seals to a public key and opens with the private key', async () => {
    const k = await generateKeyPair();
    const sealed = await seal(k.publicKey, utf8('hello professor'));
    expect(isSealedPacket(sealed)).toBe(true);
    expect(new TextDecoder().decode(await unseal(k.privateKey, sealed))).toBe('hello professor');
  });

  it('refuses another key, tampering and non-packets', async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const sealed = await seal(a.publicKey, utf8('secret'));
    await expect(unseal(b.privateKey, sealed)).rejects.toThrow(/different key/);
    const bent = sealed.slice();
    bent[bent.length - 1]! ^= 1;
    await expect(unseal(a.privateKey, bent)).rejects.toThrow(/altered/);
    await expect(unseal(a.privateKey, utf8('LLP1short'))).rejects.toThrow(/Not a Letter Ledger packet/);
    await expect(unseal(a.privateKey, utf8('{"json":true}'))).rejects.toThrow(/Not a Letter Ledger packet/);
  });

  it('prints a stable fingerprint', async () => {
    const k = await generateKeyPair();
    const f = await fingerprint(k.publicKey);
    expect(f).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/);
    expect(await fingerprint(k.publicKey)).toBe(f);
  });
});

describe('passphrase sealing', () => {
  it('round-trips and rejects a wrong passphrase', async () => {
    const sealed = await sealWithPassphrase('correct horse', utf8('backup'), 1000);
    expect(isSealedBackup(sealed)).toBe(true);
    expect(isSealedPacket(sealed)).toBe(false);
    expect(new TextDecoder().decode(await unsealWithPassphrase('correct horse', sealed))).toBe('backup');
    await expect(unsealWithPassphrase('wrong', sealed)).rejects.toThrow(/Wrong passphrase/);
    await expect(unsealWithPassphrase('x', utf8('LLB1'))).rejects.toThrow(/Not an encrypted/);
  });

  it('reads the iteration count from the file', async () => {
    const sealed = await sealWithPassphrase('p', utf8('x'), 1234);
    expect(new DataView(sealed.buffer, 4, 4).getUint32(0)).toBe(1234);
    // A copy at a non-zero offset still opens.
    const padded = new Uint8Array(sealed.length + 3);
    padded.set(sealed, 3);
    expect(new TextDecoder().decode(await unsealWithPassphrase('p', padded.subarray(3)))).toBe('x');
  });
});
