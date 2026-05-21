import type { Issue, Rule } from '../types.js';
import { describeElement, snippetOf, visibleText, isHiddenFromA11y } from '../dom.js';

/**
 * WCAG 1.3.1 Info and Relationships. Headings should form a logical outline:
 * exactly one h1 ideally, and levels should not jump (h2 -> h4). Screen reader
 * users navigate by heading, so a broken outline is a broken map of the page.
 */
export const headingOrderRule: Rule = {
  id: 'heading-order',
  title: 'Broken heading structure',
  wcagCriterion: '1.3.1 Info and Relationships',
  wcagLevel: 'A',
  defaultSeverity: 'moderate',
  profiles: ['screen-reader'],

  evaluate(doc: Document): Issue[] {
    const issues: Issue[] = [];
    const headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(
      (h) => !isHiddenFromA11y(h),
    );

    if (headings.length === 0) {
      issues.push(this.makeIssue('No headings found on the page.', 'document', '<body>'));
      return issues;
    }

    const h1Count = headings.filter((h) => h.tagName.toLowerCase() === 'h1').length;
    if (h1Count === 0) {
      issues.push(
        this.makeIssue(
          'The page has no <h1>, so screen reader users have no top-level landmark for the main topic.',
          describeElement(headings[0]),
          snippetOf(headings[0]),
        ),
      );
    }

    let previous = 0;
    for (const h of headings) {
      const level = Number(h.tagName.charAt(1));
      if (previous !== 0 && level > previous + 1) {
        issues.push(
          this.makeIssue(
            `Heading level jumps from h${previous} to h${level} ("${visibleText(h).slice(0, 40)}"), skipping a level and confusing the outline.`,
            describeElement(h),
            snippetOf(h),
          ),
        );
      }
      previous = level;
    }
    return issues;
  },

  makeIssue(impact: string, selector: string, snippet: string): Issue {
    return {
      ruleId: this.id,
      title: this.title,
      severity: this.defaultSeverity,
      wcagCriterion: this.wcagCriterion,
      wcagLevel: this.wcagLevel,
      profiles: this.profiles,
      impact,
      selector,
      snippet,
      suggestedFix:
        'Use a single <h1> for the page topic and nest headings without skipping levels (h2 then h3, not h2 then h4).',
    };
  },
} as Rule & { makeIssue(impact: string, selector: string, snippet: string): Issue };
