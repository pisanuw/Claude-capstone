import { scanArgSecrets, scanSecrets } from './envscan.js';
import { asStringArray, asStringRecord, isRecord } from './jsonc.js';
import { classifyPath, looksLikePath, type PathScope } from './paths.js';
import type { Capability, Finding } from './types.js';

/** A normalized MCP server entry, whichever client's config it came from. */
export interface McpServer {
  name: string;
  command?: string;
  args: string[];
  env: Record<string, string>;
  url?: string;
  headers: Record<string, string>;
  disabled: boolean;
  autoApprove: string[];
}

export interface McpAnalysis {
  summary: string;
  capabilities: Capability[];
  findings: Finding[];
}

/**
 * Pull every MCP server out of a parsed config. Handles:
 * - `mcpServers` (Claude Desktop, Cursor, Windsurf, Cline, Claude Code `.mcp.json`)
 * - `servers` (VS Code `.vscode/mcp.json`)
 * - `mcp.servers` (VS Code user `settings.json`)
 * - `projects.<path>.mcpServers` (Claude Code `~/.claude.json`)
 */
export function extractMcpServers(doc: unknown): McpServer[] {
  if (!isRecord(doc)) return [];
  const blocks: Array<[string, unknown]> = [];
  if (isRecord(doc.mcpServers)) blocks.push(['', doc.mcpServers]);
  if (isRecord(doc.servers)) blocks.push(['', doc.servers]);
  if (isRecord(doc.mcp) && isRecord(doc.mcp.servers)) blocks.push(['', doc.mcp.servers]);
  if (isRecord(doc.projects)) {
    for (const [proj, cfg] of Object.entries(doc.projects)) {
      if (isRecord(cfg) && isRecord(cfg.mcpServers) && Object.keys(cfg.mcpServers).length > 0) {
        blocks.push([`${shortProject(proj)}: `, cfg.mcpServers]);
      }
    }
  }
  const out: McpServer[] = [];
  for (const [prefix, block] of blocks) {
    for (const [name, raw] of Object.entries(block as Record<string, unknown>)) {
      if (!isRecord(raw)) continue;
      const url = typeof raw.url === 'string' ? raw.url : typeof raw.serverUrl === 'string' ? raw.serverUrl : undefined;
      const server: McpServer = {
        name: prefix + name,
        args: asStringArray(raw.args),
        env: asStringRecord(raw.env),
        headers: asStringRecord(raw.headers),
        disabled: raw.disabled === true || raw.enabled === false,
        autoApprove: [...asStringArray(raw.autoApprove), ...asStringArray(raw.alwaysAllow)],
      };
      if (typeof raw.command === 'string') server.command = raw.command;
      if (url !== undefined) server.url = url;
      out.push(server);
    }
  }
  return out;
}

function shortProject(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

const FS_WEIGHT: Record<PathScope, number> = { root: 100, home: 90, sensitive: 92, scoped: 50 };
const FS_WHERE: Record<PathScope, string> = {
  root: 'the entire disk',
  home: 'your whole home directory (ssh keys, cloud credentials, browser profiles, every project)',
  sensitive: 'a directory that holds credentials or system configuration',
  scoped: 'this directory and everything under it',
};

interface KnownServer {
  id: string;
  match: RegExp;
  caps: (s: McpServer, pathArgs: string[]) => Capability[];
}

/** Capabilities of well-known servers, matched on the launch command line. */
const KNOWN: KnownServer[] = [
  {
    id: 'desktop-commander',
    match: /desktop-commander|mcp-server-commands|server-shell|mcp-shell|shell-mcp|iterm-mcp|terminal-mcp|mcp-server-shell|code-runner|computer-use/i,
    caps: () => [
      cap('shell', 95, 'Runs arbitrary shell commands', 'This server exists to execute commands. A prompt injection in any document or web page the agent reads can become a command on your machine.', 'command execution server'),
      cap('filesystem', 90, 'Reads and writes any file your account can', 'With a shell, every file your user account can reach is in scope.', 'implied by shell access'),
    ],
  },
  {
    id: 'filesystem',
    match: /server-filesystem|mcp-server-filesystem|filesystem-mcp|mcp-filesystem/i,
    caps: (_s, paths) => {
      if (paths.length === 0) {
        return [cap('filesystem', 50, 'Reads and writes files in client-granted roots', 'No directories are listed on the command line, so the scope depends on the roots your client grants at runtime.', 'no path arguments')];
      }
      return paths.map((p) => {
        const scope = classifyPath(p);
        return cap('filesystem', FS_WEIGHT[scope], `Reads and writes ${scope === 'scoped' ? p : FS_WHERE[scope]}`, `Can read, create, overwrite, and move files in ${FS_WHERE[scope]}.`, p);
      });
    },
  },
  {
    id: 'git',
    match: /server-git\b|mcp-server-git\b|git-mcp/i,
    caps: (_s, paths) => [
      cap('filesystem', 45, `Commits, resets, and checks out in ${paths[0] ?? 'a repository'}`, 'Can rewrite the working tree and history of the repository it points at.', paths[0] ?? 'git server'),
    ],
  },
  {
    id: 'github',
    match: /server-github|github-mcp-server|mcp-github|github\/github-mcp|githubcopilot\.com\/mcp/i,
    caps: () => [
      cap('credentials', 60, 'Acts on your GitHub account', 'Can read private repositories, push code, and open or merge pull requests, as far as its token allows.', 'GitHub server'),
      cap('network', 30, 'Talks to api.github.com', 'Sends repository data to GitHub on your behalf.', 'GitHub server'),
    ],
  },
  {
    id: 'gitlab',
    match: /server-gitlab|gitlab-mcp/i,
    caps: () => [cap('credentials', 60, 'Acts on your GitLab account', 'Can read and push to projects its token can reach.', 'GitLab server')],
  },
  {
    id: 'fetch',
    match: /server-fetch|mcp-server-fetch|fetch-mcp|mcp-fetch/i,
    caps: () => [
      cap('network', 70, 'Fetches any URL', 'Can request any address, including internal services on your network, and can carry data out inside a URL.', 'fetch server'),
    ],
  },
  {
    id: 'browser',
    match: /puppeteer|playwright|browser-?use|browserbase|chrome-devtools|mcp-browser|browsermcp|selenium/i,
    caps: (s) => {
      const attached = s.args.some((a) => /user-data-dir|cdp-endpoint|--extension|profile/i.test(a)) || /browsermcp|chrome-devtools/i.test(s.args.join(' '));
      return [
        cap('browser', attached ? 90 : 60, attached ? 'Drives your real browser profile' : 'Drives a browser', attached ? 'Attached to a browser with your logins: it can act as you on every site you are signed in to.' : 'Can open any page, fill forms, and read what it sees.', attached ? 'profile/CDP flag' : 'browser automation'),
        cap('network', 65, 'Visits any site', 'A headless browser can reach any URL, including internal ones.', 'browser automation'),
      ];
    },
  },
  {
    id: 'database',
    match: /postgres|mysql|mariadb|sqlite|mongo|redis|supabase|neon|clickhouse|snowflake|bigquery|duckdb/i,
    caps: () => [cap('credentials', 50, 'Queries a database', 'Can read, and unless the connection is read-only, change or drop the data it connects to.', 'database server')],
  },
  {
    id: 'saas',
    match: /slack|gmail|google-drive|gdrive|notion|linear|jira|atlassian|confluence|outlook|microsoft-365|todoist|asana|hubspot|salesforce|stripe/i,
    caps: (s) => [cap('credentials', 65, 'Acts on a workspace account', 'Can read and send messages or documents in the connected account; private data can leave through any other tool the agent has.', matchName(s))],
  },
  {
    id: 'cloud',
    match: /\baws\b|aws-|gcp|gcloud|azure|cloudflare|kubernetes|k8s|kubectl|terraform|pulumi|vercel|netlify|render|heroku|fly\.io/i,
    caps: (s) => {
      const out = [cap('credentials', 85, 'Controls cloud infrastructure', 'Can create, change, or delete cloud resources and read their secrets, with whatever role its credentials carry.', matchName(s))];
      if (/kubernetes|k8s|kubectl/i.test(cmdline(s))) out.push(cap('shell', 60, 'Can exec into containers', 'Kubernetes access usually includes exec into running pods.', 'kubernetes server'));
      return out;
    },
  },
  {
    id: 'memory',
    match: /server-memory|mcp-memory|knowledge-graph/i,
    caps: () => [cap('filesystem', 15, 'Writes a local memory file', 'Stores notes the agent chooses to remember in a local file.', 'memory server')],
  },
];

const LOW_RISK = /sequential-?thinking|server-time|mcp-server-time|server-everything|calculator/i;

const SHELLS = /^(bash|sh|zsh|fish|dash|cmd(\.exe)?|powershell(\.exe)?|pwsh(\.exe)?)$/i;

function cap(dimension: Capability['dimension'], weight: number, label: string, explain: string, evidence: string): Capability {
  return { dimension, weight, label, explain, evidence };
}

function cmdline(s: McpServer): string {
  return [s.command ?? '', ...s.args].join(' ');
}

function matchName(s: McpServer): string {
  const pkg = s.args.find((a) => !a.startsWith('-') && /[a-z]/i.test(a) && !looksLikePath(a));
  return pkg ?? s.command ?? s.name;
}

function basename(cmd: string): string {
  return cmd.split(/[\\/]/).pop() ?? cmd;
}

/** Analyze one MCP server entry. */
export function analyzeMcpServer(s: McpServer): McpAnalysis {
  const capabilities: Capability[] = [];
  const findings: Finding[] = [];

  if (s.url !== undefined && s.command === undefined) {
    return analyzeRemote(s);
  }

  const command = s.command ?? '';
  const bin = basename(command).toLowerCase();
  let args = s.args;
  let launcher = '';

  // Docker: the container is the sandbox, so mounts and flags decide the reach.
  if (bin === 'docker' || bin === 'podman') {
    const d = analyzeDocker(s);
    capabilities.push(...d.capabilities);
    findings.push(...d.findings);
    launcher = 'container';
  } else if (/^(npx|bunx|pnpx)$/.test(bin) || (/^(pnpm|yarn)$/.test(bin) && /^dlx$/.test(args[0] ?? ''))) {
    launcher = 'npm';
    const pkg = args.find((a) => !a.startsWith('-') && a !== 'dlx');
    if (pkg && !/@[\d^~]/.test(pkg.replace(/^@[^/]+\//, ''))) {
      findings.push({
        severity: 'medium',
        message: `Unpinned package: ${bin} fetches the latest "${pkg}" on launch, so a compromised release would run as you with no change to this file.`,
        evidence: pkg,
      });
    }
  } else if (bin === 'uvx' || (bin === 'uv' && args.includes('run'))) {
    launcher = 'python';
    const pkg = args.find((a) => !a.startsWith('-') && a !== 'run' && a !== 'tool');
    if (pkg && !/[=@]=?\d/.test(pkg)) {
      findings.push({ severity: 'medium', message: `Unpinned package: ${bin} resolves the latest "${pkg}" on launch.`, evidence: pkg });
    }
  } else if (SHELLS.test(bin)) {
    const inline = args.find((_a, i) => i > 0 && /^(-c|\/c|-Command)$/i.test(args[i - 1] ?? ''));
    capabilities.push(cap('shell', 90, 'Launched through a shell', 'The server is started by an inline shell script, which can do anything your account can.', inline ?? command));
    args = inline ? inline.split(/\s+/) : args;
  }

  const full = [command, ...args].join(' ');
  const pathArgs = args.filter((a) => looksLikePath(a) && !/\.(m?js|cjs|ts|py|jar)$/i.test(a));
  let known = false;
  for (const k of KNOWN) {
    if (k.match.test(full)) {
      capabilities.push(...k.caps({ ...s, args }, pathArgs));
      known = true;
      break;
    }
  }

  if (!known && launcher !== 'container' && !LOW_RISK.test(full) && !capabilities.some((c) => c.dimension === 'shell')) {
    capabilities.push(
      cap('shell', 50, 'Unrecognized local program', 'This is not a server the scanner knows, so its declared tools cannot be checked. It runs as a normal process under your account: whatever its code does, it can do.', basename(matchName(s))),
    );
    for (const p of pathArgs) {
      const scope = classifyPath(p);
      capabilities.push(cap('filesystem', Math.round(FS_WEIGHT[scope] * 0.7), `Given the path ${p}`, `A path argument usually means the server reads or writes ${FS_WHERE[scope]}.`, p));
    }
  }

  if (launcher === 'container' && capabilities.length === 0) {
    capabilities.push(cap('network', 20, 'Sandboxed container', 'Runs in a container with no host mounts: it can still reach the network by default.', dockerImage(s.args) ?? 'docker run'));
  }

  if (launcher !== 'container' && command !== '') {
    findings.push({
      severity: 'info',
      message: 'Runs as a local process under your account. Any scope it declares is enforced by its own code, not by an OS sandbox.',
    });
  }

  const env = scanSecrets(s.env, 'env');
  const argSecrets = scanArgSecrets(s.args);
  capabilities.push(...env.capabilities, ...argSecrets.capabilities);
  findings.push(...env.findings, ...argSecrets.findings);
  findings.push(...autoApproveFindings(s));

  return { summary: [command, ...s.args].join(' ').trim() || '(no command)', capabilities, findings };
}

function analyzeRemote(s: McpServer): McpAnalysis {
  const capabilities: Capability[] = [];
  const findings: Finding[] = [];
  const url = s.url as string;
  let host = url;
  let insecure = false;
  try {
    const u = new URL(url);
    host = u.host;
    insecure = u.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(u.host);
  } catch {
    findings.push({ severity: 'low', message: 'Server URL does not parse.', evidence: url });
  }
  capabilities.push(cap('network', 35, `Remote server at ${host}`, 'Every tool call, and whatever context the agent attaches to it, is sent to this host. Its operator sees it all.', url));
  if (insecure) {
    findings.push({ severity: 'high', message: 'Remote server over plain HTTP: tool calls and any auth headers travel unencrypted.', evidence: url });
  }
  const known = KNOWN.find((k) => k.match.test(url));
  if (known && known.id !== 'fetch' && known.id !== 'browser') capabilities.push(...known.caps(s, []));
  const headers = scanSecrets(s.headers, 'header');
  capabilities.push(...headers.capabilities);
  findings.push(...headers.findings);
  if (Object.keys(s.headers).length === 0 && !known) {
    capabilities.push(cap('credentials', 30, 'May act on an OAuth-linked account', 'Remote servers without a static header usually sign in with OAuth, so the server can act on whatever account you authorized.', url));
  }
  findings.push(...autoApproveFindings(s));
  return { summary: url, capabilities, findings };
}

function analyzeDocker(s: McpServer): { capabilities: Capability[]; findings: Finding[] } {
  const capabilities: Capability[] = [];
  const findings: Finding[] = [];
  const a = s.args;
  for (let i = 0; i < a.length; i++) {
    const arg = a[i] as string;
    let spec: string | undefined;
    if (arg === '-v' || arg === '--volume') spec = a[i + 1];
    else if (arg.startsWith('--volume=')) spec = arg.slice(9);
    else if (arg === '--mount') spec = mountSource(a[i + 1] ?? '');
    else if (arg.startsWith('--mount=')) spec = mountSource(arg.slice(8));
    if (spec) {
      const host = splitVolume(spec);
      if (/docker\.sock/.test(host)) {
        capabilities.push(cap('shell', 100, 'Controls the Docker daemon', 'The Docker socket is mounted: the container can start a privileged container that mounts your whole disk. This is root on the host.', spec));
      } else if (host !== '' && looksLikePath(host)) {
        const scope = classifyPath(host);
        const ro = /:ro(,|$)/.test(spec) || /readonly|ro=true/.test(a[i + 1] ?? '');
        capabilities.push(cap('filesystem', ro ? Math.round(FS_WEIGHT[scope] * 0.6) : FS_WEIGHT[scope], `${ro ? 'Reads' : 'Reads and writes'} ${scope === 'scoped' ? host : FS_WHERE[scope]}`, `Host directory mounted into the container${ro ? ' read-only' : ''}.`, spec));
      }
    }
    if (arg === '--privileged') {
      capabilities.push(cap('shell', 100, 'Privileged container', '--privileged removes the container boundary: it has full access to host devices.', arg));
    }
    if (arg === '--network=host' || (arg === '--network' && a[i + 1] === 'host') || arg === '--net=host') {
      capabilities.push(cap('network', 50, 'Host networking', 'Shares the host network stack: it can reach services bound to localhost.', 'network host'));
    }
    if (arg === '--pid=host' || arg === '--cap-add') {
      capabilities.push(cap('shell', 70, 'Extra kernel privileges', 'Host PID namespace or added capabilities weaken the container sandbox.', `${arg} ${arg === '--cap-add' ? (a[i + 1] ?? '') : ''}`.trim()));
    }
  }
  const image = dockerImage(a);
  if (image && (!/:[^/]+$/.test(image) || /:latest$/.test(image)) && !/@sha256:/.test(image)) {
    findings.push({ severity: 'low', message: `Image "${image}" is not pinned to a version or digest; a new push changes what runs.`, evidence: image });
  }
  return { capabilities, findings };
}

function mountSource(spec: string): string | undefined {
  const m = /(?:^|,)(?:source|src)=([^,]+)/.exec(spec);
  return m ? `${m[1]}${/readonly|ro=true/.test(spec) ? ':ro' : ''}` : undefined;
}

/** Host side of `host:container[:opts]`, careful with Windows drive letters. */
function splitVolume(spec: string): string {
  const win = /^([A-Z]:[\\/][^:]*)/i.exec(spec);
  if (win) return win[1] as string;
  return spec.split(':')[0] ?? '';
}

function dockerImage(a: string[]): string | undefined {
  const takesValue = new Set(['-v', '--volume', '--mount', '-e', '--env', '--name', '--network', '--net', '-p', '--publish', '-w', '--workdir', '-u', '--user', '--cap-add', '--entrypoint', '--env-file', '-l', '--label']);
  const start = a.indexOf('run');
  if (start === -1) return undefined;
  for (let i = start + 1; i < a.length; i++) {
    const arg = a[i] as string;
    if (takesValue.has(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith('-')) continue;
    return arg;
  }
  return undefined;
}

const DANGEROUS_TOOL = /write|edit|delete|remove|exec|run|shell|command|push|merge|send|create|move|kill|drop|deploy/i;

function autoApproveFindings(s: McpServer): Finding[] {
  if (s.autoApprove.length === 0) return [];
  const risky = s.autoApprove.filter((t) => DANGEROUS_TOOL.test(t) || t === '*');
  return [
    {
      severity: risky.length > 0 ? 'high' : 'low',
      message: `${s.autoApprove.length} tool${s.autoApprove.length === 1 ? '' : 's'} auto-approved: the agent calls ${s.autoApprove.length === 1 ? 'it' : 'them'} without asking you${risky.length > 0 ? `, including ${risky.slice(0, 3).join(', ')}` : ''}.`,
      evidence: s.autoApprove.join(', '),
    },
  ];
}
