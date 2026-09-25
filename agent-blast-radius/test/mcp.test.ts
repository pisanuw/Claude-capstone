import { describe, expect, it } from 'vitest';
import { analyzeMcpServer, extractMcpServers, type McpServer } from '../src/core/mcp.js';

const server = (over: Partial<McpServer>): McpServer => ({ name: 's', args: [], env: {}, headers: {}, disabled: false, autoApprove: [], ...over });
const dims = (s: McpServer) => analyzeMcpServer(s).capabilities.map((c) => c.dimension);
const top = (s: McpServer, d: string) => Math.max(0, ...analyzeMcpServer(s).capabilities.filter((c) => c.dimension === d).map((c) => c.weight));
const messages = (s: McpServer) => analyzeMcpServer(s).findings.map((f) => `${f.severity}: ${f.message}`);

describe('extractMcpServers', () => {
  it('reads mcpServers, servers, mcp.servers, and Claude Code projects', () => {
    const doc = {
      mcpServers: { a: { command: 'npx', args: ['x'], env: { K: 'v' } } },
      servers: { b: { type: 'http', url: 'https://b.example/mcp', headers: { Authorization: 'Bearer ${input:t}' } } },
      mcp: { servers: { c: { serverUrl: 'https://c.example/sse' } } },
      projects: { '/Users/a/code/app': { mcpServers: { d: { command: 'node', args: ['s.js'], disabled: true } } }, '/other': { mcpServers: {} } },
    };
    const out = extractMcpServers(doc);
    expect(out.map((s) => s.name)).toEqual(['a', 'b', 'c', 'app: d']);
    expect(out[1]?.url).toBe('https://b.example/mcp');
    expect(out[2]?.url).toBe('https://c.example/sse');
    expect(out[3]?.disabled).toBe(true);
  });

  it('merges autoApprove and alwaysAllow, honors enabled:false, skips junk', () => {
    const out = extractMcpServers({ mcpServers: { a: { command: 'x', autoApprove: ['r'], alwaysAllow: ['w'], enabled: false }, bad: 'nope' } });
    expect(out).toHaveLength(1);
    expect(out[0]?.autoApprove).toEqual(['r', 'w']);
    expect(out[0]?.disabled).toBe(true);
  });

  it('returns nothing for non-objects', () => {
    expect(extractMcpServers([])).toEqual([]);
    expect(extractMcpServers({ other: 1 })).toEqual([]);
  });
});

describe('filesystem server', () => {
  const fs = (...paths: string[]) => server({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', ...paths] });

  it('scores the root and home far above a project folder', () => {
    expect(top(fs('/'), 'filesystem')).toBe(100);
    expect(top(fs('/Users/alex'), 'filesystem')).toBe(90);
    expect(top(fs('~/.ssh'), 'filesystem')).toBe(92);
    expect(top(fs('/Users/alex/code/app'), 'filesystem')).toBe(50);
  });

  it('reports each path separately and falls back to client roots', () => {
    expect(analyzeMcpServer(fs('/a/one', '/a/two')).capabilities.filter((c) => c.dimension === 'filesystem')).toHaveLength(2);
    expect(analyzeMcpServer(fs()).capabilities[0]?.label).toMatch(/client-granted roots/);
  });

  it('flags an unpinned npx package but not a pinned one', () => {
    expect(messages(fs('/x')).some((m) => m.startsWith('medium: Unpinned'))).toBe(true);
    const pinned = server({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem@2025.3.28', '/x'] });
    expect(messages(pinned).some((m) => m.includes('Unpinned'))).toBe(false);
    const dlx = server({ command: 'pnpm', args: ['dlx', 'mcp-thing'] });
    expect(messages(dlx).some((m) => m.includes('"mcp-thing"'))).toBe(true);
  });
});

describe('known servers', () => {
  it('treats command servers as shell plus filesystem', () => {
    const s = server({ command: 'npx', args: ['-y', '@wonderwhy-er/desktop-commander@1.0.0'] });
    expect(top(s, 'shell')).toBe(95);
    expect(dims(s)).toContain('filesystem');
  });

  it('maps git, github, gitlab, fetch, database, saas, cloud, and memory servers', () => {
    expect(analyzeMcpServer(server({ command: 'uvx', args: ['mcp-server-git', '--repository', '/r'] })).capabilities[0]?.label).toMatch(/\/r/);
    expect(analyzeMcpServer(server({ command: 'uvx', args: ['mcp-server-git'] })).capabilities[0]?.label).toMatch(/a repository/);
    expect(top(server({ command: 'npx', args: ['@modelcontextprotocol/server-github'] }), 'credentials')).toBe(60);
    expect(top(server({ command: 'npx', args: ['@zereight/gitlab-mcp'] }), 'credentials')).toBe(60);
    expect(top(server({ command: 'uvx', args: ['mcp-server-fetch'] }), 'network')).toBe(70);
    expect(top(server({ command: 'npx', args: ['@modelcontextprotocol/server-sqlite'] }), 'credentials')).toBe(50);
    expect(top(server({ command: 'npx', args: ['slack-mcp-server'] }), 'credentials')).toBe(65);
    expect(top(server({ command: 'npx', args: ['@cloudflare/mcp-server-cloudflare'] }), 'credentials')).toBe(85);
    expect(top(server({ command: 'npx', args: ['mcp-server-kubernetes'] }), 'shell')).toBe(60);
    expect(top(server({ command: 'npx', args: ['@modelcontextprotocol/server-memory'] }), 'filesystem')).toBe(15);
  });

  it('distinguishes a fresh browser from one attached to your profile', () => {
    expect(top(server({ command: 'npx', args: ['@playwright/mcp@0.0.30'] }), 'browser')).toBe(60);
    expect(top(server({ command: 'npx', args: ['@playwright/mcp@0.0.30', '--user-data-dir', '/p'] }), 'browser')).toBe(90);
    expect(top(server({ command: 'npx', args: ['chrome-devtools-mcp@latest'] }), 'browser')).toBe(90);
  });

  it('gives low-risk utility servers no capabilities', () => {
    expect(analyzeMcpServer(server({ command: 'uvx', args: ['mcp-server-time==1.0'] })).capabilities).toEqual([]);
    expect(messages(server({ command: 'uv', args: ['tool', 'run', 'mcp-server-time'] })).some((m) => m.includes('Unpinned'))).toBe(true);
  });

  it('scores an unrecognized local program as running with your privileges', () => {
    const s = server({ command: 'node', args: ['/Users/a/tools/my-server.js', '/Users/a/data'] });
    const a = analyzeMcpServer(s);
    expect(a.capabilities[0]?.label).toBe('Unrecognized local program');
    expect(a.capabilities.find((c) => c.dimension === 'filesystem')?.evidence).toBe('/Users/a/data');
    expect(a.summary).toBe('node /Users/a/tools/my-server.js /Users/a/data');
  });

  it('handles an entry with no command or url', () => {
    expect(analyzeMcpServer(server({})).summary).toBe('(no command)');
  });
});

describe('shell launchers', () => {
  it('scores bash -c as shell and scans the inline script', () => {
    const s = server({ command: '/bin/bash', args: ['-c', 'npx -y @modelcontextprotocol/server-filesystem /'] });
    expect(top(s, 'shell')).toBe(90);
    expect(top(s, 'filesystem')).toBe(100);
  });

  it('handles a shell with no inline script', () => {
    expect(top(server({ command: 'sh', args: ['start.sh'] }), 'shell')).toBe(90);
  });
});

describe('docker', () => {
  const d = (...args: string[]) => server({ command: 'docker', args: ['run', '-i', '--rm', ...args] });

  it('scores host mounts, read-only mounts, and the docker socket', () => {
    expect(top(d('-v', '/Users/alex:/data', 'img:1'), 'filesystem')).toBe(90);
    expect(top(d('-v', '/Users/alex/proj:/data:ro', 'img:1'), 'filesystem')).toBe(30);
    expect(top(d('--volume=/:/host', 'img:1'), 'filesystem')).toBe(100);
    expect(top(d('--mount', 'type=bind,src=/etc,dst=/e,readonly', 'img:1'), 'filesystem')).toBe(55);
    expect(top(d('--mount=type=bind,source=C:\\Users\\a,target=/a', 'img:1'), 'filesystem')).toBe(90);
    expect(top(d('-v', '/var/run/docker.sock:/var/run/docker.sock', 'img:1'), 'shell')).toBe(100);
    expect(top(d('-v', 'named-volume:/data', 'img:1'), 'filesystem')).toBe(0);
  });

  it('scores privileged, host network, and extra capabilities', () => {
    expect(top(d('--privileged', 'img:1'), 'shell')).toBe(100);
    expect(top(d('--network', 'host', 'img:1'), 'network')).toBe(50);
    expect(top(d('--net=host', 'img:1'), 'network')).toBe(50);
    expect(analyzeMcpServer(d('--cap-add', 'SYS_ADMIN', 'img:1')).capabilities[0]?.evidence).toBe('--cap-add SYS_ADMIN');
    expect(top(d('--pid=host', 'img:1'), 'shell')).toBe(70);
  });

  it('marks a mount-free container as sandboxed and flags unpinned images', () => {
    const a = analyzeMcpServer(d('-e', 'X', 'mcp/unknown'));
    expect(a.capabilities[0]?.label).toBe('Sandboxed container');
    expect(a.capabilities[0]?.evidence).toBe('mcp/unknown');
    expect(a.findings.some((f) => f.message.includes('not pinned'))).toBe(true);
    expect(analyzeMcpServer(d('mcp/x:latest')).findings.some((f) => f.message.includes('not pinned'))).toBe(true);
    expect(analyzeMcpServer(d('mcp/x@sha256:abc')).findings.some((f) => f.message.includes('not pinned'))).toBe(false);
    expect(analyzeMcpServer(d('mcp/x:1.2')).findings.some((f) => f.message.includes('not pinned'))).toBe(false);
    expect(analyzeMcpServer(server({ command: 'docker', args: ['compose', 'up'] })).capabilities[0]?.evidence).toBe('docker run');
  });

  it('keeps known-server capabilities without adding a sandbox label', () => {
    const a = analyzeMcpServer(d('ghcr.io/github/github-mcp-server'));
    expect(a.capabilities.map((c) => c.label)).not.toContain('Sandboxed container');
    expect(a.findings.some((f) => f.severity === 'info')).toBe(false);
  });
});

describe('remote servers', () => {
  it('flags plain HTTP but not localhost', () => {
    expect(messages(server({ url: 'http://mcp.example.com/sse' })).some((m) => m.startsWith('high: Remote server over plain HTTP'))).toBe(true);
    expect(messages(server({ url: 'http://localhost:3000/mcp' })).some((m) => m.includes('plain HTTP'))).toBe(false);
  });

  it('assumes OAuth when no header is set, and scans header secrets', () => {
    expect(analyzeMcpServer(server({ url: 'https://x.example/mcp' })).capabilities.map((c) => c.label)).toContain('May act on an OAuth-linked account');
    const a = analyzeMcpServer(server({ url: 'https://x.example/mcp', headers: { Authorization: 'Bearer abcdefghijklmnop' } }));
    expect(a.capabilities.map((c) => c.dimension)).toContain('credentials');
    expect(a.findings.some((f) => f.message.startsWith('Plaintext secret in config (header.Authorization)'))).toBe(true);
  });

  it('applies known-server capabilities to hosted servers', () => {
    expect(top(server({ url: 'https://api.githubcopilot.com/mcp/github' }), 'credentials')).toBe(60);
    expect(top(server({ url: 'https://mcp.example/fetch' }), 'network')).toBe(35);
  });

  it('survives an unparseable URL', () => {
    expect(messages(server({ url: 'not a url' }))).toContain('low: Server URL does not parse.');
  });
});

describe('secrets and auto-approve', () => {
  it('records env credentials and plaintext values', () => {
    const a = analyzeMcpServer(server({ command: 'npx', args: ['x@1'], env: { API_KEY: '${API_KEY}', DB_PASSWORD: 'hunter2hunter2', LOG_LEVEL: 'debug' } }));
    expect(a.capabilities.filter((c) => c.dimension === 'credentials')).toHaveLength(2);
    expect(a.findings.filter((f) => f.message.startsWith('Plaintext secret'))).toHaveLength(1);
  });

  it('flags secrets passed as arguments', () => {
    const a = analyzeMcpServer(server({ command: 'npx', args: ['server-postgres@1', 'postgres://u:pw@db.host/x'] }));
    expect(a.findings.some((f) => f.message.startsWith('Secret passed as a command-line argument'))).toBe(true);
  });

  it('flags auto-approved tools, harder when they write or execute', () => {
    expect(messages(server({ command: 'x', autoApprove: ['read_file'] }))).toContain('low: 1 tool auto-approved: the agent calls it without asking you.');
    expect(messages(server({ command: 'x', autoApprove: ['read_file', 'write_file'] })).some((m) => m.startsWith('high: 2 tools auto-approved') && m.includes('write_file'))).toBe(true);
    expect(messages(server({ url: 'https://x.example', autoApprove: ['*'] })).some((m) => m.startsWith('high:'))).toBe(true);
  });
});
