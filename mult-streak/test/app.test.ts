import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { primeFactors } from '../src/game.js';
import { MemoryActivityStore } from '../src/store.js';
import { NoopEmailer, type Emailer } from '../src/email.js';

const secret = 'test-secret';

function makeApp(overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  // Deterministic rng so the served mult problem is known: factors at min (10x10).
  return createApp({
    store: new MemoryActivityStore(),
    emailer: new NoopEmailer(),
    cookieSecret: secret,
    idleMs: 15 * 60 * 1000,
    rng: () => 0,
    ...overrides,
  });
}

// rng that works for both initial mult game (pos 0-1) and factor mode (pos 2+).
// Pos 2-5 cycle as [0.25,0.16,0.2,0.24] producing n=2431 (11*13*17).
function makeFactorRng() {
  const cycle = [0.25, 0.16, 0.2, 0.24];
  let i = 0;
  return () => {
    if (i < 2) { i++; return 0; } // initial mult problem: a=10, b=10
    return cycle[(i++ - 2) % 4];
  };
}

/** Pull the mstreak cookie out of a set-cookie header for the next request. */
function cookieFrom(res: request.Response): string {
  const set = res.headers['set-cookie'];
  const arr = Array.isArray(set) ? set : [set];
  return arr.map((c) => c.split(';')[0]).join('; ');
}

describe('GET /api/health', () => {
  it('reports status and email flag', async () => {
    const res = await request(makeApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.email).toBe(false);
  });
});

describe('GET /api/state', () => {
  it('starts a new mult game with a problem and sets a cookie', async () => {
    const res = await request(makeApp()).get('/api/state');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('playing');
    expect(res.body.mode).toBe('mult');
    expect(res.body.streak).toBe(0);
    expect(res.body.problem).toEqual({ type: 'mult', a: 10, b: 10 }); // rng=0
    expect(res.headers['set-cookie']).toBeTruthy();
  });
});

describe('POST /api/answer – mult mode', () => {
  it('rejects answering with no cookie', async () => {
    const res = await request(makeApp()).post('/api/answer').send({ answer: 100 });
    expect(res.status).toBe(400);
  });

  it('increments the streak on a correct answer', async () => {
    const app = makeApp();
    const start = await request(app).get('/api/state');
    const cookie = cookieFrom(start);
    const res = await request(app).post('/api/answer').set('Cookie', cookie).send({ answer: 100 });
    expect(res.body.outcome).toBe('correct');
    expect(res.body.streak).toBe(1);
  });

  it('resets the streak and reveals the answer when wrong', async () => {
    const app = makeApp();
    const cookie = cookieFrom(await request(app).get('/api/state'));
    const res = await request(app).post('/api/answer').set('Cookie', cookie).send({ answer: 99 });
    expect(res.body.outcome).toBe('wrong');
    expect(res.body.streak).toBe(0);
    expect(res.body.correctValue).toBe(100);
    expect(res.body.correctFactors).toBeUndefined();
  });

  it('declares a win and locks out after 10 correct in a row', async () => {
    const app = makeApp();
    let cookie = cookieFrom(await request(app).get('/api/state'));
    let last: request.Response | null = null;
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/answer').set('Cookie', cookie).send({ answer: 100 });
      cookie = cookieFrom(res) || cookie;
      last = res;
    }
    expect(last?.body.outcome).toBe('won');
    expect(last?.body.status).toBe('locked');
    expect(last?.body.streak).toBe(10);
    expect(last?.body.lockoutRemainingMs).toBeGreaterThan(0);
  });

  it('refuses further play while locked', async () => {
    const app = makeApp();
    let cookie = cookieFrom(await request(app).get('/api/state'));
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/answer').set('Cookie', cookie).send({ answer: 100 });
      cookie = cookieFrom(res) || cookie;
    }
    const after = await request(app).post('/api/answer').set('Cookie', cookie).send({ answer: 100 });
    expect(after.body.status).toBe('locked');
  });

  it('triggers an idle email via the request sweep', async () => {
    let clock = 0;
    const sent: string[] = [];
    const emailer: Emailer = {
      enabled: true,
      async send(subject) {
        sent.push(subject);
      },
    };
    const app = makeApp({ emailer, now: () => clock });
    const a = cookieFrom(await request(app).get('/api/state'));
    await request(app).post('/api/answer').set('Cookie', a).send({ answer: 100 });
    clock = 20 * 60 * 1000;
    await request(app).get('/api/state');
    expect(sent.length).toBeGreaterThanOrEqual(1);
  });
});

describe('POST /api/mode', () => {
  it('rejects mode change with no cookie', async () => {
    const res = await request(makeApp()).post('/api/mode').send({ mode: 'factor' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid mode value', async () => {
    const app = makeApp();
    const cookie = cookieFrom(await request(app).get('/api/state'));
    const res = await request(app).post('/api/mode').set('Cookie', cookie).send({ mode: 'divide' });
    expect(res.status).toBe(400);
  });

  it('switches to factor mode when streak is 0', async () => {
    const app = makeApp({ rng: makeFactorRng() });
    const cookie = cookieFrom(await request(app).get('/api/state'));
    const res = await request(app)
      .post('/api/mode').set('Cookie', cookie).send({ mode: 'factor' });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('factor');
    expect(res.body.problem.type).toBe('factor');
    expect(res.body.problem.n).toBeGreaterThanOrEqual(1_000);
    expect(res.body.problem.n).toBeLessThanOrEqual(1_000_000);
  });

  it('switches back to mult mode', async () => {
    const app = makeApp({ rng: makeFactorRng() });
    const cookie = cookieFrom(await request(app).get('/api/state'));
    const modeRes = await request(app)
      .post('/api/mode').set('Cookie', cookie).send({ mode: 'factor' });
    const factorCookie = cookieFrom(modeRes) || cookie;
    const res = await request(app)
      .post('/api/mode').set('Cookie', factorCookie).send({ mode: 'mult' });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('mult');
    expect(res.body.problem.type).toBe('mult');
  });

  it('rejects mode change when streak > 0', async () => {
    const app = makeApp();
    let cookie = cookieFrom(await request(app).get('/api/state'));
    const answerRes = await request(app)
      .post('/api/answer').set('Cookie', cookie).send({ answer: 100 });
    cookie = cookieFrom(answerRes) || cookie;
    const res = await request(app)
      .post('/api/mode').set('Cookie', cookie).send({ mode: 'factor' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/answer – factor mode', () => {
  it('accepts a correct prime factorization', async () => {
    const app = makeApp({ rng: makeFactorRng() });
    const init = cookieFrom(await request(app).get('/api/state'));
    const modeRes = await request(app)
      .post('/api/mode').set('Cookie', init).send({ mode: 'factor' });
    const cookie = cookieFrom(modeRes) || init;
    const n = modeRes.body.problem.n;
    const answer = primeFactors(n).join('*');

    const res = await request(app)
      .post('/api/answer').set('Cookie', cookie).send({ answer });
    expect(res.body.outcome).toBe('correct');
    expect(res.body.streak).toBe(1);
    expect(res.body.mode).toBe('factor');
  });

  it('resets streak and reveals factorization on wrong answer', async () => {
    const app = makeApp({ rng: makeFactorRng() });
    const init = cookieFrom(await request(app).get('/api/state'));
    const modeRes = await request(app)
      .post('/api/mode').set('Cookie', init).send({ mode: 'factor' });
    const cookie = cookieFrom(modeRes) || init;
    const n = modeRes.body.problem.n;

    const res = await request(app)
      .post('/api/answer').set('Cookie', cookie).send({ answer: 'wrong' });
    expect(res.body.outcome).toBe('wrong');
    expect(res.body.streak).toBe(0);
    expect(res.body.correctValue).toBe(n);
    expect(Array.isArray(res.body.correctFactors)).toBe(true);
    expect(res.body.correctFactors.length).toBeGreaterThanOrEqual(2);
  });

  it('wins after 10 correct factor answers', async () => {
    const app = makeApp({ rng: makeFactorRng() });
    const init = cookieFrom(await request(app).get('/api/state'));
    const modeRes = await request(app)
      .post('/api/mode').set('Cookie', init).send({ mode: 'factor' });
    let cookie = cookieFrom(modeRes) || init;
    let last: request.Response | null = null;

    for (let i = 0; i < 10; i++) {
      const n = last ? last.body.problem.n : modeRes.body.problem.n;
      const answer = primeFactors(n).join('*');
      const res = await request(app).post('/api/answer').set('Cookie', cookie).send({ answer });
      cookie = cookieFrom(res) || cookie;
      last = res;
    }
    expect(last?.body.outcome).toBe('won');
    expect(last?.body.streak).toBe(10);
    expect(last?.body.status).toBe('locked');
  });
});
