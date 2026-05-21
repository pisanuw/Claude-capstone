import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('applies sensible defaults from an empty environment', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.aiEnrichLimit).toBe(5);
    expect(config.anthropicApiKey).toBeUndefined();
    expect(config.clientDir).toBe('../../client/dist');
  });

  it('reads values from the environment', () => {
    const config = loadConfig({
      PORT: '8080',
      AI_ENRICH_LIMIT: '2',
      ANTHROPIC_API_KEY: 'sk-x',
      ANTHROPIC_MODEL: 'claude-test',
      CLIENT_DIR: '/srv/client',
    });
    expect(config.port).toBe(8080);
    expect(config.aiEnrichLimit).toBe(2);
    expect(config.anthropicApiKey).toBe('sk-x');
    expect(config.anthropicModel).toBe('claude-test');
    expect(config.clientDir).toBe('/srv/client');
  });

  it('treats a blank API key as undefined', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: '  ' }).anthropicApiKey).toBeUndefined();
  });
});
