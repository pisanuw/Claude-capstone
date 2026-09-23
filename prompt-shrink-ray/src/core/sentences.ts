const TERMINATOR_RE = /[.!?]/;

/**
 * Splits text into sentences, scanning for a run of `.`/`!`/`?` followed by
 * whitespace or end-of-string. A terminator with no following whitespace
 * (an abbreviation, a decimal, `obj.method()`) is treated as ordinary text
 * rather than a boundary. Unlike a single match-all regex, this never drops
 * characters: every position in `text` ends up in exactly one sentence or in
 * the whitespace between two sentences.
 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    if (TERMINATOR_RE.test(text[i])) {
      let end = i;
      while (end + 1 < text.length && TERMINATOR_RE.test(text[end + 1])) end += 1;
      const next = text[end + 1];
      if (next === undefined || /\s/.test(next)) {
        const sentence = text.slice(start, end + 1).trim();
        if (sentence.length > 0) sentences.push(sentence);
        let k = end + 1;
        while (k < text.length && /\s/.test(text[k])) k += 1;
        start = k;
        i = k;
        continue;
      }
      i = end + 1;
      continue;
    }
    i += 1;
  }
  const rest = text.slice(start).trim();
  if (rest.length > 0) sentences.push(rest);
  return sentences;
}

export function normalizeSentence(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
