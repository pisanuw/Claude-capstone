import type { Issue, Rule } from '../types.js';

/**
 * WCAG 3.1.1 Language of Page. The root <html> element must declare a valid
 * language so a screen reader uses the correct pronunciation and voice.
 */
export const htmlLangRule: Rule = {
  id: 'html-lang',
  title: 'Page language not declared',
  wcagCriterion: '3.1.1 Language of Page',
  wcagLevel: 'A',
  defaultSeverity: 'moderate',
  profiles: ['screen-reader'],

  evaluate(doc: Document): Issue[] {
    const html = doc.documentElement;
    const lang = html.getAttribute('lang');
    if (lang && lang.trim()) return [];
    return [
      {
        ruleId: this.id,
        title: this.title,
        severity: this.defaultSeverity,
        wcagCriterion: this.wcagCriterion,
        wcagLevel: this.wcagLevel,
        profiles: this.profiles,
        impact:
          'Without a language, screen readers may read English content with a foreign-language voice, making it unintelligible.',
        selector: 'html',
        snippet: '<html>',
        suggestedFix: 'Set the language on the root element, e.g. <html lang="en">.',
      },
    ];
  },
};
