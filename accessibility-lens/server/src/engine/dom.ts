/**
 * Small DOM helpers shared across rules. Pure functions over DOM nodes.
 */

const SNIPPET_MAX = 160;

/** Produce a short, readable selector hint for an element. */
export function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.getAttribute('id');
  if (id) return `${tag}#${id}`;
  const cls = el.getAttribute('class');
  if (cls) {
    const first = cls.trim().split(/\s+/)[0];
    if (first) return `${tag}.${first}`;
  }
  return tag;
}

/** Return the element's outer HTML, collapsed and truncated for display. */
export function snippetOf(el: Element): string {
  const raw = el.outerHTML ?? '';
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= SNIPPET_MAX) return collapsed;
  return `${collapsed.slice(0, SNIPPET_MAX - 1)}\u2026`;
}

/** Visible text content of an element, normalized. */
export function visibleText(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * The accessible name of an element, computed with a pragmatic subset of the
 * WAI accessible-name algorithm: aria-label, then aria-labelledby target text,
 * then alt/value/title, then text content.
 */
export function accessibleName(el: Element, doc: Document): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) return text;
  }

  const alt = el.getAttribute('alt');
  if (alt !== null && alt.trim()) return alt.trim();

  const title = el.getAttribute('title');
  if (title && title.trim()) return title.trim();

  return visibleText(el);
}

/** True when an element is explicitly hidden from the accessibility tree. */
export function isHiddenFromA11y(el: Element): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.hasAttribute('hidden')) return true;
  const role = el.getAttribute('role');
  if (role === 'presentation' || role === 'none') return true;
  return false;
}
