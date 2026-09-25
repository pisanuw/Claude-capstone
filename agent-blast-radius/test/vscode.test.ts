import { describe, expect, it } from 'vitest';
import { analyzeVscodeExtension, isVscodeExtension } from '../src/core/vscode.js';

const pkg = (over: Record<string, unknown>) => ({ name: 'ext', publisher: 'pub', version: '1.0.0', engines: { vscode: '^1.90.0' }, main: './out/ext.js', ...over });

describe('isVscodeExtension', () => {
  it('requires engines.vscode', () => {
    expect(isVscodeExtension(pkg({}))).toBe(true);
    expect(isVscodeExtension({ name: 'lib', engines: { node: '>=20' } })).toBe(false);
  });
});

describe('analyzeVscodeExtension', () => {
  it('gives any extension with code the unsandboxed baseline', () => {
    const a = analyzeVscodeExtension(pkg({}));
    expect(a.capabilities.map((c) => c.dimension)).toEqual(['shell', 'filesystem', 'network']);
    expect(a.name).toBe('ext (pub)');
    expect(a.summary).toBe('VS Code extension pub.ext v1.0.0');
  });

  it('uses the browser entry and displayName, but not a localized placeholder', () => {
    const a = analyzeVscodeExtension(pkg({ main: undefined, browser: './web.js', displayName: 'Nice Name' }));
    expect(a.capabilities[0]?.evidence).toBe('browser: ./web.js');
    expect(a.name).toBe('Nice Name (pub)');
    expect(analyzeVscodeExtension(pkg({ displayName: '%displayName%' })).name).toBe('ext (pub)');
  });

  it('treats a declarative extension as code-free', () => {
    const a = analyzeVscodeExtension(pkg({ main: undefined, activationEvents: ['*'] }));
    expect(a.capabilities).toEqual([]);
    expect(a.findings.map((f) => f.severity)).toEqual(['info']);
  });

  it('reports startup activation, terminals, auth, agent tools, restricted mode, and dependencies', () => {
    const a = analyzeVscodeExtension(
      pkg({
        activationEvents: ['onStartupFinished'],
        contributes: { terminal: {}, authentication: [{}], languageModelTools: [] },
        capabilities: { untrustedWorkspaces: { supported: true } },
        extensionDependencies: ['other.ext'],
        description: 'An AI coding assistant',
      }),
    );
    const msgs = a.findings.map((f) => f.message).join('\n');
    expect(msgs).toMatch(/Activates at startup/);
    expect(msgs).toMatch(/Exposes tools to AI agents/);
    expect(msgs).toMatch(/Restricted Mode/);
    expect(msgs).toMatch(/other\.ext/);
    expect(msgs).toMatch(/AI assistant/);
    expect(a.capabilities.map((c) => c.label)).toEqual(expect.arrayContaining(['Contributes terminals or tasks', 'Provides sign-in sessions']));
  });

  it('falls back on missing fields', () => {
    const a = analyzeVscodeExtension({ engines: { vscode: '*' } });
    expect(a.name).toBe('extension (?)');
    expect(a.summary).toBe('VS Code extension ?.extension v?');
  });
});
