import type { Issue, Rule } from '../types.js';
import { describeElement, snippetOf, accessibleName, isHiddenFromA11y } from '../dom.js';

/**
 * WCAG 4.1.2 Name, Role, Value. Buttons (including role="button") must have an
 * accessible name. Icon-only buttons with no aria-label are a common failure.
 */
export const buttonNameRule: Rule = {
  id: 'button-name',
  title: 'Button without an accessible name',
  wcagCriterion: '4.1.2 Name, Role, Value',
  wcagLevel: 'A',
  defaultSeverity: 'serious',
  profiles: ['screen-reader', 'keyboard-only'],

  evaluate(doc: Document): Issue[] {
    const issues: Issue[] = [];
    const candidates = Array.from(
      doc.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]'),
    );
    for (const el of candidates) {
      if (isHiddenFromA11y(el)) continue;

      // <input> buttons use the value attribute as their name.
      if (el.tagName.toLowerCase() === 'input') {
        const value = el.getAttribute('value')?.trim();
        const aria = el.getAttribute('aria-label')?.trim();
        if (value || aria) continue;
      } else if (accessibleName(el, doc)) {
        continue;
      }

      issues.push({
        ruleId: this.id,
        title: this.title,
        severity: this.defaultSeverity,
        wcagCriterion: this.wcagCriterion,
        wcagLevel: this.wcagLevel,
        profiles: this.profiles,
        impact:
          'A screen reader announces this only as "button", so the user cannot tell what it does before activating it.',
        selector: describeElement(el),
        snippet: snippetOf(el),
        suggestedFix:
          'Give the button visible text, or for icon-only buttons add aria-label, e.g. <button aria-label="Close dialog">.',
      });
    }
    return issues;
  },
};
