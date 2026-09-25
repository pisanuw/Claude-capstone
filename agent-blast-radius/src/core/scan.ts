import { analyzeAgentSettings, isAgentSettings } from './agentSettings.js';
import { analyzeExtension, isBrowserManifest } from './extension.js';
import { isRecord, parseJsonc } from './jsonc.js';
import { analyzeMcpServer, extractMcpServers } from './mcp.js';
import { dimensionScores, overallScore, riskLevel } from './score.js';
import type { Capability, FileInput, FileResult, Finding, ScanResult, SourceKind, ToolReport } from './types.js';
import { analyzeVscodeExtension, isVscodeExtension } from './vscode.js';

export function buildReport(
  file: string,
  name: string,
  kind: SourceKind,
  summary: string,
  capabilities: Capability[],
  findings: Finding[],
  disabled = false,
): ToolReport {
  const dimensions = dimensionScores(capabilities);
  const score = overallScore(dimensions, findings);
  return {
    id: `${file}#${name}`,
    name,
    kind,
    file,
    summary,
    disabled,
    capabilities: [...capabilities].sort((a, b) => b.weight - a.weight),
    findings: [...findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]),
    dimensions,
    score,
    level: riskLevel(score),
  };
}

const SEVERITY_RANK: Record<Finding['severity'], number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

/** Scan one file. Never throws: parse errors come back as an `error` result. */
export function scanFile(input: FileInput): FileResult {
  let doc: unknown;
  try {
    doc = parseJsonc(input.text);
  } catch (e) {
    return { file: input.name, kind: 'error', message: `Not valid JSON: ${(e as Error).message}`, tools: [] };
  }
  if (!isRecord(doc)) {
    return { file: input.name, kind: 'unknown', message: 'Top level is not a JSON object.', tools: [] };
  }

  if (isBrowserManifest(doc)) {
    const a = analyzeExtension(doc);
    return { file: input.name, kind: 'browser-extension', tools: [buildReport(input.name, a.name, 'browser-extension', a.summary, a.capabilities, a.findings)] };
  }
  if (isVscodeExtension(doc)) {
    const a = analyzeVscodeExtension(doc);
    return { file: input.name, kind: 'vscode-extension', tools: [buildReport(input.name, a.name, 'vscode-extension', a.summary, a.capabilities, a.findings)] };
  }

  const tools: ToolReport[] = [];
  let kind: FileResult['kind'] = 'unknown';
  if (isAgentSettings(doc)) {
    const a = analyzeAgentSettings(doc);
    tools.push(buildReport(input.name, 'Claude Code permissions', 'agent-settings', a.summary, a.capabilities, a.findings));
    kind = 'agent-settings';
  }
  const servers = extractMcpServers(doc);
  for (const s of servers) {
    const a = analyzeMcpServer(s);
    tools.push(buildReport(input.name, s.name, 'mcp-config', a.summary, a.capabilities, a.findings, s.disabled));
  }
  if (servers.length > 0) kind = 'mcp-config';

  if (tools.length === 0) {
    const hasMcpBlock = 'mcpServers' in doc || 'servers' in doc;
    return {
      file: input.name,
      kind: 'unknown',
      message: hasMcpBlock
        ? 'Found an MCP server block, but it lists no servers.'
        : 'Not a recognized format. Expected an MCP config (mcpServers / servers), a Claude Code settings.json, a browser extension manifest.json, or a VS Code extension package.json.',
      tools: [],
    };
  }
  return { file: input.name, kind, tools };
}

/** Scan many files; tools are ranked by score, enabled before disabled. */
export function scan(inputs: FileInput[]): ScanResult {
  const files = inputs.map(scanFile);
  const tools = files
    .flatMap((f) => f.tools)
    .sort((a, b) => Number(a.disabled) - Number(b.disabled) || b.score - a.score || a.name.localeCompare(b.name));
  return { files, tools };
}
