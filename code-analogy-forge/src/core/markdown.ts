import type { Audience } from './types';
import { AUDIENCE_LABELS } from './types';
import { getAnalogy } from './corpus/index';

/**
 * Render one analogy card as Markdown, ready to paste into a blog post,
 * slide deck, or Stack Overflow answer.
 */
export function analogyToMarkdown(analogyId: string, audience: Audience, note?: string): string | null {
  const found = getAnalogy(analogyId);
  if (!found) return null;
  const { concept, analogy } = found;
  const lines: string[] = [
    `### ${concept.name}: ${analogy.title}`,
    '',
    `*${analogy.domainLabel} analogy, written for a ${AUDIENCE_LABELS[audience].toLowerCase()}.*`,
    '',
    analogy.text[audience],
    '',
    '| In the code | In the analogy |',
    '| --- | --- |',
    ...analogy.maps.map((m) => `| ${m.code} | ${m.analog} |`),
  ];
  const trimmedNote = note?.trim();
  if (trimmedNote) {
    lines.push('', `> ${trimmedNote}`);
  }
  lines.push('', '<sub>Forged with Code Analogy Forge.</sub>', '');
  return lines.join('\n');
}
