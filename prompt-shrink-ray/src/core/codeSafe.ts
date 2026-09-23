const FENCE_RE = /```[\s\S]*?```/g;
// Private-Use-Area characters: vanishingly unlikely to appear in a pasted
// prompt, so they double as safe placeholder delimiters.
const MARK_START = '';
const MARK_END = '';
const PLACEHOLDER_RE = new RegExp(`${MARK_START}CODE(\\d+)${MARK_END}`, 'g');

/**
 * Runs `fn` over `text` with fenced code blocks swapped out for placeholders
 * first, so compression rules never rewrite code the prompt is showing
 * verbatim. Placeholders are restored byte-for-byte afterward.
 */
export function applyOutsideCodeFences(text: string, fn: (segment: string) => string): string {
  const blocks: string[] = [];
  const withPlaceholders = text.replace(FENCE_RE, (match) => {
    const index = blocks.length;
    blocks.push(match);
    return `${MARK_START}CODE${index}${MARK_END}`;
  });
  const processed = fn(withPlaceholders);
  return processed.replace(PLACEHOLDER_RE, (_match, index: string) => blocks[Number(index)] ?? '');
}

export function extractCodeFences(text: string): string[] {
  return text.match(FENCE_RE) ?? [];
}
