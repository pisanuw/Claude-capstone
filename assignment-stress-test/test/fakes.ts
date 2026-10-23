import type { ChatModel, ChatOptions, ChatReply } from '../src/core/anthropic.js';
import type { ChatTurn } from '../src/core/types.js';

/** A ChatModel that answers from a function and records every call. */
export class FakeModel implements ChatModel {
  calls: { turns: ChatTurn[]; opts: ChatOptions }[] = [];
  constructor(
    readonly id: string,
    private readonly answer: (turns: ChatTurn[], opts: ChatOptions) => ChatReply | Promise<ChatReply>,
  ) {}
  async chat(turns: ChatTurn[], opts: ChatOptions): Promise<ChatReply> {
    this.calls.push({ turns: turns.map((t) => ({ ...t })), opts });
    return this.answer(turns, opts);
  }
}

export const reply = (text: string): ChatReply => ({ text, refused: false, note: '' });
