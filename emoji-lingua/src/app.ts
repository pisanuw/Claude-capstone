import express, { type Express } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Translator } from './ai.js';
import { looksLikeEmoji, type Direction, type Mode } from './translate.js';

export const MAX_INPUT = 500;

export interface AppDeps {
  translator: Translator;
  publicDir?: string;
}

export function createApp(deps: AppDeps): Express {
  // Resolve the static dir defensively: when this module is bundled into a
  // serverless function import.meta.url can be undefined, in which case the CDN
  // serves the page and we only handle /api here.
  let publicDir = deps.publicDir;
  if (!publicDir) {
    try {
      publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
    } catch {
      publicDir = undefined;
    }
  }

  const app = express();
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', engine: deps.translator.name, ai: deps.translator.aiEnabled });
  });

  app.post('/api/translate', async (req, res, next) => {
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text : '';
      if (!text.trim()) {
        res.status(400).json({ error: 'Enter some text to translate.' });
        return;
      }
      if (text.length > MAX_INPUT) {
        res.status(400).json({ error: `Please keep it under ${MAX_INPUT} characters.` });
        return;
      }

      // Direction: honor the client, but auto-detect when asked to.
      let direction = req.body?.direction as Direction | 'auto' | undefined;
      if (!direction || direction === 'auto') {
        direction = looksLikeEmoji(text) ? 'to-english' : 'to-emoji';
      }
      const mode: Mode = req.body?.mode === 'literal' ? 'literal' : 'interpretive';

      const result = await deps.translator.translate(text, direction, mode);
      res.json({ ...result, direction, mode });
    } catch (err) {
      next(err);
    }
  });

  if (publicDir && fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Something went wrong translating that.' });
  });

  return app;
}
