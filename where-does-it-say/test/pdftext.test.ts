import { describe, expect, it } from 'vitest';
import { pdfItemsToText, type PdfItem } from '../src/core/pdftext.js';
import { parseDoc } from '../src/core/docs.js';

/** Lays out lines top-down, 14 units apart, with optional extra gap before a line. */
function page(lines: (string | { text: string; gap?: number; h?: number; runs?: string[] })[], top = 700): PdfItem[] {
  const items: PdfItem[] = [];
  let y = top;
  for (const l of lines) {
    const o = typeof l === 'string' ? { text: l } : l;
    y -= 14 + (o.gap ?? 0);
    const runs = o.runs ?? [o.text];
    let x = 72;
    runs.forEach((r, i) => {
      items.push({ str: r, x, y, h: o.h ?? 11, hasEOL: i === runs.length - 1 });
      x += r.length * 5;
    });
  }
  return items;
}

describe('pdfItemsToText', () => {
  it('joins runs, keeps lines, splits paragraphs on large gaps and font changes', () => {
    const text = pdfItemsToText([
      page([
        { text: 'Late Work', h: 16 },
        { text: '', runs: ['Late submissions lose', '10% per day.'] },
        'Work more than three days',
        'late receives a zero.',
        { text: 'Extensions are granted for emergencies.', gap: 12 },
      ]),
    ]);
    expect(text).toBe('Late Work\n\nLate submissions lose 10% per day.\nWork more than three days\nlate receives a zero.\n\nExtensions are granted for emergencies.');
  });

  it('rejoins hyphenated words and keeps bullets on their own lines', () => {
    const text = pdfItemsToText([page(['Students must sub-', 'mit on time.', '• one', '• two'])]);
    expect(text).toBe('Students must submit on time.\n• one\n• two');
  });

  it('drops repeated headers, footers and page numbers across pages', () => {
    const pages = [1, 2, 3].map((n) => page(['CS 142 Syllabus', `Body text of page ${n} here.`, `Page ${n} of 3`]));
    const text = pdfItemsToText(pages);
    expect(text.split('\f')).toEqual(['Body text of page 1 here.', 'Body text of page 2 here.', 'Body text of page 3 here.']);
    const doc = parseDoc({ title: 'S', format: 'pdf', source: text });
    expect(doc.blocks.map((b) => b.page)).toEqual([1, 2, 3]);
  });

  it('merges items on the same baseline and handles empty pages', () => {
    const items: PdfItem[] = [
      { str: 'Office', x: 72, y: 500, h: 11 },
      { str: 'hours', x: 110, y: 500.4, h: 11 },
      { str: '', x: 0, y: 0, h: 0 },
      { str: ' Tuesday', x: 150, y: 500, h: 11, hasEOL: true },
      { str: 'next', x: 72, y: 486, h: 0 },
    ];
    expect(pdfItemsToText([items, []])).toBe('Office hours Tuesday\nnext\f');
  });
});
