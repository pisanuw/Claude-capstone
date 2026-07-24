import { createApp } from './app.js';
import { createTranslator } from './ai.js';

function main(): void {
  const port = Number(process.env.PORT ?? 3000);
  const translator = createTranslator({
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  });
  createApp({ translator }).listen(port, () => {
    console.log(`emoji-lingua on :${port} (engine: ${translator.name}, ai: ${translator.aiEnabled})`);
  });
}

main();
