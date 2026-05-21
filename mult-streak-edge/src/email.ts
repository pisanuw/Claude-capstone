import type { ActivityStore, Activity } from './store.js';

/**
 * Email sending behind an interface so the app runs with no credentials (noop)
 * and tests never hit the network. The real provider uses Resend's HTTP API.
 */
export interface Emailer {
  readonly enabled: boolean;
  send(subject: string, text: string): Promise<void>;
}

/** No-op emailer used when RESEND_API / ADMIN_EMAIL are not configured. */
export class NoopEmailer implements Emailer {
  readonly enabled = false;
  async send(): Promise<void> {
    /* intentionally does nothing */
  }
}

export interface ResendOptions {
  apiKey: string;
  from: string;
  to: string;
  fetchImpl?: typeof fetch;
}

export class ResendEmailer implements Emailer {
  readonly enabled = true;
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly opts: ResendOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async send(subject: string, text: string): Promise<void> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.opts.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: this.opts.from, to: [this.opts.to], subject, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend API HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
  }
}

function describe(a: Activity, now: number): string {
  const mins = Math.round((now - a.lastActivity) / 60000);
  const shortId = a.id.slice(0, 8);
  const note =
    a.streak >= 10
      ? `They reached a winning streak of ${a.streak} and are now locked out for 24 hours.`
      : `Their streak when they stopped was ${a.streak}.`;
  return (
    `Anonymous player ${shortId} has stopped answering multiplication problems.\n` +
    `${note}\n` +
    `Idle for about ${mins} minute(s); last active ${new Date(a.lastActivity).toISOString()}.`
  );
}

/**
 * Email about every player idle past the threshold who has not been emailed
 * yet, then mark them so we do not email twice for the same idle period.
 * Best-effort: a send failure is logged and the player is left unmarked so a
 * later sweep can retry. Returns the number of emails sent.
 */
export async function sweepIdle(
  store: ActivityStore,
  emailer: Emailer,
  idleMs: number,
  now: number,
  log: (msg: string) => void = () => {},
): Promise<number> {
  if (!emailer.enabled) return 0;
  const idle = store.idleUnnotified(idleMs, now);
  let sent = 0;
  for (const a of idle) {
    try {
      await emailer.send(
        `A player stopped playing (streak ${a.streak})`,
        describe(a, now),
      );
      store.markEmailed(a.id);
      sent += 1;
    } catch (err) {
      log(`idle email for ${a.id.slice(0, 8)} failed: ${String(err).slice(0, 160)}`);
    }
  }
  return sent;
}
