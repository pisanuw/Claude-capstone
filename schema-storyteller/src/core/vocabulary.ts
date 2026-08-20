/**
 * Turns cryptic identifiers into human-readable phrases, deterministically.
 *
 * This is the piece the original idea proposed handing to an LLM ("business
 * domain vocabulary suggestions for cryptically named tables or columns"). It
 * is done here with a splitter, an abbreviation dictionary, and singular/plural
 * rules, so it is instant, offline, and identical every run.
 */

/** Common database abbreviations expanded to their full word. */
const ABBREVIATIONS: Record<string, string> = {
  id: 'identifier',
  pk: 'primary key',
  fk: 'foreign key',
  tbl: 'table',
  ref: 'reference',
  xref: 'cross-reference',
  xmap: 'cross-mapping',
  mapping: 'mapping',
  map: 'mapping',
  cfg: 'configuration',
  config: 'configuration',
  addr: 'address',
  amt: 'amount',
  qty: 'quantity',
  num: 'number',
  no: 'number',
  cnt: 'count',
  desc: 'description',
  descr: 'description',
  msg: 'message',
  usr: 'user',
  acct: 'account',
  txn: 'transaction',
  trans: 'transaction',
  org: 'organization',
  dept: 'department',
  cat: 'category',
  cust: 'customer',
  prod: 'product',
  inv: 'invoice',
  ord: 'order',
  img: 'image',
  pic: 'picture',
  avatar: 'avatar',
  dob: 'date of birth',
  ts: 'timestamp',
  dt: 'date',
  yr: 'year',
  mo: 'month',
  min: 'minimum',
  max: 'maximum',
  avg: 'average',
  pct: 'percent',
  attr: 'attribute',
  attrib: 'attribute',
  meta: 'metadata',
  pref: 'preference',
  perm: 'permission',
  auth: 'authentication',
  info: 'information',
  loc: 'location',
  geo: 'geographic',
  lat: 'latitude',
  lng: 'longitude',
  lon: 'longitude',
  url: 'URL',
  uri: 'URI',
  uuid: 'UUID',
  ip: 'IP address',
  db: 'database',
  seq: 'sequence',
  idx: 'index',
  ver: 'version',
  rev: 'revision',
  stat: 'status',
  status: 'status',
  active: 'active',
  deleted: 'deleted',
  archived: 'archived',
  created: 'created',
  updated: 'updated',
  modified: 'modified',
};

/** Words we never try to singularize/expand because they are already plain. */
const STOP_SUFFIXES = ['at', 'on', 'by', 'to', 'of'];

/** Splits `snake_case`, `camelCase`, `PascalCase`, `kebab-case` into lowercase words. */
export function splitWords(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0);
}

/** Expands one word via the abbreviation table, leaving unknown words as-is. */
export function expandWord(word: string): string {
  return ABBREVIATIONS[word] ?? word;
}

/** Naive English singularization, good enough for table-name humanizing. */
export function singularize(word: string): string {
  if (STOP_SUFFIXES.includes(word)) return word;
  if (/(ss|us|is)$/.test(word)) return word;
  if (/ies$/.test(word)) return word.replace(/ies$/, 'y');
  if (/(ches|shes|xes|zes|ses)$/.test(word)) return word.replace(/es$/, '');
  if (/s$/.test(word)) return word.replace(/s$/, '');
  return word;
}

function pluralize(word: string): string {
  if (/[^aeiou]y$/.test(word)) return word.replace(/y$/, 'ies');
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

/** Best-effort human phrase for a column/field name. */
export function humanizeField(name: string): string {
  const words = splitWords(name).map(expandWord);
  if (words.length === 0) return name;
  return words.join(' ');
}

/** Human phrase for an entity name, singularized (`order_items` -> `order item`). */
export function humanizeEntity(name: string): string {
  const words = splitWords(name).map(expandWord);
  if (words.length === 0) return name;
  words[words.length - 1] = singularize(words[words.length - 1]);
  return words.join(' ');
}

/** Plural human phrase for an entity, used when narrating collections. */
export function humanizeEntityPlural(name: string): string {
  const singular = humanizeEntity(name);
  const words = singular.split(' ');
  words[words.length - 1] = pluralize(words[words.length - 1]);
  return words.join(' ');
}

/**
 * Suggests a clearer name when the identifier leans on abbreviations, and
 * returns null when it is already plain English. Used to build the "these
 * cryptic names might mean" list.
 */
export function suggestRename(name: string): string | null {
  const words = splitWords(name);
  const hasAbbrev = words.some((w) => w in ABBREVIATIONS && ABBREVIATIONS[w] !== w && w !== 'id');
  if (!hasAbbrev) return null;
  const expanded = words.map(expandWord).join('_').replace(/\s+/g, '_');
  if (expanded.toLowerCase() === name.toLowerCase()) return null;
  return expanded;
}
