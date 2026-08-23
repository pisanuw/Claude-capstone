/**
 * Deterministic synthetic HAR used for the in-app demo and as an end-to-end
 * fixture: one session that trips every detector at least once. Timestamps
 * are fixed so analysis output is reproducible.
 */

const T0 = Date.parse('2026-08-21T10:00:00.000Z');

interface SampleSpec {
  at: number;
  url: string;
  method?: string;
  status: number;
  statusText?: string;
  mime: string;
  resourceType?: string;
  bodySize?: number;
  transferSize?: number;
  httpVersion?: string;
  responseHeaders?: Record<string, string>;
  timings?: Partial<Record<'blocked' | 'dns' | 'connect' | 'ssl' | 'send' | 'wait' | 'receive', number>>;
  redirectURL?: string;
}

function entry(spec: SampleSpec) {
  const timings = {
    blocked: 0,
    dns: -1,
    connect: -1,
    ssl: -1,
    send: 1,
    wait: 40,
    receive: 10,
    ...spec.timings,
  };
  const time = Object.values(timings).reduce((a, b) => a + Math.max(0, b), 0);
  const bodySize = spec.bodySize ?? 0;
  return {
    startedDateTime: new Date(T0 + spec.at).toISOString(),
    time,
    _resourceType: spec.resourceType,
    request: {
      method: spec.method ?? 'GET',
      url: spec.url,
      httpVersion: spec.httpVersion ?? 'http/2.0',
      headers: [{ name: 'Accept', value: '*/*' }],
      headersSize: 120,
      bodySize: 0,
    },
    response: {
      status: spec.status,
      statusText: spec.statusText ?? (spec.status === 200 ? 'OK' : ''),
      httpVersion: spec.httpVersion ?? 'http/2.0',
      headers: Object.entries(spec.responseHeaders ?? {}).map(([name, value]) => ({ name, value })),
      content: { size: bodySize, mimeType: spec.mime },
      redirectURL: spec.redirectURL ?? '',
      headersSize: 180,
      bodySize: spec.transferSize ?? bodySize,
      _transferSize: (spec.transferSize ?? bodySize) + 180,
    },
    cache: {},
    timings,
    pageref: 'page_1',
  };
}

export function sampleHarText(): string {
  const shop = 'https://example-shop.dev';
  const entries = [
    // Redirect chain: http -> https -> /home before the document loads.
    entry({ at: 0, url: 'http://example-shop.dev/', status: 301, mime: '', resourceType: 'document', redirectURL: 'https://example-shop.dev/', timings: { dns: 12, connect: 25, wait: 60 } }),
    entry({ at: 100, url: `${shop}/`, status: 302, mime: '', resourceType: 'document', redirectURL: `${shop}/home`, timings: { connect: 30, ssl: 22, wait: 70 } }),
    entry({ at: 220, url: `${shop}/home`, status: 200, mime: 'text/html', resourceType: 'document', bodySize: 48_211, transferSize: 12_050, responseHeaders: { 'content-encoding': 'br', 'cache-control': 'no-cache' }, timings: { wait: 95, receive: 18 } }),

    // Static assets with broken caching (5 offenders, ~1.9 MB total).
    entry({ at: 360, url: `${shop}/assets/app.8f3ab1.js`, status: 200, mime: 'application/javascript', resourceType: 'script', bodySize: 412_000, transferSize: 128_500, responseHeaders: { 'content-encoding': 'gzip' }, timings: { wait: 55, receive: 60 } }),
    entry({ at: 365, url: `${shop}/assets/styles.4c2d.css`, status: 200, mime: 'text/css', resourceType: 'stylesheet', bodySize: 88_400, transferSize: 21_300, responseHeaders: { 'content-encoding': 'gzip', 'cache-control': 'max-age=0' }, timings: { wait: 48, receive: 12 } }),
    entry({ at: 370, url: `${shop}/img/hero-4k.jpg`, status: 200, mime: 'image/jpeg', resourceType: 'image', bodySize: 1_380_000, transferSize: 1_378_000, responseHeaders: { 'cache-control': 'no-store' }, timings: { wait: 80, receive: 420 } }),
    entry({ at: 380, url: `${shop}/img/logo.svg`, status: 200, mime: 'image/svg+xml', resourceType: 'image', bodySize: 9_400, transferSize: 9_400, timings: { wait: 30, receive: 4 } }),
    entry({ at: 385, url: `${shop}/fonts/inter-var.woff2`, status: 200, mime: 'font/woff2', resourceType: 'font', bodySize: 118_000, transferSize: 118_000, responseHeaders: { 'cache-control': 'max-age=600' }, timings: { wait: 42, receive: 25 } }),

    // Big uncompressed JSON catalog (uncompressed + large JSON).
    entry({ at: 900, url: `${shop}/api/catalog?page=all`, status: 200, mime: 'application/json', resourceType: 'fetch', bodySize: 358_000, transferSize: 358_000, timings: { wait: 210, receive: 160 } }),

    // Sequential chain: cart -> user -> recommendations, each waiting for the last.
    entry({ at: 1300, url: `${shop}/api/cart`, status: 200, mime: 'application/json', resourceType: 'xhr', bodySize: 2_100, transferSize: 900, responseHeaders: { 'content-encoding': 'gzip' }, timings: { wait: 180, receive: 5 } }),
    entry({ at: 1510, url: `${shop}/api/user`, status: 200, mime: 'application/json', resourceType: 'xhr', bodySize: 1_400, transferSize: 700, responseHeaders: { 'content-encoding': 'gzip' }, timings: { wait: 160, receive: 4 } }),
    entry({ at: 1700, url: `${shop}/api/recommendations`, status: 200, mime: 'application/json', resourceType: 'xhr', bodySize: 5_600, transferSize: 2_300, responseHeaders: { 'content-encoding': 'gzip' }, timings: { wait: 240, receive: 6 } }),

    // Slow search endpoint: server think-time dominates.
    entry({ at: 2100, url: `${shop}/api/search?q=running+shoes`, status: 200, mime: 'application/json', resourceType: 'xhr', bodySize: 44_000, transferSize: 12_800, responseHeaders: { 'content-encoding': 'gzip' }, timings: { wait: 1850, receive: 22 } }),

    // Failing requests: a 500 on telemetry and a 404 on a legacy call.
    entry({ at: 2300, url: `${shop}/api/track`, method: 'POST', status: 500, statusText: 'Internal Server Error', mime: 'application/json', resourceType: 'xhr', bodySize: 120, transferSize: 120, timings: { wait: 320 } }),
    entry({ at: 2700, url: `${shop}/api/legacy/wishlist`, status: 404, statusText: 'Not Found', mime: 'application/json', resourceType: 'xhr', bodySize: 90, transferSize: 90, timings: { wait: 45 } }),

    // Duplicate config fetches.
    entry({ at: 2400, url: `${shop}/api/config`, status: 200, mime: 'application/json', resourceType: 'xhr', bodySize: 64_000, transferSize: 64_000, timings: { wait: 60, receive: 15 } }),
    entry({ at: 2900, url: `${shop}/api/config`, status: 200, mime: 'application/json', resourceType: 'xhr', bodySize: 64_000, transferSize: 64_000, timings: { wait: 58, receive: 14 } }),
    entry({ at: 5600, url: `${shop}/api/config`, status: 200, mime: 'application/json', resourceType: 'xhr', bodySize: 64_000, transferSize: 64_000, timings: { wait: 61, receive: 15 } }),
  ];

  // N+1 burst: the product list, then one request per product id.
  for (let i = 1; i <= 8; i++) {
    entries.push(
      entry({
        at: 3200 + i * 140,
        url: `${shop}/api/products/${i}`,
        status: 200,
        mime: 'application/json',
        resourceType: 'xhr',
        bodySize: 3_800,
        transferSize: 1_600,
        responseHeaders: { 'content-encoding': 'gzip', 'cache-control': 'private, max-age=120' },
        timings: { wait: 110, receive: 4 },
      }),
    );
  }

  // Legacy third-party widget over HTTP/1.1, new connection every time.
  for (let i = 0; i < 5; i++) {
    entries.push(
      entry({
        at: 4600 + i * 130,
        url: `https://cdn.legacy-widgets.dev/widget/part-${i}.js`,
        status: 200,
        mime: 'application/javascript',
        resourceType: 'script',
        bodySize: 24_000,
        transferSize: 8_100,
        httpVersion: 'http/1.1',
        responseHeaders: { 'content-encoding': 'gzip', 'cache-control': 'public, max-age=31536000, immutable' },
        timings: { dns: i === 0 ? 28 : 0, connect: 45, ssl: 38, wait: 90, receive: 8 },
      }),
    );
  }

  return JSON.stringify(
    {
      log: {
        version: '1.2',
        creator: { name: 'HAR Detective sample', version: '1.0' },
        pages: [{ startedDateTime: new Date(T0).toISOString(), id: 'page_1', title: 'https://example-shop.dev/home' }],
        entries,
      },
    },
    null,
    2,
  );
}
