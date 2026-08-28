import { describe, expect, it } from 'vitest';
import { narrate } from '../src/core/narrate';
import type { StepSeed } from '../src/core/analyze';

const seed = (over: Partial<StepSeed>): StepSeed => ({
  kind: 'literal',
  start: 0,
  end: 1,
  type: 'number',
  details: [],
  subject: 'x',
  ...over,
});

describe('narrate', () => {
  it('covers every step kind with a complete sentence', () => {
    const cases: Array<[Partial<StepSeed>, string]> = [
      [{ kind: 'literal', subject: '42', type: '42' }, 'The literal `42` gets type `42`.'],
      [{ kind: 'identifier', subject: 'x', type: 'number' }, '`x` has type `number` here.'],
      [
        { kind: 'narrow', subject: 'v', type: 'string', extra: 'string | number' },
        'Control flow narrows `v` from `string | number` to `string` at this location.',
      ],
      [
        { kind: 'member', subject: 'a.b', type: 'number' },
        'Member access `a.b` resolves to type `number`.',
      ],
      [
        { kind: 'call', subject: 'f', type: 'string[]', extra: 'T = string' },
        'Calling `f` infers T = string; the call returns `string[]`.',
      ],
      [{ kind: 'call', subject: 'f', type: 'void' }, 'Calling `f` returns `void`.'],
      [
        { kind: 'function', subject: 'arrow function', type: '(n: number) => number' },
        'This arrow function gets signature `(n: number) => number`.',
      ],
      [
        { kind: 'param', subject: 'n', type: 'number' },
        'Parameter `n` has no annotation, so its type comes from context: `number`.',
      ],
      [
        { kind: 'expression', subject: 'a + b', type: 'string', extra: '+' },
        'The `+` expression evaluates to type `string`.',
      ],
      [
        { kind: 'expression', subject: '!x', type: 'boolean' },
        'This expression evaluates to type `boolean`.',
      ],
      [
        { kind: 'var-infer', subject: 'x', type: '42', keyword: 'const' },
        'const `x` has no annotation; its type is inferred as `42`.',
      ],
      [
        { kind: 'widen', subject: 'y', type: 'number', extra: '42', keyword: 'let' },
        'let `y` starts from the fresh literal type `42` and widens to `number`, because a let binding can be reassigned.',
      ],
      [
        { kind: 'var-declared', subject: 'n', type: 'number', keyword: 'const' },
        'const `n` is annotated, so its type is `number` by declaration, not inference.',
      ],
      [
        { kind: 'return-infer', subject: 'f', type: 'string' },
        '`f` has no return annotation; the compiler infers the return type `string` from its return statements.',
      ],
      [{ kind: 'error', subject: 'boom' }, 'boom'],
    ];
    for (const [over, expected] of cases) {
      expect(narrate(seed(over))).toBe(expected);
    }
  });

  it('narrow falls back when the declared type is missing', () => {
    expect(narrate(seed({ kind: 'narrow', subject: 'v', type: 'string' }))).toContain('`unknown`');
  });

  it('unknown kinds get a generic sentence', () => {
    expect(narrate(seed({ kind: 'mystery' as StepSeed['kind'] }))).toBe('Type `number`.');
  });
});
