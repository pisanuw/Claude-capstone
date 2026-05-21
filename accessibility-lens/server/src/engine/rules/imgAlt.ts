import type { Issue, Rule } from '../types.js';
import { describeElement, snippetOf, isHiddenFromA11y } from '../dom.js';

/**
 * WCAG 1.1.1 Non-text Content. Every <img> that conveys meaning needs an alt
 * attribute. An *empty* alt ("") is valid and intentional (decorative), so we
 * only flag a missing alt attribute entirely.
 */
export const imgAltRule: Rule = {
  id: 'img-alt',
  title: 'Image missing alt text',
  wcagCriterion: '1.1.1 Non-text Content',
  wcagLevel: 'A',
  defaultSeverity: 'serious',
  profiles: ['screen-reader', 'low-vision'],

  evaluate(doc: Document): Issue[] {
    const issues: Issue[] = [];
    for (const img of Array.from(doc.querySelectorAll('img'))) {
      if (isHiddenFromA11y(img)) continue;
      if (img.hasAttribute('alt')) continue;
      issues.push({
        ruleId: this.id,
        title: this.title,
        severity: this.defaultSeverity,
        wcagCriterion: this.wcagCriterion,
        wcagLevel: this.wcagLevel,
        profiles: this.profiles,
        impact:
          'A screen reader will announce the file name or simply "image", giving a blind user no idea what the picture shows.',
        selector: describeElement(img),
        snippet: snippetOf(img),
        suggestedFix:
          'Add a descriptive alt attribute, e.g. alt="Student presenting a poster". If the image is purely decorative, use alt="" so it is skipped.',
      });
    }
    return issues;
  },
};
