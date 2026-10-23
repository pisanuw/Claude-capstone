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
