/**
 * Term extraction for retrieval: lower-casing, a light stemmer, stop words, a
 * small course-logistics synonym table, and numbered course items ("lab 3",
 * "labs 1-4", "homework 2 and 5") turned into exact entity terms so a
 * question about lab 3 finds a policy about labs 1 to 4.
 */

import { words } from './text.js';

export const STOPWORDS = new Set(
  (
    'a an and are as at be been being but by can could did do does doing for from had has have having he her here hers him his how i if ' +
    'in into is it its itself just me my myself of on once or our ours out over own she should so some such than that the their them ' +
    'then there these they this those through to too under until up very was we were what when where which while who whom why will with ' +
    'would you your yours yourself im ive id dont doesnt isnt arent wasnt cant get got also any all each other more most only same ' +
    'about above after again against below before between both during further few nor not off per s t there us ok okay please ' +
    'much many say says said tell know want am happen happens happened mean means like able going really still exactly anyone anything something someone possible'
  ).split(/\s+/),
);


/** Canonical concept for a stemmed word. Both the word and the concept are indexed. */
const SYNONYMS: Record<string, string> = {};
function group(canon: string, list: string): void {
  for (const w of list.split(/\s+/)) SYNONYMS[w] = canon;
}
group('ai', 'ai genai chatgpt gpt llm copilot claude gemini generative chatbot bard');
group('late', 'late lateness overdue tardy');
group('due', 'due deadline');
group('penalty', 'penalty deduction deduct lose lost los penaliz penalis');
group('extension', 'extension extend');
group('exam', 'exam examination midterm final');
group('ta', 'ta tas assistant');
group('collab', 'collaborat collaboration group partner pair teammate team together');
group('grade', 'grade grading score mark weight worth percent percentage');
group('attend', 'attend attendance absence absent miss');
group('regrade', 'regrade appeal dispute');
group('integrity', 'integrity cheat plagiarism plagiariz misconduct dishonesty copy violat violation');
group('submit', 'submit submission turn upload hand');
group('allow', 'allow permit permitted prohibit forbid forbidden ban banned may');
group('contact', 'contact email reach message');
group('device', 'device laptop phone calculator');
group('drop', 'drop lowest dropp');
group('resubmit', 'resubmit resubmission redo retake');
group('accommodat', 'accommodat disability drc dss');
group('require', 'require requir mandatory compulsory must need obligatory');

/** Course items that are counted: "lab 3", "project 2". Plurals and abbreviations fold onto one name. */
const NUMBERED: Record<string, string> = {
  lab: 'lab', labs: 'lab',
  assignment: 'assignment', assignments: 'assignment', hw: 'homework', homework: 'homework', homeworks: 'homework',
  project: 'project', projects: 'project', quiz: 'quiz', quizzes: 'quiz', exam: 'exam', exams: 'exam',
  midterm: 'midterm', midterms: 'midterm', week: 'week', weeks: 'week', chapter: 'chapter', chapters: 'chapter',
  ch: 'chapter', module: 'module', modules: 'module', unit: 'unit', units: 'unit', lecture: 'lecture', lectures: 'lecture',
  milestone: 'milestone', milestones: 'milestone', ps: 'pset', pset: 'pset', psets: 'pset', problem: 'pset',
  section: 'section', sections: 'section', part: 'part', parts: 'part', a: 'assignment', mp: 'mp', mps: 'mp', pa: 'pa', pas: 'pa',
};

/** Irregular forms the suffix rules cannot reach. */
const IRREGULAR: Record<string, string> = {
  broken: 'break', broke: 'break', chosen: 'choose', chose: 'choose', written: 'write', wrote: 'write', taken: 'take',
  took: 'take', given: 'give', gave: 'give', gotten: 'get', done: 'do', did: 'do', made: 'make', paid: 'pay', sent: 'send',
  went: 'go', gone: 'go', left: 'leave', lost: 'lose', kept: 'keep', held: 'hold', met: 'meet', ran: 'run', seen: 'see',
  saw: 'see', told: 'tell', bought: 'buy', brought: 'bring', taught: 'teach', begun: 'begin', began: 'begin', spent: 'spend',
  forgot: 'forget', forgotten: 'forget', missed: 'miss', children: 'child', people: 'person', mice: 'mouse',
};

/** Concepts that carry the form of a question ("is it allowed", "is it required") rather than its topic. */
export const MODAL = new Set(['~allow', '~require']);

/** A light suffix stemmer: good enough to join "submissions"/"submission", "graded"/"grade". */
export function stem(w: string): string {
  let s = w.toLowerCase().replace(/'s$/, '').replace(/'/g, '');
  if (IRREGULAR[s]) s = IRREGULAR[s];
  if (s.length <= 3 || /^\d/.test(s)) return s;
  if (s.endsWith('ies') && s.length > 4) s = s.slice(0, -3) + 'y';
  else if (s.endsWith('sses')) s = s.slice(0, -2);
  else if (s.endsWith('es') && /(ch|sh|x|z)es$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith('s') && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.endsWith('ing') && s.length > 5) s = s.slice(0, -3);
  else if (s.endsWith('ed') && s.length > 4) s = s.slice(0, -2);
  if (s.endsWith('ly') && s.length > 5) s = s.slice(0, -2);
  if (/(.)\1$/.test(s) && !/(ll|ss|zz)$/.test(s) && s.length > 3) s = s.slice(0, -1);
  if (s.endsWith('e') && s.length > 4) s = s.slice(0, -1);
  return s;
}

/**
 * Words that carry meaning in a question but not enough on their own to count
 * as evidence ("class", "course"): they still score, at a discount.
 */
export const WEAK = new Set(
  ['course', 'class', 'student', 'instructor', 'professor', 'use', 'allow', '~allow', 'time', 'thing', 'question', 'rule', 'policy', 'work', 'do', 'go', 'way', 'information', 'info'].map(stem),
);

/** Canonical concept of a stemmed word, matching on prefixes for families like "collaborat". */
export function concept(stemmed: string): string | undefined {
  if (SYNONYMS[stemmed]) return SYNONYMS[stemmed];
  for (let n = stemmed.length - 1; n >= 5; n--) {
    const c = SYNONYMS[stemmed.slice(0, n)];
    if (c) return c;
  }
  return undefined;
}

/** Numbers named by a range or list: "1-4" -> 1,2,3,4; "2, 3 and 5" -> 2,3,5. Ranges are capped at 30 items. */
function numbersIn(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(/\s*(?:,|\band\b|\bor\b|&|\/)\s*/)) {
    const r = /^(\d{1,3})\s*(?:-|to|through|thru)\s*(\d{1,3})$/.exec(part.trim());
    if (r) {
      const a = Number(r[1]);
      const b = Number(r[2]);
      if (b >= a && b - a <= 30) for (let n = a; n <= b; n++) out.push(n);
      continue;
    }
    if (/^\d{1,3}$/.test(part.trim())) out.push(Number(part.trim()));
  }
  return out;
}

const NUMBER_SPEC = String.raw`\d{1,3}(?:\s*(?:-|\u2013|to|through|thru)\s*\d{1,3})?(?:\s*(?:,|and|or|&|/)\s*\d{1,3}(?:\s*(?:-|\u2013|to|through|thru)\s*\d{1,3})?)*`;
const OPEN_ENDED = String.raw`(\s*(?:onwards?|and (?:later|after|beyond|up|above)|or (?:later|after|above)|\+))?`;
const NUMBERED_RE = new RegExp(String.raw`\b([A-Za-z]+)\s*#?\s*(${NUMBER_SPEC})\b${OPEN_ENDED}`, 'g');
/** How far an open-ended mention ("lab 5 onward") reaches. */
const OPEN_REACH = 15;

/** Numbered course items in a text, as "lab#3" terms. */
export function numberedItems(text: string): string[] {
  const out = new Set<string>();
  const t = text.replace(/\u2013|\u2014/g, '-');
  for (const m of t.matchAll(NUMBERED_RE)) {
    const kind = NUMBERED[m[1].toLowerCase()];
    if (!kind) continue;
    // "A1" style only counts when written together ("A1", not "a 1").
    if ((kind === 'assignment' && m[1].toLowerCase() === 'a') && /\s/.test(m[0])) continue;
    const nums = numbersIn(m[2].replace(/\s*(?:-|to|through|thru)\s*/g, '-'));
    for (const n of nums) out.add(`${kind}#${n}`);
    if (m[3] && nums.length) for (let n = nums[nums.length - 1] + 1; n <= nums[nums.length - 1] + OPEN_REACH; n++) out.add(`${kind}#${n}`);
  }
  return [...out];
}

/** The stem a numbered item's kind is indexed under ("lab#3" -> "lab"). */
export function kindStem(item: string): string {
  return stem(item.split('#')[0]);
}

/** Kinds of numbered item mentioned in a text ("lab"), whether or not a number follows. */
export function numberedKinds(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of words(text)) {
    const k = NUMBERED[w.toLowerCase()];
    if (k && w.length > 2) out.add(k);
  }
  return out;
}

/** Content terms of a text: stems (minus stop words), their concepts, and numbered items. */
export function terms(text: string): string[] {
  const out: string[] = [];
  for (const w of words(text)) {
    const lw = w.toLowerCase();
    if (STOPWORDS.has(lw.replace(/'/g, ''))) continue;
    const s = stem(lw);
    if (!s || STOPWORDS.has(s)) continue;
    // Bare numbers only count through numbered items or as percentages/times, never alone.
    if (/^\d+$/.test(s)) continue;
    out.push(s);
    const c = concept(s);
    if (c) out.push('~' + c);
  }
  for (const n of numberedItems(text)) out.push(n);
  return out;
}
