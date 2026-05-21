import express, { type Express, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyAnswer,
  ensureProblem,
  isLocked,
  newGame,
  type GameState,
} from './game.js';
import { COOKIE_NAME, decodeState, encodeState, newId } from './cookie.js';
import type { ActivityStore } from './store.js';
import { sweepIdle, type Emailer } from './email.js';

export interface AppDeps {
  store: ActivityStore;
  emailer: Emailer;
  cookieSecret: string;
  idleMs: number;
  /** Injectable clock and rng for deterministic tests. */
  now?: () => number;
  rng?: () => number;
  /** Serve the static UI from here (defaults to ./public). */
  publicDir?: string;
}

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Public-facing view of state (never leaks the unguessable correct answer). */
function viewState(state: GameState, now: number) {
  if (isLocked(state, now)) {
    return {
      status: 'locked' as const,
      streak: state.streak,
      lockoutRemainingMs: state.lockoutUntil - now,
    };
  }
  return {
    status: 'playing' as const,
    streak: state.streak,
    problem: state.problem,
  };
}

export function createApp(deps: AppDeps): Express {
  const now = deps.now ?? (() => Date.now());
  const rng = deps.rng ?? Math.random;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = deps.publicDir ?? path.join(here, 'public');

  const app = express();
  app.use(express.json({ limit: '16kb' }));

  function readCookie(req: Request): string | undefined {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === COOKIE_NAME) return decodeURIComponent(v.join('='));
    }
    return undefined;
  }

  function writeCookie(res: Response, state: GameState): void {
    const value = encodeState(state, deps.cookieSecret);
    res.cookie(COOKIE_NAME, value, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/',
    });
  }

  /** Record activity and opportunistically email anyone who has gone idle. */
  async function recordAndSweep(state: GameState): Promise<void> {
    deps.store.touch(state.id, state.streak, now());
    await sweepIdle(deps.store, deps.emailer, deps.idleMs, now());
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', email: deps.emailer.enabled });
  });

  app.get('/api/state', async (req, res) => {
    const current = decodeState(readCookie(req), deps.cookieSecret);
    const state = ensureProblem(current ?? newGame(newId(), rng), now(), rng);
    writeCookie(res, state);
    await recordAndSweep(state);
    res.json(viewState(state, now()));
  });

  app.post('/api/answer', async (req, res) => {
    const current = decodeState(readCookie(req), deps.cookieSecret);
    if (!current) {
      res.status(400).json({ error: 'No game in progress. Reload to start.' });
      return;
    }
    const answer = Number(req.body?.answer);
    const result = applyAnswer(current, answer, now(), rng);
    writeCookie(res, result.state);
    await recordAndSweep(result.state);
    res.json({
      ...viewState(result.state, now()),
      outcome: result.outcome,
      correctValue: result.outcome === 'wrong' ? result.correctValue : undefined,
    });
  });

  app.use(express.static(publicDir));
  return app;
}
