import { asStringArray, isRecord } from './jsonc.js';
import type { Capability, Finding } from './types.js';

export interface ExtensionAnalysis {
  name: string;
  summary: string;
  capabilities: Capability[];
  findings: Finding[];
}

type Rule = [Capability['dimension'], number, string, string];

/**
 * Chrome/Edge/Firefox API permissions and what each one reaches. Weights are
 * for the permission alone; host access multiplies several of them (see
 * BROAD_HOST_BOOST).
 */
const PERMISSIONS: Record<string, Rule[]> = {
  debugger: [['browser', 90, 'Full DevTools control of any tab', 'The debugger API can read and rewrite any page, including passwords as you type them, and every network response.']],
  nativeMessaging: [['shell', 70, 'Talks to a native program on your computer', 'A companion program installed outside the browser can do anything your account can; the extension is its remote control.']],
  cookies: [['credentials', 55, 'Reads and sets cookies', 'Session cookies are logins: with host access, the extension can copy them and sign in as you elsewhere.']],
  history: [['browser', 50, 'Reads your full browsing history', 'Every URL you have visited, with timestamps.']],
  tabs: [['browser', 30, 'Sees the URL and title of every tab', 'Knows what you are looking at in real time.']],
  webNavigation: [['browser', 30, 'Watches every navigation', 'Sees every page load and redirect across all tabs.']],
  webRequest: [['browser', 40, 'Observes network requests', 'Can watch requests the browser makes to the sites it has host access to.']],
  webRequestBlocking: [['browser', 55, 'Rewrites network requests in flight', 'Can block, redirect, or alter requests and headers before they leave the browser.']],
  declarativeNetRequestWithHostAccess: [['browser', 40, 'Redirects and modifies requests', 'Can redirect requests and change headers on sites it has host access to.']],
  declarativeNetRequest: [['browser', 20, 'Blocks or redirects requests by rule', 'Rule-based request filtering (the ad-blocker API).']],
  proxy: [['network', 65, 'Controls the browser proxy', 'Can route all browser traffic through a server of its choosing.']],
  management: [['browser', 45, 'Manages other extensions', 'Can list, disable, or uninstall your other extensions.']],
  clipboardRead: [['credentials', 50, 'Reads the clipboard', 'Copied passwords, one-time codes, and API keys pass through the clipboard.']],
  pageCapture: [['browser', 45, 'Saves full copies of pages', 'Can capture any tab as MHTML, including logged-in content.']],
  tabCapture: [['browser', 45, 'Records tab audio and video', 'Can capture what a tab shows and plays.']],
  desktopCapture: [['browser', 60, 'Captures your screen', 'Can request a screen or window capture stream.']],
  downloads: [['filesystem', 30, 'Manages downloads', 'Can start downloads and see where files were saved.']],
  'downloads.open': [['filesystem', 45, 'Opens downloaded files', 'Can open a downloaded file, which for an executable means running it.']],
  identity: [['credentials', 40, 'Gets OAuth tokens for your accounts', 'Can request sign-in tokens for your browser-profile accounts.']],
  'identity.email': [['credentials', 20, 'Reads your profile email address', 'Knows who is signed in to the browser.']],
  scripting: [['browser', 35, 'Injects scripts into pages', 'Can run its code inside pages it has host access to.']],
  bookmarks: [['browser', 20, 'Reads and edits bookmarks', 'Sees and changes your bookmarks.']],
  topSites: [['browser', 15, 'Sees your most visited sites', 'A summary of your browsing habits.']],
  geolocation: [['browser', 20, 'Reads your location', 'Can ask for your physical location.']],
  privacy: [['browser', 30, 'Changes privacy settings', 'Can turn browser privacy protections on or off.']],
  contentSettings: [['browser', 30, 'Changes per-site settings', 'Can grant sites camera, mic, or popup permissions.']],
  browsingData: [['browser', 30, 'Clears browsing data', 'Can delete history, cookies, and caches.']],
  sessions: [['browser', 25, 'Reads recently closed tabs and other devices', 'Sees tabs from your synced devices.']],
  userScripts: [['browser', 50, 'Runs user scripts', 'Can register arbitrary scripts to run on pages.']],
  offscreen: [],
  storage: [],
  unlimitedStorage: [],
  alarms: [],
  notifications: [],
  contextMenus: [],
  activeTab: [['browser', 10, 'Accesses a tab when you click it', 'Only the current tab, and only after you invoke the extension.']],
  sidePanel: [],
  clipboardWrite: [],
  idle: [],
  power: [],
  fontSettings: [],
  tts: [],
};

const BROAD = /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*|\*:\/\/\*\/|https?:\/\/\*\/?)$/;
const FILE_URL = /^file:\/\//;

/** Permissions that become much stronger when paired with access to every site. */
const BROAD_HOST_BOOST: Record<string, number> = { cookies: 30, webRequest: 20, scripting: 20, webRequestBlocking: 15 };

function isHostPattern(p: string): boolean {
  return p === '<all_urls>' || /^(\*|https?|wss?|ftp|file):\/\//.test(p);
}

export function isBrowserManifest(doc: unknown): boolean {
  return isRecord(doc) && typeof doc.manifest_version === 'number' && ('permissions' in doc || 'host_permissions' in doc || 'content_scripts' in doc || 'background' in doc || 'action' in doc || 'browser_action' in doc || 'name' in doc);
}

export function analyzeExtension(doc: Record<string, unknown>): ExtensionAnalysis {
  const capabilities: Capability[] = [];
  const findings: Finding[] = [];
  const name = typeof doc.name === 'string' ? doc.name : 'Unnamed extension';
  const version = typeof doc.version === 'string' ? doc.version : '?';
  const mv = doc.manifest_version as number;

  const perms = asStringArray(doc.permissions);
  const apiPerms = perms.filter((p) => !isHostPattern(p));
  const hosts = [...asStringArray(doc.host_permissions), ...perms.filter(isHostPattern)];
  const contentMatches: string[] = [];
  if (Array.isArray(doc.content_scripts)) {
    for (const cs of doc.content_scripts) if (isRecord(cs)) contentMatches.push(...asStringArray(cs.matches));
  }
  const allHosts = [...new Set([...hosts, ...contentMatches])];
  const broad = allHosts.some((h) => BROAD.test(h));
  const fileAccess = allHosts.some((h) => FILE_URL.test(h));

  if (broad) {
    const via = allHosts.find((h) => BROAD.test(h)) as string;
    capabilities.push({
      dimension: 'browser',
      weight: 85,
      label: 'Reads and changes every website',
      explain: 'Access to all sites: it can read and modify your email, banking, and work apps as you use them, including form fields before you submit.',
      evidence: `${contentMatches.includes(via) && !hosts.includes(via) ? 'content_scripts' : 'host_permissions'}: ${via}`,
    });
    capabilities.push({
      dimension: 'network',
      weight: 50,
      label: 'Can send page data anywhere',
      explain: 'With all-sites access it can make requests to any server, so anything it reads can leave the browser.',
      evidence: via,
    });
  } else {
    const specific = allHosts.filter((h) => !FILE_URL.test(h));
    if (specific.length > 0) {
      capabilities.push({
        dimension: 'browser',
        weight: Math.min(70, 25 + specific.length * 5),
        label: `Reads and changes ${specific.length} site pattern${specific.length === 1 ? '' : 's'}`,
        explain: `Limited to specific sites: ${specific.slice(0, 4).join(', ')}${specific.length > 4 ? ', …' : ''}.`,
        evidence: specific.join(', '),
      });
    }
  }
  if (fileAccess) {
    capabilities.push({
      dimension: 'filesystem',
      weight: 55,
      label: 'Reads local files opened in the browser',
      explain: 'file:// access lets it read local files shown in the browser (Chrome also requires you to enable "Allow access to file URLs").',
      evidence: allHosts.filter((h) => FILE_URL.test(h)).join(', '),
    });
  }

  for (const p of apiPerms) {
    const rules = PERMISSIONS[p];
    if (rules === undefined) {
      findings.push({ severity: 'info', message: `Permission not in the scanner's table: ${p}`, evidence: p });
      continue;
    }
    for (const [dimension, weight, label, explain] of rules) {
      const boost = broad ? (BROAD_HOST_BOOST[p] ?? 0) : 0;
      capabilities.push({ dimension, weight: Math.min(100, weight + boost), label, explain: boost > 0 ? `${explain} Combined with all-sites access, this applies everywhere.` : explain, evidence: `permissions: ${p}` });
    }
  }

  const optional = [...asStringArray(doc.optional_permissions), ...asStringArray(doc.optional_host_permissions)];
  if (optional.length > 0) {
    findings.push({
      severity: optional.some((p) => BROAD.test(p) || p === 'debugger' || p === 'nativeMessaging' || p === 'cookies') ? 'medium' : 'low',
      message: `Can ask for more at runtime: ${optional.join(', ')}.`,
      evidence: 'optional_permissions',
    });
  }

  if (isRecord(doc.oauth2)) {
    const scopes = asStringArray(doc.oauth2.scopes);
    if (scopes.length > 0) {
      const wide = scopes.filter((s) => /(^|\/)(gmail|drive(?!\.file)|calendar|contacts|admin|cloud-platform)|mail\.google\.com/i.test(s));
      capabilities.push({
        dimension: 'credentials',
        weight: wide.length > 0 ? 70 : 40,
        label: `OAuth access to ${scopes.length} Google scope${scopes.length === 1 ? '' : 's'}`,
        explain: `Signs in to your Google account with these scopes: ${scopes.map(shortScope).join(', ')}.`,
        evidence: scopes.join(', '),
      });
    }
  }

  if (isRecord(doc.externally_connectable)) {
    const matches = asStringArray(doc.externally_connectable.matches);
    if (matches.some((m) => BROAD.test(m) || /:\/\/\*\//.test(m))) {
      findings.push({ severity: 'medium', message: 'Any website can message this extension (externally_connectable matches all sites).', evidence: matches.join(', ') });
    }
  }

  const csp = typeof doc.content_security_policy === 'string'
    ? doc.content_security_policy
    : isRecord(doc.content_security_policy) && typeof doc.content_security_policy.extension_pages === 'string'
      ? doc.content_security_policy.extension_pages
      : '';
  if (/unsafe-eval/.test(csp)) {
    findings.push({ severity: 'medium', message: "CSP allows 'unsafe-eval': the extension can run code built from strings, a common injection path.", evidence: csp });
  }
  if (/https?:\/\/(?!localhost)/.test(csp) && /script-src/.test(csp)) {
    findings.push({ severity: 'medium', message: 'CSP loads scripts from a remote origin: code can change without an extension update.', evidence: csp });
  }
  if (mv === 2) {
    findings.push({ severity: 'low', message: 'Manifest V2: Chrome has retired MV2, and MV2 background pages are persistent and allow remotely hosted code.' });
  }
  if (typeof doc.update_url === 'string' && !/clients2\.google\.com|edge\.microsoft\.com|addons\.mozilla\.org/.test(doc.update_url)) {
    findings.push({ severity: 'medium', message: 'Updates from a server outside the official stores: no store review applies to new versions.', evidence: doc.update_url });
  }

  return { name, summary: `Browser extension v${version} (Manifest V${mv})`, capabilities, findings };
}

function shortScope(s: string): string {
  return s.replace('https://www.googleapis.com/auth/', '');
}
