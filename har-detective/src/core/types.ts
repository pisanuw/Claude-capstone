/** Shared types for the HAR model, detectors, and reports. */

export type ResourceType =
  | 'document'
  | 'script'
  | 'stylesheet'
  | 'image'
  | 'font'
  | 'xhr'
  | 'media'
  | 'other';

/** Millisecond durations of each request phase; 0 when the phase did not occur. */
export interface Phases {
  blocked: number;
  dns: number;
  connect: number;
  ssl: number;
  send: number;
  wait: number;
  receive: number;
}

/** One normalized HAR entry. All times are ms; `start` is relative to the first request. */
export interface Entry {
  index: number;
  url: string;
  origin: string;
  path: string;
  method: string;
  status: number;
  statusText: string;
  httpVersion: string;
  mimeType: string;
  type: ResourceType;
  start: number;
  time: number;
  phases: Phases;
  /** Bytes on the wire (compressed), best-effort. */
  transferSize: number;
  /** Decoded body size in bytes, best-effort. */
  bodySize: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  redirectURL: string;
  fromCache: boolean;
  pageref: string | null;
}

export interface ParsedHar {
  entries: Entry[];
  /** Human-readable notes about entries that were skipped or repaired. */
  warnings: string[];
  creator: string;
  /** Wall-clock time of the first request, ISO string, or null if absent. */
  startedAt: string | null;
}

export type Severity = 'high' | 'medium' | 'low';

export interface Finding {
  /** Stable detector identifier, e.g. `repeated-calls`. */
  detector: string;
  severity: Severity;
  title: string;
  /** Plain-English explanation with the concrete numbers behind the verdict. */
  explanation: string;
  /** Copy-paste remediation suggestion (header value, code pattern, or action). */
  remediation: string;
  /** Indexes into ParsedHar.entries of the affected requests. */
  entries: number[];
  /** Estimated avoidable bytes on the wire, when quantifiable. */
  wastedBytes?: number;
  /** Estimated avoidable milliseconds, when quantifiable. */
  wastedMs?: number;
}

export interface TypeBreakdown {
  type: ResourceType;
  count: number;
  transferSize: number;
}

export interface OriginBreakdown {
  origin: string;
  count: number;
  transferSize: number;
}

export interface SessionStats {
  requestCount: number;
  originCount: number;
  totalTransfer: number;
  totalDecoded: number;
  /** From first request start to last request end, ms. */
  duration: number;
  errorCount: number;
  cachedCount: number;
  byType: TypeBreakdown[];
  topOrigins: OriginBreakdown[];
}

export interface Analysis {
  stats: SessionStats;
  /** Ranked: high severity first, larger estimated impact first within a tier. */
  findings: Finding[];
  /** Deterministic plain-English summary of the session and its biggest wins. */
  narrative: string;
}
