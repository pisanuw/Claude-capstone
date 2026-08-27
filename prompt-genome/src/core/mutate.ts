import type { Gene, GeneType, Mutation } from './types';

/**
 * Deterministic gene mutations: three alternative phrasings per gene,
 * replacing the idea's "AI suggests three alternatives" with rule-based
 * transforms. The same gene always yields the same three mutations, each
 * labeled with what it changes and why.
 */

/** Case-aware word swaps used by strengthen/soften. */
function swapWords(text: string, pairs: [RegExp, string][]): string {
  let out = text;
  for (const [pattern, replacement] of pairs) {
    out = out.replace(pattern, (match) => {
      const isCapitalized = /^[A-Z]/.test(match);
      return isCapitalized ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
    });
  }
  return out;
}

export function strengthen(text: string): string {
  return swapWords(text, [
    [/\bshould\b/gi, 'must'],
    [/\btry to\b/gi, 'always'],
    [/\baim to\b/gi, 'always'],
    [/\bavoid\b/gi, 'never use'],
    [/\bplease\b\s*/gi, ''],
    [/\bif possible\b,?\s*/gi, ''],
    [/\bideally\b,?\s*/gi, ''],
  ]).trim();
}

export function soften(text: string): string {
  return swapWords(text, [
    [/\bmust not\b/gi, 'should not'],
    [/\bmust\b/gi, 'should'],
    [/\bnever\b/gi, 'avoid'],
    [/\bdo not\b/gi, 'prefer not to'],
    [/\bdon't\b/gi, 'prefer not to'],
    [/\balways\b/gi, 'where possible'],
  ]).trim();
}

function ensureSentenceEnd(text: string): string {
  const trimmed = text.trim();
  return /[.!?:]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function withSuffix(text: string, suffix: string): string {
  return `${ensureSentenceEnd(text)} ${suffix}`;
}

const RECIPES: Record<GeneType, { label: string; rationale: string; make: (text: string) => string }[]> = {
  role: [
    {
      label: 'Deepen the expertise',
      rationale: 'Concrete experience claims pull answers toward specifics instead of generalities.',
      make: (t) => withSuffix(t, 'You have ten years of hands-on experience in this area; ground every claim in concrete practice, not textbook generalities.'),
    },
    {
      label: 'Name the audience',
      rationale: 'A role plus an audience fixes the level of explanation.',
      make: (t) => withSuffix(t, 'You are addressing a reader who is smart but new to this subject; define each term of art the first time it appears.'),
    },
    {
      label: 'Add a self-check',
      rationale: 'Asking the model to judge its own answer against the role catches out-of-character output.',
      make: (t) => withSuffix(t, 'Before finishing, check that an expert in this role would sign the answer as written.'),
    },
  ],
  persona: [
    {
      label: 'Formal register',
      rationale: 'Removes chattiness; suits reports and documentation.',
      make: (t) => withSuffix(t, 'Keep the register formal: complete sentences, no exclamations, no asides.'),
    },
    {
      label: 'Plain-spoken register',
      rationale: 'Short words and short sentences; suits explanations for broad audiences.',
      make: (t) => withSuffix(t, 'Prefer short, plain words and sentences under twenty words; say it the way you would across a desk.'),
    },
    {
      label: 'Warm register',
      rationale: 'Encouraging tone; suits feedback and teaching.',
      make: (t) => withSuffix(t, 'Keep the tone warm and encouraging; acknowledge effort before pointing out problems.'),
    },
  ],
  context: [
    {
      label: 'Mark it as ground truth',
      rationale: 'Tells the model to prefer your facts over its own priors.',
      make: (t) => `Background, to be treated as ground truth: ${t.trim()}`,
    },
    {
      label: 'Fence the scope',
      rationale: 'Blocks the model from inventing facts beyond the context you gave.',
      make: (t) => withSuffix(t, 'Only the details above are in scope; do not invent additional facts.'),
    },
    {
      label: 'Surface the gaps',
      rationale: 'An explicit escape hatch beats a confident guess.',
      make: (t) => withSuffix(t, 'If a fact you need is missing here, say which one instead of guessing.'),
    },
  ],
  task: [
    {
      label: 'Force steps',
      rationale: 'Stepwise work improves reasoning-heavy tasks.',
      make: (t) => withSuffix(t, 'Work through this in numbered steps, then give the final result on its own line.'),
    },
    {
      label: 'One deliverable',
      rationale: 'A single named deliverable prevents sprawling answers.',
      make: (t) => `Your single deliverable: ${t.trim().charAt(0).toLowerCase()}${t.trim().slice(1)}`,
    },
    {
      label: 'Add acceptance check',
      rationale: 'Ends with the model verifying its own output against the ask.',
      make: (t) => withSuffix(t, 'Before answering, re-read this instruction and confirm the output satisfies every part of it.'),
    },
  ],
  constraint: [
    {
      label: 'Harden it',
      rationale: 'Softeners ("should", "try to") become musts; the rule reads as non-negotiable.',
      make: (t) => withSuffix(strengthen(t), 'This is a hard requirement, not a preference.'),
    },
    {
      label: 'Soften it',
      rationale: 'A preference instead of a rule; useful when the constraint sometimes fights the task.',
      make: (t) => withSuffix(soften(t), 'Use judgment when this conflicts with the main task, and say when you did.'),
    },
    {
      label: 'Make it checkable',
      rationale: 'A constraint the model re-verifies is far more likely to hold.',
      make: (t) => withSuffix(t, 'After drafting, verify this constraint is satisfied; if not, revise once before answering.'),
    },
  ],
  format: [
    {
      label: 'Lock the format',
      rationale: 'Forbids preamble and trailing chat around the structured output.',
      make: (t) => withSuffix(t, 'Output nothing outside this format: no preamble, no closing remarks.'),
    },
    {
      label: 'Add a fallback rule',
      rationale: 'Defines what happens when content cannot fit, instead of silent improvisation.',
      make: (t) => withSuffix(t, 'If the content cannot fit this format, say why in one sentence rather than inventing a different format.'),
    },
    {
      label: 'Demand validity',
      rationale: 'For machine-readable formats, ask for output that parses, not output that looks right.',
      make: (t) => withSuffix(t, 'The output must be machine-parseable exactly as specified; check it would parse before answering.'),
    },
  ],
  example: [
    {
      label: 'Label the parts',
      rationale: 'Explicitly separating input from expected output removes ambiguity about which is which.',
      make: (t) => `Example (input first, expected output after it):\n${t.trim()}`,
    },
    {
      label: 'Generalize the pattern',
      rationale: 'Tells the model to copy the structure, not the topic.',
      make: (t) => withSuffix(t, "Match this example's structure and level of detail, not its topic."),
    },
    {
      label: 'Make it binding',
      rationale: 'Turns an illustration into a specification.',
      make: (t) => withSuffix(t, 'Treat any output that deviates from this shape as wrong.'),
    },
  ],
};

export function mutations(gene: Gene): Mutation[] {
  return RECIPES[gene.type].map((recipe, i) => ({
    id: `${gene.id}-m${i + 1}`,
    label: recipe.label,
    rationale: recipe.rationale,
    text: recipe.make(gene.text),
  }));
}
