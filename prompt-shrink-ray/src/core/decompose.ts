import type { Section, SectionKind } from './types.js';

const LABEL_RE =
  /^\s*(system(\s*prompt)?|instructions?|context|background|examples?|few-shot|sample(\s*(input|output))?|user|task|question|request|input)\s*:/i;

const SYSTEM_LABEL_RE = /^\s*(system(\s*prompt)?|instructions?)\s*:/i;
const CONTEXT_LABEL_RE = /^\s*(context|background)\s*:/i;
const EXAMPLE_LABEL_RE = /^\s*(examples?|few-shot|sample(\s*(input|output))?)\s*:/i;
const USER_LABEL_RE = /^\s*(user|task|question|request|input)\s*:/i;
const SYSTEM_OPENER_RE = /^\s*(you are|act as)\b/i;

/**
 * Splits a raw prompt into labeled sections. Blank lines start a new
 * paragraph; a line that opens with a recognized label (e.g. "System:",
 * "Example 2:") starts a new section even mid-paragraph, so back-to-back
 * labeled blocks pasted without blank lines still separate correctly.
 */
export function decomposePrompt(text: string): Section[] {
  const normalized = text.replace(/\r\n/g, '\n');
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) return [];

  const blocks: string[] = [];
  for (const paragraph of paragraphs) {
    const lines = paragraph.split('\n');
    let current: string[] = [];
    for (const line of lines) {
      if (LABEL_RE.test(line) && current.length > 0) {
        blocks.push(current.join('\n'));
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) blocks.push(current.join('\n'));
  }

  return blocks.map((block, index) => ({ kind: classifyBlock(block, index === 0), text: block }));
}

export function classifyBlock(block: string, isFirst: boolean): SectionKind {
  const firstLine = block.trimStart().split('\n', 1)[0] ?? '';
  if (SYSTEM_LABEL_RE.test(firstLine)) return 'system';
  if (CONTEXT_LABEL_RE.test(firstLine)) return 'context';
  if (EXAMPLE_LABEL_RE.test(firstLine)) return 'example';
  // Checked before the generic user-label test: "Input:" is also a user-label
  // alias, but a block pairing Input:/Output: (or Q:/A:) lines is a worked
  // example, not a request, and that reading should win.
  if (looksLikeExample(block)) return 'example';
  if (USER_LABEL_RE.test(firstLine)) return 'user';
  if (SYSTEM_OPENER_RE.test(firstLine)) return 'system';
  return isFirst ? 'system' : 'user';
}

function looksLikeExample(block: string): boolean {
  if (/\bexample\s*\d+\b/i.test(block)) return true;
  const qCount = (block.match(/^\s*q\s*:/gim) ?? []).length;
  const aCount = (block.match(/^\s*a\s*:/gim) ?? []).length;
  if (qCount >= 1 && aCount >= 1) return true;
  const inputCount = (block.match(/^\s*input\s*:/gim) ?? []).length;
  const outputCount = (block.match(/^\s*output\s*:/gim) ?? []).length;
  return inputCount >= 1 && outputCount >= 1;
}
