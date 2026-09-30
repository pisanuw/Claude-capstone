import { describe, expect, it } from 'vitest';
import { fold, foldText, hash, unfoldRange, words } from '../src/core/text.js';
import { escapeHtml } from '../src/core/html.js';
import { segments } from '../src/core/highlight.js';

describe('fold', () => {
  it('collapses whitespace runs and trims', () => {
    expect(foldText('  Late   work\n\nloses\t10%  ')).toBe('Late work loses 10%');
  });

  it('folds curly quotes, dashes, ellipses, ligatures and drops soft hyphens', () => {
    expect(foldText('“It’s due” – now… ﬁle co­op')).toBe('"It\'s due" - now... file coop');
  });

  it('maps folded offsets back to the original', () => {
    const src = 'A  “quoted”\n word';
    const f = fold(src);
    const at = f.text.indexOf('"quoted" word');
    const span = unfoldRange(f, at, at + '"quoted" word'.length);
    expect(src.slice(span.start, span.end)).toBe('“quoted”\n word');
  });

  it('handles an empty range', () => {
    const f = fold('abc');
    expect(unfoldRange(f, 1, 1)).toEqual({ start: 1, end: 1 });
  });
});

describe('words and hash', () => {
  it('keeps inner apostrophes and decimal points', () => {
    expect(words("Don't use Python 3.12, OK?")).toEqual(["Don't", 'use', 'Python', '3.12', 'OK']);
    expect(words('...')).toEqual([]);
  });

  it('hashes deterministically to 8 hex digits', () => {
    expect(hash('abc')).toMatch(/^[0-9a-f]{8}$/);
    expect(hash('abc')).toBe(hash('abc'));
    expect(hash('abc')).not.toBe(hash('abd'));
  });

  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('segments', () => {
  const text = 'Alpha beta gamma delta';
  it('returns the whole range when nothing is marked', () => {
    expect(segments(text, 0, text.length, [])).toEqual([{ text }]);
  });

  it('highlights marks clipped to the block, earlier quote winning overlaps', () => {
    const s = segments(text, 6, 22, [
      { start: 0, end: 10, quote: 0 },
      { start: 8, end: 16, quote: 1 },
      { start: 30, end: 40, quote: 2 },
    ]);
    expect(s).toEqual([
      { text: 'beta', quote: 0 },
      { text: ' gamma', quote: 1 },
      { text: ' delta' },
    ]);
  });

  it('skips marks fully swallowed by an earlier one', () => {
    const s = segments(text, 0, text.length, [
      { start: 0, end: 16, quote: 0 },
      { start: 6, end: 10, quote: 1 },
    ]);
    expect(s).toEqual([{ text: 'Alpha beta gamma', quote: 0 }, { text: ' delta' }]);
  });
});
