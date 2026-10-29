type Child = Node | string;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  if (tag === 'input' && 'value' in attrs) (node as HTMLInputElement).value = attrs.value as string;
  return node;
}

const NS = 'http://www.w3.org/2000/svg';

export function svg(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): SVGElement {
  const node = document.createElementNS(NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', { type: 'button', class: cls }, label);
  b.addEventListener('click', onClick);
  return b;
}

export function select(options: [value: string, label: string][], value: string, onChange: (v: string) => void): HTMLSelectElement {
  const s = el('select');
  for (const [v, label] of options) s.append(el('option', { value: v }, label));
  s.value = value;
  s.addEventListener('change', () => onChange(s.value));
  return s;
}
