import { scanSecrets } from './envscan.js';
import { asStringArray, asStringRecord, isRecord } from './jsonc.js';
import type { Capability, Finding } from './types.js';

export interface AgentSettingsAnalysis {
  summary: string;
  capabilities: Capability[];
  findings: Finding[];
}

/** A Claude Code settings file: `.claude/settings.json`, `settings.local.json`, or managed settings. */
export function isAgentSettings(doc: unknown): doc is Record<string, unknown> {
  return isRecord(doc) && (isRecord(doc.permissions) || isRecord(doc.hooks) || 'enableAllProjectMcpServers' in doc || 'enabledMcpjsonServers' in doc);
}

/**
 * What a coding agent may do *without asking*. Claude Code prompts before
 * running tools by default; the `permissions.allow` list and `defaultMode`
 * decide what skips the prompt, which is exactly the unattended blast radius.
 */
export function analyzeAgentSettings(doc: Record<string, unknown>): AgentSettingsAnalysis {
  const capabilities: Capability[] = [];
  const findings: Finding[] = [];
  const perms = isRecord(doc.permissions) ? doc.permissions : {};
  const allow = asStringArray(perms.allow);
  const deny = asStringArray(perms.deny);
  const mode = typeof perms.defaultMode === 'string' ? perms.defaultMode : 'default';

  if (mode === 'bypassPermissions') {
    capabilities.push({ dimension: 'shell', weight: 100, label: 'Every tool runs without a prompt', explain: 'bypassPermissions skips all approval prompts: any shell command, any file write, any network call, as you.', evidence: 'permissions.defaultMode: bypassPermissions' });
    findings.push({ severity: 'critical', message: 'defaultMode is bypassPermissions. Use it only inside a disposable container or VM.', evidence: 'permissions.defaultMode' });
  } else if (mode === 'acceptEdits') {
    capabilities.push({ dimension: 'filesystem', weight: 55, label: 'File edits are auto-accepted', explain: 'The agent writes files in the working directory without asking.', evidence: 'permissions.defaultMode: acceptEdits' });
  }
  if (doc.skipDangerousModePermissionPrompt === true) {
    findings.push({ severity: 'medium', message: 'The warning before entering bypass mode is switched off.', evidence: 'skipDangerousModePermissionPrompt' });
  }

  for (const rule of allow) {
    const c = allowRule(rule);
    if (c) capabilities.push(c);
  }

  if (deny.some((d) => /\.env|secrets|\.ssh|\.aws|credentials/i.test(d))) {
    findings.push({ severity: 'info', message: 'Deny rules protect some secret files. Good.', evidence: deny.filter((d) => /\.env|secrets|\.ssh|\.aws|credentials/i.test(d)).join(', ') });
  } else if (allow.length > 0 || mode !== 'default') {
    findings.push({ severity: 'low', message: 'No deny rules for secret files (e.g. "Read(./.env)", "Read(~/.ssh/**)").' });
  }

  if (doc.enableAllProjectMcpServers === true) {
    findings.push({ severity: 'medium', message: 'Every MCP server a cloned repo declares in .mcp.json is approved automatically: opening an untrusted repo can start its servers.', evidence: 'enableAllProjectMcpServers: true' });
  }

  if (isRecord(doc.hooks)) {
    const commands: string[] = [];
    for (const groups of Object.values(doc.hooks)) {
      if (!Array.isArray(groups)) continue;
      for (const g of groups) {
        if (!isRecord(g) || !Array.isArray(g.hooks)) continue;
        for (const h of g.hooks) if (isRecord(h) && typeof h.command === 'string') commands.push(h.command);
      }
    }
    if (commands.length > 0) {
      capabilities.push({
        dimension: 'shell',
        weight: 45,
        label: `${commands.length} hook command${commands.length === 1 ? '' : 's'} run automatically`,
        explain: 'Hooks run shell commands on agent events with no prompt. Check that each one is yours and does what you think.',
        evidence: commands.slice(0, 3).join(' | '),
      });
    }
  }

  const env = scanSecrets(asStringRecord(doc.env), 'env');
  capabilities.push(...env.capabilities);
  findings.push(...env.findings);

  const summary = `Claude Code settings: mode ${mode}, ${allow.length} allow rule${allow.length === 1 ? '' : 's'}, ${deny.length} deny rule${deny.length === 1 ? '' : 's'}`;
  return { summary, capabilities, findings };
}

/** Map one `permissions.allow` rule to what it lets the agent do unprompted. */
export function allowRule(rule: string): Capability | undefined {
  const m = /^([A-Za-z_][\w-]*)(?:\((.*)\))?$/.exec(rule.trim());
  if (!m) return undefined;
  const tool = m[1] as string;
  const spec = (m[2] ?? '').trim();
  const unscoped = spec === '' || spec === '*' || spec === ':*' || spec === '**';
  const evidence = `permissions.allow: ${rule}`;

  if (tool === 'Bash') {
    if (unscoped) return { dimension: 'shell', weight: 95, label: 'Any shell command runs unprompted', explain: 'A bare Bash allow rule lets the agent run any command at all without asking.', evidence };
    const risky = /^(curl|wget|rm|sudo|ssh|scp|docker|kubectl|python|node|npx|bash|sh|eval|git push|aws|gcloud|az)\b/.test(spec);
    return {
      dimension: 'shell',
      weight: risky ? 70 : 25,
      label: `Runs \`${spec}\` unprompted`,
      explain: risky ? 'This command prefix can run arbitrary code or reach the network, so the scoping is weaker than it looks.' : 'Scoped to one command prefix.',
      evidence,
    };
  }
  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    return { dimension: 'filesystem', weight: unscoped ? 65 : 35, label: unscoped ? 'Edits any file unprompted' : `Edits ${spec} unprompted`, explain: unscoped ? 'Writes are approved everywhere the agent can reach, including shell startup files and git hooks, which later run code.' : 'Writes are scoped to a path pattern.', evidence };
  }
  if (tool === 'Read' || tool === 'Glob' || tool === 'Grep') {
    return { dimension: 'filesystem', weight: unscoped ? 30 : 10, label: unscoped ? 'Reads any file unprompted' : `Reads ${spec} unprompted`, explain: 'Reads cannot change anything, but what is read can be sent elsewhere by another tool.', evidence };
  }
  if (tool === 'WebFetch' || tool === 'WebSearch') {
    return { dimension: 'network', weight: unscoped ? 50 : 20, label: unscoped ? 'Fetches any URL unprompted' : `Fetches ${spec} unprompted`, explain: unscoped ? 'Unprompted fetches are an exfiltration path: data can leave inside a URL.' : 'Scoped to a domain.', evidence };
  }
  if (tool.startsWith('mcp__')) {
    const parts = tool.split('__');
    return { dimension: 'shell', weight: parts.length === 2 ? 40 : 20, label: `MCP ${parts.length === 2 ? `server ${parts[1] as string} (all tools)` : `tool ${parts.slice(1).join('/')}`} unprompted`, explain: 'The agent can call this MCP tool without asking; its reach is whatever that server can do (scan its config too).', evidence };
  }
  return undefined;
}
