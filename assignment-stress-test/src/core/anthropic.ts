/**
 * Claude, called from the instructor's browser with their own API key. The
 * key goes straight to api.anthropic.com and nowhere else; there is no
 * backend. Tests pass a fake client, so nothing here touches the network in CI.
 *
 * Refusal fallbacks are deliberately not enabled: a refusal is a result in a
 * stress test (that model would not do the assignment), and silently
 * answering with a different model would put the wrong name on the score.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ChatTurn } from './types.js';

export interface ChatOptions {
  system?: string;
  effort?: 'low' | 'medium' | 'high';
  /** JSON schema for structured outputs (the judge). */
  schema?: Record<string, unknown>;
  maxTokens?: number;
}

export interface ChatReply {
  text: string;
  refused: boolean;
  /** Why the reply ended, when it ended for a reason other than finishing. */
  note: string;
}

export interface ChatModel {
  readonly id: string;
  chat(turns: ChatTurn[], opts: ChatOptions): Promise<ChatReply>;
}

export const MODEL_CHOICES: { id: string; name: string }[] = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' },
];

export const DEFAULT_JUDGE = 'claude-opus-5-5';

export function modelName(id: string): string {
  return MODEL_CHOICES.find((m) => m.id === id)?.name ?? id;
}

/** The slice of the SDK client this module uses, so tests can fake it. */
export interface MessagesClient {
  messages: {
    create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

export function browserClient(apiKey: string): MessagesClient {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 3 });
}

export class ClaudeModel implements ChatModel {
  constructor(
    readonly id: string,
    private readonly client: MessagesClient,
  ) {}

  async chat(turns: ChatTurn[], opts: ChatOptions): Promise<ChatReply> {
    try {
      return await this.send(turns, opts);
    } catch (err) {
      // Not every model takes every effort level; rather than lose the attempt,
      // run once more at the model's default and say so on the attempt.
      if (opts.effort && err instanceof Anthropic.BadRequestError && /effort/i.test(err.message)) {
        const r = await this.send(turns, { ...opts, effort: undefined });
        return { ...r, note: [r.note, `ran at default effort (${opts.effort} rejected)`].filter(Boolean).join('; ') };
      }
      throw err;
    }
  }

  private async send(turns: ChatTurn[], opts: ChatOptions): Promise<ChatReply> {
    const outputConfig: Anthropic.OutputConfig = {};
    if (opts.effort) outputConfig.effort = opts.effort;
    if (opts.schema) outputConfig.format = { type: 'json_schema', schema: opts.schema };
    const body: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.id,
      max_tokens: opts.maxTokens ?? 16000,
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
    };
    if (opts.system) body.system = opts.system;
    if (Object.keys(outputConfig).length > 0) body.output_config = outputConfig;
    const msg = await this.client.messages.create(body);
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (msg.stop_reason === 'refusal') {
      return { text, refused: true, note: msg.stop_details?.category ? `refused (${msg.stop_details.category})` : 'refused' };
    }
    return { text, refused: false, note: msg.stop_reason === 'max_tokens' ? 'cut off at max_tokens' : '' };
  }
}

/** Readable message for a failed call; the SDK's typed errors carry the HTTP status. */
export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'The API key was rejected (401).';
  if (err instanceof Anthropic.PermissionDeniedError) return 'This key cannot use that model (403).';
  if (err instanceof Anthropic.NotFoundError) return 'Model not found (404). Check the model id.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited (429) after retries. Try fewer models at once.';
  if (err instanceof Anthropic.APIError) return `API error ${err.status ?? ''}: ${err.message}`.trim();
  return err instanceof Error ? err.message : String(err);
}
