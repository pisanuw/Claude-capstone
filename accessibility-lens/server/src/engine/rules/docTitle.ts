import type { Issue, Rule } from '../types.js';

/**
 * WCAG 2.4.2 Page Titled. The document needs a meaningful <title>; it is the
 * first thing a screen reader announces and the label for the browser tab.
 */
export const docTitleRule: Rule = {
  id: 'doc-title',
  title: 'Missing or empty page title',
  wcagCriterion: '2.4.2 Page Titled',
  wcagLevel: 'A',
  defaultSeverity: 'serious',
  profiles: ['screen-reader'],

  evaluate(doc: Document): Issue[] {
    const title = doc.querySelector('title');
    const text = (title?.textContent ?? '').trim();
    if (text) return [];
    return [
      {
        ruleId: this.id,
        title: this.title,
        severity: this.defaultSeverity,
        wcagCriterion: this.wcagCriterion,
        wcagLevel: this.wcagLevel,
        profiles: this.profiles,
        impact:
          'Screen reader users rely on the title to know which page they are on, especially with many tabs open. An empty title leaves them lost.',
        selector: 'head > title',
        snippet: title ? '<title></title>' : '<head> (no <title>)',
        suggestedFix:
          'Add a concise, unique title, e.g. <title>Accessibility Lens \u2013 Scan a page</title>.',
      },
    ];
  },
};
