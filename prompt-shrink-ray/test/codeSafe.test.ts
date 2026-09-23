import { describe, expect, it } from 'vitest';
import { applyOutsideCodeFences, extractCodeFences } from '../src/core/codeSafe.js';

describe('applyOutsideCodeFences', () => {
  it('applies the function only outside fenced code blocks', () => {
    const text = 'please do this\n```js\nplease.leaveThisAlone();\n```\nplease do that';
    const result = applyOutsideCodeFences(text, (s) => s.replace(/please/g, ''));
    expect(result).toContain('please.leaveThisAlone();');
    expect(result).not.toMatch(/please do this/);
    expect(result).not.toMatch(/please do that/);
  });

  it('restores multiple code fences in order', () => {
    const text = '```a\ncode1\n```\nmiddle\n```b\ncode2\n```';
    const result = applyOutsideCodeFences(text, (s) => s.toUpperCase());
    expect(result).toBe('```a\ncode1\n```\nMIDDLE\n```b\ncode2\n```');
  });

  it('is a no-op wrapper when there are no code fences', () => {
    const result = applyOutsideCodeFences('hello world', (s) => s.toUpperCase());
    expect(result).toBe('HELLO WORLD');
  });
});

describe('extractCodeFences', () => {
  it('returns each fenced block verbatim', () => {
    const text = 'text\n```js\nconst x = 1;\n```\nmore\n```py\nx = 1\n```';
    expect(extractCodeFences(text)).toEqual(['```js\nconst x = 1;\n```', '```py\nx = 1\n```']);
  });

  it('returns an empty array when there is no fenced code', () => {
    expect(extractCodeFences('no code here')).toEqual([]);
  });
});
