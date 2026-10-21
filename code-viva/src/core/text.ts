/** Small text helpers shared by the generator, the follow-up logic and the scorer. */

/** cyrb53: a fast 53-bit string hash, returned as 13 hex digits. Not cryptographic. */
export function hash(s: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Lower-case words, keeping identifier characters so `merge_sort` and `t2` survive. */
export function words(s: string): string[] {
  return s.toLowerCase().match(/o\([^)]*\)|[a-z0-9_]+(?:\(\))?/g) ?? [];
}

/** Identifier-like tokens in a line of code. */
export function identifiersIn(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/[A-Za-z_]\w*/g)) out.add(m[0]);
  return [...out];
}

/** Splits prose into sentences (and lines), trimmed, so evidence can be quoted verbatim. */
export function sentences(s: string): string[] {
  return s
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** True when `answer` mentions `name` as a word, ignoring case and backticks; camelCase and snake_case spellings both count. */
export function mentions(answer: string, name: string): boolean {
  const a = answer.toLowerCase().replace(/`/g, '');
  const variants = new Set([name.toLowerCase(), name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), name.replace(/_/g, ' ').toLowerCase()]);
  for (const v of variants) {
    if (!v.trim()) continue;
    const re = new RegExp(`(?:^|[^a-z0-9_])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9_])`);
    if (re.test(a)) return true;
  }
  return false;
}

/** True when the answer contains any of the keyword stems (prefix match on words, substring for phrases). */
export function coversConcept(answer: string, group: string[]): boolean {
  const a = answer.toLowerCase();
  const ws = words(a);
  return group.some((k) => (/[\s(^]/.test(k) ? a.includes(k) : ws.some((w) => w.startsWith(k))));
}
