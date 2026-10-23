// Laser-cut export: every gear of a train laid out in a row, outlines in mm,
// a bore hole and an engraved label. Units are millimetres throughout.

import { gearDims, gearOutline, outlinePath } from './gear';
import type { Stage } from './search';

export interface CutOptions {
  module: number;
  bore: number;
  gap: number;
}

export function cutSheet(stages: Stage[], opts: CutOptions): string {
  const gears = stages.flatMap((s, i) => [
    { teeth: s.driver, label: `S${i + 1} driver ${s.driver}T` },
    { teeth: s.driven, label: `S${i + 1} driven ${s.driven}T` },
  ]);
  let x = opts.gap;
  let height = 0;
  const parts: string[] = [];
  for (const g of gears) {
    const r = gearDims(g.teeth, opts.module).outer;
    const cx = x + r;
    const cy = opts.gap + r;
    parts.push(
      `<path d="${outlinePath(gearOutline(g.teeth, opts.module), cx, cy)}" fill="none" stroke="#ff0000" stroke-width="0.1"/>`,
      `<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${(opts.bore / 2).toFixed(3)}" fill="none" stroke="#ff0000" stroke-width="0.1"/>`,
      `<text x="${cx.toFixed(3)}" y="${(cy + opts.bore / 2 + 4).toFixed(3)}" font-size="3" text-anchor="middle" fill="#0000ff" font-family="sans-serif">${g.label}</text>`,
    );
    x += 2 * r + opts.gap;
    height = Math.max(height, 2 * r + 2 * opts.gap);
  }
  const w = x.toFixed(3);
  const h = height.toFixed(3);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`,
    `<!-- Brocot Gear Finder: module ${opts.module} mm, 20 degree involute. Red = cut, blue = engrave. -->`,
    ...parts,
    `</svg>`,
    '',
  ].join('\n');
}
