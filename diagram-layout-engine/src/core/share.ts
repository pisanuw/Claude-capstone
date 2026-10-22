// Share links: the diagram source travels in the URL fragment, deflated when
// the runtime supports CompressionStream, so nothing is sent to a server.

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export interface SharedState {
  source: string;
  /** Second version for the diff view. */
  after?: string;
  view?: string;
}

/** Fragment (without '#') encoding the state: 'z.' + deflate-raw, or 'p.' + plain UTF-8. */
export async function encodeState(state: SharedState): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  if (typeof CompressionStream !== 'undefined') {
    return `z.${toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
  }
  return `p.${toBase64Url(bytes)}`;
}

export async function decodeState(fragment: string): Promise<SharedState | null> {
  const f = fragment.replace(/^#/, '');
  try {
    let bytes: Uint8Array;
    if (f.startsWith('z.')) bytes = await pipe(fromBase64Url(f.slice(2)), new DecompressionStream('deflate-raw'));
    else if (f.startsWith('p.')) bytes = fromBase64Url(f.slice(2));
    else return null;
    const obj = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!obj || typeof obj !== 'object' || typeof (obj as SharedState).source !== 'string') return null;
    const s = obj as SharedState;
    return {
      source: s.source,
      ...(typeof s.after === 'string' ? { after: s.after } : {}),
      ...(typeof s.view === 'string' ? { view: s.view } : {}),
    };
  } catch {
    return null;
  }
}
