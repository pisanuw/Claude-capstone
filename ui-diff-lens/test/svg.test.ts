import { describe, expect, it } from 'vitest';
import { buildOverlaySvg, TYPE_COLORS, TYPE_LABELS } from '../src/core/svg';
import { CHANGE_TYPES, type Region } from '../src/core/types';

const regions: Region[] = [
  {
    box: { x: 10, y: 20, w: 30, h: 40 },
    changedPixels: 100,
    type: 'color',
    confidence: 0.9,
    reason: 'palette <shifted> & "restyled"',
  },
  {
    box: { x: 60, y: 60, w: 10, h: 10 },
    changedPixels: 50,
    type: 'element-added',
    confidence: 0.95,
    reason: 'new content',
  },
];

describe('buildOverlaySvg', () => {
  it('renders one numbered rect per region', () => {
    const svg = buildOverlaySvg(200, 150, regions);
    expect(svg).toContain('viewBox="0 0 200 150"');
    expect((svg.match(/<rect/g) ?? []).length).toBe(2);
    expect(svg).toContain('>1</text>');
    expect(svg).toContain('>2</text>');
    expect(svg).toContain(TYPE_COLORS['color']);
    expect(svg).toContain(TYPE_COLORS['element-added']);
  });

  it('escapes reason text in titles', () => {
    const svg = buildOverlaySvg(200, 150, regions);
    expect(svg).toContain('&lt;shifted&gt;');
    expect(svg).toContain('&quot;restyled&quot;');
    expect(svg).not.toContain('<shifted>');
  });

  it('filters hidden types', () => {
    const svg = buildOverlaySvg(200, 150, regions, { visibleTypes: ['color'] });
    expect((svg.match(/<rect/g) ?? []).length).toBe(1);
  });

  it('adds data-index attributes when interactive', () => {
    const svg = buildOverlaySvg(200, 150, regions, { interactive: true });
    expect(svg).toContain('data-index="0"');
    expect(svg).toContain('data-index="1"');
    expect(buildOverlaySvg(200, 150, regions)).not.toContain('data-index');
  });

  it('has a label and color for every change type', () => {
    for (const t of CHANGE_TYPES) {
      expect(TYPE_LABELS[t]).toBeTruthy();
      expect(TYPE_COLORS[t]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
