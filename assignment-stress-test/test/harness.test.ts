/**
 * Runs the real harness under CPython + pytest (the browser runs the same
 * source in Pyodide). CI installs pytest for this job.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HARNESS_PY, buildPayload, parseHarnessOutput, testSummary, type HarnessPayload } from '../src/core/harness.js';
import { sample } from '../src/core/samples.js';
import type { CodeSetup } from '../src/core/types.js';

const dir = mkdtempSync(join(tmpdir(), 'ast-test-'));
const script = join(dir, 'harness.py');
// Two suites in one interpreter, like the reused Pyodide worker.
writeFileSync(script, HARNESS_PY + '\nimport sys\nfor line in sys.stdin:\n    print(run_suite(line))\n');

function runAll(payloads: HarnessPayload[]) {
  const r = spawnSync('python3', ['-I', script], {
    input: payloads.map((p) => JSON.stringify({ ...p, root: join(dir, p.root.replace(/\//g, '_')) })).join('\n') + '\n',
    encoding: 'utf8',
    timeout: 60_000,
  });
  expect(r.stderr).toBe('');
  return r.stdout.trim().split('\n').map(parseHarnessOutput);
}

const REFERENCE = `def encode(s):
    """Run-length encode a string of non-digit characters."""
    if any(c.isdigit() for c in s):
        raise ValueError("digits cannot be encoded")
    out, i = [], 0
    while i < len(s):
        j = i
        while j < len(s) and s[j] == s[i]:
            j += 1
        out.append(f"{j - i}{s[i]}")
        i = j
    return "".join(out)


def decode(s):
    """Reverse encode."""
    out, num = [], ""
    for c in s:
        if c.isdigit():
            num += c
        else:
            if not num:
                raise ValueError("missing count")
            out.append(c * int(num))
            num = ""
    if num:
        raise ValueError("count with no character")
    return "".join(out)
`;

describe('harness under CPython', () => {
  const rle = sample('rle').code as CodeSetup;

  it('the sample suite passes a reference solution and fails a naive one, in one interpreter', () => {
    const naive = REFERENCE.replace('if any(c.isdigit() for c in s):', 'if False:');
    const [good, bad] = runAll([buildPayload(rle, REFERENCE, 'good'), buildPayload(rle, naive, 'bad')]);
    expect(good.status).toBe('ok');
    expect(good.results).toHaveLength(10);
    expect(good.results.every((r) => r.outcome === 'passed')).toBe(true);
    expect(testSummary(good)).toBe('10/10 passed');
    // The second suite must import its own rle module, not the cached one.
    expect(bad.results.find((r) => r.name === 'test_digits_rejected')?.outcome).toBe('failed');
    expect(bad.results.find((r) => r.name === 'test_digits_rejected')?.message).toMatch(/DID NOT RAISE/);
  });

  it('reports syntax errors as collection errors, and skips and fixture errors', () => {
    const setup: CodeSetup = {
      solutionFile: 'sol.py',
      starter: [{ name: 'data/words.txt', content: 'a b' }],
      tests: [
        {
          name: 'test_sol.py',
          content:
            'import pytest\nfrom sol import f\n@pytest.fixture\ndef boom():\n    raise RuntimeError("x")\n' +
            'def test_ok():\n    assert f() == 1\n@pytest.mark.skip(reason="later")\ndef test_skip():\n    pass\n' +
            'def test_fix(boom):\n    pass\ndef test_file():\n    assert open("data/words.txt").read() == "a b"\n',
        },
      ],
    };
    const [broken, fine] = runAll([buildPayload(setup, 'def f(:\n', 'broken'), buildPayload(setup, 'def f():\n    return 1\n', 'fine')]);
    expect(broken.status).toBe('collection-error');
    expect(broken.log).toMatch(/SyntaxError/);
    expect(testSummary(broken)).toBe('collection error');
    expect(fine.results.map((r) => [r.name, r.outcome])).toEqual([
      ['test_ok', 'passed'],
      ['test_skip', 'skipped'],
      ['test_fix', 'error'],
      ['test_file', 'passed'],
    ]);
    expect(fine.results[1].message).toMatch(/later/);
  });
});

describe('payload and parsing', () => {
  it('lets the solution win a name clash and numbers roots', () => {
    const p = buildPayload(
      { solutionFile: 'a.py', starter: [{ name: 'a.py', content: 'old' }], tests: [{ name: 't.py', content: 't' }] },
      'new',
    );
    expect(p.files).toEqual([
      { name: 'a.py', content: 'new' },
      { name: 't.py', content: 't' },
    ]);
    expect(p.root).toMatch(/^\/tmp\/ast_run_\d+$/);
  });

  it('turns malformed harness output into a harness error', () => {
    expect(parseHarnessOutput('Traceback...').status).toBe('harness-error');
    expect(parseHarnessOutput('{"status":"weird","results":[]}').status).toBe('harness-error');
    const r = parseHarnessOutput('{"status":"ok","results":[{"name":"t","outcome":"odd"},{}]}');
    expect(r.results).toEqual([
      { name: 't', outcome: 'error', message: '' },
      { name: '', outcome: 'error', message: '' },
    ]);
    expect(r.log).toBe('');
    expect(testSummary(null)).toBe('not run');
  });
});
