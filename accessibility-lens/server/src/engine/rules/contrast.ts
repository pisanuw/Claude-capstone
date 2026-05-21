import type { Issue, Rule } from '../types.js';
import { describeElement, snippetOf, visibleText, isHiddenFromA11y } from '../dom.js';
import { parseColor, contrastRatio, styleValue } from '../color.js';

// WCAG AA threshold for normal-size text.
const AA_NORMAL = 4.5;

/**
 * WCAG 1.4.3 Contrast (Minimum). Best-effort: we can only see colors set via
 * inline style attributes, since resolving a full stylesheet cascade requires
 * a real browser. We walk text-bearing elements that set an inline color and
 * find the nearest ancestor inline background to compare against, defaulting
 * to white. See ASSUMPTIONS.md for why this is intentionally limited.
 */
export const contrastRule: Rule = {
  id: 'contrast',
  title: 'Low color contrast (inline styles)',
  wcagCriterion: '1.4.3 Contrast (Minimum)',
  wcagLevel: 'AA',
  defaultSeverity: 'serious',
  profiles: ['low-vision', 'color-blindness'],

  evaluate(doc: Document): Issue[] {
    const issues: Issue[] = [];
    const elements = Array.from(doc.querySelectorAll('[style]'));

    for (const el of elements) {
      if (isHiddenFromA11y(el)) continue;
      const style = el.getAttribute('style') ?? '';
      const fgRaw = styleValue(style, 'color');
      if (!fgRaw) continue;
      const fg = parseColor(fgRaw);
      if (!fg) continue;
      // Only meaningful if the element actually renders text.
      if (!visibleText(el)) continue;

      const bg = resolveBackground(el);
      const ratio = contrastRatio(fg, bg);
      if (ratio >= AA_NORMAL) continue;

      issues.push({
        ruleId: this.id,
        title: this.title,
        severity: this.defaultSeverity,
        wcagCriterion: this.wcagCriterion,
        wcagLevel: this.wcagLevel,
        profiles: this.profiles,
        impact: `Text contrast is about ${ratio.toFixed(2)}:1, below the 4.5:1 minimum. Low-vision and color-blind readers may not be able to read it.`,
        selector: describeElement(el),
        snippet: snippetOf(el),
        suggestedFix: `Increase contrast to at least 4.5:1. Darken the text or lighten the background; ${ratio.toFixed(2)}:1 is currently failing.`,
      });
    }
    return issues;
  },
};

/** Nearest inline background-color up the tree, defaulting to white. */
function resolveBackground(el: Element): { r: number; g: number; b: number } {
  let node: Element | null = el;
  while (node) {
    const style = node.getAttribute('style');
    if (style) {
      const bg = parseColor(styleValue(style, 'background-color') ?? styleValue(style, 'background'));
      if (bg) return bg;
    }
    node = node.parentElement;
  }
  return { r: 255, g: 255, b: 255 };
}
