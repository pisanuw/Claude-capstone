import type { Detection } from './types';
import { CONCEPTS } from './corpus/index';

/**
 * Deterministic concept detection over pasted code or prose.
 *
 * Two signal sources, summed per concept:
 *  - keyword mentions ("recursion", "hash map"), matched as whole words/phrases;
 *  - code-shape patterns (a `while` loop, `.push(` + `.pop(`, a function calling itself).
 *
 * No AI, no network: the same paste always yields the same ranking.
 */

const KEYWORD_SCORE = 4;
const PATTERN_SCORE = 2;
const SELF_CALL_SCORE = 6;

interface PatternRule {
  re: RegExp;
  why: string;
}

interface ConceptRules {
  conceptId: string;
  keywords: string[];
  patterns: PatternRule[];
}

const RULES: ConceptRules[] = [
  {
    conceptId: 'variable',
    keywords: ['variable', 'variables', 'assignment', 'mutable state'],
    patterns: [
      { re: /\b(?:let|const|var)\s+[A-Za-z_$][\w$]*\s*=/, why: 'declares and assigns a variable' },
      { re: /\b(?:int|long|double|float|boolean|String)\s+\w+\s*=/, why: 'typed variable declaration' },
      { re: /^\s*[A-Za-z_]\w*\s*=\s*[^=\s]/m, why: 'assigns a value to a name' },
      { re: /\b\w+\s*(?:\+=|-=|\*=)\s*/, why: 'updates a variable in place' },
    ],
  },
  {
    conceptId: 'function-return',
    // "a function" / "functions" catch prose without firing on the JS
    // `function` keyword, which the patterns below already score.
    keywords: ['a function', 'functions', 'return value', 'method', 'parameter', 'subroutine'],
    patterns: [
      { re: /\breturn\b/, why: 'uses return' },
      { re: /\bdef\s+\w+\s*\(/, why: 'defines a function (def)' },
      { re: /\bfunction\b\s*\w*\s*\(/, why: 'defines a function' },
      { re: /=>/, why: 'arrow function' },
    ],
  },
  {
    conceptId: 'conditional',
    keywords: ['conditional', 'conditionals', 'if statement', 'if/else', 'branching', 'ternary'],
    patterns: [
      { re: /\bif\s*\(|^\s*(?:el)?if\b[^\n]*:/m, why: 'has an if' },
      { re: /\belse\b/, why: 'has an else branch' },
      { re: /\b(?:elif|else if)\b/, why: 'chains conditions' },
      { re: /\bswitch\s*\(/, why: 'has a switch' },
    ],
  },
  {
    conceptId: 'loop',
    keywords: ['loop', 'loops', 'iteration', 'iterate', 'for loop', 'while loop'],
    patterns: [
      { re: /\bfor\s*[(\s]\s*\w/, why: 'has a for loop' },
      { re: /\bwhile\s*[(\s]/, why: 'has a while loop' },
      { re: /\.forEach\s*\(/, why: 'iterates with forEach' },
      { re: /\brange\s*\(/, why: 'iterates over a range' },
      { re: /\bfor\s+\w+\s+in\b/, why: 'has a for-in/for-each loop' },
    ],
  },
  {
    conceptId: 'array',
    keywords: ['array', 'arrays', 'arraylist', 'indexing', 'out of bounds'],
    patterns: [
      { re: /\b\w+\[[^\]\n]*\]/, why: 'indexes with square brackets' },
      { re: /\.append\s*\(/, why: 'appends to a list' },
      { re: /\bnew\s+\w+\[\d*\]/, why: 'allocates an array' },
      { re: /\.length\b|\blen\s*\(/, why: 'reads a length' },
    ],
  },
  {
    conceptId: 'hashmap',
    keywords: ['hash map', 'hashmap', 'hash table', 'dictionary', 'key-value', 'lookup table'],
    patterns: [
      { re: /\bnew\s+(?:Map|HashMap|WeakMap)\b/, why: 'creates a map' },
      { re: /\bdict\s*\(|\{\s*['"][^'"\n]+['"]\s*:/, why: 'builds a dictionary literal' },
      { re: /\.(?:get|set|has)\s*\(\s*['"\w]/, why: 'looks up by key' },
      { re: /\bin\s+\w+\s*:\s*$|\.containsKey\s*\(/m, why: 'checks for a key' },
    ],
  },
  {
    conceptId: 'stack',
    keywords: ['stack', 'lifo', 'last in first out', 'call stack', 'undo history'],
    patterns: [
      { re: /\bnew\s+Stack\b|\bStack</, why: 'creates a stack' },
      { re: /\.push\s*\([\s\S]*\.pop\s*\(|\.pop\s*\([\s\S]*\.push\s*\(/, why: 'pushes and pops' },
      { re: /\.peek\s*\(/, why: 'peeks at a top element' },
    ],
  },
  {
    conceptId: 'queue',
    keywords: ['queue', 'fifo', 'first in first out', 'enqueue', 'dequeue'],
    patterns: [
      { re: /\bnew\s+Queue\b|\bQueue</, why: 'creates a queue' },
      { re: /\.shift\s*\(|\.poll\s*\(|\bpopleft\b/, why: 'removes from the front' },
    ],
  },
  {
    conceptId: 'tree',
    keywords: ['tree', 'binary tree', 'binary search tree', 'bst', 'hierarchy', 'treenode'],
    patterns: [
      { re: /\.left\b[\s\S]*\.right\b|\.right\b[\s\S]*\.left\b/, why: 'nodes with left and right children' },
      { re: /\bTreeNode\b|\broot\b/, why: 'mentions a root or tree node' },
      { re: /\.children\b/, why: 'nodes with children' },
    ],
  },
  {
    conceptId: 'binary-search',
    keywords: ['binary search', 'bisect', 'halving the range'],
    patterns: [
      { re: /\b(?:lo|low|left)\b[\s\S]{0,120}?\b(?:hi|high|right)\b[\s\S]{0,120}?\bmid\b/, why: 'keeps low/high/mid bounds' },
      { re: /\(\s*(?:lo|low|left)\s*\+\s*(?:hi|high|right)\s*\)\s*(?:\/|\/\/|>>)\s*[21]/, why: 'computes a midpoint' },
    ],
  },
  {
    conceptId: 'sorting',
    keywords: [
      'sort',
      'sorting',
      'sorted order',
      'quicksort',
      'merge sort',
      'mergesort',
      'bubble sort',
      'insertion sort',
      'selection sort',
    ],
    patterns: [
      { re: /\.sort\s*\(|\bsorted\s*\(|Collections\.sort|Arrays\.sort/, why: 'calls a sort' },
      { re: /\bswap\s*\(|\b(?:temp|tmp)\s*=\s*\w+\s*[;\n]\s*\w+\s*=\s*\w+/, why: 'swaps two elements' },
    ],
  },
  {
    conceptId: 'recursion',
    keywords: ['recursion', 'recursive', 'recurse', 'base case', 'self-referential'],
    patterns: [],
  },
  {
    conceptId: 'async',
    keywords: ['async', 'asynchronous', 'await', 'promise', 'promises', 'callback', 'concurrency', 'non-blocking'],
    patterns: [
      { re: /\basync\s+(?:function|def|\w+\s*\()|\basync\s*\(/, why: 'declares async work' },
      { re: /\bawait\b/, why: 'awaits a result' },
      { re: /\bPromise\b|\.then\s*\(/, why: 'uses promises' },
      { re: /\bsetTimeout\s*\(|\bsetInterval\s*\(/, why: 'schedules work for later' },
    ],
  },
  {
    conceptId: 'class-oop',
    keywords: [
      'class',
      'classes',
      'object-oriented',
      'oop',
      'inheritance',
      'polymorphism',
      'encapsulation',
      'instance',
      'constructor',
    ],
    patterns: [
      { re: /\bclass\s+[A-Z]\w*/, why: 'defines a class' },
      { re: /\bextends\b|\bimplements\b|\bsuper\s*[(.]/, why: 'uses inheritance' },
      { re: /\bself\.\w+|\bthis\.\w+/, why: 'accesses instance state' },
      { re: /\bnew\s+[A-Z]\w*\s*\(|__init__/, why: 'constructs an object' },
    ],
  },
];

const knownConceptIds = new Set(CONCEPTS.map((c) => c.id));

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The text between the braces that open at or after `from` (best effort). */
function braceBody(input: string, from: number): string | null {
  const open = input.indexOf('{', from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < input.length; i++) {
    if (input[i] === '{') depth += 1;
    else if (input[i] === '}') {
      depth -= 1;
      if (depth === 0) return input.slice(open + 1, i);
    }
  }
  // Unbalanced snippet (partial paste): take everything after the brace.
  return input.slice(open + 1);
}

/** The indented block following a Python def at `lineStart`. */
function pythonBody(input: string, lineStart: number): string {
  const lines = input.slice(lineStart).split('\n');
  const defIndent = (/^\s*/.exec(lines[0]) ?? [''])[0].length;
  const body: string[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue;
    const indent = (/^\s*/.exec(line) ?? [''])[0].length;
    if (indent <= defIndent) break;
    body.push(line);
  }
  return body.join('\n');
}

interface FoundFunction {
  name: string;
  body: string;
}

/** Functions defined in the input with their (best-effort) bodies. */
function definedFunctions(input: string): FoundFunction[] {
  const out: FoundFunction[] = [];
  const seen = new Set<string>();
  const push = (name: string, body: string | null) => {
    if (body !== null && !seen.has(name)) {
      seen.add(name);
      out.push({ name, body });
    }
  };

  for (const m of input.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    push(m[1], braceBody(input, m.index + m[0].length));
  }
  for (const m of input.matchAll(/^([ \t]*)def\s+([A-Za-z_]\w*)\s*\(/gm)) {
    push(m[2], pythonBody(input, m.index));
  }
  for (const m of input.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)\n]*\)|[\w$]+)\s*=>/g,
  )) {
    const after = input.slice(m.index + m[0].length);
    const trimmed = after.trimStart();
    if (trimmed.startsWith('{')) {
      push(m[1], braceBody(input, m.index + m[0].length));
    } else {
      // Expression body: up to the terminating semicolon or end of input.
      const end = after.indexOf(';');
      push(m[1], end === -1 ? after : after.slice(0, end));
    }
  }
  for (const m of input.matchAll(
    /\b(?:public|private|protected|static|int|long|double|float|boolean|void|String|char)\s+(?:[\w<>[\]]+\s+)?([A-Za-z_]\w*)\s*\([^)\n]*\)\s*\{/g,
  )) {
    push(m[1], braceBody(input, m.index + m[0].length - 1));
  }
  return out;
}

/** Names of defined functions whose own body calls them again (self-recursion). */
export function selfCallingFunctions(input: string): string[] {
  const out: string[] = [];
  for (const fn of definedFunctions(input)) {
    if (new RegExp(`\\b${escapeRegExp(fn.name)}\\s*\\(`).test(fn.body)) {
      out.push(fn.name);
    }
  }
  return out;
}

/** Run every rule over the input and return concepts ranked by score (desc). */
export function detectConcepts(input: string): Detection[] {
  const text = input.trim();
  if (text === '') return [];
  const lower = text.toLowerCase();

  const detections: Detection[] = [];
  for (const rule of RULES) {
    let score = 0;
    const evidence: string[] = [];

    for (const kw of rule.keywords) {
      const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(kw)}(?:[^a-z0-9]|$)`, 'i');
      if (re.test(lower)) {
        score += KEYWORD_SCORE;
        evidence.push(`mentions "${kw}"`);
      }
    }

    for (const p of rule.patterns) {
      if (p.re.test(text)) {
        score += PATTERN_SCORE;
        evidence.push(p.why);
      }
    }

    if (rule.conceptId === 'recursion') {
      const selfCalls = selfCallingFunctions(text);
      if (selfCalls.length > 0) {
        score += SELF_CALL_SCORE;
        evidence.push(`calls itself (${selfCalls.join(', ')})`);
      }
    }

    if (score > 0 && knownConceptIds.has(rule.conceptId)) {
      detections.push({ conceptId: rule.conceptId, score, evidence });
    }
  }

  // Stable sort: score desc, then rule order (already the array order).
  return detections.sort((a, b) => b.score - a.score);
}
