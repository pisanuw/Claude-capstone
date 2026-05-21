import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { FileActivityStore } from './store.js';
import { NoopEmailer, ResendEmailer, sweepIdle, type Emailer } from './email.js';

function main(): void {
  const config = loadConfig();
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

  // Background sweep so the idle email fires even with no further traffic.
  // This is what makes the email reliable on a persistent host like Render.
  if (emailer.enabled) {
    setInterval(() => {
      void sweepIdle(store, emailer, idleMs, Date.now(), (m) => console.warn('[sweep]', m));
    }, 60_000).unref();
  }

  app.listen(config.port, () => {
    console.log(
      `mult-streak on :${config.port} (email: ${emailer.enabled ? 'on' : 'off'}, idle ${config.idleMinutes}m)`,
    );
  });
}

main();
