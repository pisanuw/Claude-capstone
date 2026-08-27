import type { Finding, Gene } from './types';

/**
 * Genome lint: deterministic health checks on the assembled prompt.
 * Each rule has a stable id, so the UI (and tests) can rely on them.
 */

const VAGUE_WORDS = /\b(etc\.?|some stuff|various|stuff|things like|a few|nice|good enough|properly|appropriately|as needed|and so on|somehow)\b/i;
const SUBJECTIVE_WORDS = /\b(engaging|compelling|high[- ]quality|world[- ]class|amazing|awesome|great|beautiful|perfect)\b/i;
const FILLER = /\b(please|kindly|thank you|if you don't mind|i would appreciate)\b/i;
const BRIEF = /\b(brief|concise|short|succinct|terse)\b/i;
const DETAILED = /\b(detailed|comprehensive|thorough|in-depth|exhaustive|extensive)\b/i;
const NEGATIVE_OPEN = /^(do not|don't|never|avoid|refrain from)\b/i;

function words(text: string): number {
  return text.split(/\s+/).filter((w) => w !== '').length;
}

export function lintGenome(genes: Gene[]): Finding[] {
  const findings: Finding[] = [];
  const byType = (t: string) => genes.filter((g) => g.type === t);

  if (genes.length === 0) return findings;

  const tasks = byType('task');
  if (tasks.length === 0) {
    findings.push({
      severity: 'issue',
      rule: 'no-task',
      message: 'No task gene detected: the prompt never says what to produce.',
      geneIds: [],
    });
  } else if (tasks.length > 2) {
    findings.push({
      severity: 'warning',
      rule: 'many-tasks',
      message: `${tasks.length} separate task genes compete for attention; consider merging them or splitting the prompt.`,
      geneIds: tasks.map((g) => g.id),
    });
  }

  if (byType('format').length === 0) {
    findings.push({
      severity: 'note',
      rule: 'no-format',
      message: 'No format gene: the output shape is left to chance.',
      geneIds: [],
    });
  }

  if (byType('example').length === 0) {
    findings.push({
      severity: 'note',
      rule: 'no-example',
      message: 'No example gene: one worked input/output pair is often worth a paragraph of rules.',
      geneIds: [],
    });
  }

  for (const g of genes) {
    const vague = g.text.match(VAGUE_WORDS);
    if (vague) {
      findings.push({
        severity: 'warning',
        rule: 'vague-language',
        message: `Vague wording ("${vague[0]}") leaves the model to decide what you meant.`,
        geneIds: [g.id],
      });
    }
    const subjective = g.text.match(SUBJECTIVE_WORDS);
    if (subjective) {
      findings.push({
        severity: 'warning',
        rule: 'subjective-quality',
        message: `Subjective quality word ("${subjective[0]}"): state a measurable target instead.`,
        geneIds: [g.id],
      });
    }
    const filler = g.text.match(FILLER);
    if (filler) {
      findings.push({
        severity: 'note',
        rule: 'politeness-filler',
        message: `Filler ("${filler[0]}") spends tokens without adding signal.`,
        geneIds: [g.id],
      });
    }
    if (words(g.text) > 150) {
      findings.push({
        severity: 'warning',
        rule: 'gene-too-long',
        message: `This gene runs ${words(g.text)} words; split it so each gene makes one point.`,
        geneIds: [g.id],
      });
    }
  }

  const wantsBrief = genes.filter((g) => BRIEF.test(g.text));
  const wantsDetail = genes.filter((g) => DETAILED.test(g.text));
  if (wantsBrief.length > 0 && wantsDetail.length > 0) {
    findings.push({
      severity: 'warning',
      rule: 'length-conflict',
      message: 'The genome asks for both brevity and depth; pick one or scope each to a section.',
      geneIds: [...wantsBrief, ...wantsDetail].map((g) => g.id),
    });
  }

  const constraints = byType('constraint');
  const negative = constraints.filter((g) => NEGATIVE_OPEN.test(g.text.trim()));
  if (negative.length >= 2 && negative.length === constraints.length) {
    findings.push({
      severity: 'note',
      rule: 'only-negative-constraints',
      message: 'Every constraint says what to avoid; adding what to do instead usually steers better.',
      geneIds: negative.map((g) => g.id),
    });
  }

  const seen = new Map<string, Gene>();
  for (const g of genes) {
    const key = g.text.trim().toLowerCase();
    const prior = seen.get(key);
    if (prior) {
      findings.push({
        severity: 'warning',
        rule: 'duplicate-gene',
        message: 'Two genes carry identical text; the repeat adds tokens, not emphasis.',
        geneIds: [prior.id, g.id],
      });
    } else {
      seen.set(key, g);
    }
  }

  const total = genes.reduce((n, g) => n + words(g.text), 0);
  if (total > 600) {
    findings.push({
      severity: 'note',
      rule: 'genome-long',
      message: `The whole genome is ${total} words; long prompts dilute every individual instruction.`,
      geneIds: [],
    });
  }

  return findings;
}

/** 0-100; a rough single number for the dashboard. */
export function healthScore(findings: Finding[]): number {
  let score = 100;
  for (const f of findings) {
    if (f.severity === 'issue') score -= 25;
    else if (f.severity === 'warning') score -= 10;
    else score -= 3;
  }
  return Math.max(0, score);
}
