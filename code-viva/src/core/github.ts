/**
 * GitHub Classroom import, straight from the browser to api.github.com with
 * the instructor's own token (kept in memory only). Classroom names student
 * repos `<assignment-prefix>-<github-username>`, so the prefix selects one
 * assignment. GitHub reports commit times in UTC; the course's UTC offset
 * turns them back into the students' wall-clock time for the late-night check.
 */

import { isCode } from './code';
import { withOffset } from './commits';
import type { Commit, SourceFile, Submission } from './types';

export interface FetchLike {
  (url: string, init?: { headers?: Record<string, string> }): Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;
}

export interface ClassroomOptions {
  org: string;
  prefix: string;
  token: string;
  /** Minutes east of UTC for the course, e.g. -420 for Pacific daylight time. */
  utcOffset: number;
  maxFiles?: number;
  maxCommits?: number;
  onProgress?: (done: number, total: number, repo: string) => void;
}

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function get<T>(fetcher: FetchLike, path: string, token: string, raw = false): Promise<T> {
  const res = await fetcher(`${API}${path}`, {
    headers: { Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    const hint = res.status === 401 ? 'the token was rejected' : res.status === 403 ? 'rate limit reached or the token lacks repo access' : res.status === 404 ? 'not found (check the organization name and token scope)' : `HTTP ${res.status}`;
    throw new GitHubError(`GitHub ${path.split('?')[0]}: ${hint}`, res.status);
  }
  return (raw ? res.text() : res.json()) as Promise<T>;
}

interface Repo {
  name: string;
  default_branch: string;
}

/** Repositories in the organization whose names start with `<prefix>-`. */
export async function listAssignmentRepos(fetcher: FetchLike, org: string, prefix: string, token: string): Promise<Repo[]> {
  const out: Repo[] = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await get<Repo[]>(fetcher, `/orgs/${encodeURIComponent(org)}/repos?per_page=100&page=${page}&type=all`, token);
    out.push(...batch.filter((r) => r.name.toLowerCase().startsWith(`${prefix.toLowerCase()}-`)));
    if (batch.length < 100) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

interface TreeEntry {
  path: string;
  type: string;
  size?: number;
}

interface CommitListItem {
  sha: string;
  commit: { author: { name: string; date: string } | null; message: string };
}

interface CommitDetail {
  stats?: { additions: number; deletions: number };
  files?: { filename: string; additions: number }[];
}

async function repoSubmission(fetcher: FetchLike, opts: ClassroomOptions, repo: Repo): Promise<Submission> {
  const base = `/repos/${encodeURIComponent(opts.org)}/${encodeURIComponent(repo.name)}`;
  const tree = await get<{ tree: TreeEntry[] }>(fetcher, `${base}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`, opts.token);
  const wanted = tree.tree
    .filter((e) => e.type === 'blob' && isCode(e.path) && (e.size ?? 0) <= 200_000 && !/(?:^|\/)(?:node_modules|dist|build|vendor|\.github)\//.test(e.path))
    .slice(0, opts.maxFiles ?? 40);
  const files: SourceFile[] = [];
  for (const e of wanted) {
    const text = await get<string>(fetcher, `${base}/contents/${e.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(repo.default_branch)}`, opts.token, true);
    files.push({ path: e.path, text });
  }
  const list = await get<CommitListItem[]>(fetcher, `${base}/commits?sha=${encodeURIComponent(repo.default_branch)}&per_page=${opts.maxCommits ?? 30}`, opts.token);
  const commits: Commit[] = [];
  for (const c of list) {
    const d = await get<CommitDetail>(fetcher, `${base}/commits/${c.sha}`, opts.token);
    commits.push({
      sha: c.sha,
      author: c.commit.author?.name ?? '',
      date: withOffset(c.commit.author?.date ?? '', opts.utcOffset),
      message: c.commit.message,
      added: d.stats?.additions ?? 0,
      deleted: d.stats?.deletions ?? 0,
      files: (d.files ?? []).map((f) => ({ path: f.filename, added: f.additions })),
    });
  }
  // A commit without an author date cannot be placed in time, so it is left out of the history.
  const dated = commits.filter((c) => !Number.isNaN(Date.parse(c.date))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return { id: repo.name, student: repo.name.slice(opts.prefix.length + 1), files, commits: dated };
}

/** Imports every student repository of one Classroom assignment. Requests run one at a time to stay polite to the rate limit. */
export async function importClassroom(fetcher: FetchLike, opts: ClassroomOptions): Promise<{ submissions: Submission[]; failed: { repo: string; error: string }[] }> {
  const repos = await listAssignmentRepos(fetcher, opts.org, opts.prefix, opts.token);
  const submissions: Submission[] = [];
  const failed: { repo: string; error: string }[] = [];
  for (const [i, repo] of repos.entries()) {
    opts.onProgress?.(i, repos.length, repo.name);
    try {
      const s = await repoSubmission(fetcher, opts, repo);
      if (s.files.length) submissions.push(s);
      else failed.push({ repo: repo.name, error: 'no code files' });
    } catch (e) {
      failed.push({ repo: repo.name, error: (e as Error).message });
    }
  }
  opts.onProgress?.(repos.length, repos.length, '');
  return { submissions, failed };
}
