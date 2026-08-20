import type { Express } from 'express';
import { createApp } from './app.js';
import { loadConfig, type Config } from './config.js';
import { FileActivityStore } from './store.js';
import { NoopEmailer, ResendEmailer, sweepIdle, type Emailer } from './email.js';

export interface Service {
  app: Express;
  config: Config;
  emailer: Emailer;
  /**
   * Arm the background idle sweep (unref'd, once per minute). Separate from
   * construction so tests and embedders opt in explicitly; the standalone
   * entry and the backend hub both call it when email is enabled.
   */
  startSweep: () => void;
}

/**
 * Wire the full mult-streak service (config, store, emailer, app) without
 * binding a port. The standalone entry (index.ts) listens on it directly;
 * backend-hub mounts `service.app` under a path prefix instead.
 */
export function createService(env: NodeJS.ProcessEnv = process.env): Service {
  const config = loadConfig(env);
  const store = new FileActivityStore(config.activityFile);

  let emailer: Emailer;
  if (config.resendApiKey && config.adminEmail) {
    emailer = new ResendEmailer({
      apiKey: config.resendApiKey,
      from: config.fromEmail,
      to: config.adminEmail,
    });
  } else {
    emailer = new NoopEmailer();
  }

  const idleMs = config.idleMinutes * 60 * 1000;
  const app = createApp({ store, emailer, cookieSecret: config.cookieSecret, idleMs });

  const startSweep = (): void => {
    if (!emailer.enabled) return;
    setInterval(() => {
      void sweepIdle(store, emailer, idleMs, Date.now(), (m) => console.warn('[sweep]', m));
    }, 60_000).unref();
  };

  return { app, config, emailer, startSweep };
}
