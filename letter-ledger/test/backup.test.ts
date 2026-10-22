import { describe, expect, it } from 'vitest';
import { backupNeedsPassphrase, readBackup, writeBackup } from '../src/core/backup';
import { utf8 } from '../src/core/codec';
import { demoLedger, demoPolicy } from '../src/core/demo';
import { checkRequest } from '../src/core/request';
import { releaseProblems } from '../src/core/release';
import { deadlines, emptyLedger, stats } from '../src/core/ledger';
import { factOutline } from '../src/core/outline';
import { policy, TODAY } from './fixtures';

describe('backups', () => {
  const content = { exportedAt: '2026-10-22T00:00:00Z', policy: policy(), privateKey: { kty: 'EC' }, ledger: emptyLedger(), files: { 'r/a': 'AAAA' } };

  it('round-trip as plain JSON', async () => {
    const bytes = await writeBackup(content);
    expect(backupNeedsPassphrase(bytes)).toBe(false);
    expect(await readBackup(bytes)).toEqual({ v: 1, kind: 'letter-ledger-backup', ...content });
  });

  it('round-trip sealed with a passphrase', async () => {
    const bytes = await writeBackup(content, 'pass phrase', 1000);
    expect(backupNeedsPassphrase(bytes)).toBe(true);
    await expect(readBackup(bytes)).rejects.toThrow(/encrypted/);
    await expect(readBackup(bytes, 'nope')).rejects.toThrow(/Wrong passphrase/);
    expect((await readBackup(bytes, 'pass phrase')).files).toEqual({ 'r/a': 'AAAA' });
  });

  it('reject other files', async () => {
    await expect(readBackup(utf8('not json'))).rejects.toThrow(/Not a Letter Ledger backup/);
    await expect(readBackup(utf8('{"kind":"other"}'))).rejects.toThrow(/Not a Letter Ledger backup/);
    await expect(readBackup(utf8(JSON.stringify({ v: 1, kind: 'letter-ledger-backup', policy: {}, ledger: { v: 9 } })))).rejects.toThrow(/damaged/);
    const noFiles = await readBackup(utf8(JSON.stringify({ v: 1, kind: 'letter-ledger-backup', policy: {}, ledger: emptyLedger() })));
    expect(noFiles.files).toEqual({});
  });
});

describe('demo ledger', () => {
  it('has every urgency, valid releases and clean outlines', async () => {
    const pol = demoPolicy('KEY');
    const l = await demoLedger(pol, TODAY);
    const s = stats(l, TODAY);
    expect(s.students).toBe(6);
    expect(s.overdue).toBe(1);
    expect(s.dueSoon).toBeGreaterThanOrEqual(2);
    expect(s.submitted).toBe(1);
    expect(new Set(deadlines(l, TODAY).map((r) => r.urgency))).toEqual(new Set(['overdue', 'due-soon', 'upcoming', 'closed']));
    for (const r of l.requests) {
      expect(await releaseProblems(r.packet)).toEqual([]);
      expect(r.packet.attachments.every((a) => a.data && a.size > 0)).toBe(true);
      expect(factOutline(l, r.packet.id, { today: TODAY })).toContain(`# Letter outline: ${r.packet.student.name}`);
    }
    // Requests were made on their asked-on day, so they pass the form's own checks then (warnings aside).
    const first = l.requests[0]!;
    expect(checkRequest(pol, first.packet, first.receivedOn).filter((i) => i.level === 'error')).toEqual([]);
    expect(l.students.find((x) => x.id === 'demo-term')!.notes).toHaveLength(2);
  });
});
