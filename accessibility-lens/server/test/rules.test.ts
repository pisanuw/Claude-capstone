import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { imgAltRule } from '../src/engine/rules/imgAlt.js';
import { htmlLangRule } from '../src/engine/rules/htmlLang.js';
import { docTitleRule } from '../src/engine/rules/docTitle.js';
import { formLabelRule } from '../src/engine/rules/formLabel.js';
import { headingOrderRule } from '../src/engine/rules/headingOrder.js';
import { linkTextRule } from '../src/engine/rules/linkText.js';
import { buttonNameRule } from '../src/engine/rules/buttonName.js';
import { viewportZoomRule } from '../src/engine/rules/viewportZoom.js';
import { duplicateIdRule } from '../src/engine/rules/duplicateId.js';
import { positiveTabindexRule } from '../src/engine/rules/positiveTabindex.js';
import { contrastRule } from '../src/engine/rules/contrast.js';

function doc(html: string): Document {
  return new JSDOM(html).window.document;
}

describe('imgAltRule', () => {
  it('flags an image with no alt attribute', () => {
    const issues = imgAltRule.evaluate(doc('<img src="a.png">'));
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('img-alt');
  });

  it('passes images with alt, including empty decorative alt', () => {
    expect(imgAltRule.evaluate(doc('<img src="a.png" alt="A cat">'))).toHaveLength(0);
    expect(imgAltRule.evaluate(doc('<img src="a.png" alt="">'))).toHaveLength(0);
  });

  it('ignores images hidden from the accessibility tree', () => {
    expect(imgAltRule.evaluate(doc('<img src="a.png" aria-hidden="true">'))).toHaveLength(0);
  });
});

describe('htmlLangRule', () => {
  it('flags a document with no lang', () => {
    expect(htmlLangRule.evaluate(doc('<html><body></body></html>'))).toHaveLength(1);
  });
  it('passes a document with a lang', () => {
    expect(htmlLangRule.evaluate(doc('<html lang="en"><body></body></html>'))).toHaveLength(0);
  });
});

describe('docTitleRule', () => {
  it('flags a missing title', () => {
    expect(docTitleRule.evaluate(doc('<head></head>'))).toHaveLength(1);
  });
  it('flags an empty title', () => {
    expect(docTitleRule.evaluate(doc('<head><title>   </title></head>'))).toHaveLength(1);
  });
  it('passes a real title', () => {
    expect(docTitleRule.evaluate(doc('<head><title>Hello</title></head>'))).toHaveLength(0);
  });
});

describe('formLabelRule', () => {
  it('flags an unlabeled text input', () => {
    expect(formLabelRule.evaluate(doc('<input type="text">'))).toHaveLength(1);
  });
  it('passes an input with aria-label', () => {
    expect(formLabelRule.evaluate(doc('<input aria-label="Email">'))).toHaveLength(0);
  });
  it('passes an input associated via label[for]', () => {
    const d = doc('<label for="e">Email</label><input id="e">');
    expect(formLabelRule.evaluate(d)).toHaveLength(0);
  });
  it('passes an input wrapped in a label with text', () => {
    expect(formLabelRule.evaluate(doc('<label>Email <input></label>'))).toHaveLength(0);
  });
  it('ignores hidden and submit inputs', () => {
    expect(formLabelRule.evaluate(doc('<input type="hidden"><input type="submit">'))).toHaveLength(
      0,
    );
  });
});

describe('headingOrderRule', () => {
  it('flags a page with no headings', () => {
    const issues = headingOrderRule.evaluate(doc('<body><p>hi</p></body>'));
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });
  it('flags a missing h1', () => {
    const issues = headingOrderRule.evaluate(doc('<body><h2>Sub</h2></body>'));
    expect(issues.some((i) => i.impact.includes('no <h1>'))).toBe(true);
  });
  it('flags a skipped heading level', () => {
    const issues = headingOrderRule.evaluate(doc('<body><h1>A</h1><h3>C</h3></body>'));
    expect(issues.some((i) => i.impact.includes('jumps'))).toBe(true);
  });
  it('passes a well-formed outline', () => {
    const issues = headingOrderRule.evaluate(
      doc('<body><h1>A</h1><h2>B</h2><h3>C</h3><h2>D</h2></body>'),
    );
    expect(issues).toHaveLength(0);
  });
});

describe('linkTextRule', () => {
  it('flags an empty link as critical', () => {
    const issues = linkTextRule.evaluate(doc('<a href="/x"></a>'));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('critical');
  });
  it('flags generic link text', () => {
    const issues = linkTextRule.evaluate(doc('<a href="/x">click here</a>'));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('moderate');
  });
  it('passes descriptive link text', () => {
    expect(linkTextRule.evaluate(doc('<a href="/x">Download the syllabus</a>'))).toHaveLength(0);
  });
  it('uses aria-label as the accessible name', () => {
    expect(
      linkTextRule.evaluate(doc('<a href="/x" aria-label="Open menu"><svg></svg></a>')),
    ).toHaveLength(0);
  });
});

describe('buttonNameRule', () => {
  it('flags an icon-only button', () => {
    expect(buttonNameRule.evaluate(doc('<button><svg></svg></button>'))).toHaveLength(1);
  });
  it('passes a button with text', () => {
    expect(buttonNameRule.evaluate(doc('<button>Save</button>'))).toHaveLength(0);
  });
  it('passes a button with aria-label', () => {
    expect(buttonNameRule.evaluate(doc('<button aria-label="Close"></button>'))).toHaveLength(0);
  });
  it('handles input buttons via value', () => {
    expect(buttonNameRule.evaluate(doc('<input type="submit" value="Go">'))).toHaveLength(0);
    expect(buttonNameRule.evaluate(doc('<input type="button">'))).toHaveLength(1);
  });
});

describe('viewportZoomRule', () => {
  it('flags user-scalable=no', () => {
    const d = doc('<meta name="viewport" content="width=device-width, user-scalable=no">');
    expect(viewportZoomRule.evaluate(d)).toHaveLength(1);
  });
  it('flags maximum-scale=1', () => {
    const d = doc('<meta name="viewport" content="width=device-width, maximum-scale=1.0">');
    expect(viewportZoomRule.evaluate(d)).toHaveLength(1);
  });
  it('passes a permissive viewport', () => {
    const d = doc('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(viewportZoomRule.evaluate(d)).toHaveLength(0);
  });
  it('passes when there is no viewport meta', () => {
    expect(viewportZoomRule.evaluate(doc('<head></head>'))).toHaveLength(0);
  });
});

describe('duplicateIdRule', () => {
  it('flags duplicate ids', () => {
    const issues = duplicateIdRule.evaluate(doc('<div id="x"></div><div id="x"></div>'));
    expect(issues).toHaveLength(1);
    expect(issues[0].snippet).toContain('2');
  });
  it('passes unique ids', () => {
    expect(duplicateIdRule.evaluate(doc('<div id="a"></div><div id="b"></div>'))).toHaveLength(0);
  });
});

describe('positiveTabindexRule', () => {
  it('flags a positive tabindex', () => {
    expect(positiveTabindexRule.evaluate(doc('<div tabindex="3"></div>'))).toHaveLength(1);
  });
  it('passes tabindex 0 and -1', () => {
    expect(positiveTabindexRule.evaluate(doc('<div tabindex="0"></div>'))).toHaveLength(0);
    expect(positiveTabindexRule.evaluate(doc('<div tabindex="-1"></div>'))).toHaveLength(0);
  });
  it('ignores non-numeric tabindex', () => {
    expect(positiveTabindexRule.evaluate(doc('<div tabindex="abc"></div>'))).toHaveLength(0);
  });
});

describe('contrastRule', () => {
  it('flags low-contrast inline text', () => {
    const issues = contrastRule.evaluate(doc('<p style="color:#bbbbbb">Faint text</p>'));
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('contrast');
  });
  it('passes high-contrast inline text', () => {
    expect(contrastRule.evaluate(doc('<p style="color:#111111">Dark text</p>'))).toHaveLength(0);
  });
  it('uses an inline ancestor background when present', () => {
    const d = doc('<div style="background-color:#000000"><span style="color:#222">Hi</span></div>');
    const issues = contrastRule.evaluate(d);
    // Dark text on dark bg should fail.
    expect(issues).toHaveLength(1);
  });
  it('ignores elements with a color but no text', () => {
    expect(contrastRule.evaluate(doc('<span style="color:#bbb"></span>'))).toHaveLength(0);
  });
});
