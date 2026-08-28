import { describe, expect, it } from 'vitest';
import { analyze, mapperPairs } from '../src/core/analyze';
import type { Step, StepKind } from '../src/core/types';

const kinds = (steps: Step[]): StepKind[] => steps.map((s) => s.kind);
const byKind = (steps: Step[], kind: StepKind): Step[] => steps.filter((s) => s.kind === kind);
const one = (steps: Step[], kind: StepKind): Step => {
  const hits = byKind(steps, kind);
  expect(hits.length, `expected exactly one ${kind} step`).toBe(1);
  return hits[0];
};

describe('literals and variables', () => {
  it('const keeps the fresh literal type', () => {
    const { steps, diagnostics } = analyze('const x = 42;');
    expect(diagnostics).toEqual([]);
    expect(kinds(steps)).toEqual(['literal', 'var-infer']);
    expect(steps[0].type).toBe('42');
    const varStep = one(steps, 'var-infer');
    expect(varStep.type).toBe('42');
    expect(varStep.narration).toContain('const `x`');
    expect(varStep.narration).toContain('inferred as `42`');
  });

  it('let widens a fresh literal type', () => {
    const { steps } = analyze('let y = "hi";');
    const widen = one(steps, 'widen');
    expect(widen.type).toBe('string');
    expect(widen.narration).toContain('widens to `string`');
    expect(widen.details).toContain('initializer: "hi"');
  });

  it('var widens like let', () => {
    const { steps } = analyze('var z = true;');
    const widen = one(steps, 'widen');
    expect(widen.type).toBe('boolean');
    expect(widen.narration).toContain('var `z`');
  });

  it('an annotated variable reports the annotation, not inference', () => {
    const { steps, diagnostics } = analyze('const n: number = 5;');
    expect(diagnostics).toEqual([]);
    const declared = one(steps, 'var-declared');
    expect(declared.type).toBe('number');
    expect(declared.narration).toContain('by declaration, not inference');
    expect(declared.details).toContain('initializer type: 5');
  });

  it('a let with no initializer still yields a step', () => {
    const { steps } = analyze('let pending: string | undefined;');
    const declared = one(steps, 'var-declared');
    expect(declared.type).toBe('string | undefined');
  });

  it('object and array literals get structural types', () => {
    const { steps } = analyze('const p = { x: 1, y: 2 };\nconst a = [1, "two"];');
    const literals = byKind(steps, 'literal');
    const objectStep = literals.find((s) => s.snippet.startsWith('{'));
    const arrayStep = literals.find((s) => s.snippet.startsWith('['));
    expect(objectStep?.type).toBe('{ x: number; y: number; }');
    expect(arrayStep?.type).toBe('(string | number)[]');
  });

  it('template literals are literal steps', () => {
    const { steps } = analyze('const name = "world";\nconst msg = `hello ${name}`;');
    // With a const (literal-typed) placeholder the template itself gets a
    // template literal type, not just string.
    const template = byKind(steps, 'literal').find((s) => s.snippet.includes('hello'));
    expect(template?.type).toBe('"hello world"');
  });
});

describe('generic inference', () => {
  const source = 'function wrap<T>(value: T): T[] {\n  return [value];\n}\nconst w = wrap("hi");\n';

  it('reports declared vs resolved signatures with type-argument bindings', () => {
    const { steps, diagnostics } = analyze(source);
    expect(diagnostics).toEqual([]);
    const call = one(steps, 'call');
    expect(call.type).toBe('string[]');
    expect(call.details).toContain('declared: <T>(value: T): T[]');
    expect(call.details).toContain('inferred: T = string');
    expect(call.details).toContain('resolved: (value: string): string[]');
    expect(call.narration).toBe('Calling `wrap` infers T = string; the call returns `string[]`.');
  });

  it('binds several type parameters independently', () => {
    const { steps } = analyze(
      'function pair<A, B>(a: A, b: B): [A, B] { return [a, b]; }\nconst p = pair(1, "x");\n',
    );
    const call = one(steps, 'call');
    expect(call.details).toContain('inferred: A = number');
    expect(call.details).toContain('inferred: B = string');
  });

  it('non-generic calls have no declared/inferred lines', () => {
    const { steps } = analyze('function id(n: number) { return n; }\nconst r = id(3);\n');
    const call = one(steps, 'call');
    expect(call.details.filter((d) => d.startsWith('declared:'))).toEqual([]);
    expect(call.details).toContain('resolved: (n: number): number');
  });

  it('does not emit reference steps for type parameter declarations', () => {
    const { steps } = analyze(source);
    const identifiers = byKind(steps, 'identifier').map((s) => s.snippet);
    expect(identifiers).not.toContain('T');
  });

  it('new expressions resolve construct signatures', () => {
    const { steps, diagnostics } = analyze('const m = new Map<string, number>();');
    expect(diagnostics).toEqual([]);
    const call = one(steps, 'call');
    expect(call.type).toBe('Map<string, number>');
  });
});

describe('contextual typing and return inference', () => {
  it('types an unannotated callback parameter from context', () => {
    const { steps, diagnostics } = analyze('const lens = ["a", "bb"].map(s => s.length);');
    expect(diagnostics).toEqual([]);
    const param = one(steps, 'param');
    expect(param.type).toBe('string');
    expect(param.narration).toContain('its type comes from context');
    const fn = one(steps, 'function');
    expect(fn.type).toBe('(s: string) => number');
  });

  it('infers a union return type from multiple return statements', () => {
    const { steps } = analyze(
      'function pick(flag: boolean) {\n  if (flag) { return "yes"; }\n  return 0;\n}\n',
    );
    const ret = one(steps, 'return-infer');
    expect(ret.type).toBe('"yes" | 0');
    expect(ret.narration).toContain('`pick`');
    expect(ret.narration).toContain('from its return statements');
  });

  it('does not emit return inference for annotated functions', () => {
    const { steps } = analyze('function f(): number { return 1; }');
    expect(byKind(steps, 'return-infer')).toEqual([]);
  });

  it('names anonymous arrow functions in the narration', () => {
    const { steps } = analyze('const f = (n: number) => n + 1;');
    const ret = one(steps, 'return-infer');
    expect(ret.narration).toContain('this arrow function');
  });

  it('handles method declarations in classes', () => {
    const { steps, diagnostics } = analyze(
      'class Box {\n  value = 1;\n  double() { return this.value * 2; }\n}\n',
    );
    expect(diagnostics).toEqual([]);
    const ret = one(steps, 'return-infer');
    expect(ret.type).toBe('number');
  });
});

describe('control-flow narrowing', () => {
  it('narrows a union with typeof, per branch', () => {
    const { steps, diagnostics } = analyze(
      'function f(v: string | number) {\n  if (typeof v === "string") { return v.toUpperCase(); }\n  return v.toFixed(0);\n}\n',
    );
    expect(diagnostics).toEqual([]);
    const narrows = byKind(steps, 'narrow');
    expect(narrows.map((s) => s.type)).toEqual(['string', 'number']);
    expect(narrows[0].narration).toContain('from `string | number` to `string`');
    expect(narrows[0].details).toEqual(['declared: string | number', 'here: string']);
  });

  it('narrows with a null check', () => {
    const { steps } = analyze(
      'function g(t: string | null) {\n  if (t === null) { return t; }\n  return t.trim();\n}\n',
    );
    const narrowed = byKind(steps, 'narrow');
    expect(narrowed.some((s) => s.type === 'null')).toBe(true);
    expect(narrowed.some((s) => s.type === 'string')).toBe(true);
  });

  it('narrows a discriminated union member access', () => {
    const { steps, diagnostics } = analyze(
      'type S = { kind: "a"; a: number } | { kind: "b"; b: string };\n' +
        'function h(s: S) {\n  if (s.kind === "a") { return s.a; }\n  return s.b;\n}\n',
    );
    expect(diagnostics).toEqual([]);
    const narrows = byKind(steps, 'narrow');
    expect(narrows.map((s) => s.type)).toEqual([
      '{ kind: "a"; a: number; }',
      '{ kind: "b"; b: string; }',
    ]);
  });

  it('plain references that are not narrowed stay identifier steps', () => {
    const { steps } = analyze('const a = 1;\nconst b = a;');
    const ident = one(steps, 'identifier');
    expect(ident.snippet).toBe('a');
    expect(ident.type).toBe('1');
  });
});

describe('members, expressions, and hover', () => {
  it('member access resolves to the member type', () => {
    const { steps } = analyze('const len = "abc".length;');
    const member = one(steps, 'member');
    expect(member.type).toBe('number');
    expect(member.narration).toContain('`"abc".length`');
  });

  it('binary expressions name their operator', () => {
    const { steps } = analyze('const s = "a" + 1;');
    const expr = one(steps, 'expression');
    expect(expr.type).toBe('string');
    expect(expr.narration).toContain('`+` expression');
  });

  it('records a hover entry for every expression', () => {
    const { hover } = analyze('const total = 1 + 2;');
    const types = hover.map((h) => h.type);
    expect(types).toContain('1');
    expect(types).toContain('2');
    expect(types).toContain('number');
  });

  it('hover spans are sorted by start, larger spans first on ties', () => {
    const { hover } = analyze('const v = "ab".toUpperCase();');
    for (let i = 1; i < hover.length; i++) {
      const prev = hover[i - 1];
      const cur = hover[i];
      expect(prev.start < cur.start || (prev.start === cur.start && prev.end >= cur.end)).toBe(true);
    }
  });

  it('as-expressions are expression steps', () => {
    const { steps } = analyze('const u = "x" as unknown;');
    const expr = byKind(steps, 'expression').find((s) => s.snippet.includes('as unknown'));
    expect(expr?.type).toBe('unknown');
  });
});

describe('diagnostics as story steps', () => {
  it('threads a type error in right after the offending span', () => {
    const { steps, diagnostics } = analyze('const label: string = 42;');
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].message).toContain("Type 'number' is not assignable to type 'string'");
    const errIndex = steps.findIndex((s) => s.kind === 'error');
    expect(errIndex).toBeGreaterThan(-1);
    const before = steps[errIndex - 1];
    // The error lands immediately after a step that overlaps its span.
    expect(before.start < steps[errIndex].end && steps[errIndex].start < before.end).toBe(true);
    expect(steps[errIndex].details).toEqual(['TS2322']);
  });

  it('reports implicit any parameters', () => {
    const { diagnostics } = analyze('function f(x) { return x; }');
    expect(diagnostics.some((d) => d.code === 7006)).toBe(true);
  });

  it('reports unknown property access with its code', () => {
    const { steps } = analyze('const n = 1;\nconst v = n.missing;');
    const err = byKind(steps, 'error');
    expect(err.length).toBe(1);
    expect(err[0].details).toEqual(['TS2339']);
  });

  it('survives syntax errors', () => {
    const { steps, diagnostics } = analyze('const = ;');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(Array.isArray(steps)).toBe(true);
  });

  it('a diagnostic with no overlapping step is placed by position', () => {
    // The unused-parameter style error spans the parameter, which emits no
    // step for an annotated declaration parameter.
    const { steps } = analyze('function f(x: number): string { return "ok"; }\nconst y = f(1);');
    expect(byKind(steps, 'error')).toEqual([]);
    const r = analyze('let a: NotAType;');
    const err = byKind(r.steps, 'error');
    expect(err.length).toBe(1);
  });

  it('re-indexes steps after inserting errors', () => {
    const { steps } = analyze('const a: string = 1;\nconst b: number = "x";');
    steps.forEach((s, i) => expect(s.index).toBe(i));
    expect(byKind(steps, 'error').length).toBe(2);
  });
});

describe('robustness', () => {
  it('handles empty input', () => {
    const r = analyze('');
    expect(r.steps).toEqual([]);
    expect(r.diagnostics).toEqual([]);
    expect(r.hover).toEqual([]);
  });

  it('handles type-only declarations without steps', () => {
    const r = analyze('interface P { x: number }\ntype Q = P | null;');
    expect(r.steps).toEqual([]);
    expect(r.diagnostics).toEqual([]);
  });

  it('skips destructuring names but keeps the initializer story', () => {
    const { steps, diagnostics } = analyze('const { a, b } = { a: 1, b: "x" };');
    expect(diagnostics).toEqual([]);
    expect(byKind(steps, 'var-infer')).toEqual([]);
    expect(byKind(steps, 'literal').length).toBeGreaterThan(0);
  });

  it('shorthand property values still count as references', () => {
    const { steps } = analyze('const a = 1;\nconst o = { a };');
    const refs = byKind(steps, 'identifier').filter((s) => s.snippet === 'a');
    expect(refs.length).toBe(1);
  });

  it('truncates long snippets', () => {
    const long = `const s = "${'x'.repeat(200)}";`;
    const { steps } = analyze(long);
    const literal = byKind(steps, 'literal')[0];
    expect(literal.snippet.length).toBeLessThanOrEqual(64);
    expect(literal.snippet.endsWith('...')).toBe(true);
  });

  it('uses the full ES2022 lib surface', () => {
    const { diagnostics } = analyze(
      'const p = Promise.resolve(1);\nconst e = Object.entries({ a: 1 });\nconst r = "aa".replaceAll("a", "b");\nconst g = [1, [2]].flat();\nconst at = [1, 2].at(-1);\n',
    );
    expect(diagnostics).toEqual([]);
  });

  it('console is declared without pulling in the DOM', () => {
    const withConsole = analyze('console.log("hi");');
    expect(withConsole.diagnostics).toEqual([]);
    const withDom = analyze('const d = document;');
    expect(withDom.diagnostics.some((d) => d.message.includes("Cannot find name 'document'"))).toBe(
      true,
    );
  });
});

describe('mapperPairs (internal compiler state, read defensively)', () => {
  const t = (name: string) => ({ name }) as unknown as import('typescript').Type;

  it('returns nothing for missing or unknown mappers', () => {
    expect(mapperPairs(undefined)).toEqual([]);
    expect(mapperPairs({})).toEqual([]);
    expect(mapperPairs({ kind: 2 })).toEqual([]);
    expect(mapperPairs({ kind: 3 })).toEqual([]);
  });

  it('reads simple and array mappers', () => {
    const a = t('A');
    const b = t('B');
    expect(mapperPairs({ kind: 0, source: a, target: b })).toEqual([[a, b]]);
    expect(mapperPairs({ kind: 0 })).toEqual([]);
    expect(mapperPairs({ kind: 1, sources: [a], targets: [b] })).toEqual([[a, b]]);
    expect(mapperPairs({ kind: 1, sources: [a] })).toEqual([[a, undefined]]);
  });

  it('flattens composite and merged mappers', () => {
    const a = t('A');
    const b = t('B');
    const c = t('C');
    const d = t('D');
    const pairs = mapperPairs({
      kind: 4,
      mapper1: { kind: 0, source: a, target: b },
      mapper2: { kind: 5, mapper1: { kind: 0, source: c, target: d }, mapper2: { kind: 2 } },
    });
    expect(pairs).toEqual([
      [a, b],
      [c, d],
    ]);
  });
});
