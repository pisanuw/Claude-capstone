import type { ScenarioSpec } from './types';

/** Everything a share link can carry. */
export interface SharePayload {
  /** Instructor scenario (raw spec, so generators stay compact). */
  scenario?: ScenarioSpec;
  /** Policy source to preload in the editor. */
  code?: string;
  /** Built-in scenario id to select when no scenario is embedded. */
  scenarioId?: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const blob = new Blob([bytes as BlobPart]);
  const result = blob.stream().pipeThrough(stream);
  return new Uint8Array(await new Response(result).arrayBuffer());
}

/** Compress a payload into a URL fragment value (deflate-raw + base64url). */
export async function encodeShare(payload: SharePayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const packed = await pipe(json, new CompressionStream('deflate-raw'));
  return 'v1.' + bytesToBase64Url(packed);
}

/** Inverse of encodeShare. Returns null for anything that is not a share fragment. */
export async function decodeShare(fragment: string): Promise<SharePayload | null> {
  const text = fragment.replace(/^#/, '');
  if (!text.startsWith('v1.')) return null;
  try {
    const packed = base64UrlToBytes(text.slice(3));
    const json = await pipe(packed, new DecompressionStream('deflate-raw'));
    const obj = JSON.parse(new TextDecoder().decode(json)) as unknown;
    if (!obj || typeof obj !== 'object') return null;
    const p = obj as Record<string, unknown>;
    const out: SharePayload = {};
    if (p.scenario && typeof p.scenario === 'object') out.scenario = p.scenario as ScenarioSpec;
    if (typeof p.code === 'string') out.code = p.code;
    if (typeof p.scenarioId === 'string') out.scenarioId = p.scenarioId;
    return out;
  } catch {
    return null;
  }
}
