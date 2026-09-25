import { describe, expect, it } from 'vitest';
import { allowRule, analyzeAgentSettings, isAgentSettings } from '../src/core/agentSettings.js';

describe('isAgentSettings', () => {
  it('recognizes Claude Code settings files', () => {
    expect(isAgentSettings({ permissions: {} })).toBe(true);
    expect(isAgentSettings({ hooks: {} })).toBe(true);
    expect(isAgentSettings({ enableAllProjectMcpServers: false })).toBe(true);
    expect(isAgentSettings({ mcpServers: {} })).toBe(false);
  });
});

describe('allowRule', () => {
  it('scores bare Bash as near-total and scoped Bash by prefix', () => {
    expect(allowRule('Bash')?.weight).toBe(95);
    expect(allowRule('Bash(*)')?.weight).toBe(95);
    expect(allowRule('Bash(npm test:*)')?.weight).toBe(25);
    expect(allowRule('Bash(curl:*)')?.weight).toBe(70);
    expect(allowRule('Bash(git push:*)')?.weight).toBe(70);
  });

  it('scores edits, reads, and fetches by scope', () => {
    expect(allowRule('Edit')?.weight).toBe(65);
    expect(allowRule('Write(src/**)')?.label).toBe('Edits src/** unprompted');
    expect(allowRule('Read')?.weight).toBe(30);
    expect(allowRule('Grep(./docs/**)')?.weight).toBe(10);
    expect(allowRule('WebFetch')?.weight).toBe(50);
    expect(allowRule('WebFetch(domain:docs.example.com)')?.weight).toBe(20);
  });

  it('scores MCP server and tool rules', () => {
    expect(allowRule('mcp__github')?.label).toBe('MCP server github (all tools) unprompted');
    expect(allowRule('mcp__github__create_issue')?.label).toBe('MCP tool github/create_issue unprompted');
  });

  it('ignores unknown or malformed rules', () => {
    expect(allowRule('TodoWrite')).toBeUndefined();
    expect(allowRule('(broken')).toBeUndefined();
  });
});

describe('analyzeAgentSettings', () => {
  it('treats bypassPermissions as critical', () => {
    const a = analyzeAgentSettings({ permissions: { defaultMode: 'bypassPermissions' }, skipDangerousModePermissionPrompt: true });
    expect(a.capabilities[0]?.weight).toBe(100);
    expect(a.findings.map((f) => f.severity)).toEqual(['critical', 'medium', 'low']);
  });

  it('notes acceptEdits, project MCP auto-approval, and hooks', () => {
    const a = analyzeAgentSettings({
      permissions: { defaultMode: 'acceptEdits', allow: ['Bash(ls:*)'], deny: ['Read(./.env)'] },
      enableAllProjectMcpServers: true,
      hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'echo hi' }, 'junk'] }, 'junk'], Other: 'x' },
    });
    expect(a.capabilities.map((c) => c.label)).toEqual(['File edits are auto-accepted', 'Runs `ls:*` unprompted', '1 hook command run automatically']);
    expect(a.findings.map((f) => f.message).join('\n')).toMatch(/cloned repo/);
    expect(a.findings.some((f) => f.message.startsWith('Deny rules protect'))).toBe(true);
    expect(a.summary).toBe('Claude Code settings: mode acceptEdits, 1 allow rule, 1 deny rule');
  });

  it('is quiet for default settings and scans env secrets', () => {
    expect(analyzeAgentSettings({ permissions: {} })).toEqual({ summary: 'Claude Code settings: mode default, 0 allow rules, 0 deny rules', capabilities: [], findings: [] });
    const a = analyzeAgentSettings({ env: { ANTHROPIC_API_KEY: 'literal-key-value-1234' }, hooks: {} });
    expect(a.findings[0]?.message).toMatch(/Plaintext secret/);
  });
});
