import { asStringArray, isRecord } from './jsonc.js';
import type { Capability, Finding } from './types.js';

export interface VscodeAnalysis {
  name: string;
  summary: string;
  capabilities: Capability[];
  findings: Finding[];
}

export function isVscodeExtension(doc: unknown): doc is Record<string, unknown> {
  return isRecord(doc) && isRecord(doc.engines) && typeof doc.engines.vscode === 'string';
}

const AI_HINT = /copilot|\bai\b|agent|assistant|llm|gpt|claude|codeium|tabnine|continue|cline|chat|autocomplete/i;

/**
 * VS Code has no per-extension permission model: every extension runs in the
 * extension host with the editor's full privileges. The manifest can only
 * tell us *when* it wakes up and what it plugs into, so the baseline is high
 * for everything and the findings carry the detail.
 */
export function analyzeVscodeExtension(doc: Record<string, unknown>): VscodeAnalysis {
  const capabilities: Capability[] = [];
  const findings: Finding[] = [];
  const publisher = typeof doc.publisher === 'string' ? doc.publisher : '?';
  const rawName = typeof doc.name === 'string' ? doc.name : 'extension';
  const display = typeof doc.displayName === 'string' && !doc.displayName.startsWith('%') ? doc.displayName : rawName;
  const version = typeof doc.version === 'string' ? doc.version : '?';
  const hasCode = typeof doc.main === 'string' || typeof doc.browser === 'string';

  if (hasCode) {
    capabilities.push({
      dimension: 'shell',
      weight: 70,
      label: 'Runs unsandboxed code in the editor',
      explain: 'VS Code extensions have no permission prompts: this one can read and write any file, spawn processes, and make network requests with your account, whenever it is active.',
      evidence: typeof doc.main === 'string' ? `main: ${doc.main}` : `browser: ${String(doc.browser)}`,
    });
    capabilities.push({
      dimension: 'filesystem',
      weight: 70,
      label: 'Reads every file you open, and more',
      explain: 'Sees the contents of every workspace you open, including .env files and credentials checked into projects.',
      evidence: 'extension host',
    });
    capabilities.push({ dimension: 'network', weight: 45, label: 'Unrestricted network access', explain: 'Can send what it reads to any server.', evidence: 'extension host' });
  } else {
    findings.push({ severity: 'info', message: 'No main/browser entry point: a declarative extension (themes, grammars, snippets) with no code of its own.' });
  }

  const activation = asStringArray(doc.activationEvents);
  if (hasCode && (activation.includes('*') || activation.includes('onStartupFinished'))) {
    findings.push({ severity: 'low', message: 'Activates at startup in every window, not only when you use it.', evidence: activation.filter((a) => a === '*' || a === 'onStartupFinished').join(', ') });
  }

  const contributes = isRecord(doc.contributes) ? doc.contributes : {};
  if ('terminal' in contributes || 'taskDefinitions' in contributes) {
    capabilities.push({ dimension: 'shell', weight: 60, label: 'Contributes terminals or tasks', explain: 'Plugs into the terminal or task runner, the places where commands run.', evidence: 'contributes.terminal / taskDefinitions' });
  }
  if ('authentication' in contributes) {
    capabilities.push({ dimension: 'credentials', weight: 50, label: 'Provides sign-in sessions', explain: 'Registers an authentication provider and holds the resulting tokens.', evidence: 'contributes.authentication' });
  }
  if ('languageModelTools' in contributes || 'chatParticipants' in contributes || 'mcpServerDefinitionProviders' in contributes) {
    findings.push({ severity: 'medium', message: 'Exposes tools to AI agents in the editor (chat participants, language-model tools, or MCP servers): an agent may invoke it without you opening it.', evidence: Object.keys(contributes).filter((k) => /languageModelTools|chatParticipants|mcpServerDefinitionProviders/.test(k)).join(', ') });
  }
  if (isRecord(doc.capabilities) && isRecord(doc.capabilities.untrustedWorkspaces) && doc.capabilities.untrustedWorkspaces.supported === true) {
    findings.push({ severity: 'low', message: 'Runs fully in Restricted Mode, i.e. also in folders you have not marked as trusted.', evidence: 'capabilities.untrustedWorkspaces.supported: true' });
  }
  const deps = asStringArray(doc.extensionDependencies);
  if (deps.length > 0) {
    findings.push({ severity: 'info', message: `Installs alongside ${deps.join(', ')}; scan those too.`, evidence: 'extensionDependencies' });
  }
  if (AI_HINT.test(`${rawName} ${display} ${typeof doc.description === 'string' ? doc.description : ''}`)) {
    findings.push({ severity: 'info', message: 'Looks like an AI assistant: it likely sends code context to a remote model provider.' });
  }

  return { name: `${display} (${publisher})`, summary: `VS Code extension ${publisher}.${rawName} v${version}`, capabilities, findings };
}
