// Netlify Function serving the emoji-lingua API. The page itself is static on
// the CDN; only /api/* runs here. Wraps the same Express app via serverless-http.
import serverless from 'serverless-http';
import { createApp } from '../../dist/app.js';
import { createTranslator } from '../../dist/ai.js';

const translator = createTranslator({
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
});
const inner = serverless(createApp({ translator }));

export const handler = async (event, context) => {
  if (typeof event.path === 'string') {
    event.path = event.path.replace(/^\/\.netlify\/functions\/api/, '/api');
    if (!event.path.startsWith('/api')) {
      event.path = `/api${event.path.startsWith('/') ? '' : '/'}${event.path}`;
    }
  }
  return inner(event, context);
};
