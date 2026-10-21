import { describe, expect, it } from 'vitest';
import { GitHubError, importClassroom, listAssignmentRepos, type FetchLike } from '../src/core/github';

type Routes = Record<string, unknown>;

function fake(routes: Routes, log: string[] = []): FetchLike {
  return async (url, init) => {
    const path = url.replace('https://api.github.com', '');
    log.push(`${path} ${init?.headers?.Accept ?? ''} ${init?.headers?.Authorization ?? ''}`);
    const hit = Object.keys(routes).find((k) => path === k || path.startsWith(`${k}?`));
    if (!hit) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    const body = routes[hit];
    if (typeof body === 'number') return { ok: false, status: body, json: async () => ({}), text: async () => '' };
    return { ok: true, status: 200, json: async () => body, text: async () => String(body) };
  };
}

const repos = [
  { name: 'a4-ana', default_branch: 'main' },
  { name: 'a4-ben', default_branch: 'master' },
  { name: 'a4-empty', default_branch: 'main' },
  { name: 'a3-old', default_branch: 'main' },
];

const routes: Routes = {
  '/orgs/cs143/repos': repos,
  '/repos/cs143/a4-ana/git/trees/main': { tree: [{ path: 'src/list.py', type: 'blob', size: 100 }, { path: 'README.md', type: 'blob', size: 10 }, { path: 'node_modules/x.js', type: 'blob', size: 1 }, { path: 'src', type: 'tree' }] },
  '/repos/cs143/a4-ana/contents/src/list.py': 'def f(x):\n    return x\n',
  '/repos/cs143/a4-ana/commits': [
    { sha: 'bbb', commit: { author: { name: 'Ana', date: '2026-10-02T09:47:10Z' }, message: 'late' } },
    { sha: 'aaa', commit: { author: null, message: 'starter' } },
    { sha: 'ccc', commit: { author: { name: 'Ana', date: '2026-09-30T18:00:00Z' }, message: 'start' } },
  ],
  '/repos/cs143/a4-ana/commits/bbb': { stats: { additions: 50, deletions: 1 }, files: [{ filename: 'src/list.py', additions: 50 }] },
  '/repos/cs143/a4-ana/commits/aaa': {},
  '/repos/cs143/a4-ana/commits/ccc': { stats: { additions: 3, deletions: 0 } },
  '/repos/cs143/a4-ben/git/trees/master': 403,
  '/repos/cs143/a4-empty/git/trees/main': { tree: [{ path: 'README.md', type: 'blob', size: 5 }] },
  '/repos/cs143/a4-empty/commits': [],
};

describe('GitHub Classroom import', () => {
  it('lists only repos with the assignment prefix, paging until a short page', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ name: `a4-s${i}`, default_branch: 'main' }));
    const log: string[] = [];
    const f: FetchLike = async (url) => {
      log.push(url);
      const page = Number(/[?&]page=(\d+)/.exec(url)![1]);
      return { ok: true, status: 200, json: async () => (page === 1 ? many : [{ name: 'A4-last', default_branch: 'main' }]), text: async () => '' };
    };
    const out = await listAssignmentRepos(f, 'org', 'a4', '');
    expect(out).toHaveLength(101);
    expect(log).toHaveLength(2);
  });
  it('imports code and commits, converting commit times to the course offset', async () => {
    const log: string[] = [];
    const progress: string[] = [];
    const res = await importClassroom(fake(routes, log), { org: 'cs143', prefix: 'a4', token: 'tok', utcOffset: -420, onProgress: (d, t, r) => progress.push(`${d}/${t} ${r}`) });
    expect(res.submissions.map((s) => [s.id, s.student])).toEqual([['a4-ana', 'ana']]);
    const ana = res.submissions[0]!;
    expect(ana.files).toEqual([{ path: 'src/list.py', text: 'def f(x):\n    return x\n' }]);
    expect(ana.commits.map((c) => c.sha)).toEqual(['ccc', 'bbb']);
    expect(ana.commits[0]!.files).toEqual([]);
    expect(ana.commits[1]).toMatchObject({ date: '2026-10-02T02:47:10-07:00', added: 50, files: [{ path: 'src/list.py', added: 50 }] });
    expect(res.failed).toEqual([
      { repo: 'a4-ben', error: 'GitHub /repos/cs143/a4-ben/git/trees/master: rate limit reached or the token lacks repo access' },
      { repo: 'a4-empty', error: 'no code files' },
    ]);
    expect(log.some((l) => l.includes('contents/src/list.py') && l.includes('raw+json') && l.includes('Bearer tok'))).toBe(true);
    expect(progress[progress.length - 1]).toBe('3/3 ');
  });
  it('explains auth and missing-org errors', async () => {
    await expect(listAssignmentRepos(fake({ '/orgs/x/repos': 401 }), 'x', 'a', 't')).rejects.toThrow('token was rejected');
    await expect(listAssignmentRepos(fake({}), 'nope', 'a', 't')).rejects.toThrow('not found');
    await expect(listAssignmentRepos(fake({ '/orgs/x/repos': 500 }), 'x', 'a', 't')).rejects.toBeInstanceOf(GitHubError);
  });
});
