import type { ChangeType, Region } from './types';

/** Display color per change type (shared by overlay, legend, and report). */
export const TYPE_COLORS: Record<ChangeType, string> = {
  layout: '#8b5cf6',
  spacing: '#0ea5e9',
  color: '#f59e0b',
  text: '#10b981',
  visibility: '#64748b',
  'element-added': '#22c55e',
  'element-removed': '#ef4444',
};

export const TYPE_LABELS: Record<ChangeType, string> = {
  layout: 'Layout shift',
  spacing: 'Spacing',
  color: 'Color',
  text: 'Text edit',
  visibility: 'Visibility',
  'element-added': 'Added',
  'element-removed': 'Removed',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface OverlayOptions {
  /** Only render these types (default: all). */
  visibleTypes?: ChangeType[];
  /** data-index attribute base for click handling (default 0). */
  interactive?: boolean;
}

/**
 * Standalone SVG overlay for one image of the pair. Regions are numbered so
 * the list beside the image can reference them.
 */
export function buildOverlaySvg(
  width: number,
  height: number,
  regions: Region[],
  options: OverlayOptions = {},
): string {
  const visible = options.visibleTypes ? new Set(options.visibleTypes) : null;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
      `width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet">`,
  ];
  regions.forEach((r, i) => {
    if (visible && !visible.has(r.type)) return;
    const c = TYPE_COLORS[r.type];
    const interactive = options.interactive ? ` class="region" data-index="${i}"` : '';
    const badgeX = Math.max(2, r.box.x);
    const badgeY = Math.max(14, r.box.y - 4);
    parts.push(
      `<g${interactive}>` +
        `<rect x="${r.box.x - 1.5}" y="${r.box.y - 1.5}" width="${r.box.w + 3}" height="${r.box.h + 3}" ` +
        `fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-width="2" rx="3">` +
        `<title>${esc(`#${i + 1} ${TYPE_LABELS[r.type]}: ${r.reason}`)}</title></rect>` +
        `<text x="${badgeX}" y="${badgeY}" font-family="system-ui,sans-serif" font-size="12" ` +
        `font-weight="700" fill="${c}" stroke="#fff" stroke-width="3" paint-order="stroke">${i + 1}</text>` +
        `</g>`,
    );
  });
  parts.push('</svg>');
  return parts.join('');
}
