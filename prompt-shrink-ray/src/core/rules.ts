/**
 * Word/phrase rewrite tables used by the compressor. Every entry is a
 * meaning-preserving substitution (never a bare deletion of content words),
 * so compression never silently drops an instruction.
 */

export interface PhraseRule {
  pattern: RegExp;
  replacement: string;
}

function boundary(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`, 'gi');
}

// Applied at every aggressiveness level: pure noise with no semantic content.
export const FILLER_WORDS: PhraseRule[] = [
  { pattern: boundary('please'), replacement: '' },
  { pattern: boundary('kindly'), replacement: '' },
  { pattern: boundary('just to clarify'), replacement: '' },
  { pattern: boundary('simply'), replacement: '' },
  { pattern: boundary('basically'), replacement: '' },
  { pattern: boundary('very'), replacement: '' },
  { pattern: boundary('really'), replacement: '' },
];

// Applied at medium and aggressive: verbose phrase -> terser equivalent, same meaning.
export const VERBOSE_PHRASES: PhraseRule[] = [
  { pattern: boundary('in order to'), replacement: 'to' },
  { pattern: boundary('due to the fact that'), replacement: 'because' },
  { pattern: boundary('at this point in time'), replacement: 'now' },
  { pattern: boundary('in the event that'), replacement: 'if' },
  { pattern: boundary('for the purpose of'), replacement: 'to' },
  { pattern: boundary('with regard to'), replacement: 'about' },
  { pattern: boundary('a large number of'), replacement: 'many' },
  { pattern: boundary('in spite of the fact that'), replacement: 'although' },
  { pattern: boundary('on a regular basis'), replacement: 'regularly' },
  { pattern: boundary('in the near future'), replacement: 'soon' },
  { pattern: boundary('prior to'), replacement: 'before' },
  { pattern: boundary('subsequent to'), replacement: 'after' },
  { pattern: boundary('take into consideration'), replacement: 'consider' },
  { pattern: boundary('make a decision'), replacement: 'decide' },
  { pattern: boundary('come to the conclusion'), replacement: 'conclude' },
  { pattern: boundary('give consideration to'), replacement: 'consider' },
  { pattern: boundary('it is important that you'), replacement: 'you must' },
  { pattern: boundary('please make sure to'), replacement: 'you must' },
  { pattern: boundary('make sure to'), replacement: 'must' },
  { pattern: boundary('you should make sure that'), replacement: 'ensure' },
];

// Applied at aggressive only: hedges that carry no instructional content.
export const HEDGE_WORDS: PhraseRule[] = [
  { pattern: boundary('I think'), replacement: '' },
  { pattern: boundary('in my opinion'), replacement: '' },
  { pattern: boundary('sort of'), replacement: '' },
  { pattern: boundary('kind of'), replacement: '' },
  { pattern: boundary('somewhat'), replacement: '' },
  { pattern: boundary('arguably'), replacement: '' },
  { pattern: boundary('generally speaking'), replacement: '' },
  { pattern: boundary('please note that'), replacement: '' },
  { pattern: boundary('it should be noted that'), replacement: '' },
  { pattern: boundary('keep in mind that'), replacement: '' },
];

export function applyPhraseRules(text: string, rules: PhraseRule[]): { text: string; applied: boolean } {
  let result = text;
  let applied = false;
  for (const rule of rules) {
    const next = result.replace(rule.pattern, rule.replacement);
    if (next !== result) applied = true;
    result = next;
  }
  return { text: result, applied };
}
