/**
 * Netlify Functions entry point.
 *
 * Netlify cannot run a long-lived Express server, so we wrap the same app the
 * standalone server uses with serverless-http and expose it as a single
 * function. netlify.toml redirects /api/* here. We deliberately build the app
 * WITHOUT a clientDir so this function only answers /api/* ; Netlify serves the
 * static client (client/dist) directly from its CDN.
 *
 * The API logic, rules engine, and AI provider are all shared with the
 * standalone server. This file is the only Netlify-specific glue.
 */
import serverless from 'serverless-http';
import { createApp } from '../../server/dist/app.js';
import { createAiProvider } from '../../server/dist/ai/index.js';

const ai = createAiProvider(process.env);
const app = createApp({ ai });
const inner = serverless(app);

export const handler = async (event, context) => {
  // Netlify routes "/api/scan" to this function as
  // "/.netlify/functions/api/scan". Rewrite the path back to "/api/..." so the
  // Express routes (which are mounted under /api) match.
  if (typeof event.path === 'string') {
    event.path = event.path.replace(/^\/\.netlify\/functions\/api/, '/api');
    if (event.path === '/api') event.path = '/api/';
  }
  return inner(event, context);
};
