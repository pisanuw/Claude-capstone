const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Human-readable size using 1024-based units, e.g. "1.5 MB". */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  let v = n;
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : v < 10 ? 2 : v < 100 ? 1 : 0;
  return `${v.toFixed(digits)} ${UNITS[i]}`;
}

/** Percentage string with one decimal, guarded against a zero denominator. */
export function formatPct(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  const p = (part / whole) * 100;
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

/** Normalize a path: forward slashes, no leading "./" or "/", no trailing slash, no empty segments. */
export function normalizePath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s !== '' && s !== '.')
    .join('/');
}

/** Drop the first path segment (used for `webkitRelativePath`, which starts with the picked folder's name). */
export function stripFirstSegment(p: string): string {
  const n = normalizePath(p);
  const i = n.indexOf('/');
  return i < 0 ? '' : n.slice(i + 1);
}

export function baseName(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}

export function dirName(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

/** Lower-case extension without the dot, or '' when there is none. Dotfiles like `.env` have no extension. */
export function extensionOf(p: string): string {
  const b = baseName(p);
  const i = b.lastIndexOf('.');
  if (i <= 0) return '';
  return b.slice(i + 1).toLowerCase();
}
