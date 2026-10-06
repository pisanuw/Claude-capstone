// Simulator-verified quiz questions: every answer is read off a replay.

import { hex, type HeapConfig } from './heap';
import { describeOp, formatOp, policyLabel, rng, runTrace, type Op, type Step } from './trace';
import { narrate } from './narrate';

export type QuestionType = 'address' | 'coalesce' | 'blocksize' | 'padding' | 'examined' | 'freeblocks' | 'largest' | 'success';

export const QUESTION_TYPES: { key: QuestionType; label: string }[] = [
  { key: 'address', label: 'Which address does the next malloc return?' },
  { key: 'coalesce', label: 'How many blocks merge on this free?' },
  { key: 'blocksize', label: 'How big is the block malloc carves out?' },
  { key: 'padding', label: 'How many padding bytes does the block carry?' },
  { key: 'examined', label: 'How many free blocks does the search examine?' },
  { key: 'freeblocks', label: 'How many free blocks are on the heap afterwards?' },
  { key: 'largest', label: 'How large is the largest free block afterwards?' },
  { key: 'success', label: 'Does this malloc succeed?' },
];

export interface Question {
  n: number;
  type: QuestionType;
  /** Op index the question is about; the heap shown is the state before it. */
  step: number;
  /** Trace lines up to and including the op in question. */
  context: string;
  policy: string;
  prompt: string;
  answer: string;
  /** Alternative spellings accepted as correct. */
  accepted: string[];
  explanation: string;
}

export interface QuizOptions {
  count: number;
  seed: number;
  types: QuestionType[];
}

function contextText(ops: Op[], upto: number): string {
  return ops
    .slice(0, upto + 1)
    .map((op, i) => `${String(i + 1).padStart(3)}  ${formatOp(op)}${i === upto ? '   <- this op' : ''}`)
    .join('\n');
}

function build(type: QuestionType, step: Step, prev: Step | undefined, cfg: HeapConfig): Omit<Question, 'n' | 'context' | 'policy' | 'step' | 'type'> | null {
  const e = step.event;
  const op = describeOp(step.op);
  const before = prev ? prev.metrics : undefined;
  const explanation = narrate(step);
  switch (type) {
    case 'address': {
      if (e.kind === 'free' || (e.error && e.asize === 0)) return null;
      const a = e.result === null ? 'NULL' : hex(e.result);
      return {
        prompt: `Which payload address does ${op} return? Answer in hex (for example 0x40) or NULL.`,
        answer: a,
        accepted: e.result === null ? ['NULL', 'null', '0', '0x0', 'nil'] : [a, String(e.result), hex(e.result).toUpperCase()],
        explanation,
      };
    }
    case 'coalesce': {
      if (e.kind !== 'free' || e.error) return null;
      if (step.cfg.coalesce !== 'immediate') return null;
      return {
        prompt: `When ${op} runs, how many free blocks (counting the freed block itself) are merged into one?`,
        answer: String(e.merged),
        accepted: [String(e.merged)],
        explanation,
      };
    }
    case 'blocksize': {
      if (e.kind !== 'malloc' || e.error) return null;
      return {
        prompt: `How many bytes, header and footer included, does the block carved out for ${op} occupy?`,
        answer: String(e.asize),
        accepted: [String(e.asize)],
        explanation,
      };
    }
    case 'padding': {
      if (e.kind !== 'malloc' || e.result === null) return null;
      const blockSize = e.split || !e.found ? e.asize : e.found.size;
      const pad = blockSize - e.req - 2 * cfg.word;
      return {
        prompt: `After ${op}, how many bytes of the allocated block are padding (neither payload, header nor footer)?`,
        answer: String(pad),
        accepted: [String(pad)],
        explanation,
      };
    }
    case 'examined': {
      if (e.kind === 'free' || e.error) return null;
      if (e.kind === 'realloc' && e.strategy !== 'move') return null;
      return {
        prompt: `How many free blocks does the ${step.cfg.fit}-fit search examine while serving ${op}?`,
        answer: String(e.examined.length),
        accepted: [String(e.examined.length)],
        explanation,
      };
    }
    case 'freeblocks': {
      if (e.error) return null;
      const n = step.metrics.freeBlocks;
      return {
        prompt: `After ${op} completes, how many free blocks are on the heap?`,
        answer: String(n),
        accepted: [String(n)],
        explanation: `${explanation} Afterwards the heap holds ${n} free block${n === 1 ? '' : 's'}${before ? ` (it held ${before.freeBlocks} before)` : ''}.`,
      };
    }
    case 'largest': {
      if (e.error) return null;
      const n = step.metrics.largestFree;
      return {
        prompt: `After ${op} completes, how many bytes is the largest free block (header and footer included)?`,
        answer: String(n),
        accepted: [String(n)],
        explanation: `${explanation} The largest free block afterwards is ${n} bytes.`,
      };
    }
    case 'success': {
      if (e.kind !== 'malloc' || (e.error && e.asize === 0)) return null;
      const ok = e.result !== null;
      return {
        prompt: `Does ${op} succeed, or does it return NULL? Answer "succeeds" or "NULL".`,
        answer: ok ? 'succeeds' : 'NULL',
        accepted: ok ? ['succeeds', 'yes', 'success'] : ['NULL', 'null', 'fails', 'no'],
        explanation,
      };
    }
  }
}

export function generateQuiz(ops: Op[], cfg: HeapConfig, opts: QuizOptions): Question[] {
  const run = runTrace(ops, cfg);
  const r = rng(opts.seed);
  const types = opts.types.length > 0 ? opts.types : QUESTION_TYPES.map((t) => t.key);
  const out: Question[] = [];
  const used = new Set<string>();
  const policy = policyLabel(cfg);
  let attempts = 0;
  while (out.length < opts.count && attempts < opts.count * 40 && run.steps.length > 0) {
    attempts += 1;
    const type = types[Math.floor(r() * types.length)];
    const idx = Math.floor(r() * run.steps.length);
    const key = `${type}:${idx}`;
    if (used.has(key)) continue;
    const q = build(type, run.steps[idx], run.steps[idx - 1], cfg);
    if (!q) continue;
    used.add(key);
    out.push({ n: out.length + 1, type, step: idx, context: contextText(ops, idx), policy, ...q });
  }
  return out;
}

export function checkAnswer(q: Question, given: string): boolean {
  const g = given.trim().toLowerCase();
  if (!g) return false;
  return q.accepted.some((a) => a.toLowerCase() === g);
}

export function quizToMarkdown(qs: Question[], cfg: HeapConfig, withAnswers: boolean): string {
  const lines: string[] = [`# Heap Arena Replay quiz`, '', `Allocator: ${policyLabel(cfg)}, ${cfg.word}-byte words, ${cfg.heapSize}-byte heap.`, ''];
  for (const q of qs) {
    lines.push(`## Question ${q.n}`, '', '```', q.context, '```', '', q.prompt, '');
    if (withAnswers) lines.push(`**Answer:** ${q.answer}`, '', q.explanation, '');
  }
  return lines.join('\n');
}
