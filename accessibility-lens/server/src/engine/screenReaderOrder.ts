import type { ReadingOrderNode } from './types.js';
import { accessibleName, visibleText, isHiddenFromA11y } from './dom.js';

/**
 * Reconstruct the linear sequence a screen reader would encounter. This is one
 * of the most illuminating outputs for students: it strips away visual layout
 * and shows the page as a stream of announced roles and text.
 *
 * It is a pragmatic linearization, not a full accessibility-tree
 * implementation: we walk the DOM in document order and emit a node for each
 * element that a screen reader would meaningfully announce.
 */
export function buildReadingOrder(doc: Document): ReadingOrderNode[] {
  const body = doc.body;
  if (!body) return [];
  const nodes: ReadingOrderNode[] = [];
  walk(body, doc, nodes);
  return nodes;
}

const LANDMARK_ROLES: Record<string, string> = {
  header: 'banner',
  nav: 'navigation',
  main: 'main',
  footer: 'contentinfo',
  aside: 'complementary',
  form: 'form',
  section: 'region',
};

function walk(el: Element, doc: Document, out: ReadingOrderNode[]): void {
  for (const child of Array.from(el.children)) {
    if (isHiddenFromA11y(child)) continue;
    const tag = child.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      out.push({ role: 'heading', level: Number(tag.charAt(1)), text: visibleText(child) });
      continue; // heading text already captured
    }

    if (tag === 'a' && child.hasAttribute('href')) {
      out.push({ role: 'link', text: accessibleName(child, doc) || '(empty link)' });
      continue;
    }

    if (tag === 'button' || child.getAttribute('role') === 'button') {
      out.push({ role: 'button', text: accessibleName(child, doc) || '(unnamed button)' });
      continue;
    }

    if (tag === 'img') {
      const alt = child.getAttribute('alt');
      if (alt === '') continue; // decorative, skipped by screen readers
      out.push({ role: 'image', text: alt?.trim() || '(undescribed image)' });
      continue;
    }

    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      const type = (child.getAttribute('type') ?? 'text').toLowerCase();
      if (type === 'hidden') continue;
      out.push({ role: `form field (${type})`, text: accessibleName(child, doc) || '(unlabeled)' });
      continue;
    }

    if (LANDMARK_ROLES[tag]) {
      out.push({ role: `landmark: ${LANDMARK_ROLES[tag]}`, text: '' });
      walk(child, doc, out);
      continue;
    }

    if (tag === 'li') {
      out.push({ role: 'list item', text: directText(child) });
      walk(child, doc, out);
      continue;
    }

    if (tag === 'p') {
      const text = visibleText(child);
      if (text) out.push({ role: 'text', text });
      // Still descend for links/images nested inside the paragraph.
      walk(child, doc, out);
      continue;
    }

    walk(child, doc, out);
  }
}

/** Text owned directly by the element, excluding nested block content. */
function directText(el: Element): string {
  let text = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 /* TEXT_NODE */) text += node.textContent ?? '';
  }
  return text.replace(/\s+/g, ' ').trim();
}
