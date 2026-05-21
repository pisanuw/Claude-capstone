import type { Issue, Rule } from '../types.js';
import { describeElement, snippetOf, accessibleName, isHiddenFromA11y } from '../dom.js';

const GENERIC = new Set([
  'click here',
  'here',
  'read more',
  'more',
  'link',
  'this',
  'learn more',
  'details',
]);

/**
 * WCAG 2.4.4 Link Purpose. Links must make sense out of context. Screen reader
 * users often pull up a list of all links; "click here" x12 tells them nothing.
 */
export const linkTextRule: Rule = {
  id: 'link-text',
  title: 'Unclear or empty link text',
  wcagCriterion: '2.4.4 Link Purpose (In Context)',
  wcagLevel: 'A',
  defaultSeverity: 'moderate',
  profiles: ['screen-reader'],

  evaluate(doc: Document): Issue[] {
    const issues: Issue[] = [];
    for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
      if (isHiddenFromA11y(a)) continue;
      const name = accessibleName(a, doc).toLowerCase();

      if (!name) {
        issues.push(
          this.makeIssue(
            'This link has no text at all, so a screen reader announces only its URL or "link".',
            a,
            'critical',
          ),
        );
        continue;
      }
      if (GENERIC.has(name)) {
        issues.push(
          this.makeIssue(
            `Link text "${name}" is meaningless out of context; in a links list it gives no clue where it goes.`,
            a,
            'moderate',
          ),
        );
      }
    }
    return issues;
  },

  makeIssue(impact: string, el: Element, severity: Issue['severity']): Issue {
    return {
      ruleId: this.id,
      title: this.title,
      severity,
      wcagCriterion: this.wcagCriterion,
      wcagLevel: this.wcagLevel,
      profiles: this.profiles,
      impact,
      selector: describeElement(el),
      snippet: snippetOf(el),
      suggestedFix:
        'Write link text that describes the destination, e.g. "Download the syllabus (PDF)" instead of "click here". For icon-only links add aria-label.',
    };
  },
} as Rule & { makeIssue(impact: string, el: Element, severity: Issue['severity']): Issue };
