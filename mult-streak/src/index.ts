import { createService } from './serve.js';

function main(): void {
  const { app, config, emailer, startSweep } = createService();

  // Background sweep so the idle email fires even with no further traffic.
  // This is what makes the email reliable on a persistent host like Render.
  startSweep();

  app.listen(config.port, () => {
    console.log(
      `mult-streak on :${config.port} (email: ${emailer.enabled ? 'on' : 'off'}, idle ${config.idleMinutes}m)`,
    );
  });
}

main();
