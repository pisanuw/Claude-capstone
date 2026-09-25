import { describe, expect, it } from 'vitest';
import { SAMPLES } from '../src/core/samples.js';
import { scan, scanFile } from '../src/core/scan.js';

describe('scanFile', () => {
  it('reports parse errors and non-object documents without throwing', () => {
    expect(scanFile({ name: 'a.json', text: '{oops' })).toMatchObject({ kind: 'error', tools: [] });
    expect(scanFile({ name: 'a.json', text: '[1,2]' })).toMatchObject({ kind: 'unknown', message: 'Top level is not a JSON object.' });
  });

  it('explains unrecognized files and empty server blocks', () => {
    expect(scanFile({ name: 'x.json', text: '{"a":1}' }).message).toMatch(/Not a recognized format/);
    expect(scanFile({ name: 'x.json', text: '{"mcpServers":{}}' }).message).toMatch(/lists no servers/);
  });

  it('detects each file kind', () => {
    const kinds = SAMPLES.map((s) => scanFile(s).kind);
    expect(kinds).toEqual(['mcp-config', 'mcp-config', 'agent-settings', 'browser-extension', 'vscode-extension']);
  });

  it('reports both permissions and MCP servers from one settings file', () => {
    const r = scanFile({ name: '.claude.json', text: JSON.stringify({ permissions: { allow: ['Bash'] }, mcpServers: { a: { command: 'npx', args: ['mcp-server-fetch@1'] } } }) });
    expect(r.kind).toBe('mcp-config');
    expect(r.tools.map((t) => t.name)).toEqual(['Claude Code permissions', 'a']);
  });

  it('builds reports with sorted capabilities and findings', () => {
    const [tool] = scanFile(SAMPLES[0] as (typeof SAMPLES)[number]).tools;
    expect(tool?.id).toBe('claude_desktop_config.json#filesystem');
    const weights = tool?.capabilities.map((c) => c.weight) ?? [];
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
    expect(tool?.findings[0]?.severity).toBe('medium');
  });
});

describe('scan', () => {
  it('ranks tools by score with disabled ones last', () => {
    const r = scan([
      { name: 'a.json', text: JSON.stringify({ mcpServers: { off: { command: 'bash', args: ['-c', 'x'], disabled: true }, low: { command: 'uvx', args: ['mcp-server-time==1'] }, high: { command: 'npx', args: ['@modelcontextprotocol/server-filesystem@1', '/'] } } }) },
    ]);
    expect(r.tools.map((t) => t.name)).toEqual(['high', 'low', 'off']);
  });

  it('breaks score ties by name', () => {
    const r = scan([{ name: 'a.json', text: JSON.stringify({ mcpServers: { b: { command: 'uvx', args: ['mcp-server-time==1'] }, a: { command: 'uvx', args: ['mcp-server-time==1'] } } }) }]);
    expect(r.tools.map((t) => t.name)).toEqual(['a', 'b']);
  });

  it('scores every sample with a sensible spread', () => {
    const r = scan(SAMPLES);
    const levels = new Set(r.tools.map((t) => t.level));
    expect(levels).toEqual(new Set(['critical', 'high', 'medium', 'low']));
    expect(r.tools[0]?.level).toBe('critical');
    expect(r.tools.at(-1)?.name).toBe('time');
  });
});
