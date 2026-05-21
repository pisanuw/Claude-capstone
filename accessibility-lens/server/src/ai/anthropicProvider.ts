import Anthropic from '@anthropic-ai/sdk';
import type { AiProvider, PageContext } from './provider.js';
import type { Issue } from '../engine/types.js';

/**
 * Optional provider that uses Claude to rewrite the offending snippet into a
 * concrete, corrected version. It is constructed only when an API key is
 * present. enrichFix never throws: any error degrades gracefully to the
 * rule-based fix so a flaky model call cannot break a scan.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly enabled = true;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async enrichFix(issue: Issue, pageContext: PageContext): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 400,
        system:
          'You are an accessibility expert helping a student fix one issue on their web page. ' +
          'Given the failing HTML snippet and the WCAG rule it breaks, return a short, concrete fix: ' +
          'one or two sentences of explanation, then a corrected HTML snippet in a fenced code block. ' +
          'Be specific to the snippet. Do not lecture.',
        messages: [
          {
            role: 'user',
            content:
              `Page: ${pageContext.pageTitle ?? pageContext.url}\n` +
              `WCAG rule: ${issue.wcagCriterion} (level ${issue.wcagLevel})\n` +
              `Problem: ${issue.title}\n` +
              `Impact: ${issue.impact}\n` +
              `Failing snippet:\n${issue.snippet}\n\n` +
              `Rule-based suggestion: ${issue.suggestedFix}`,
          },
        ],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();

      return text || issue.suggestedFix;
    } catch {
      // Never let a model failure break the scan.
      return issue.suggestedFix;
    }
  }
}
