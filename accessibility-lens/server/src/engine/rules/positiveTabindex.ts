import type { Issue, Rule } from '../types.js';
import { describeElement, snippetOf } from '../dom.js';

/**
 * WCAG 2.4.3 Focus Order. A positive tabindex forces an explicit tab order
 * that almost always diverges from the visual/DOM order, disorienting
 * keyboard-only users. tabindex of 0 or -1 is fine.
 */
export const positiveTabindexRule: Rule = {
  id: 'positive-tabindex',
  title: 'Positive tabindex disrupts focus order',
  wcagCriterion: '2.4.3 Focus Order',
  wcagLevel: 'A',
  defaultSeverity: 'moderate',
  profiles: ['keyboard-only'],

  evaluate(doc: Document): Issue[] {
    const issues: Issue[] = [];
    for (const el of Array.from(doc.querySelectorAll('[tabindex]'))) {
      const raw = el.getAttribute('tabindex') ?? '';
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) continue;
      issues.push({
        ruleId: this.id,
        title: this.title,
        severity: this.defaultSeverity,
        wcagCriterion: this.wcagCriterion,
        wcagLevel: this.wcagLevel,
        profiles: this.profiles,
        impact:
          'A positive tabindex pulls this element out of the natural tab order, so keyboard users jump around the page unpredictably.',
        selector: describeElement(el),
        snippet: snippetOf(el),
        suggestedFix:
          'Use tabindex="0" to make an element focusable in DOM order, or restructure the markup so the visual order matches the source order.',
      });
    }
    return issues;
  },
};
