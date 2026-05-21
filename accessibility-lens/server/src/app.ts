import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import type { AiProvider } from './ai/provider.js';
import { scanUrl } from './api/scan.js';
import { FetchError, type FetchImpl } from './engine/fetchPage.js';

export interface AppDeps {
  ai: AiProvider;
  aiEnrichLimit?: number;
  fetchImpl?: FetchImpl;
  /** Absolute path to built client assets; served if it exists. */
  clientDir?: string;
}

/**
 * Build the Express app. Separated from server startup (index.ts) so tests can
 * exercise it with supertest without binding a port.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', ai: { provider: deps.ai.name, enabled: deps.ai.enabled } });
  });

  app.post('/api/scan', async (req: Request, res: Response, next: NextFunction) => {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url) {
      res.status(400).json({ error: 'A "url" field is required.' });
      return;
    }
    try {
      const report = await scanUrl(url, {
        ai: deps.ai,
        fetchImpl: deps.fetchImpl,
        aiEnrichLimit: deps.aiEnrichLimit,
      });
      res.json(report);
    } catch (err) {
      if (err instanceof FetchError) {
        res.status(422).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  // Serve the built client if it is present (production single-service deploy).
  const clientDir = deps.clientDir;
  if (clientDir && fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get('*', (req: Request, res: Response, nextFn: NextFunction) => {
      if (req.path.startsWith('/api/')) return nextFn();
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  // Centralized error handler.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Something went wrong while scanning the page.' });
  });

  return app;
}
