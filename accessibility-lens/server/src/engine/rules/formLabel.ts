import type { Issue, Rule } from '../types.js';
import { describeElement, snippetOf, isHiddenFromA11y } from '../dom.js';

const LABELABLE = ['input', 'select', 'textarea'];
// Input types that do not need a visible text label.
const EXEMPT_INPUT_TYPES = new Set(['hidden', 'submit', 'reset', 'button', 'image']);

/**
 * WCAG 1.3.1 / 4.1.2. Form controls must have a programmatically associated
 * label, via <label for>, a wrapping <label>, aria-label, or aria-labelledby.
 */
export const formLabelRule: Rule = {
  id: 'form-label',
  title: 'Form control without a label',
  wcagCriterion: '4.1.2 Name, Role, Value',
  wcagLevel: 'A',
  defaultSeverity: 'serious',
  profiles: ['screen-reader', 'low-vision'],

  evaluate(doc: Document): Issue[] {
    const issues: Issue[] = [];
    const controls = Array.from(doc.querySelectorAll(LABELABLE.join(',')));
    for (const el of controls) {
      if (isHiddenFromA11y(el)) continue;
      const type = (el.getAttribute('type') ?? '').toLowerCase();
      if (el.tagName.toLowerCase() === 'input' && EXEMPT_INPUT_TYPES.has(type)) continue;

      if (hasAccessibleLabel(el, doc)) continue;

      issues.push({
        ruleId: this.id,
        title: this.title,
        severity: this.defaultSeverity,
        wcagCriterion: this.wcagCriterion,
        wcagLevel: this.wcagLevel,
        profiles: this.profiles,
        impact:
          'A screen reader announces this field with no name, so the user cannot tell what to type. Larger click targets from labels also help low-vision and motor users.',
        selector: describeElement(el),
        snippet: snippetOf(el),
        suggestedFix:
          'Associate a <label for="id"> with the control, wrap it in a <label>, or add aria-label="Email address".',
      });
    }
    return issues;
  },
};

function hasAccessibleLabel(el: Element, doc: Document): boolean {
  if (el.getAttribute('aria-label')?.trim()) return true;
  if (el.getAttribute('aria-labelledby')?.trim()) return true;
  if (el.getAttribute('title')?.trim()) return true;

  const id = el.getAttribute('id');
  if (id) {
    const escaped = cssEscape(id);
    if (doc.querySelector(`label[for="${escaped}"]`)) return true;
  }
  // Wrapped in a <label> with its own text.
  let parent: Element | null = el.parentElement;
  while (parent) {
    if (parent.tagName.toLowerCase() === 'label') {
      const text = (parent.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text) return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

/** Minimal attribute-value escaping for ids used in a selector. */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}
