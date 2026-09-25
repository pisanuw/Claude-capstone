/** The five kinds of reach a tool can have over the machine it runs on. */
export type Dimension = 'filesystem' | 'shell' | 'network' | 'credentials' | 'browser';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Where a tool definition came from. */
export type SourceKind = 'mcp-config' | 'agent-settings' | 'browser-extension' | 'vscode-extension';

/**
 * One concrete capability a tool has, with the evidence that proves it.
 * `weight` is how much it contributes to the dimension score (0-100).
 */
export interface Capability {
  dimension: Dimension;
  weight: number;
  /** Short label, e.g. "Writes files under ~/projects". */
  label: string;
  /** Plain-English "if this tool were compromised or misconfigured..." sentence. */
  explain: string;
  /** The config fragment that triggered it, e.g. a permission name or an arg. */
  evidence: string;
}

/** A config-hygiene problem that is not a capability in itself. */
export interface Finding {
  severity: Severity;
  message: string;
  evidence?: string;
}

export interface ToolReport {
  /** Stable id: `<file>#<name>`. */
  id: string;
  name: string;
  kind: SourceKind;
  /** The file this came from. */
  file: string;
  /** One-line description of how it runs (command line, URL, or version). */
  summary: string;
  disabled: boolean;
  capabilities: Capability[];
  findings: Finding[];
  /** Per-dimension score, 0-100. */
  dimensions: Record<Dimension, number>;
  /** Overall blast-radius score, 0-100. */
  score: number;
  level: RiskLevel;
}

export interface FileInput {
  name: string;
  text: string;
}

export interface FileResult {
  file: string;
  kind: SourceKind | 'unknown' | 'error';
  message?: string;
  tools: ToolReport[];
}

export interface ScanResult {
  files: FileResult[];
  tools: ToolReport[];
}

export const DIMENSIONS: Dimension[] = ['filesystem', 'shell', 'network', 'credentials', 'browser'];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  filesystem: 'Filesystem',
  shell: 'Shell / code exec',
  network: 'Network egress',
  credentials: 'Credentials',
  browser: 'Browser data',
};
