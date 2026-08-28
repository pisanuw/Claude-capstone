/**
 * Serverless share links: the snippet travels in the URL hash as
 * base64url-encoded UTF-8. Decoding failures return null so a mangled link
 * degrades to the normal editor instead of an error page.
 */

export function encodeShare(codeText: string): string {
  const bytes = new TextEncoder().encode(codeText);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(hash: string): string | null {
  const raw = hash.startsWith('#code=') ? hash.slice('#code='.length) : null;
  if (!raw) return null;
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
