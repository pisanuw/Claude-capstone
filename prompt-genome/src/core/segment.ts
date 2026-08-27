import type { Gene, GeneType } from './types';

/**
 * Deterministic prompt segmentation: split a pasted prompt into typed genes.
 *
 * This replaces the idea's suggested Claude API call with a rule-based
 * classifier, so the same paste always yields the same genome, offline and
 * free. The classifier works in three passes:
 *
 *   1. Split the prompt into blocks on blank lines.
 *   2. A block that opens with an explicit label ("Constraints:", "## Format",
 *      "Example:") is classified wholesale by that label.
 *   3. Any other block is split into sentences; each sentence is classified
 *      by cue patterns, and adjacent same-type sentences merge into one gene.
 */

interface Cue {
  type: GeneType;
  pattern: RegExp;
  cue: string;
}

/** Explicit section labels: "Role:", "## Constraints", "**Examples**" ... */
const LABELS: { pattern: RegExp; type: GeneType }[] = [
  { pattern: /^(#+\s*|\*\*)?(role|you are)\b[:*]*/i, type: 'role' },
  { pattern: /^(#+\s*|\*\*)?(persona|tone|voice|style)\b[:*]*/i, type: 'persona' },
  { pattern: /^(#+\s*|\*\*)?(context|background|situation|about)\b[:*]*/i, type: 'context' },
  { pattern: /^(#+\s*|\*\*)?(task|goal|objective|instructions?)\b[:*]*/i, type: 'task' },
  { pattern: /^(#+\s*|\*\*)?(constraints?|rules?|requirements?|guidelines?)\b[:*]*/i, type: 'constraint' },
  { pattern: /^(#+\s*|\*\*)?(format|output|response format|structure)\b[:*]*/i, type: 'format' },
  { pattern: /^(#+\s*|\*\*)?(examples?|sample|demonstration)\b[:*]*/i, type: 'example' },
];

/** Sentence-level cues, checked in priority order (first match set wins). */
const CUES: Cue[] = [
  // example
  { type: 'example', pattern: /^(for example|e\.g\.|example\b|input\s*:|q\s*:)/i, cue: 'opens like a worked example' },
  { type: 'example', pattern: /\binput\s*:[\s\S]*\boutput\s*:/i, cue: 'input/output pair' },
  { type: 'example', pattern: /\bsuch as ["'`]/i, cue: 'quoted sample' },
  // role
  { type: 'role', pattern: /^(you are|you're|act as|imagine (you are|being)|take the role|pretend (to be|you are)|as an? [a-z]+(,| you))/i, cue: 'assigns an identity' },
  { type: 'role', pattern: /\byour role is\b/i, cue: 'names a role' },
  { type: 'role', pattern: /\b(an? (senior|expert|experienced|world-class) [a-z]+)\b/i, cue: 'expertise claim' },
  // persona
  { type: 'persona', pattern: /\b(tone|voice|persona|writing style)\b/i, cue: 'talks about tone or voice' },
  { type: 'persona', pattern: /\b(sound|be) (friendly|formal|casual|warm|professional|playful|encouraging|empathetic|direct)\b/i, cue: 'names a register' },
  // format
  { type: 'format', pattern: /\b(json|yaml|xml|csv|markdown|bullet(ed)? (points?|list)|numbered list|table|headings?|code block)\b/i, cue: 'names an output shape' },
  { type: 'format', pattern: /\b(respond|reply|answer|output|return|format) (only )?(in|with|as|using)\b/i, cue: 'prescribes response form' },
  { type: 'format', pattern: /\bstructure (your|the) (answer|response|output)\b/i, cue: 'prescribes structure' },
  // constraint
  { type: 'constraint', pattern: /\b(do not|don't|never|must not|avoid|refrain from|under no circumstances|exclude)\b/i, cue: 'forbids something' },
  { type: 'constraint', pattern: /\b(must|always|only|ensure|make sure|be sure to)\b/i, cue: 'hard requirement' },
  { type: 'constraint', pattern: /\b(no more than|at most|at least|fewer than|within|limit\w* (\w+ ){0,2}?to|maximum|minimum|up to) \d+/i, cue: 'numeric limit' },
  { type: 'constraint', pattern: /\b\d+ (words?|sentences?|paragraphs?|items?|characters?)( or (fewer|less))?\b/i, cue: 'length limit' },
  // task
  { type: 'task', pattern: /^(please |kindly )?(write|summarize|summarise|explain|generate|create|translate|list|analyze|analyse|describe|draft|compose|review|classify|extract|answer|rewrite|produce|suggest|identify|compare|convert|fix|improve|plan|outline|evaluate|recommend|brainstorm|design|build|implement|find|give|provide|help)\b/i, cue: 'imperative verb' },
  { type: 'task', pattern: /^(your (task|job|goal|objective) is|i (want|need) you to|i would like you to|help me)\b/i, cue: 'states the task' },
  // context
  { type: 'context', pattern: /^(background|for context|context:|given|note that|keep in mind|consider that|here (is|are)|the following|below is)/i, cue: 'introduces background' },
  { type: 'context', pattern: /\b(we are|we're|i am|i'm|our (team|company|class|project)|my (team|company|class|project))\b/i, cue: 'describes the situation' },
];

const FALLBACK_CUE = 'no strong signal; treated as background';

let idCounter = 0;

/** Reset the id sequence (used by tests for stable snapshots). */
export function resetGeneIds(): void {
  idCounter = 0;
}

function nextId(): string {
  idCounter += 1;
  return `g${idCounter}`;
}

export function makeGene(type: GeneType, text: string, cues: string[]): Gene {
  return { id: nextId(), type, text, cues };
}

function labelType(block: string): { type: GeneType; cue: string } | null {
  const firstLine = block.split('\n', 1)[0].trim();
  // Only trust short heading-like openers; a full sentence that happens to
  // start with "You are" is handled better by the sentence classifier.
  const headingLike = /[:*#]\s*$/.test(firstLine) || /^#+\s/.test(firstLine) || firstLine.split(/\s+/).length <= 3;
  if (!headingLike) return null;
  for (const { pattern, type } of LABELS) {
    if (pattern.test(firstLine)) {
      return { type, cue: `labeled section ("${firstLine.slice(0, 40)}")` };
    }
  }
  return null;
}

export function classifySentence(sentence: string): { type: GeneType; cues: string[] } {
  const matches = new Map<GeneType, string[]>();
  for (const { type, pattern, cue } of CUES) {
    if (pattern.test(sentence)) {
      const list = matches.get(type) ?? [];
      list.push(cue);
      matches.set(type, list);
    }
  }
  // CUES is ordered by priority: the first type that matched anything wins.
  for (const { type } of CUES) {
    const cues = matches.get(type);
    if (cues) return { type, cues: [...new Set(cues)] };
  }
  return { type: 'context', cues: [FALLBACK_CUE] };
}

/** Split a block into sentences, keeping list items whole. */
export function splitSentences(block: string): string[] {
  const parts: string[] = [];
  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (/^([-*+•]|\d+[.)])\s/.test(trimmed)) {
      // A list item is one unit regardless of its punctuation.
      parts.push(trimmed);
      continue;
    }
    // Split on sentence enders followed by whitespace and a capital/quote.
    const pieces = trimmed.split(/(?<=[.!?])\s+(?=["'A-Z])/);
    for (const p of pieces) {
      if (p.trim() !== '') parts.push(p.trim());
    }
  }
  return parts;
}

/**
 * Segment a prompt into genes. Empty input yields an empty genome.
 */
export function segmentPrompt(text: string): Gene[] {
  const genes: Gene[] = [];
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b !== '');

  for (const block of blocks) {
    const labeled = labelType(block);
    if (labeled) {
      genes.push(makeGene(labeled.type, block, [labeled.cue]));
      continue;
    }
    // An input/output pair spanning lines is one example gene.
    if (/\binput\s*:/i.test(block) && /\boutput\s*:/i.test(block)) {
      genes.push(makeGene('example', block, ['input/output pair']));
      continue;
    }
    let current: { type: GeneType; texts: string[]; cues: string[] } | null = null;
    for (const sentence of splitSentences(block)) {
      const { type, cues } = classifySentence(sentence);
      if (current && current.type === type) {
        current.texts.push(sentence);
        current.cues.push(...cues);
      } else {
        if (current) {
          genes.push(makeGene(current.type, current.texts.join(' '), [...new Set(current.cues)]));
        }
        current = { type, texts: [sentence], cues: [...cues] };
      }
    }
    if (current) {
      genes.push(makeGene(current.type, current.texts.join(' '), [...new Set(current.cues)]));
    }
  }
  return genes;
}
