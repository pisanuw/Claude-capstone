import type { Issue, Rule } from '../types.js';

/**
 * WCAG 4.1.1 Parsing (and a practical ARIA concern). Duplicate ids break
 * label[for], aria-labelledby and aria-describedby references, because those
 * resolve to the first matching id only.
 */
export const duplicateIdRule: Rule = {
  id: 'duplicate-id',
  title: 'Duplicate id attribute',
  wcagCriterion: '4.1.1 Parsing',
  wcagLevel: 'A',
  defaultSeverity: 'moderate',
  profiles: ['screen-reader'],

  evaluate(doc: Document): Issue[] {
    const seen = new Map<string, number>();
    for (const el of Array.from(doc.querySelectorAll('[id]'))) {
      const id = el.getAttribute('id');
      if (!id) continue;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }

    const issues: Issue[] = [];
    for (const [id, count] of seen) {
      if (count < 2) continue;
      issues.push({
        ruleId: this.id,
        title: this.title,
        severity: this.defaultSeverity,
        wcagCriterion: this.wcagCriterion,
        wcagLevel: this.wcagLevel,
        profiles: this.profiles,
        impact: `The id "${id}" appears ${count} times. ARIA and label associations point at only the first one, so some controls lose their names.`,
        selector: `[id="${id}"]`,
        snippet: `id="${id}" (\u00d7${count})`,
        suggestedFix: `Make every id unique. Rename the duplicate "${id}" values, e.g. "${id}-1", "${id}-2".`,
      });
    }
    return issues;
  },
};
