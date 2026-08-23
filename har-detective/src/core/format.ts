/** Human-readable byte and time formatting used by the report and the UI. */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Shorten a URL path for labels: keep the last segments within a budget. */
export function shortPath(path: string, max = 40): string {
  if (path.length <= max) return path;
  const tail = path.slice(-(max - 1));
  const cut = tail.indexOf('/');
  return `…${cut >= 0 ? tail.slice(cut) : tail}`;
}
