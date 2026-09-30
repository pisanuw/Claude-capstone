import { describe, expect, it } from 'vitest';
import {
  blockAt,
  formatFromName,
  locationLabel,
  looksLikeHeading,
  parseDoc,
  parseMarkdown,
  parsePlain,
  stripInline,
  titleFromName,
} from '../src/core/docs.js';
import { sentencesOf, splitBlock } from '../src/core/sentences.js';

describe('stripInline', () => {
  it('removes emphasis, code, links, images, html and escapes', () => {
    expect(stripInline('**Late** work is _not_ accepted; see [the policy](http://x) and `wordfreq.py`.')).toBe(
      'Late work is not accepted; see the policy and wordfreq.py.',
    );
    expect(stripInline('![logo](a.png) <b>bold</b> ~~old~~ \\*literal\\* <https://example.edu>')).toBe(
      'logo bold old *literal* https://example.edu',
    );
    expect(stripInline('snake_case_name and 2*3*4')).toBe('snake_case_name and 2*3*4');
  });
});

describe('parseMarkdown', () => {
  it('reads headings, paragraphs, lists, tables, code, rules and blockquotes', () => {
    const md = [
      '# Title',
      '',
      'First line',
      'second line.',
      '',
      '- item one',
      '  continued',
      '2. item two',
      '',
      '| Part | Weight |',
      '|---|---|',
      '| Labs | 25% |',
      '| Exams | 50% |',
      '',
      '```',
      'code here',
      '```',
      '',
      '---',
      '> quoted text',
      '',
      'Setext',
      '======',
      'Sub',
      '---',
    ].join('\n');
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => [b.kind, b.text])).toEqual([
      ['heading', 'Title'],
      ['para', 'First line second line.'],
      ['item', 'item one continued'],
      ['item', 'item two'],
      ['row', 'Labs; Weight: 25%'],
      ['row', 'Exams; Weight: 50%'],
      ['code', 'code here'],
      ['para', 'quoted text'],
      ['heading', 'Setext'],
      ['heading', 'Sub'],
    ]);
    expect(blocks[8].level).toBe(1);
    expect(blocks[9].level).toBe(2);
  });

  it('skips empty headings and empty code fences', () => {
    expect(parseMarkdown('#   \n\n```\n```\n')).toEqual([]);
  });
});

describe('parsePlain', () => {
  it('detects headings, bullets and pages', () => {
    const text = 'LATE WORK\nLate work loses 10% per day.\n\n• First bullet\n• Second bullet\fGrading:\nLabs are 25%.\n\nExams\nare worth half.';
    const blocks = parsePlain(text);
    expect(blocks.map((b) => [b.kind, b.text, b.page])).toEqual([
      ['heading', 'LATE WORK', 1],
      ['para', 'Late work loses 10% per day.', 1],
      ['item', 'First bullet', 1],
      ['item', 'Second bullet', 1],
      ['heading', 'Grading', 2],
      ['para', 'Labs are 25%.', 2],
      ['para', 'Exams are worth half.', 2],
    ]);
  });

  it('treats a lone short unpunctuated line as a heading', () => {
    expect(parsePlain('Lab reports\n\nReports follow the template.\n\nSee you soon').map((b) => b.kind)).toEqual(['heading', 'para', 'heading']);
    expect(parsePlain('Email the staff.').map((b) => b.kind)).toEqual(['para']);
  });

  it('has no page numbers for single-page text', () => {
    expect(parsePlain('Just one paragraph here.')[0].page).toBeUndefined();
  });

  it('recognises heading shapes', () => {
    expect(looksLikeHeading('3.2 Late submissions')).toBe(true);
    expect(looksLikeHeading('Office Hours')).toBe(true);
    expect(looksLikeHeading('Grading:')).toBe(true);
    expect(looksLikeHeading('This is a sentence.')).toBe(false);
    expect(looksLikeHeading('x')).toBe(false);
    expect(looksLikeHeading('one two three four five six seven eight nine ten')).toBe(false);
    expect(looksLikeHeading('a lower case line')).toBe(false);
  });
});

describe('parseDoc', () => {
  const doc = parseDoc({ title: 'Syllabus', format: 'markdown', source: '# Course\n\n## Late work\n\nLate work loses 10% per day. Dr. Smith decides extensions.\n\n### Exceptions\n\nNone.\n\n## Exams\n\nClosed book.' });

  it('builds display text and heading paths', () => {
    expect(doc.text.split('\n\n')).toEqual(['Course', 'Late work', 'Late work loses 10% per day. Dr. Smith decides extensions.', 'Exceptions', 'None.', 'Exams', 'Closed book.']);
    expect(doc.blocks[2].section).toEqual(['Course', 'Late work']);
    expect(doc.blocks[4].section).toEqual(['Course', 'Late work', 'Exceptions']);
    expect(doc.blocks[5].section).toEqual(['Course']);
    expect(doc.blocks[6].section).toEqual(['Course', 'Exams']);
    expect(doc.id).toMatch(/^d0-[0-9a-f]{6}$/);
  });

  it('finds blocks and labels locations', () => {
    const at = doc.text.indexOf('Closed');
    expect(blockAt(doc, at)?.kind).toBe('para');
    expect(blockAt(doc, -1)).toBeUndefined();
    expect(blockAt(doc, doc.text.length + 5)).toBeUndefined();
    expect(locationLabel(doc, at)).toBe('Exams');
    expect(locationLabel(doc, doc.text.length + 5)).toBe('');
    const pdf = parseDoc({ title: 'P', format: 'pdf', source: 'Intro text here.\fMore text here.' });
    expect(locationLabel(pdf, pdf.text.indexOf('More'))).toBe('p. 2');
  });

  it('gives untitled documents a name', () => {
    expect(parseDoc({ title: ' ', format: 'text', source: 'x' }, 2).title).toBe('Document 3');
  });

  it('splits sentences without breaking on abbreviations', () => {
    const s = sentencesOf(doc).map((x) => doc.text.slice(x.start, x.end));
    expect(s).toContain('Late work loses 10% per day.');
    expect(s).toContain('Dr. Smith decides extensions.');
  });
});

describe('splitBlock', () => {
  const cut = (t: string) => splitBlock(t, 0, t.length).map((s) => t.slice(s.start, s.end));
  it('handles initials, e.g., decimals, quotes and question marks', () => {
    expect(cut('Ask J. Smith first. Use e.g. Python 3.12 today! Is it "due"? Yes (mostly). ok')).toEqual([
      'Ask J. Smith first.',
      'Use e.g. Python 3.12 today!',
      'Is it "due"?',
      'Yes (mostly). ok',
    ]);
  });

  it('keeps a lower-case continuation together and drops blank spans', () => {
    expect(cut('Due 5 p.m. on Friday. Late after that.')).toEqual(['Due 5 p.m. on Friday.', 'Late after that.']);
    expect(cut('   ')).toEqual([]);
    expect(cut('End.')).toEqual(['End.']);
    expect(cut('Version 2.Next')).toEqual(['Version 2.Next']);
  });
});

describe('file names', () => {
  it('maps extensions to formats and names to titles', () => {
    expect(formatFromName('Syllabus.PDF')).toBe('pdf');
    expect(formatFromName('notes.md')).toBe('markdown');
    expect(formatFromName('notes.txt')).toBe('text');
    expect(formatFromName('image.png')).toBeNull();
    expect(titleFromName('late-policy_v2.md')).toBe('late policy v2');
    expect(titleFromName('.md')).toBe('.md');
  });
});
