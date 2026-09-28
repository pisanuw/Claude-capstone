/** A file found in the chosen folder. `path` is relative to the folder root, forward slashes, no leading slash. */
export interface FileRecord {
  path: string;
  size: number;
}

export type Category =
  | 'source'
  | 'dependency'
  | 'generated'
  | 'binary'
  | 'media'
  | 'data'
  | 'docs'
  | 'config'
  | 'vcs'
  | 'other';

export interface TreeNode {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  size: number;
  fileCount: number;
  category: Category;
  children?: TreeNode[];
}

export type FindingKind = 'ignore' | 'large' | 'secret';

export interface Rule {
  id: string;
  ecosystem: string;
  title: string;
  explanation: string;
  /** Lines to add to .gitignore. Empty for "large file" advice that has no generic pattern. */
  gitignore: string[];
  kind: FindingKind;
  match: (file: FileRecord, ctx: MatchContext) => boolean;
}

export interface MatchContext {
  /** Every directory path in the tree (relative, no trailing slash; '' is the root). */
  dirs: Set<string>;
  /** Directories that contain a `pyvenv.cfg` (Python virtualenvs). */
  venvRoots: string[];
  /** Directories that contain both `Assets` and `ProjectSettings` (Unity projects). */
  unityRoots: string[];
  /** Directories that contain a .csproj/.fsproj/.vbproj (.NET projects). */
  dotnetRoots?: string[];
  /** Every file path, for "does this root have a Cargo.toml" style checks. */
  files?: Set<string>;
  /** Files bigger than this are reported as large. */
  largeThreshold: number;
}

export interface Finding {
  ruleId: string;
  ecosystem: string;
  title: string;
  explanation: string;
  kind: FindingKind;
  gitignore: string[];
  files: string[];
  bytes: number;
}

export interface GitignoreDiff {
  /** Lines to add, in order, none of which the existing file already has. */
  added: string[];
  /** Suggested lines the existing .gitignore already contains. */
  alreadyPresent: string[];
  /** The block to append to .gitignore. */
  block: string;
  /** A unified diff of the existing file against the proposed one. */
  unified: string;
}

export interface Analysis {
  root: TreeNode;
  totalBytes: number;
  fileCount: number;
  byCategory: Record<Category, { bytes: number; files: number }>;
  findings: Finding[];
  largestFiles: FileRecord[];
  /** Bytes that would leave the working tree if every selected finding were applied. */
  reclaimableBytes: number;
  afterBytes: number;
  gitignore: GitignoreDiff;
}
