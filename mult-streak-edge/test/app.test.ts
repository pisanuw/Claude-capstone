import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { MemoryActivityStore } from '../src/store.js';
import { NoopEmailer, type Emailer } from '../src/email.js';

const secret = 'test-secret';

function makeApp(overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  // Deterministic rng so the served problem is known: factors at min (10x10).
  return createApp({
    store: new MemoryActivityStore(),
    emailer: new NoopEmailer(),
    cookieSecret: secret,
    idleMs: 15 * 60 * 1000,
    rng: () => 0,
    ...overrides,
  });
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
  it('starts a new game with a problem and sets a cookie', async () => {
    const res = await request(makeApp()).get('/api/state');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('playing');
    expect(res.body.streak).toBe(0);
    expect(res.body.problem).toEqual({ a: 10, b: 10 }); // rng=0 -> min factors
    expect(res.headers['set-cookie']).toBeTruthy();
  });
});

describe('POST /api/answer', () => {
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
    // Player A plays, then goes quiet.
    const a = cookieFrom(await request(app).get('/api/state'));
    await request(app).post('/api/answer').set('Cookie', a).send({ answer: 100 });
    // 20 minutes later, anyone's request sweeps and emails idle player A.
    clock = 20 * 60 * 1000;
    await request(app).get('/api/state');
    expect(sent.length).toBeGreaterThanOrEqual(1);
  });
});
