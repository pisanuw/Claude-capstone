import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { analyzeHtml } from '../src/engine/analyze.js';
import { buildReadingOrder } from '../src/engine/screenReaderOrder.js';
import { accessibleName, describeElement, snippetOf } from '../src/engine/dom.js';

const CLEAN_PAGE = `<!doctype html><html lang="en"><head><title>Clean</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><h1>Welcome</h1><h2>About</h2><p>Hello world</p>
<img src="x.png" alt="A diagram"><a href="/docs">Read the documentation</a></body></html>`;

const MESSY_PAGE = `<!doctype html><html><head></head>
<body><h2>Sub</h2><img src="x.png"><a href="/x">click here</a>
<input type="text"><button><svg></svg></button>
<p style="color:#cccccc">faint</p></body></html>`;

describe('analyzeHtml', () => {
  it('reports no issues on a clean page', () => {
    const report = analyzeHtml(CLEAN_PAGE, 'https://example.com', '2026-05-21T00:00:00Z');
    expect(report.issues).toHaveLength(0);
    expect(report.score).toBe(100);
    expect(report.pageTitle).toBe('Clean');
    expect(report.lang).toBe('en');
  });

  it('finds multiple issues on a messy page and lowers the score', () => {
    const report = analyzeHtml(MESSY_PAGE, 'https://example.com', '2026-05-21T00:00:00Z');
    expect(report.issues.length).toBeGreaterThan(3);
    expect(report.score).toBeLessThan(100);
    const ruleIds = new Set(report.issues.map((i) => i.ruleId));
    expect(ruleIds).toContain('img-alt');
    expect(ruleIds).toContain('form-label');
    expect(ruleIds).toContain('button-name');
  });

  it('sorts issues by severity descending', () => {
    const report = analyzeHtml(MESSY_PAGE, 'https://example.com', '2026-05-21T00:00:00Z');
    const order = ['critical', 'serious', 'moderate', 'minor'];
    const indices = report.issues.map((i) => order.indexOf(i.severity));
    const sorted = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sorted);
  });

  it('produces a per-profile score for every profile', () => {
    const report = analyzeHtml(MESSY_PAGE, 'https://example.com', '2026-05-21T00:00:00Z');
    expect(report.profileScores).toHaveLength(4);
    for (const ps of report.profileScores) {
      expect(ps.score).toBeGreaterThanOrEqual(0);
      expect(ps.score).toBeLessThanOrEqual(100);
    }
  });

  it('summary counts add up to the number of issues', () => {
    const report = analyzeHtml(MESSY_PAGE, 'https://example.com', '2026-05-21T00:00:00Z');
    const total = Object.values(report.summary).reduce((a, b) => a + b, 0);
    expect(total).toBe(report.issues.length);
  });

  it('honors an injected subset of rules', () => {
    const report = analyzeHtml(MESSY_PAGE, 'https://example.com', '2026-05-21T00:00:00Z', {
      rules: [],
    });
    expect(report.issues).toHaveLength(0);
  });
});

describe('buildReadingOrder', () => {
  it('linearizes headings, links, images, and form fields in order', () => {
    const d = new JSDOM(CLEAN_PAGE).window.document;
    const order = buildReadingOrder(d);
    const roles = order.map((n) => n.role);
    expect(roles).toContain('heading');
    expect(roles).toContain('link');
    expect(roles).toContain('image');
    const heading = order.find((n) => n.role === 'heading');
    expect(heading?.level).toBe(1);
  });

  it('skips decorative images with empty alt', () => {
    const d = new JSDOM('<body><img alt=""><img alt="real"></body>').window.document;
    const images = buildReadingOrder(d).filter((n) => n.role === 'image');
    expect(images).toHaveLength(1);
    expect(images[0].text).toBe('real');
  });

  it('emits landmark markers for semantic regions', () => {
    const d = new JSDOM('<body><nav><a href="/">Home</a></nav><main><p>Hi</p></main></body>')
      .window.document;
    const roles = buildReadingOrder(d).map((n) => n.role);
    expect(roles).toContain('landmark: navigation');
    expect(roles).toContain('landmark: main');
  });

  it('returns empty array when there is no body', () => {
    const d = new JSDOM('<html></html>').window.document;
    // jsdom always synthesizes a body, so force the edge case explicitly.
    Object.defineProperty(d, 'body', { value: null, configurable: true });
    expect(buildReadingOrder(d)).toEqual([]);
  });
});

describe('dom helpers', () => {
  it('describeElement prefers id, then class, then tag', () => {
    const d = new JSDOM('<div id="hero"></div><span class="a b"></span><p></p>').window.document;
    expect(describeElement(d.querySelector('div')!)).toBe('div#hero');
    expect(describeElement(d.querySelector('span')!)).toBe('span.a');
    expect(describeElement(d.querySelector('p')!)).toBe('p');
  });

  it('snippetOf truncates very long markup', () => {
    const long = `<div>${'x'.repeat(500)}</div>`;
    const d = new JSDOM(long).window.document;
    const snip = snippetOf(d.querySelector('div')!);
    expect(snip.length).toBeLessThanOrEqual(160);
  });

  it('accessibleName resolves aria-labelledby', () => {
    const d = new JSDOM('<span id="lbl">Hello</span><button aria-labelledby="lbl"></button>')
      .window.document;
    expect(accessibleName(d.querySelector('button')!, d)).toBe('Hello');
  });
});
