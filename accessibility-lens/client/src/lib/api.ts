import type { Report } from './types.js';

export class ApiError extends Error {}

/** Call the backend scan endpoint. Throws ApiError with a friendly message. */
export async function scan(url: string, fetchImpl: typeof fetch = fetch): Promise<Report> {
  let res: Response;
  try {
    res = await fetchImpl('/api/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new ApiError('Could not reach the server. Is it running?');
  }

  const data = (await res.json().catch(() => ({}))) as Partial<Report> & { error?: string };
  if (!res.ok) {
    throw new ApiError(data.error ?? `The scan failed (HTTP ${res.status}).`);
  }
  return data as Report;
}
