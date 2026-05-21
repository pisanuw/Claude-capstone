// Netlify Function serving the mult-streak API. The static game page is served
// by Netlify's CDN (publish dir dist/public); only /api/* runs here. It wraps
// the same Express app the standalone server uses, via serverless-http.
//
// Note: a Netlify function has no persistent disk across invocations, so the
// file-based idle store does NOT reliably retain "last activity". The game and
// the 24h lockout work fully (their state lives in the signed cookie), but the
// idle-email feature is only dependable on the Render deployment. See README.
import serverless from 'serverless-http';
import { createApp } from '../../dist/app.js';
import { FileActivityStore } from '../../dist/store.js';
import { NoopEmailer, ResendEmailer } from '../../dist/email.js';
import { loadConfig } from '../../dist/config.js';

const config = loadConfig();
const store = new FileActivityStore(config.activityFile);
const emailer =
  config.resendApiKey && config.adminEmail
    ? new ResendEmailer({ apiKey: config.resendApiKey, from: config.fromEmail, to: config.adminEmail })
    : new NoopEmailer();

const app = createApp({
  store,
  emailer,
  cookieSecret: config.cookieSecret,
  idleMs: config.idleMinutes * 60 * 1000,
});
const inner = serverless(app);

export const handler = async (event, context) => {
  if (typeof event.path === 'string') {
    event.path = event.path.replace(/^\/\.netlify\/functions\/api/, '/api');
    if (!event.path.startsWith('/api')) {
      event.path = `/api${event.path.startsWith('/') ? '' : '/'}${event.path}`;
    }
  }
  return inner(event, context);
};
