import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { ClaudeModel, describeError, modelName, type MessagesClient } from '../src/core/anthropic.js';
import { parseRubric } from '../src/core/rubric.js';
import { attempt, callCount, gradeCell, gradeTests, runStressTest } from '../src/core/runner.js';
import { sample } from '../src/core/samples.js';
import type { TestRun } from '../src/core/types.js';
import { FakeModel, reply } from './fakes.js';

const code = sample('rle');
const memo = sample('memo');
const codeRows = parseRubric(code.rubricText).rows;
const memoRows = parseRubric(memo.rubricText).rows;

const allPass: TestRun = {
  status: 'ok',
  results: ['test_basic_encode', 'test_empty_encode', 'test_single_char', 'test_digits_rejected'].map((name) => ({
    name,
    outcome: 'passed',
    message: '',
  })),
  log: '',
};

const judge = (points: number) =>
  new FakeModel('judge', (turns) => {
    const ids = [...turns[0].content.matchAll(/- id (r\d+)/g)].map((m) => m[1]);
    return reply(JSON.stringify({ rows: ids.map((id) => ({ id, points, reason: 'fine' })) }));
  });

describe('attempt', () => {
  it('sends each turn with the growing transcript and the style effort', async () => {
    const m = new FakeModel('m', (turns) => reply(`reply ${turns.length}`));
    const cell = await attempt(m, 'careful', memo);
    expect(m.calls.map((c) => c.turns.length)).toEqual([1, 3, 5]);
    expect(m.calls[0].opts.effort).toBe('high');
    expect(cell.output).toBe('reply 5');
    expect(cell.transcript).toHaveLength(6);
  });

  it('stops on a refusal and records errors and notes', async () => {
    const refuser = new FakeModel('r', () => ({ text: '', refused: true, note: 'refused (general)' }));
    expect((await attempt(refuser, 'student', memo)).status).toBe('refused');
    const broken = new FakeModel('b', () => {
      throw new Error('network down');
    });
    const e = await attempt(broken, 'lazy', memo);
    expect([e.status, e.error]).toEqual(['error', 'network down']);
    const cut = new FakeModel('c', () => ({ text: 'half', refused: false, note: 'cut off at max_tokens' }));
    expect((await attempt(cut, 'lazy', memo)).error).toBe('cut off at max_tokens');
  });
});

describe('gradeTests', () => {
  it('needs code, a code block and an autograder', async () => {
    expect(await gradeTests(memo, 'x', null)).toBeNull();
    expect((await gradeTests(code, 'no code here', null))?.status).toBe('no-code');
    expect((await gradeTests(code, '```python\nx=1\n```', null))?.status).toBe('harness-error');
    const failing = async () => {
      throw new Error('worker died');
    };
    expect((await gradeTests(code, '```python\nx=1\n```', failing))?.log).toBe('worker died');
    let seen = '';
    await gradeTests(code, '```python\ndef encode(s): pass\n```', async (p) => {
      seen = p.files.find((f) => f.name === 'rle.py')?.content ?? '';
      return allPass;
    });
    expect(seen).toBe('def encode(s): pass\n');
  });
});

describe('gradeCell', () => {
  it('combines test rows and judge rows in rubric order', async () => {
    const cell = await attempt(new FakeModel('m', () => reply('```python\nx=1\n```')), 'lazy', code);
    const j = judge(10);
    const graded = await gradeCell(cell, { assignment: code, rows: codeRows, judge: j, autograde: async () => allPass });
    expect(graded.scores.map((s) => [s.id, s.points, s.source])).toEqual([
      ['r1', 40, 'tests'],
      ['r2', 15, 'tests'],
      ['r3', 10, 'judge'],
      ['r4', 10, 'judge'],
      ['r5', 10, 'judge'],
    ]);
    expect(j.calls[0].opts.schema).toBeDefined();
    expect(j.calls[0].opts.system).toMatch(/strict but fair/);
  });

  it('handles refused, failed and judge-error cells', async () => {
    const base = { assignment: memo, rows: memoRows, autograde: null };
    const refused = await attempt(new FakeModel('r', () => ({ text: '', refused: true, note: '' })), 'lazy', memo);
    expect((await gradeCell(refused, { ...base, judge: judge(1) })).scores.every((s) => s.points === 0)).toBe(true);
    const failed = await attempt(new FakeModel('f', () => Promise.reject(new Error('x'))), 'lazy', memo);
    expect((await gradeCell(failed, { ...base, judge: judge(1) })).scores.every((s) => s.points === null)).toBe(true);
    const ok = await attempt(new FakeModel('o', () => reply('memo text')), 'lazy', memo);
    const badJudge = new FakeModel('j', () => Promise.reject(new Error('judge down')));
    const g = await gradeCell(ok, { ...base, judge: badJudge });
    expect(g.error).toBe('Judge failed: judge down');
    const vague = new FakeModel('j', () => reply('{"rows":[]}'));
    expect((await gradeCell(ok, { ...base, judge: vague })).error).toMatch(/skipped row r1/);
  });
});

describe('runStressTest', () => {
  it('runs every model x style with bounded concurrency and reports progress', async () => {
    let live = 0;
    let peak = 0;
    const slow = (id: string) =>
      new FakeModel(id, async () => {
        live++;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 2));
        live--;
        return reply('text');
      });
    const progress: number[] = [];
    const cells = await runStressTest({
      assignment: memo,
      rows: memoRows,
      models: [slow('a'), slow('b')],
      styles: ['lazy', 'student', 'careful'],
      judge: judge(5),
      autograde: null,
      concurrency: 2,
      onProgress: (d) => progress.push(d),
    });
    expect(cells.map((c) => `${c.model}:${c.style}`)).toEqual([
      'a:lazy',
      'a:student',
      'a:careful',
      'b:lazy',
      'b:student',
      'b:careful',
    ]);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('marks jobs after a stop as not run', async () => {
    const signal = { aborted: false };
    const m = new FakeModel('a', () => {
      signal.aborted = true;
      return reply('x');
    });
    const cells = await runStressTest({ assignment: memo, rows: memoRows, models: [m], styles: ['lazy', 'student'], judge: judge(1), autograde: null, concurrency: 1, signal });
    expect(cells[1].error).toBe('Stopped before it ran.');
  });

  it('counts calls', () => {
    expect(callCount(3, ['lazy', 'student', 'careful'], memo, memoRows)).toBe(3 * (5 + 3));
    const allTests = parseRubric('Correctness (10) {tests}').rows;
    expect(callCount(1, ['lazy'], code, allTests)).toBe(1);
  });
});

describe('ClaudeModel', () => {
  const msg = (over: Partial<Anthropic.Message>): Anthropic.Message =>
    ({
      id: 'm',
      type: 'message',
      role: 'assistant',
      model: 'x',
      content: [
        { type: 'thinking', thinking: '', signature: 's' },
        { type: 'text', text: 'hello ', citations: null },
        { type: 'text', text: 'world', citations: null },
      ],
      stop_reason: 'end_turn',
      stop_details: null,
      stop_sequence: null,
      usage: {},
      ...over,
    }) as unknown as Anthropic.Message;

  const client = (m: Anthropic.Message) => {
    const bodies: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const c: MessagesClient = { messages: { create: async (b) => (bodies.push(b), m) } };
    return { c, bodies };
  };

  it('builds the request and joins text blocks', async () => {
    const { c, bodies } = client(msg({}));
    const r = await new ClaudeModel('claude-haiku-5-5', c).chat([{ role: 'user', content: 'hi' }], {
      system: 'sys',
      effort: 'low',
      schema: { type: 'object' },
      maxTokens: 100,
    });
    expect(r).toEqual({ text: 'hello world', refused: false, note: '' });
    expect(bodies[0]).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      system: 'sys',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } },
    });
    const plain = client(msg({}));
    await new ClaudeModel('m', plain.c).chat([{ role: 'user', content: 'hi' }], {});
    expect(plain.bodies[0]).toEqual({ model: 'm', max_tokens: 16000, messages: [{ role: 'user', content: 'hi' }] });
  });

  it('reports refusals and truncation', async () => {
    const refused = client(msg({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null } as never }));
    expect(await new ClaudeModel('m', refused.c).chat([], {})).toMatchObject({ refused: true, note: 'refused (cyber)' });
    const bare = client(msg({ stop_reason: 'refusal' }));
    expect((await new ClaudeModel('m', bare.c).chat([], {})).note).toBe('refused');
    const cut = client(msg({ stop_reason: 'max_tokens' }));
    expect((await new ClaudeModel('m', cut.c).chat([], {})).note).toBe('cut off at max_tokens');
  });

  it('retries once at default effort when the effort level is rejected', async () => {
    const bodies: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const bad = (m: string) => Anthropic.APIError.generate(400, { error: { message: m } }, m, new Headers());
    const c: MessagesClient = {
      messages: {
        create: async (b) => {
          bodies.push(b);
          if (b.output_config?.effort) throw bad('Invalid effort level');
          return msg({});
        },
      },
    };
    const r = await new ClaudeModel('m', c).chat([{ role: 'user', content: 'hi' }], { effort: 'high', schema: { type: 'object' } });
    expect(r.note).toBe('ran at default effort (high rejected)');
    expect(bodies[1].output_config).toEqual({ format: { type: 'json_schema', schema: { type: 'object' } } });
    const other: MessagesClient = { messages: { create: async () => Promise.reject(bad('prompt too long')) } };
    await expect(new ClaudeModel('m', other).chat([], { effort: 'high' })).rejects.toThrow(/prompt too long/);
  });

  it('describes SDK errors', () => {
    const mk = (status: number) => Anthropic.APIError.generate(status, { error: { message: 'm' } }, 'm', new Headers());
    expect(describeError(mk(401))).toMatch(/rejected/);
    expect(describeError(mk(403))).toMatch(/cannot use/);
    expect(describeError(mk(404))).toMatch(/not found/);
    expect(describeError(mk(429))).toMatch(/Rate limited/);
    expect(describeError(mk(500))).toMatch(/^API error 500/);
    expect(describeError('plain')).toBe('plain');
    expect(modelName('claude-opus-5-5')).toBe('Claude Opus 5.5');
    expect(modelName('ChatGPT')).toBe('ChatGPT');
  });
});
