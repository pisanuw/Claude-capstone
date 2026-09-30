/**
 * Course documents: parsing Markdown and plain text (including text pulled out
 * of a PDF) into a flat display text split into blocks.
 *
 * The display text is the ground truth. The viewer shows exactly this text,
 * the retriever indexes it, and the verifier checks quotes against it, so a
 * highlighted span is always a span of what the student sees.
 */

import { hash } from './text.js';

export type DocFormat = 'markdown' | 'text' | 'pdf';

/** A document as the instructor supplied it. */
export interface SourceDoc {
  title: string;
  format: DocFormat;
  /** Markdown or plain text. For PDFs, the extracted text with pages separated by form feeds. */
  source: string;
}

export type BlockKind = 'heading' | 'para' | 'item' | 'row' | 'code';

export interface Block {
  kind: BlockKind;
  /** Heading level 1-6 (headings only). */
  level?: number;
  /** [start, end) in the parsed document's text. */
  start: number;
  end: number;
  /** Headings above this block, outermost first (for a heading, its parents). */
  section: string[];
  /** 1-based page number, for PDFs. */
  page?: number;
}

export interface ParsedDoc {
  id: string;
  title: string;
  format: DocFormat;
  text: string;
  blocks: Block[];
}

interface RawBlock {
  kind: BlockKind;
  level?: number;
  text: string;
  page?: number;
}

/** Removes inline Markdown markup, keeping the words a reader sees. */
export function stripInline(s: string): string {
  // Escaped characters are set aside first so emphasis rules cannot eat them.
  const escaped: string[] = [];
  return s
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, (_, ch: string) => `\uE000${escaped.push(ch) - 1}\uE000`)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<(https?:[^>\s]+)>/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^\w_])_(?=\S)([^_]*?\S)_(?![\w])/g, '$1$2')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/\uE000(\d+)\uE000/g, (_, i: string) => escaped[Number(i)])
    .replace(/[ \t]+/g, ' ')
    .trim();
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const ITEM = /^\s*(?:[-*+]|\d{1,3}[.)])\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => stripInline(c));
}

/** Parses Markdown into raw blocks. Setext headings, blockquotes, lists and pipe tables are understood. */
export function parseMarkdown(src: string): RawBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: RawBlock[] = [];
  let para: string[] = [];
  let header: string[] | null = null;
  const flush = () => {
    if (para.length) {
      const text = stripInline(para.join(' '));
      if (text) out.push({ kind: 'para', text });
    }
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/^\s*>\s?/, '');
    if (FENCE.test(line)) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++]);
      const text = code.join('\n').trim();
      if (text) out.push({ kind: 'code', text });
      continue;
    }
    if (!line.trim()) {
      flush();
      header = null;
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flush();
      const text = stripInline(h[2]);
      if (text) out.push({ kind: 'heading', level: h[1].length, text });
      continue;
    }
    const next = lines[i + 1] ?? '';
    if (para.length === 0 && /^\s*(=+|-+)\s*$/.test(next) && !ITEM.test(line) && !line.includes('|')) {
      const text = stripInline(line);
      if (text) out.push({ kind: 'heading', level: next.trim().startsWith('=') ? 1 : 2, text });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      continue;
    }
    if (line.includes('|') && (TABLE_SEP.test(next) || header)) {
      flush();
      if (TABLE_SEP.test(next)) {
        header = tableCells(line);
        i++;
        continue;
      }
      const cells = tableCells(line);
      const cols = header ?? [];
      // Each row reads as a sentence: "Homework: 30%". Header labels keep cells meaningful out of context.
      const text = cells
        .map((c, k) => (k > 0 && cols[k] && c ? `${cols[k]}: ${c}` : c))
        .filter(Boolean)
        .join('; ');
      if (text) out.push({ kind: 'row', text });
      continue;
    }
    const it = ITEM.exec(line);
    if (it) {
      flush();
      const parts = [it[1]];
      // Lazy continuation lines of a list item (indented, not a new item).
      while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !ITEM.test(lines[i + 1])) parts.push(lines[++i].trim());
      const text = stripInline(parts.join(' '));
      if (text) out.push({ kind: 'item', text });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out;
}

/** True for a short standalone line that reads like a heading in plain text. */
export function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 2 || t.length > 70) return false;
  if (/[.,;!?]$/.test(t)) return false;
  const w = t.split(/\s+/);
  if (w.length > 9) return false;
  if (/^(\d+(\.\d+)*\.?|[IVX]+\.|[A-Z]\.)\s+\S/.test(t)) return true;
  if (/:$/.test(t)) return true;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 3 && letters === letters.toUpperCase()) return true;
  // Title Case: most words capitalized.
  const caps = w.filter((x) => /^[A-Z0-9]/.test(x)).length;
  return w.length <= 6 && caps / w.length >= 0.6;
}

/**
 * Parses plain text. Blank lines separate paragraphs, bullet lines become
 * items, and a short standalone line that looks like a title becomes a
 * heading. Form feeds mark PDF page breaks.
 */
export function parsePlain(src: string): RawBlock[] {
  const out: RawBlock[] = [];
  const pages = src.replace(/\r\n?/g, '\n').split('\f');
  pages.forEach((pageText, p) => {
    const page = pages.length > 1 ? p + 1 : undefined;
    const paras = pageText.split(/\n\s*\n/);
    for (const chunk of paras) {
      const lines = chunk.split('\n').filter((l) => l.trim());
      if (!lines.length) continue;
      let buf: string[] = [];
      let kind: BlockKind = 'para';
      const flush = () => {
        const text = buf.join(' ').replace(/\s+/g, ' ').trim();
        if (text) out.push(page ? { kind, text, page } : { kind, text });
        buf = [];
        kind = 'para';
      };
      lines.forEach((line, k) => {
        const bullet = /^\s*(?:[-*\u2022\u25CF\u25AA\u25E6]|\d{1,3}[.)])\s+(.*)$/.exec(line);
        if (bullet) {
          flush();
          kind = 'item';
          buf.push(bullet[1]);
          return;
        }
        // A title line: first in its paragraph, and the next line does not continue it mid-sentence.
        // A lone short line with no closing punctuation ("Lab reports") is a title too.
        const lone = lines.length === 1 && /^[\p{Lu}\d]/u.test(line.trim()) && !/[.,;!?)]$/.test(line.trim()) && line.trim().split(/\s+/).length <= 5;
        if (k === 0 && (looksLikeHeading(line) || lone) && (lines.length === 1 || !/^[a-z]/.test(lines[1].trim()))) {
          flush();
          const text = line.trim().replace(/:$/, '');
          out.push(page ? { kind: 'heading', level: 2, text, page } : { kind: 'heading', level: 2, text });
          return;
        }
        buf.push(line.trim());
      });
      flush();
    }
  });
  return out;
}

/** Parses a source document into its display text and blocks. */
export function parseDoc(doc: SourceDoc, index = 0): ParsedDoc {
  const raw = doc.format === 'markdown' ? parseMarkdown(doc.source) : parsePlain(doc.source);
  const blocks: Block[] = [];
  const stack: { level: number; text: string }[] = [];
  let text = '';
  for (const r of raw) {
    if (text) text += '\n\n';
    const start = text.length;
    text += r.text;
    const section: string[] = [];
    if (r.kind === 'heading') {
      const level = r.level ?? 2;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      section.push(...stack.map((s) => s.text));
      stack.push({ level, text: r.text });
    } else {
      section.push(...stack.map((s) => s.text));
    }
    const b: Block = { kind: r.kind, start, end: text.length, section };
    if (r.kind === 'heading') b.level = r.level ?? 2;
    if (r.page) b.page = r.page;
    blocks.push(b);
  }
  const id = `d${index}-${hash(doc.title + '\uE000' + text).slice(0, 6)}`;
  return { id, title: doc.title.trim() || `Document ${index + 1}`, format: doc.format, text, blocks };
}

/** Finds the block containing an offset (binary search). */
export function blockAt(doc: ParsedDoc, offset: number): Block | undefined {
  let lo = 0;
  let hi = doc.blocks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = doc.blocks[mid];
    if (offset < b.start) hi = mid - 1;
    else if (offset >= b.end) lo = mid + 1;
    else return b;
  }
  return undefined;
}

/** A human-readable location: "Late work, p. 2". */
export function locationLabel(doc: ParsedDoc, offset: number): string {
  const b = blockAt(doc, offset);
  if (!b) return '';
  const parts: string[] = [];
  const path = b.kind === 'heading' ? [...b.section] : b.section;
  if (path.length) parts.push(path[path.length - 1]);
  if (b.page) parts.push(`p. ${b.page}`);
  return parts.join(', ');
}

/** Guesses a format from a file name. */
export function formatFromName(name: string): DocFormat | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown' || ext === 'mdx') return 'markdown';
  if (ext === 'txt' || ext === 'text') return 'text';
  return null;
}

/** A title from a file name: "late-policy_v2.md" -> "late policy v2". */
export function titleFromName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || name;
}
