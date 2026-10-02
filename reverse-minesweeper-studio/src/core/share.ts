import { type Board, MAX_SIZE, MIN_SIZE, cellCount, createBoard } from './board';

/**
 * Boards travel in the URL fragment as `v1.<w>x<h>.<start>.<bits>`, where
 * `bits` is the mine bitmap (row-major, least significant bit first) in
 * base64url. A 40x40 board is 1,600 bits: about 270 characters.
 */
const VERSION = 'v1';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function encodeBoard(board: Board): string {
  const bytes = new Uint8Array(Math.ceil(cellCount(board) / 8));
  board.mines.forEach((m, i) => {
    if (m) bytes[i >> 3]! |= 1 << (i & 7);
  });
  return `${VERSION}.${board.width}x${board.height}.${board.start}.${toBase64Url(bytes)}`;
}

export function decodeBoard(code: string): Board {
  const parts = code.trim().split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Not a Reverse Minesweeper board link.');
  const size = /^(\d+)x(\d+)$/.exec(parts[1]!);
  if (!size) throw new Error('Board size is malformed.');
  const width = Number(size[1]);
  const height = Number(size[2]);
  if (width < MIN_SIZE || height < MIN_SIZE || width > MAX_SIZE || height > MAX_SIZE) {
    throw new Error('Board size is out of range.');
  }
  const board = createBoard(width, height);
  if (!/^-?\d+$/.test(parts[2]!)) throw new Error('Start cell is malformed.');
  const start = Number(parts[2]);
  if (start < -1 || start >= cellCount(board)) throw new Error('Start cell is off the board.');
  board.start = start;
  const bytes = fromBase64Url(parts[3]!);
  if (bytes.length !== Math.ceil(cellCount(board) / 8)) throw new Error('Mine bitmap has the wrong length.');
  for (let i = 0; i < cellCount(board); i++) board.mines[i] = (bytes[i >> 3]! & (1 << (i & 7))) !== 0;
  return board;
}

export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += ALPHABET[n & 63]!;
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error('Mine bitmap is not valid base64url.');
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    let n = 0;
    for (let k = 0; k < 4; k++) n = (n << 6) | (k < chunk.length ? ALPHABET.indexOf(chunk[k]!) : 0);
    out.push((n >> 16) & 255);
    if (chunk.length > 2) out.push((n >> 8) & 255);
    if (chunk.length > 3) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

export type Route = { mode: 'edit' | 'play'; board: Board } | null;

/** Parse `#edit=<code>` or `#play=<code>`; anything else is no route. */
export function parseHash(hash: string): Route {
  const m = /^#?(edit|play)=(.+)$/.exec(hash);
  if (!m) return null;
  return { mode: m[1] as 'edit' | 'play', board: decodeBoard(decodeURIComponent(m[2]!)) };
}

export function hashFor(mode: 'edit' | 'play', board: Board): string {
  return `#${mode}=${encodeBoard(board)}`;
}
