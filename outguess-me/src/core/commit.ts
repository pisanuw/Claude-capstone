/**
 * Commit-then-reveal. Before each press the page shows SHA-256 of
 * "outguess-me:<F|J>:<nonce>". After the press it reveals the prediction and
 * the nonce, and anyone can recompute the hash to check the oracle did not
 * change its mind after seeing the key.
 */

import { KEY_FOR_BIT, type Bit } from './predictor';

export interface Commitment {
  prediction: Bit;
  nonce: string;
  hash: string;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

export function randomNonce(bytes = 16): string {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(bytes)));
}

export function commitmentMessage(prediction: Bit, nonce: string): string {
  return `outguess-me:${KEY_FOR_BIT[prediction]}:${nonce}`;
}

export async function commit(prediction: Bit, nonce: string = randomNonce()): Promise<Commitment> {
  return { prediction, nonce, hash: await sha256Hex(commitmentMessage(prediction, nonce)) };
}

export async function verify(hash: string, prediction: Bit, nonce: string): Promise<boolean> {
  return (await sha256Hex(commitmentMessage(prediction, nonce))) === hash;
}
