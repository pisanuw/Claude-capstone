import { describe, expect, it } from 'vitest';
import { classifyBlock, decomposePrompt } from '../src/core/decompose.js';

describe('decomposePrompt', () => {
  it('returns an empty array for blank input', () => {
    expect(decomposePrompt('   \n\n  ')).toEqual([]);
  });

  it('splits on blank lines into paragraphs', () => {
    const sections = decomposePrompt('First paragraph.\n\nSecond paragraph.');
    expect(sections).toHaveLength(2);
    expect(sections[0].text).toBe('First paragraph.');
    expect(sections[1].text).toBe('Second paragraph.');
  });

  it('splits on a label line even without a blank line before it', () => {
    const sections = decomposePrompt('System: be terse\nUser: summarize this');
    expect(sections).toHaveLength(2);
    expect(sections[0].kind).toBe('system');
    expect(sections[1].kind).toBe('user');
  });

  it('classifies the first unlabeled paragraph as system, later ones as user', () => {
    const sections = decomposePrompt('Do the thing well.\n\nHere is my request.');
    expect(sections[0].kind).toBe('system');
    expect(sections[1].kind).toBe('user');
  });

  it('normalizes CRLF line endings before splitting', () => {
    const sections = decomposePrompt('One.\r\n\r\nTwo.');
    expect(sections).toHaveLength(2);
  });
});

describe('classifyBlock', () => {
  it.each([
    ['System prompt: act as a helpful assistant', 'system'],
    ['Instructions: do X', 'system'],
    ['Context: the user is a beginner', 'context'],
    ['Background: prior conversation summary', 'context'],
    ['Examples: see below', 'example'],
    ['Example 1: input -> output', 'example'],
    ['Few-shot: sample pairs', 'example'],
    ['User: please help', 'user'],
    ['Task: summarize the article', 'user'],
    ['You are a pirate who only speaks in rhyme.', 'system'],
    ['Act as a senior reviewer.', 'system'],
  ] as const)('classifies %j as %s', (block, expected) => {
    expect(classifyBlock(block, false)).toBe(expected);
  });

  it('detects Q/A pairs as an example block', () => {
    expect(classifyBlock('Q: what is 2+2?\nA: 4', false)).toBe('example');
  });

  it('detects Input/Output pairs as an example block', () => {
    expect(classifyBlock('Input: hello\nOutput: HELLO', false)).toBe('example');
  });

  it('falls back to system for the first block and user otherwise', () => {
    expect(classifyBlock('Just some plain text.', true)).toBe('system');
    expect(classifyBlock('Just some plain text.', false)).toBe('user');
  });
});
