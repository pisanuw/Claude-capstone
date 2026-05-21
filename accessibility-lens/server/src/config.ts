/**
 * Centralized configuration, read once from the environment. Keeping this in
 * one typed place means the rest of the code never touches process.env.
 */
export interface Config {
  port: number;
  /** Max issues to send to the AI provider for enrichment per scan. */
  aiEnrichLimit: number;
  anthropicApiKey?: string;
  anthropicModel?: string;
  /** Directory of built client assets to serve, if present. */
  clientDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    aiEnrichLimit: Number(env.AI_ENRICH_LIMIT ?? 5),
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || undefined,
    clientDir: env.CLIENT_DIR?.trim() || '../../client/dist',
  };
}
