// Small DOM helpers shared by the views.

import { esc } from '../core/svg';

export { esc };

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
}

export function html(el: HTMLElement, markup: string): HTMLElement {
  el.innerHTML = markup;
  return el;
}

export function options(list: { value: string; label: string }[], selected: string): string {
  return list.map((o) => `<option value="${esc(o.value)}"${o.value === selected ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
}

export function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function toast(message: string): void {
  let t = document.querySelector<HTMLElement>('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = message;
  t.classList.add('show');
  window.clearTimeout(Number(t.dataset.timer));
  t.dataset.timer = String(window.setTimeout(() => t!.classList.remove('show'), 1800));
}

export function storageGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the app works without it.
  }
}

export const fmt = (n: number): string => n.toLocaleString('en-US');
