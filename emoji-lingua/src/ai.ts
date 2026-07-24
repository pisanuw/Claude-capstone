/**
 * Optional Claude-backed translation. Behind an interface so the app is fully
 * functional with no API key (DictionaryOnlyProvider) and tests never call the
 * network.
 */
import type { Direction, Mode, TranslationResult } from './translate.js';
import { translate as dictTranslate } from './translate.js';

export interface Translator {
  readonly name: string;
  readonly aiEnabled: boolean;
  translate(text: string, direction: Direction, mode: Mode): Promise<TranslationResult>;
}

/** Deterministic fallback: always the dictionary engine. */
export class DictionaryTranslator implements Translator {
  readonly name = 'dictionary';
  readonly aiEnabled = false;
  async translate(text: string, direction: Direction): Promise<TranslationResult> {
    return dictTranslate(text, direction);
  }
}

function systemPrompt(direction: Direction, mode: Mode): string {
  if (direction === 'to-emoji') {
    return (
      'You translate English into emoji. Reply with ONLY the emoji translation, ' +
      'no explanation, no quotes, no extra text. Preserve the meaning and order of ' +
      'ideas. Use widely understood emoji. Keep it compact: a handful of emoji per ' +
      'sentence. If a concept has no emoji, use the closest evocative one rather ' +
      'than English words.'
    );
  }
  if (mode === 'literal') {
    return (
      'You translate emoji into English. Reply with ONLY a literal word-by-word ' +
      'gloss of the emoji, in order, separated by spaces. No explanation, no ' +
      'punctuation beyond what is needed, no extra commentary.'
    );
  }
  return (
    'You translate emoji into English. Reply with ONLY a single natural English ' +
    'sentence conveying what the emoji sequence most likely means. No explanation, ' +
    'no quotes, no restating the emoji.'
  );
}

export interface AnthropicTranslatorOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Calls the Anthropic Messages API directly over HTTP (no SDK dependency, which
 * keeps the serverless bundle small). Any failure degrades to the dictionary
 * result so a model outage can never break the app.
 */
export class AnthropicTranslator implements Translator {
  readonly name = 'anthropic';
  readonly aiEnabled = true;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(private readonly opts: AnthropicTranslatorOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.model = opts.model ?? 'claude-sonnet-4-20250514';
  }

  async translate(text: string, direction: Direction, mode: Mode): Promise<TranslationResult> {
    try {
      const res = await this.fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.opts.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 400,
          system: systemPrompt(direction, mode),
          messages: [{ role: 'user', content: text }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const output = (data.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')
        .trim();
      if (!output) throw new Error('empty response');
      return { output, engine: 'ai', untranslated: [] };
    } catch {
      // Graceful degradation: never fail the request because the model did.
      return dictTranslate(text, direction);
    }
  }
}

/** Choose a translator from configuration. */
export function createTranslator(env: {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
}): Translator {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (key) return new AnthropicTranslator({ apiKey: key, model: env.ANTHROPIC_MODEL?.trim() });
  return new DictionaryTranslator();
}
