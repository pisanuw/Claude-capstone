/**
 * The pytest harness. The same Python source runs in Pyodide (in a Web
 * Worker, in the browser) and under CPython in the unit tests. It writes the
 * AI's solution, the starter files and the tests into a fresh directory,
 * forgets any module previously imported from an earlier attempt, runs pytest
 * with a collector plugin and returns JSON.
 */
import type { CodeSetup, TestResult, TestRun } from './types.js';

export const HARNESS_PY = String.raw`
import io, json, os, sys, contextlib, shutil

def run_suite(payload_json):
    import pytest
    payload = json.loads(payload_json)
    root = payload["root"]
    if os.path.isdir(root):
        shutil.rmtree(root)
    os.makedirs(root)
    for f in payload["files"]:
        path = os.path.join(root, f["name"])
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as fh:
            fh.write(f["content"])
    names = {os.path.splitext(os.path.basename(f["name"]))[0] for f in payload["files"]}
    for mod in list(sys.modules):
        if mod.split(".")[0] in names:
            del sys.modules[mod]

    class Collector:
        def __init__(self):
            self.results = []
            self.errors = []
        def pytest_runtest_logreport(self, report):
            name = report.nodeid.split("::")[-1]
            if report.when == "call" or (report.when == "setup" and report.outcome != "passed"):
                outcome = report.outcome
                if report.when == "setup" and outcome == "failed":
                    outcome = "error"
                msg = ""
                if report.failed:
                    msg = str(report.longrepr)[-1200:]
                elif report.skipped and isinstance(report.longrepr, tuple):
                    msg = str(report.longrepr[2])
                self.results.append({"name": name, "outcome": outcome, "message": msg})
        def pytest_collectreport(self, report):
            if report.failed:
                self.errors.append(str(report.longrepr)[-2000:])

    collector = Collector()
    out = io.StringIO()
    old_cwd = os.getcwd()
    sys.path.insert(0, root)
    try:
        os.chdir(root)
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            pytest.main([root, "-q", "-p", "no:cacheprovider", "--no-header", "-o", "console_output_style=classic"], plugins=[collector])
    finally:
        os.chdir(old_cwd)
        sys.path.remove(root)
    status = "collection-error" if collector.errors and not collector.results else "ok"
    log = out.getvalue()
    if collector.errors:
        log = "\n".join(collector.errors) + "\n" + log
    return json.dumps({"status": status, "results": collector.results, "log": log[-6000:]})
`;

export interface HarnessPayload {
  root: string;
  files: { name: string; content: string }[];
}

let rootCounter = 0;

/** Files for one attempt: starter files, then the solution (which wins on a name clash), then tests. */
export function buildPayload(setup: CodeSetup, code: string, root?: string): HarnessPayload {
  const files = new Map<string, string>();
  for (const f of setup.starter) files.set(f.name, f.content);
  files.set(setup.solutionFile, code);
  for (const t of setup.tests) files.set(t.name, t.content);
  return {
    root: root ?? `/tmp/ast_run_${++rootCounter}`,
    files: [...files].map(([name, content]) => ({ name, content })),
  };
}

const OUTCOMES = new Set(['passed', 'failed', 'skipped', 'error']);

/** Validate the harness JSON; anything malformed becomes a harness-error run. */
export function parseHarnessOutput(text: string): TestRun {
  try {
    const raw = JSON.parse(text) as { status?: unknown; results?: unknown; log?: unknown };
    const status = raw.status === 'ok' || raw.status === 'collection-error' ? raw.status : null;
    if (!status || !Array.isArray(raw.results)) throw new Error('bad shape');
    const results: TestResult[] = raw.results.map((r: { name?: unknown; outcome?: unknown; message?: unknown }) => ({
      name: String(r.name ?? ''),
      outcome: OUTCOMES.has(String(r.outcome)) ? (r.outcome as TestResult['outcome']) : 'error',
      message: String(r.message ?? ''),
    }));
    return { status, results, log: String(raw.log ?? '') };
  } catch {
    return { status: 'harness-error', results: [], log: text.slice(0, 2000) };
  }
}

export function testSummary(run: TestRun | null): string {
  if (!run) return 'not run';
  if (run.status !== 'ok') return run.status.replace('-', ' ');
  const passed = run.results.filter((r) => r.outcome === 'passed').length;
  return `${passed}/${run.results.length} passed`;
}
