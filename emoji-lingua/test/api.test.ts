import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  DictionaryTranslator,
  AnthropicTranslator,
  createTranslator,
} from '../src/ai.js';

function jsonRes(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => '' } as unknown as Response;
}

describe('createTranslator', () => {
  it('falls back to the dictionary with no key', () => {
    const t = createTranslator({});
    expect(t.name).toBe('dictionary');
    expect(t.aiEnabled).toBe(false);
  });

  it('uses Anthropic when a key is present', () => {
    const t = createTranslator({ ANTHROPIC_API_KEY: 'sk-x' });
    expect(t.name).toBe('anthropic');
    expect(t.aiEnabled).toBe(true);
  });

  it('treats a blank key as absent', () => {
    expect(createTranslator({ ANTHROPIC_API_KEY: '  ' }).name).toBe('dictionary');
  });
});

describe('DictionaryTranslator', () => {
  it('translates both directions', async () => {
    const t = new DictionaryTranslator();
    expect((await t.translate('cat', 'to-emoji', 'literal')).output).toBe('🐱');
    expect((await t.translate('🐱', 'to-english', 'literal')).output).toBe('cat');
  });
});

describe('AnthropicTranslator', () => {
  it('returns the model output on success', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes({ content: [{ type: 'text', text: '🐱🍕' }] }),
    ) as unknown as typeof fetch;
    const t = new AnthropicTranslator({ apiKey: 'k', fetchImpl });
    const r = await t.translate('cat pizza', 'to-emoji', 'interpretive');
    expect(r.output).toBe('🐱🍕');
    expect(r.engine).toBe('ai');
  });

  it('falls back to the dictionary when the API errors', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({}, false, 500)) as unknown as typeof fetch;
    const t = new AnthropicTranslator({ apiKey: 'k', fetchImpl });
    const r = await t.translate('cat', 'to-emoji', 'interpretive');
    expect(r.output).toBe('🐱');
    expect(r.engine).toBe('dictionary');
  });

  it('falls back when the response has no text', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ content: [] })) as unknown as typeof fetch;
    const t = new AnthropicTranslator({ apiKey: 'k', fetchImpl });
    expect((await t.translate('cat', 'to-emoji', 'literal')).engine).toBe('dictionary');
  });

  it('sends the right direction-specific system prompt', async () => {
    let captured: any = null;
    const fetchImpl = vi.fn(async (_u: string, init: any) => {
      captured = JSON.parse(init.body);
      return jsonRes({ content: [{ type: 'text', text: 'ok' }] });
    }) as unknown as typeof fetch;
    const t = new AnthropicTranslator({ apiKey: 'k', fetchImpl });
    await t.translate('🐱', 'to-english', 'literal');
    expect(captured.system).toMatch(/literal/i);
    await t.translate('cat', 'to-emoji', 'interpretive');
    expect(captured.system).toMatch(/emoji/i);
  });
});

describe('API', () => {
  const app = () => createApp({ translator: new DictionaryTranslator() });

  it('reports health', async () => {
    const res = await request(app()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.ai).toBe(false);
  });

  it('translates English to emoji', async () => {
    const res = await request(app())
      .post('/api/translate')
      .send({ text: 'cat', direction: 'to-emoji' });
    expect(res.status).toBe(200);
    expect(res.body.output).toBe('🐱');
  });

  it('translates emoji to English', async () => {
    const res = await request(app())
      .post('/api/translate')
      .send({ text: '🐱', direction: 'to-english' });
    expect(res.body.output).toBe('cat');
  });

  it('auto-detects direction when not specified', async () => {
    const emoji = await request(app()).post('/api/translate').send({ text: '🐱' });
    expect(emoji.body.direction).toBe('to-english');
    const text = await request(app()).post('/api/translate').send({ text: 'cat' });
    expect(text.body.direction).toBe('to-emoji');
  });

  it('rejects empty input', async () => {
    const res = await request(app()).post('/api/translate').send({ text: '  ' });
    expect(res.status).toBe(400);
  });

  it('rejects overly long input', async () => {
    const res = await request(app())
      .post('/api/translate')
      .send({ text: 'a'.repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/500/);
  });
});
