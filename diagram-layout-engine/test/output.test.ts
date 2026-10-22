import { describe, expect, it } from 'vitest';
import { BENCH_CONFIGS, benchmarkGraphs, mulberry32, runOne, summarize } from '../src/core/bench';
import { diffCharts } from '../src/core/diff';
import { DIFF_EXAMPLES, EXAMPLES } from '../src/core/examples';
import { layoutChart } from '../src/core/layout';
import { parse } from '../src/core/parser';
import { decodeState, encodeState } from '../src/core/share';
import { esc, luminance, renderSvg } from '../src/core/svg';
import { THEMES, themeById, themeCss } from '../src/core/themes';

const svgOf = (src: string, extra: Partial<Parameters<typeof renderSvg>[1]> = {}): string => {
  const chart = parse(src);
  return renderSvg(layoutChart(chart), { theme: 'light', idPrefix: 't', classDefs: chart.classDefs, ...extra });
};

describe('svg', () => {
  it('escapes labels and ids', () => {
    const s = svgOf('flowchart TD\nA["<script>alert(1)</script> & co"]');
    expect(s).not.toContain('<script>');
    expect(s).toContain('&lt;script&gt;');
    expect(esc(`"'<>&`)).toBe('&quot;&#39;&lt;&gt;&amp;');
  });

  it('emits one marker per head kind and colour', () => {
    const s = svgOf('flowchart LR\nA --> B --> C\nC --o D\nD --x E\nE <--> F');
    expect(s.match(/<marker /g)).toHaveLength(3);
    expect(s).toContain('marker-start');
    expect(s).toContain('orient="auto-start-reverse"');
  });

  it('applies classDef, style and linkStyle inline', () => {
    const s = svgOf('flowchart TD\nA:::hot --> B\nclassDef hot fill:#f96,color:#123\nstyle B stroke:#0a0\nlinkStyle 0 stroke:#f00');
    expect(s).toContain('style="fill:#f96"');
    expect(s).toContain('style="fill:#123"');
    expect(s).toContain('style="stroke:#0a0"');
    expect(s).toContain('stroke:#f00');
    const d = svgOf('flowchart TD\nA\nclassDef default fill:#abc');
    expect(d).toContain('fill:#abc');
  });

  it('picks readable text for custom fills', () => {
    expect(luminance('#fff')).toBeCloseTo(1, 6);
    expect(luminance('rgb(0, 0, 0)')).toBe(0);
    expect(luminance('red')).toBeNull();
    const light = svgOf('flowchart TD\nA:::c\nclassDef c fill:#fee2e2');
    expect(light).toContain('style="fill:#1b1f2e"');
    const dark = svgOf('flowchart TD\nA\nstyle A fill:#123456');
    expect(dark).toContain('style="fill:#f8fafc"');
    const own = svgOf('flowchart TD\nA\nstyle A fill:#123456,color:#ff0');
    expect(own).toContain('style="fill:#ff0"');
  });

  it('skips invisible edges and marks link styles with classes', () => {
    const s = svgOf('flowchart LR\nA ~~~ B\nB ==> C\nC -.-> D');
    expect(s).not.toContain('dle-invisible');
    expect(s).toContain('dle-thick');
    expect(s).toContain('dle-dotted');
  });

  it('renders every theme through CSS variables, with auto following dark mode', () => {
    for (const t of THEMES) expect(themeCss(t.id, '#x')).toContain('--dle-node-fill');
    expect(themeCss('auto', '#x')).toContain('prefers-color-scheme: dark');
    expect(themeById('nope').id).toBe('light');
    const s = svgOf('flowchart TD\nA', { theme: 'blueprint', title: 'My diagram', debug: true });
    expect(s).toContain('<title>My diagram</title>');
    expect(s).toContain('monospace');
    expect(s).toContain('r0·o0');
  });

  it('matches the golden SVG for the login example', () => {
    expect(svgOf(EXAMPLES.find((e) => e.id === 'login')!.source)).toMatchSnapshot();
  });
});

describe('diff', () => {
  it('classifies nodes, edges and subgraphs', () => {
    const a = parse('flowchart TD\nA[Alpha] --> B\nB --> C\nsubgraph S [Old]\n  C\nend\nsubgraph T\n  Z\nend');
    const b = parse('flowchart TD\nA[Alpha 2] --> B\nB -->|now labelled| D\nB --> C\nsubgraph S [New]\n  C\nend');
    const d = diffCharts(a, b);
    expect(d.status.get('A')).toBe('changed');
    expect(d.status.get('B')).toBe('same');
    expect(d.status.get('D')).toBe('added');
    expect(d.status.get('Z')).toBe('removed');
    expect(d.status.get('S')).toBe('changed');
    expect(d.status.get('T')).toBe('removed');
    expect(d.before.get('A')).toEqual(['Alpha']);
    expect(d.after.get('A')).toEqual(['Alpha 2']);
    expect(d.entries[0].status).toBe('removed');
    expect(d.entries.some((e) => e.kind === 'edge' && e.status === 'added' && /B -> D 'now labelled'/.test(e.text))).toBe(true);
    expect(d.counts.added).toBeGreaterThan(0);
    // Union keeps every node, so before and after share one layout.
    expect([...d.union.nodes.keys()].sort()).toEqual(['A', 'B', 'C', 'D', 'Z']);
  });

  it('keeps positions stable across before and after views', () => {
    const ex = DIFF_EXAMPLES[0];
    const d = diffCharts(parse(ex.before), parse(ex.after));
    const L = layoutChart(d.union);
    const before = renderSvg(L, { theme: 'light', idPrefix: 'b', classDefs: d.union.classDefs, diff: { status: d.status, view: 'before', labels: d.before } });
    const after = renderSvg(L, { theme: 'light', idPrefix: 'a', classDefs: d.union.classDefs, diff: { status: d.status, view: 'after', labels: d.after } });
    expect(before).toContain('dle-ghost');
    expect(before).toContain('dle-removed');
    expect(after).toContain('dle-added');
    expect(after).toContain('Order confirmed');
    expect(before).not.toContain('Order confirmed');
  });

  it('survives parent cycles and node/subgraph id clashes between versions', () => {
    const a = parse('flowchart TD\nsubgraph P\n  subgraph Q\n    x\n  end\nend\nM --> N');
    const b = parse('flowchart TD\nsubgraph Q\n  subgraph P\n    y\n  end\nend\nsubgraph M\n  k\nend');
    const d = diffCharts(a, b);
    const L = layoutChart(d.union);
    expect(L.clusters.length).toBe(3);
    expect(d.union.nodes.has('M')).toBe(false);
  });

  it('diffs every bundled pair without overlaps', () => {
    for (const ex of DIFF_EXAMPLES) {
      const d = diffCharts(parse(ex.before), parse(ex.after));
      const L = layoutChart(d.union);
      expect(L.nodes.length).toBe(d.union.nodes.size);
    }
  });
});

describe('benchmark', () => {
  it('generates the same 50 parseable graphs every time', () => {
    const a = benchmarkGraphs();
    const b = benchmarkGraphs();
    expect(a).toHaveLength(50);
    expect(a.map((g) => g.source)).toEqual(b.map((g) => g.source));
    expect(new Set(a.map((g) => g.family)).size).toBe(6);
    for (const g of a) expect(() => parse(g.source)).not.toThrow();
    const r = mulberry32(1);
    expect(r()).not.toBe(r());
  });

  it('runs configurations and ranks them', () => {
    const graphs = benchmarkGraphs().filter((_, k) => k % 10 === 0);
    const rows = graphs.flatMap((g) => BENCH_CONFIGS.map((c) => runOne(g, c)));
    expect(rows).toHaveLength(graphs.length * BENCH_CONFIGS.length);
    const summary = summarize(rows, BENCH_CONFIGS);
    expect(summary).toHaveLength(BENCH_CONFIGS.length);
    expect(summary[0].meanRank).toBeLessThanOrEqual(summary[summary.length - 1].meanRank);
    expect(summary.reduce((s, x) => s + x.wins, 0)).toBeGreaterThanOrEqual(graphs.length);
    const baseline = summary.find((s) => s.config === 'baseline')!;
    const full = summary.find((s) => s.config === 'full')!;
    expect(full.totals.crossings).toBeLessThanOrEqual(baseline.totals.crossings);
  });
});

describe('share links', () => {
  it('round-trips compressed state', async () => {
    const state = { source: 'flowchart TD\nA["ünïcødé"] --> B', after: 'flowchart TD\nA', view: 'diff' };
    const frag = await encodeState(state);
    expect(frag.startsWith('z.')).toBe(true);
    expect(await decodeState(`#${frag}`)).toEqual(state);
  });

  it('reads plain fragments and rejects garbage', async () => {
    const plain = `p.${btoa(JSON.stringify({ source: 'flowchart LR' })).replace(/=+$/, '')}`;
    expect(await decodeState(plain)).toEqual({ source: 'flowchart LR' });
    expect(await decodeState('#nothing')).toBeNull();
    expect(await decodeState('z.!!!!')).toBeNull();
    expect(await decodeState(`p.${btoa('{"x":1}')}`)).toBeNull();
  });
});
