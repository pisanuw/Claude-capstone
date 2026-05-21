import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createAiProvider } from './ai/index.js';

/**
 * Production entry point. Wires real configuration and a real AI provider,
 * then starts listening. All testable logic lives in createApp / the engine.
 */
function main(): void {
  const config = loadConfig();
  const ai = createAiProvider({
    ANTHROPIC_API_KEY: config.anthropicApiKey,
    ANTHROPIC_MODEL: config.anthropicModel,
  });

  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(here, config.clientDir);

  const app = createApp({ ai, aiEnrichLimit: config.aiEnrichLimit, clientDir });

  app.listen(config.port, () => {
    console.log(
      `Accessibility Lens listening on :${config.port} (AI provider: ${ai.name}, enabled: ${ai.enabled})`,
    );
  });
}

main();
