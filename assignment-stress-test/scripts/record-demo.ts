/**
 * Records the bundled demo run with the local `claude` CLI (subscription, no
 * API key) and CPython + pytest for the autograder. The outputs are real model
 * replies, not written by hand.
 *
 *   npx vite-node scripts/record-demo.ts           record every sample
 *   npx vite-node scripts/record-demo.ts --retry   re-run only the attempts that errored
 *
 * Each attempt is its own CLI session (fresh --session-id, then --resume for
 * later turns), with a short chat system prompt and tools off, so the model
 * sees close to what a student's chat window would send. The CLI still adds a
 * one-line agent preamble and basic environment facts (date, platform).
 */
import { execFile, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChatModel, ChatOptions, ChatReply } from '../src/core/anthropic.js';
import { DEFAULT_JUDGE, MODEL_CHOICES } from '../src/core/anthropic.js';
import { HARNESS_PY, parseHarnessOutput, type HarnessPayload } from '../src/core/harness.js';
import { parseRubric } from '../src/core/rubric.js';
import { attempt, gradeCell, runStressTest } from '../src/core/runner.js';
import { SAMPLES } from '../src/core/samples.js';
import type { ChatTurn, Run } from '../src/core/types.js';

// A whitelisted environment and an empty working directory: inside a coding
// session the CLI otherwise passes its agent context (paths, tool guidance)
// to the model, and replies come back as tool calls instead of chat answers.
const KEEP = /^(HOME|PATH|https?_proxy|HTTPS?_PROXY|no_proxy|NO_PROXY|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|REQUESTS_CA_BUNDLE|ANTHROPIC_BASE_URL)$/;
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => KEEP.test(k)));
const cwd = mkdtempSync(join(tmpdir(), 'ast-chat-'));
// The CLI frames every session as an agent, so say outright that this is a
// chat with no tools; without it some replies come back as tool-call markup.
const CHAT_SYSTEM = 'You are a helpful assistant in a chat window. You have no tools, so answer in plain text.';

function cli(args: string[], input: string): Promise<{ result: string; stop: string; isError: boolean }> {
  return new Promise((resolve, reject) => {
    const child = execFile('claude', args, { env, cwd, maxBuffer: 1 << 26, timeout: 15 * 60_000 }, (err, stdout) => {
      if (err && !stdout) return reject(err);
      try {
        const d = JSON.parse(stdout) as { result?: string; stop_reason?: string; is_error?: boolean; structured_output?: unknown };
        const result = d.structured_output !== undefined ? JSON.stringify(d.structured_output) : (d.result ?? '');
        resolve({ result, stop: d.stop_reason ?? '', isError: !!d.is_error });
      } catch (e) {
        reject(e);
      }
    });
    child.stdin?.end(input);
  });
}

/** One CLI session per attempt; `chat` is called with the growing transcript. */
class CliModel implements ChatModel {
  private sessions = new Map<string, string>();
  constructor(readonly id: string) {}

  async chat(turns: ChatTurn[], opts: ChatOptions): Promise<ChatReply> {
    const first = turns[0].content;
    const last = turns[turns.length - 1].content;
    const key = first + '\u0000' + (opts.effort ?? '') + '\u0000' + (opts.system ?? '');
    const args = ['-p', '--model', this.id, '--tools', '', '--output-format', 'json', '--setting-sources', ''];
    args.push('--system-prompt', opts.system ?? CHAT_SYSTEM);
    if (opts.effort) args.push('--effort', opts.effort);
    if (opts.schema) args.push('--json-schema', JSON.stringify(opts.schema));
    if (turns.length === 1) {
      const sid = randomUUID();
      this.sessions.set(key, sid);
      args.push('--session-id', sid);
    } else {
      const sid = this.sessions.get(key);
      if (!sid) throw new Error('No session to resume');
      args.push('--resume', sid);
    }
    let r = await cli(args, last);
    let note = r.stop === 'max_tokens' ? 'cut off at max_tokens' : '';
    if (r.isError && opts.effort && /invalid effort/i.test(r.result)) {
      // Same fallback as ClaudeModel: run at the model's default effort and say so.
      args.splice(args.indexOf('--effort'), 2);
      const s = args.indexOf('--session-id');
      if (s >= 0) {
        // The failed call already claimed its session id.
        args[s + 1] = randomUUID();
        this.sessions.set(key, args[s + 1]);
      }
      r = await cli(args, last);
      note = `ran at default effort (${opts.effort} rejected)`;
    }
    if (r.isError) throw new Error(`CLI error: ${r.result.slice(0, 300)}`);
    return { text: r.result, refused: r.stop === 'refusal', note };
  }
}

async function cpythonAutograde(payload: HarnessPayload): Promise<ReturnType<typeof parseHarnessOutput>> {
  const dir = mkdtempSync(join(tmpdir(), 'ast-'));
  const script = join(dir, 'harness.py');
  writeFileSync(script, HARNESS_PY + '\nimport sys\nprint(run_suite(sys.stdin.read()))\n');
  const r = spawnSync('python3', ['-I', script], {
    input: JSON.stringify({ ...payload, root: join(dir, 'work') }),
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (r.error) return { status: 'timeout', results: [], log: String(r.error) };
  return parseHarnessOutput(r.stdout.trim().split('\n').pop() ?? '');
}

const FILE = new URL('../src/data/demo-runs.json', import.meta.url);

async function retry(): Promise<void> {
  const runs = JSON.parse(readFileSync(FILE, 'utf8')) as Run[];
  for (const run of runs) {
    const rows = parseRubric(run.assignment.rubricText).rows;
    const plan = { assignment: run.assignment, rows, judge: new CliModel(DEFAULT_JUDGE), autograde: cpythonAutograde };
    for (let i = 0; i < run.cells.length; i++) {
      const c = run.cells[i];
      if (c.status !== 'error') continue;
      run.cells[i] = await gradeCell(await attempt(new CliModel(c.model), c.style, run.assignment), plan);
      console.log(`  retried ${c.model} ${c.style}: ${run.cells[i].status} ${run.cells[i].error}`);
    }
  }
  writeFileSync(FILE, JSON.stringify(runs, null, 1) + '\n');
}

async function main(): Promise<void> {
  if (process.argv.includes('--retry')) return retry();
  const out: Run[] = [];
  for (const s of SAMPLES) {
    const a = s.assignment;
    const rows = parseRubric(a.rubricText).rows;
    console.log(`== ${a.title}`);
    const cells = await runStressTest({
      assignment: a,
      rows,
      models: MODEL_CHOICES.map((m) => new CliModel(m.id)),
      styles: ['lazy', 'student', 'careful'],
      judge: new CliModel(DEFAULT_JUDGE),
      autograde: cpythonAutograde,
      concurrency: 3,
      onProgress: (d, t, c) => console.log(`  ${d}/${t} ${c.model} ${c.style} ${c.status} ${c.error}`),
    });
    const date = new Date().toISOString();
    out.push({
      id: `demo-${s.id}`,
      createdAt: date,
      term: 'Autumn 2026',
      source: 'demo',
      judge: DEFAULT_JUDGE,
      assignment: a,
      cells,
      note:
        `Recorded ${date.slice(0, 10)} with the claude CLI rather than the API: system prompt "${CHAT_SYSTEM}" ` +
        '(the CLI adds a one-line agent preamble and the date), tools off, one fresh session per attempt. ' +
        'Tests ran under CPython and pytest. Real replies, scored once.',
    });
  }
  writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n');
  console.log(`wrote ${FILE.pathname} (${readFileSync(FILE).length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
