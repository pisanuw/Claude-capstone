import { describe, expect, it } from 'vitest';
import { STYLES, extractCode, styleSpec, styleTurns } from '../src/core/prompts.js';
import { sample } from '../src/core/samples.js';

describe('styleTurns', () => {
  const code = sample('rle');
  const memo = sample('memo');

  it('lazy sends the assignment verbatim, without the rubric', () => {
    const [t] = styleTurns('lazy', memo);
    expect(t).toBe(memo.prompt.trim());
    expect(styleTurns('lazy', memo)).toHaveLength(1);
  });

  it('student includes the rubric and asks for a code block on code assignments', () => {
    const [t] = styleTurns('student', code);
    expect(t).toContain('RUBRIC:\nCorrectness (40)');
    expect(t).toContain('complete rle.py in a single Python code block');
    expect(styleTurns('student', memo)[0]).not.toContain('code block');
  });

  it('careful is plan, write, self-check', () => {
    const turns = styleTurns('careful', code);
    expect(turns).toHaveLength(3);
    expect(turns[0]).toMatch(/Do not write the submission yet/);
    expect(turns[2]).toMatch(/edge cases by hand/);
    expect(styleTurns('careful', memo)[2]).not.toMatch(/edge cases/);
  });

  it('shows starter files but never the tests', () => {
    const a = { ...code, code: { ...code.code!, starter: [{ name: 'helpers.py', content: 'X = 1\n' }] } };
    const [t] = styleTurns('lazy', a);
    expect(t).toContain('--- helpers.py ---');
    expect(t).not.toContain('def test_');
  });

  it('knows each style and rejects unknown ones', () => {
    expect(STYLES.map((s) => styleSpec(s.id).effort)).toEqual(['low', 'medium', 'high']);
    expect(() => styleSpec('nope' as never)).toThrow();
  });
});

describe('extractCode', () => {
  it('takes the longest python or untagged block', () => {
    const out = 'Here:\n```python\ndef a():\n    return 1\n```\nand\n```\nx=1\n```\n```bash\nrm -rf /\n```';
    expect(extractCode(out)).toBe('def a():\n    return 1\n');
  });

  it('accepts bare modules and rejects prose', () => {
    expect(extractCode('def f():\n  pass')).toBe('def f():\n  pass');
    expect(extractCode('I cannot help with that.')).toBeNull();
    expect(extractCode('```js\nlet x\n```')).toBeNull();
  });
});
