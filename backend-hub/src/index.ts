import { createHub } from './hub.js';

function main(): void {
  const port = Number(process.env.PORT ?? 3000);
  const { app, startBackgroundJobs } = createHub();

  startBackgroundJobs();

  app.listen(port, () => {
    console.log(`backend-hub on :${port}`);
  });
}

main();
