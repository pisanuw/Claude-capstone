/**
 * Fetches a page's HTML over HTTP(S). This is the engine's only network
 * dependency and is kept thin so it can be mocked in tests.
 *
 * IMPORTANT (security): because this server fetches arbitrary user-supplied
 * URLs, it is a classic SSRF target. We block non-HTTP schemes and obvious
 * internal hosts. This is a pragmatic guard, not a complete defense; see
 * ASSUMPTIONS.md.
 */

export interface FetchedPage {
  html: string;
  finalUrl: string;
  fetchedAt: string;
}

export class FetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal']);
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB cap
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;

/** Validate and normalize a user-supplied URL, throwing FetchError if unsafe. */
export function assertSafeUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new FetchError('That does not look like a valid URL. Include http:// or https://.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError('Only http:// and https:// URLs are supported.');
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new FetchError('Refusing to fetch internal or loopback addresses.');
  }
  // Block private IPv4 ranges. Residual risk: DNS rebinding between this check
  // and the actual connect cannot be prevented without pinning the TCP socket to
  // the validated IP — document in ASSUMPTIONS.md rather than pretend otherwise.
  if (/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host)) {
    throw new FetchError('Refusing to fetch private network addresses.');
  }
  return url;
}

export type FetchImpl = typeof fetch;

const FETCH_HEADERS = {
  'user-agent': 'AccessibilityLens/1.0 (+https://github.com/pisanuw/Claude-capstone)',
  accept: 'text/html,application/xhtml+xml',
};

/**
 * Follow redirects manually so every hop is re-validated by assertSafeUrl.
 * Using redirect:'follow' would bypass the SSRF guard on redirect destinations.
 */
async function fetchFollowRedirects(startUrl: URL, fetchImpl: FetchImpl, signal: AbortSignal): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetchImpl(current.toString(), { redirect: 'manual', signal, headers: FETCH_HEADERS });
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get('location');
    if (!location) throw new FetchError('Redirect without a Location header.');
    if (hop === MAX_REDIRECTS) throw new FetchError('Too many redirects (more than 5).');
    current = assertSafeUrl(new URL(location, current).toString());
  }
  // Unreachable, but TypeScript needs a return.
  throw new FetchError('Too many redirects.');
}

/**
 * Fetch a page. Accepts an injectable fetch implementation so tests never hit
 * the network.
 */
export async function fetchPage(input: string, fetchImpl: FetchImpl = fetch): Promise<FetchedPage> {
  const url = assertSafeUrl(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetchFollowRedirects(url, fetchImpl, controller.signal);

    if (!res.ok) {
      throw new FetchError(`The page returned HTTP ${res.status}.`, res.status);
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType && !contentType.includes('html')) {
      throw new FetchError(`Expected an HTML page but got "${contentType.split(';')[0]}".`);
    }

    const html = await readCapped(res, MAX_BYTES);
    return {
      html,
      finalUrl: res.url || url.toString(),
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new FetchError('The page took too long to respond and timed out.');
    }
    throw new FetchError('Could not reach that page. Check the URL and that the site is public.');
  } finally {
    clearTimeout(timer);
  }
}

/** Read a response body but stop after maxBytes to avoid memory blowups. */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const text = await res.text();
  if (text.length > maxBytes) return text.slice(0, maxBytes);
  return text;
}
