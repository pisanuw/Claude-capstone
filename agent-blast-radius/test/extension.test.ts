import { describe, expect, it } from 'vitest';
import { analyzeExtension, isBrowserManifest } from '../src/core/extension.js';

const ext = (over: Record<string, unknown>) => analyzeExtension({ manifest_version: 3, name: 'X', version: '1.0', ...over });
const labels = (a: ReturnType<typeof analyzeExtension>) => a.capabilities.map((c) => c.label);
const weight = (a: ReturnType<typeof analyzeExtension>, label: string) => a.capabilities.find((c) => c.label === label)?.weight;

describe('isBrowserManifest', () => {
  it('needs a numeric manifest_version', () => {
    expect(isBrowserManifest({ manifest_version: 3, name: 'x' })).toBe(true);
    expect(isBrowserManifest({ manifest_version: '3' })).toBe(false);
    expect(isBrowserManifest({ manifest_version: 3 })).toBe(false);
    expect(isBrowserManifest(null)).toBe(false);
  });
});

describe('analyzeExtension', () => {
  it('flags all-sites access from host_permissions or content scripts', () => {
    const a = ext({ host_permissions: ['<all_urls>'] });
    expect(labels(a)).toEqual(['Reads and changes every website', 'Can send page data anywhere']);
    expect(a.capabilities[0]?.evidence).toBe('host_permissions: <all_urls>');
    const b = ext({ content_scripts: [{ matches: ['https://*/*'] }, 'junk'] });
    expect(b.capabilities[0]?.evidence).toBe('content_scripts: https://*/*');
  });

  it('scores specific hosts lower and lists them', () => {
    const a = ext({ host_permissions: ['https://mail.google.com/*'] });
    expect(a.capabilities[0]?.label).toBe('Reads and changes 1 site pattern');
    expect(a.capabilities[0]?.weight).toBe(30);
    const many = ext({ host_permissions: ['https://a/*', 'https://b/*', 'https://c/*', 'https://d/*', 'https://e/*'] });
    expect(many.capabilities[0]?.explain).toMatch(/…/);
  });

  it('treats MV2 host patterns in permissions as hosts and warns about MV2', () => {
    const a = analyzeExtension({ manifest_version: 2, name: 'Old', version: '1', permissions: ['*://*/*', 'tabs'] });
    expect(labels(a)).toContain('Reads and changes every website');
    expect(a.findings.some((f) => f.message.startsWith('Manifest V2'))).toBe(true);
    expect(a.summary).toBe('Browser extension v1 (Manifest V2)');
  });

  it('flags file:// access', () => {
    expect(labels(ext({ host_permissions: ['file:///*'] }))).toEqual(['Reads local files opened in the browser']);
  });

  it('boosts cookie access when paired with all sites', () => {
    expect(weight(ext({ permissions: ['cookies'] }), 'Reads and sets cookies')).toBe(55);
    const both = ext({ permissions: ['cookies'], host_permissions: ['<all_urls>'] });
    expect(weight(both, 'Reads and sets cookies')).toBe(85);
    expect(both.capabilities.find((c) => c.label === 'Reads and sets cookies')?.explain).toMatch(/applies everywhere/);
  });

  it('maps dangerous APIs and ignores harmless ones', () => {
    const a = ext({ permissions: ['debugger', 'nativeMessaging', 'storage', 'alarms'] });
    expect(a.capabilities.map((c) => c.dimension)).toEqual(['browser', 'shell']);
    expect(ext({ permissions: ['somethingNew'] }).findings[0]?.message).toMatch(/not in the scanner's table/);
  });

  it('reports optional permissions, higher when they are dangerous', () => {
    expect(ext({ optional_permissions: ['bookmarks'] }).findings[0]?.severity).toBe('low');
    expect(ext({ optional_host_permissions: ['<all_urls>'] }).findings[0]?.severity).toBe('medium');
  });

  it('scores OAuth scopes, higher for mail and drive', () => {
    expect(weight(ext({ oauth2: { scopes: ['https://www.googleapis.com/auth/userinfo.email'] } }), 'OAuth access to 1 Google scope')).toBe(40);
    const wide = ext({ oauth2: { scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'openid'] } });
    expect(weight(wide, 'OAuth access to 2 Google scopes')).toBe(70);
    expect(wide.capabilities[0]?.explain).toMatch(/gmail\.readonly/);
    expect(ext({ oauth2: { scopes: [] } }).capabilities).toEqual([]);
  });

  it('flags wide externally_connectable, unsafe CSP, remote scripts, and off-store updates', () => {
    expect(ext({ externally_connectable: { matches: ['*://*/*'] } }).findings[0]?.message).toMatch(/Any website can message/);
    expect(ext({ externally_connectable: { matches: ['https://*.example.com/*'] } }).findings).toEqual([]);
    expect(ext({ content_security_policy: { extension_pages: "script-src 'self' 'unsafe-eval'" } }).findings[0]?.message).toMatch(/unsafe-eval/);
    expect(analyzeExtension({ manifest_version: 2, name: 'x', content_security_policy: "script-src 'self' https://cdn.example.com" }).findings.some((f) => f.message.includes('remote origin'))).toBe(true);
    expect(ext({ update_url: 'https://updates.example.com/x.xml' }).findings[0]?.message).toMatch(/outside the official stores/);
    expect(ext({ update_url: 'https://clients2.google.com/service/update2/crx' }).findings).toEqual([]);
  });

  it('falls back on missing name and version', () => {
    const a = analyzeExtension({ manifest_version: 3 });
    expect(a.name).toBe('Unnamed extension');
    expect(a.summary).toBe('Browser extension v? (Manifest V3)');
  });
});
