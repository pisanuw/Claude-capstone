import type { Anchor } from '../core/types';

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Escapes text and renders `backticked` spans as code. */
export function prose(s: string): string {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function codeBlock(a: Anchor): string {
  const lines = a.snippet.split('\n');
  const body = lines.map((l, i) => `<span class="ln${a.line + i === a.focus ? ' focus' : ''}" data-n="${a.line + i}">${esc(l) || ' '}</span>`).join('');
  return `<p class="small muted">${esc(a.file)}, from line ${a.line}${a.focus ? ` (line ${a.focus} highlighted)` : ''}</p><pre class="code" tabindex="0" aria-label="Code from ${esc(a.file)}">${body}</pre>`;
}

export function download(name: string, text: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function store<T>(key: string, value?: T): T | null {
  try {
    if (value === undefined) {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows and full quotas: the app still works, it just forgets on reload.
  }
  return null;
}

export function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
