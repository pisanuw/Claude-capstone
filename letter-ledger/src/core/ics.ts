/**
 * Calendar reminders in place of a reminder email service: one all-day event
 * per open letter on its deadline, with alarms a week, two days and the
 * morning before. Import the file into Google, Outlook or Apple Calendar;
 * re-importing updates the same events because each UID is stable.
 */

import { addDays } from './dates';
import type { DeadlineRow } from './ledger';

export const DEFAULT_ALARMS = [7, 2, 1];

/** RFC 5545 text escaping. */
export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets, never splitting a UTF-8 character. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length ? 74 : 75;
    if (len + n > limit) {
      out.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const compact = (day: string) => day.replace(/-/g, '');

export function buildIcs(rows: DeadlineRow[], stamp: Date, alarms: number[] = DEFAULT_ALARMS): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Letter Ledger//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Letter deadlines'];
  for (const r of rows) {
    if (r.urgency === 'closed') continue;
    const who = r.student?.name ?? r.request.packet.student.name;
    const desc = [`Letter for ${who} (${r.request.packet.student.email})`, `Program: ${r.program.name}${r.program.kind ? ` (${r.program.kind})` : ''}`, `Submit via: ${r.program.method}`, r.program.url ? `Link: ${r.program.url}` : '', `Status: ${r.state.status}`]
      .filter(Boolean)
      .join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.request.packet.id}-${r.program.id}@letter-ledger`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compact(r.program.deadline)}`,
      `DTEND;VALUE=DATE:${compact(addDays(r.program.deadline, 1))}`,
      `SUMMARY:${icsText(`Letter due: ${who}, ${r.program.name}`)}`,
      `DESCRIPTION:${icsText(desc)}`,
      'TRANSP:TRANSPARENT',
    );
    if (r.program.url) lines.push(`URL:${icsText(r.program.url)}`);
    for (const d of alarms) {
      // All-day events start at local midnight, so "-PT15H" would be the
      // afternoon before; days count back from midnight and land at 9am.
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`Letter for ${who} due ${d === 1 ? 'tomorrow' : `in ${d} days`}`)}`, `TRIGGER:-P${d > 1 ? `${d - 1}D` : ''}T15H`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
