// Minimal DOM builder: h('div', { class: 'x' }, 'text', child, [more]).

type Child = Node | string | null | undefined | false | Child[];
type Attrs = Record<string, string | boolean | undefined>;

export function h(tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'checked' || k === 'selected' || k === 'disabled') {
      (el as unknown as Record<string, boolean>)[k] = !!v;
      continue;
    }
    el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c);
  }
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
