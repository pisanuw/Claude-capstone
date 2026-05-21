import type { Issue, Rule } from '../types.js';

/**
 * WCAG 1.4.4 Resize Text. A viewport meta tag that disables zooming
 * (user-scalable=no or maximum-scale=1) traps low-vision users who need to
 * pinch-zoom on mobile.
 */
export const viewportZoomRule: Rule = {
  id: 'viewport-zoom',
  title: 'Zoom disabled by viewport meta',
  wcagCriterion: '1.4.4 Resize Text',
  wcagLevel: 'AA',
  defaultSeverity: 'serious',
  profiles: ['low-vision'],

  evaluate(doc: Document): Issue[] {
    const meta = doc.querySelector('meta[name="viewport"]');
    if (!meta) return [];
    const content = (meta.getAttribute('content') ?? '').toLowerCase();

    const blocksScaling = /user-scalable\s*=\s*(no|0)/.test(content);
    const maxScaleMatch = content.match(/maximum-scale\s*=\s*([0-9.]+)/);
    const lowMaxScale = maxScaleMatch ? Number(maxScaleMatch[1]) < 2 : false;

    if (!blocksScaling && !lowMaxScale) return [];

    return [
      {
        ruleId: this.id,
        title: this.title,
        severity: this.defaultSeverity,
        wcagCriterion: this.wcagCriterion,
        wcagLevel: this.wcagLevel,
        profiles: this.profiles,
        impact:
          'Low-vision users cannot pinch-zoom to read small text on mobile because the page forbids scaling.',
        selector: 'meta[name="viewport"]',
        snippet: `<meta name="viewport" content="${content}">`,
        suggestedFix:
          'Remove user-scalable=no and any maximum-scale below 2, e.g. <meta name="viewport" content="width=device-width, initial-scale=1">.',
      },
    ];
  },
};
