import { isValidZone } from './tz.js';

/** App state carried in the URL query string, so schedules are shareable. */

export interface ShareState {
  /** The raw user input: cron, RRULE, GH Actions snippet, or plain English. */
  input: string;
  scheduleZone: string;
  displayZone: string;
  horizonDays: 30 | 90 | 365;
}

export const DEFAULT_HORIZON: 30 | 90 | 365 = 90;

export function encodeShare(state: ShareState): string {
  const params = new URLSearchParams();
  params.set('q', state.input);
  params.set('tz', state.scheduleZone);
  if (state.displayZone !== state.scheduleZone) params.set('view', state.displayZone);
  if (state.horizonDays !== DEFAULT_HORIZON) params.set('days', String(state.horizonDays));
  return params.toString();
}

export function decodeShare(query: string, fallbackZone: string): ShareState | null {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const input = params.get('q');
  if (input === null || input.trim().length === 0) return null;
  const tz = params.get('tz');
  const scheduleZone =
    tz !== null && isValidZone(tz) ? tz : isValidZone(fallbackZone) ? fallbackZone : 'UTC';
  const view = params.get('view');
  // encodeShare omits `view` when both zones agree, so that is the default.
  const displayZone = view !== null && isValidZone(view) ? view : scheduleZone;
  const daysRaw = params.get('days');
  const horizonDays: 30 | 90 | 365 =
    daysRaw === '30' ? 30 : daysRaw === '365' ? 365 : DEFAULT_HORIZON;
  return { input: input.slice(0, 2000), scheduleZone, displayZone, horizonDays };
}
