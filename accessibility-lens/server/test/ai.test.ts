import { describe, it, expect } from 'vitest';
import { HeuristicProvider } from '../src/ai/heuristicProvider.js';
import { createAiProvider } from '../src/ai/index.js';
import type { Issue } from '../src/engine/types.js';

const sampleIssue: Issue = {
  ruleId: 'img-alt',
  title: 'Image missing alt text',
  severity: 'serious',
  wcagCriterion: '1.1.1',
  wcagLevel: 'A',
  profiles: ['screen-reader'],
  impact: 'x',
  selector: 'img',
  snippet: '<img>',
  suggestedFix: 'Add an alt attribute.',
};

describe('HeuristicProvider', () => {
  it('is disabled and returns the existing fix unchanged', async () => {
    const provider = new HeuristicProvider();
    expect(provider.enabled).toBe(false);
    expect(provider.name).toBe('heuristic');
    const fix = await provider.enrichFix(sampleIssue, { url: 'x', pageTitle: null });
    expect(fix).toBe('Add an alt attribute.');
  });
});

describe('createAiProvider', () => {
  it('returns the heuristic provider when no API key is set', () => {
    const provider = createAiProvider({});
    expect(provider.name).toBe('heuristic');
    expect(provider.enabled).toBe(false);
  });

  it('returns the Anthropic provider when an API key is set', () => {
    const provider = createAiProvider({ ANTHROPIC_API_KEY: 'sk-test-123' });
    expect(provider.name).toBe('anthropic');
    expect(provider.enabled).toBe(true);
  });

  it('treats a blank API key as unset', () => {
    const provider = createAiProvider({ ANTHROPIC_API_KEY: '   ' });
    expect(provider.name).toBe('heuristic');
  });
});
