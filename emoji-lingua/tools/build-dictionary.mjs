#!/usr/bin/env node
/**
 * Build the emoji dictionary from Unicode CLDR emoji annotations.
 *
 * Run: node tools/build-dictionary.mjs
 * Output: src/generated-dictionary.ts
 *
 * Layers, applied in increasing priority (later wins):
 *   1. CLDR keywords            broad but noisy
 *   2. CLDR names               more precise (the emoji's actual name)
 *   3. Morphological forms      plurals / verb forms derived from the above
 *   4. Composed vocabulary      abstract words we approximate with 1-2 emoji
 *   5. Function words           glue words, some deliberately mapped to ''
 *   6. Curated overrides        hand-picked "obvious" choices win over CLDR
 *
 * Values may be '' (empty), meaning "drop this word from the output", which is
 * how articles are handled so sentences read cleanly.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED, COMPOSED, FUNCTION_WORDS, COMMON } from './curated-vocab.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CLDR_DIR = process.env.CLDR_DIR ?? path.join(HERE, 'cldr');

const PICTOGRAPHIC =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2900}-\u{297F}\u{3030}\u{303D}\u{3297}\u{3299}\u{00A9}\u{00AE}\u{2122}]/u;
const SKIN_TONE = /[\u{1F3FB}-\u{1F3FF}]/u;
const ZWJ = '\u200D';
const REGIONAL = /[\u{1F1E6}-\u{1F1FF}]/u;

/** Parse one CLDR annotations XML file into { emoji: {name, keywords[]} }. */
function parseAnnotations(file) {
  const out = new Map();
  if (!existsSync(file)) return out;
  const xml = readFileSync(file, 'utf8');
  const re = /<annotation cp="([^"]+)"(?:\s+type="(tts)")?>([^<]*)<\/annotation>/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, cp, tts, body] = m;
    const entry = out.get(cp) ?? { name: null, keywords: [] };
    if (tts === 'tts') entry.name = decode(body).trim();
    else entry.keywords = decode(body).split('|').map((s) => s.trim()).filter(Boolean);
    out.set(cp, entry);
  }
  return out;
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Merge the base and derived annotation sets. */
function loadEmoji() {
  const merged = new Map();
  for (const f of ['annotations-en.xml', 'annotationsDerived-en.xml']) {
    for (const [cp, v] of parseAnnotations(path.join(CLDR_DIR, f))) {
      const e = merged.get(cp) ?? { name: null, keywords: [] };
      if (v.name) e.name = v.name;
      e.keywords = [...new Set([...e.keywords, ...v.keywords])];
      merged.set(cp, e);
    }
  }
  // Keep only real pictographic emoji, drop lone skin-tone modifiers.
  const emoji = new Map();
  for (const [cp, v] of merged) {
    if (!PICTOGRAPHIC.test(cp)) continue;
    if (SKIN_TONE.test(cp) && [...cp].length === 1) continue;
    if (!v.name) continue;
    emoji.set(cp, v);
  }
  return emoji;
}

const codepointCount = (s) => [...s].length;

/** Lower score = better. Ranks how well an emoji represents a word. */
function scoreCandidate(word, emoji, meta, source) {
  const name = meta.name.toLowerCase();
  const nameWords = name.split(/[^a-z0-9]+/).filter(Boolean);
  let score;

  if (name === word) score = 0;
  else if (nameWords[0] === word && nameWords.length <= 2) score = 10;
  else if (nameWords[nameWords.length - 1] === word) score = 20;
  else if (nameWords.includes(word)) score = 30;
  else score = source === 'name' ? 40 : 60; // keyword-only match

  // Prefer simple, standard emoji.
  score += Math.max(0, codepointCount(emoji) - 1) * 6;
  if (emoji.includes(ZWJ)) score += 12;
  if (SKIN_TONE.test(emoji)) score += 40;
  // Flags are great for country words, noise for anything else.
  if (REGIONAL.test(emoji) && !name.startsWith('flag')) score += 30;
  if (REGIONAL.test(emoji) && !nameWords.includes(word)) score += 60;
  // Longer, more specific names are worse general matches.
  score += Math.max(0, nameWords.length - 1) * 3;
  return score;
}

/** Build word -> best emoji from CLDR. */
function buildFromCldr(emoji) {
  const best = new Map(); // word -> {emoji, score}
  const consider = (word, em, meta, source) => {
    if (!/^[a-z][a-z0-9'_-]{1,}$/.test(word)) return;
    if (word.length > 24) return;
    const score = scoreCandidate(word, em, meta, source);
    const cur = best.get(word);
    if (!cur || score < cur.score) best.set(word, { emoji: em, score });
  };

  for (const [em, meta] of emoji) {
    const name = meta.name.toLowerCase();
    // Whole name as a phrase key (e.g. "roller coaster").
    const phrase = name.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (phrase.includes(' ') && phrase.length <= 30) {
      consider(phrase.replace(/ /g, '_'), em, meta, 'name'); // stored with _ then re-split
    }
    for (const w of phrase.split(' ')) consider(w, em, meta, 'name');
    for (const kw of meta.keywords) {
      const k = kw.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
      if (!k) continue;
      if (k.includes(' ')) {
        if (k.length <= 30) consider(k.replace(/ /g, '_'), em, meta, 'keyword');
        continue;
      }
      consider(k, em, meta, 'keyword');
    }
  }
  const dict = new Map();
  for (const [word, v] of best) dict.set(word, v.emoji);
  return dict;
}

// ---------------------------------------------------------------------------
// Morphology: materialize plausible inflected forms so real sentences resolve.

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

function pluralOf(w) {
  if (/(s|x|z|ch|sh)$/.test(w)) return `${w}es`;
  if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ies`;
  if (/(f)$/.test(w)) return `${w.slice(0, -1)}ves`;
  return `${w}s`;
}

function ingOf(w) {
  if (w.endsWith('ie')) return `${w.slice(0, -2)}ying`;
  if (w.endsWith('e') && !w.endsWith('ee')) return `${w.slice(0, -1)}ing`;
  if (
    w.length >= 3 &&
    !VOWELS.has(w[w.length - 1]) &&
    VOWELS.has(w[w.length - 2]) &&
    !VOWELS.has(w[w.length - 3]) &&
    !'wxy'.includes(w[w.length - 1])
  ) {
    return `${w}${w[w.length - 1]}ing`;
  }
  return `${w}ing`;
}

function edOf(w) {
  if (w.endsWith('e')) return `${w}d`;
  if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ied`;
  return `${w}ed`;
}

/** Add derived forms for each base word, without overwriting better entries. */
function addMorphology(dict) {
  const additions = new Map();
  for (const [word, em] of dict) {
    if (word.includes('_') || word.length < 3 || !/^[a-z]+$/.test(word)) continue;
    // Only predictable inflections here: -ly/-er too often collide with
    // unrelated real words (cat -> "cater"), so they are not derived.
    for (const form of [pluralOf(word), ingOf(word), edOf(word)]) {
      if (form === word || dict.has(form) || additions.has(form)) continue;
      if (form.length > 26) continue;
      additions.set(form, em);
    }
  }
  for (const [k, v] of additions) dict.set(k, v);
  return additions.size;
}

// ---------------------------------------------------------------------------

const CLDR_SOURCES = {
  'annotations-en.xml':
    'https://raw.githubusercontent.com/unicode-org/cldr/main/common/annotations/en.xml',
  'annotationsDerived-en.xml':
    'https://raw.githubusercontent.com/unicode-org/cldr/main/common/annotationsDerived/en.xml',
};

/** Download the CLDR annotation files if they are not already cached. */
async function ensureCldr() {
  mkdirSync(CLDR_DIR, { recursive: true });
  for (const [file, url] of Object.entries(CLDR_SOURCES)) {
    const dest = path.join(CLDR_DIR, file);
    if (existsSync(dest)) continue;
    console.log(`fetching ${file} from unicode-org/cldr ...`);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Could not download ${url} (HTTP ${res.status}).`);
      process.exit(1);
    }
    writeFileSync(dest, await res.text(), 'utf8');
  }
}

async function main() {
  await ensureCldr();
  const emoji = loadEmoji();
  if (emoji.size === 0) {
    console.error(`No usable CLDR data in ${CLDR_DIR}.`);
    process.exit(1);
  }

  const dict = buildFromCldr(emoji);
  const fromCldr = dict.size;
  const derived = addMorphology(dict);

  // Higher-priority layers overwrite CLDR guesses.
  for (const [w, em] of Object.entries(COMMON)) dict.set(w, em);
  for (const [w, em] of Object.entries(COMPOSED)) dict.set(w, em);
  const composedCount = Object.keys(COMPOSED).length + Object.keys(COMMON).length;
  for (const [w, em] of Object.entries(FUNCTION_WORDS)) dict.set(w, em);
  for (const [w, em] of Object.entries(CURATED)) dict.set(w, em);

  // Morphology for the curated/composed layers too (they are the common words).
  const handAuthored = { ...COMMON, ...COMPOSED, ...CURATED };
  for (const [w, em] of Object.entries(handAuthored)) {
    if (!/^[a-z]+$/.test(w) || w.length < 3 || em === '') continue;
    for (const form of [pluralOf(w), ingOf(w), edOf(w)]) {
      // Overwrite CLDR-derived forms: a curated base word is a better source of
      // truth than whatever emoji happened to list the inflected form as a
      // keyword (e.g. danced -> maracas).
      if (!(form in handAuthored)) dict.set(form, em);
    }
  }

  // Reverse map: emoji -> most natural word. Priority order matters more than
  // word length: the first layer to claim an emoji wins, so 🎂 glosses as
  // "birthday" (curated) rather than "age", and 🌙 as "moon" rather than "late".
  const reverse = new Map();
  const claim = (em, word) => {
    if (!em || !word || word.includes('_')) return;
    if (!reverse.has(em)) reverse.set(em, word);
  };
  for (const layer of [CURATED, COMPOSED, COMMON]) {
    for (const [w, em] of Object.entries(layer)) claim(em, w);
  }
  for (const [em, meta] of emoji) {
    const name = meta.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    claim(em, name);
  }
  for (const [w, em] of Object.entries(FUNCTION_WORDS)) claim(em, w);
  for (const [w, em] of dict) claim(em, w);

  // Serialize compactly: one "word\temoji" per line inside a template literal.
  const entries = [...dict.entries()]
    .filter(([w]) => w && !/[`${}\\]/.test(w))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const revEntries = [...reverse.entries()]
    .filter(([em, w]) => em && w && !/[`${}\\]/.test(w) && !/[`${}\\]/.test(em))
    .sort(([a], [b]) => (a < b ? -1 : 1));

  const banner = `// GENERATED FILE - do not edit by hand.
// Built by tools/build-dictionary.mjs from Unicode CLDR emoji annotations
// (unicode-org/cldr, common/annotations + common/annotationsDerived, en).
// Regenerate with: npm run build:dictionary
//
// Entries: ${entries.length} words -> emoji, ${revEntries.length} emoji -> word.
// Words are stored as "word<TAB>emoji" lines and parsed once at module load,
// which keeps the bundle far smaller than a literal object with ${entries.length} keys.
// A value of "" means "drop this word" (used for articles).
// Multi-word phrases are stored with underscores and matched before single words.
`;

  const body = `${banner}
const PACKED_WORDS = \`
${entries.map(([w, e]) => `${w}\t${e}`).join('\n')}
\`;

const PACKED_REVERSE = \`
${revEntries.map(([e, w]) => `${e}\t${w}`).join('\n')}
\`;

function unpack(packed: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of packed.split('\\n')) {
    if (!line) continue;
    const tab = line.indexOf('\\t');
    if (tab < 0) continue;
    out[line.slice(0, tab)] = line.slice(tab + 1);
  }
  return out;
}

/** word (or phrase_with_underscores) -> emoji. "" means drop the word. */
export const WORD_TO_EMOJI: Record<string, string> = unpack(PACKED_WORDS);

/** emoji -> the most natural English word or phrase. */
export const EMOJI_TO_WORD: Record<string, string> = unpack(PACKED_REVERSE);

/** Multi-word phrases (spaces), longest first, for phrase-before-word matching. */
export const PHRASES: string[] = Object.keys(WORD_TO_EMOJI)
  .filter((k) => k.includes('_'))
  .map((k) => k.replace(/_/g, ' '))
  .sort((a, b) => b.length - a.length);
`;

  const outFile = path.join(ROOT, 'src', 'generated-dictionary.ts');
  writeFileSync(outFile, body, 'utf8');

  const phrases = entries.filter(([w]) => w.includes('_')).length;
  console.log(`CLDR emoji parsed:       ${emoji.size}`);
  console.log(`words from CLDR:         ${fromCldr}`);
  console.log(`morphological additions: ${derived}`);
  console.log(`composed/abstract:       ${composedCount}`);
  console.log(`function words:          ${Object.keys(FUNCTION_WORDS).length}`);
  console.log(`curated overrides:       ${Object.keys(CURATED).length}`);
  console.log(`--------------------------------`);
  console.log(`TOTAL ENTRIES:           ${entries.length}  (${phrases} phrases)`);
  console.log(`reverse entries:         ${revEntries.length}`);
  console.log(`written to:              ${path.relative(ROOT, outFile)}`);
}

await main();
