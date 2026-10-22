/**
 * Encryption. Each professor holds an ECDH P-256 key pair generated in their
 * browser; the public half rides in the request link, so a student's packet
 * is sealed to the professor before it leaves the student's browser
 * (ephemeral ECDH, HKDF-SHA-256, AES-256-GCM). Anyone who intercepts the
 * emailed file sees only ciphertext. Backups are sealed with a passphrase
 * instead (PBKDF2-SHA-256, AES-256-GCM).
 */

import { concat, fromBase64Url, own, sha256Hex, toBase64Url, utf8, type Bytes } from './codec';

const PACKET_MAGIC = utf8('LLP1');
const BACKUP_MAGIC = utf8('LLB1');
const INFO = utf8('letter-ledger packet v1');
const PUB_LEN = 65;
const IV_LEN = 12;
const SALT_LEN = 16;
export const BACKUP_ITERATIONS = 600_000;

const subtle = () => globalThis.crypto.subtle;
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;

export interface KeyPair {
  publicKey: string;
  privateKey: JsonWebKey;
}

export async function generateKeyPair(): Promise<KeyPair> {
  const pair = (await subtle().generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
  return { publicKey: toBase64Url(raw), privateKey: await subtle().exportKey('jwk', pair.privateKey) };
}

/** Short, human-checkable fingerprint of a public key: "3f2a-91c0-77de". */
export async function fingerprint(publicKey: string): Promise<string> {
  const hex = await sha256Hex(fromBase64Url(publicKey));
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

async function aesKey(shared: ArrayBuffer, salt: Bytes): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: INFO }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function startsWith(bytes: Uint8Array, magic: Uint8Array): boolean {
  return bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
}

export function isSealedPacket(bytes: Uint8Array): boolean {
  return startsWith(bytes, PACKET_MAGIC);
}

export function isSealedBackup(bytes: Uint8Array): boolean {
  return startsWith(bytes, BACKUP_MAGIC);
}

export async function seal(publicKey: string, plain: Uint8Array): Promise<Bytes> {
  const recipient = await subtle().importKey('raw', fromBase64Url(publicKey), ECDH, false, []);
  const eph = (await subtle().generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair;
  const ephPub = new Uint8Array(await subtle().exportKey('raw', eph.publicKey));
  const shared = await subtle().deriveBits({ name: 'ECDH', public: recipient }, eph.privateKey, 256);
  const key = await aesKey(shared, ephPub);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: PACKET_MAGIC }, key, own(plain)));
  return concat(PACKET_MAGIC, ephPub, iv, ct);
}

/** Throws if the bytes are not a packet, were sealed to another key, or were altered. */
export async function unseal(privateKey: JsonWebKey, sealed: Uint8Array): Promise<Bytes> {
  if (!isSealedPacket(sealed) || sealed.length < PACKET_MAGIC.length + PUB_LEN + IV_LEN + 16) throw new Error('Not a Letter Ledger packet.');
  let at = PACKET_MAGIC.length;
  const ephPub = sealed.slice(at, (at += PUB_LEN));
  const iv = sealed.slice(at, (at += IV_LEN));
  const ct = sealed.slice(at);
  const mine = await subtle().importKey('jwk', privateKey, ECDH, false, ['deriveBits']);
  const theirs = await subtle().importKey('raw', ephPub, ECDH, false, []);
  const shared = await subtle().deriveBits({ name: 'ECDH', public: theirs }, mine, 256);
  const key = await aesKey(shared, ephPub);
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: PACKET_MAGIC }, key, ct));
  } catch {
    throw new Error('This packet was sealed to a different key, or it was altered in transit.');
  }
}

async function passKey(passphrase: string, salt: Bytes, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', utf8(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Layout: magic, 4-byte big-endian iteration count, salt, iv, ciphertext. */
export async function sealWithPassphrase(passphrase: string, plain: Uint8Array, iterations = BACKUP_ITERATIONS): Promise<Bytes> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const iter = new Uint8Array(4);
  new DataView(iter.buffer).setUint32(0, iterations);
  const key = await passKey(passphrase, salt, iterations);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: BACKUP_MAGIC }, key, own(plain)));
  return concat(BACKUP_MAGIC, iter, salt, iv, ct);
}

export async function unsealWithPassphrase(passphrase: string, sealed: Uint8Array): Promise<Bytes> {
  if (!isSealedBackup(sealed) || sealed.length < BACKUP_MAGIC.length + 4 + SALT_LEN + IV_LEN + 16) throw new Error('Not an encrypted Letter Ledger backup.');
  let at = BACKUP_MAGIC.length;
  const iterations = new DataView(sealed.buffer, sealed.byteOffset + at, 4).getUint32(0);
  at += 4;
  const salt = sealed.slice(at, (at += SALT_LEN));
  const iv = sealed.slice(at, (at += IV_LEN));
  const key = await passKey(passphrase, salt, iterations);
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: BACKUP_MAGIC }, key, sealed.slice(at)));
  } catch {
    throw new Error('Wrong passphrase, or the backup file is damaged.');
  }
}
