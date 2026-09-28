import type { FileRecord, MatchContext, Rule } from './types.js';
import { baseName, extensionOf } from './format.js';

const segs = (p: string): string[] => p.split('/').slice(0, -1);
const hasDir = (p: string, names: string[]): boolean => {
  const s = segs(p);
  return s.some((d) => names.includes(d));
};
const under = (p: string, roots: string[], sub: string): boolean =>
  roots.some((r) => p.startsWith(r ? `${r}/${sub}/` : `${sub}/`));
const inRootDir = (p: string, name: string, ctx: MatchContext): boolean => {
  // `name/` directly under any directory, e.g. dist/ at the root or packages/app/dist/
  const s = segs(p);
  const i = s.indexOf(name);
  if (i < 0) return false;
  return ctx.dirs.has(s.slice(0, i + 1).join('/'));
};

/**
 * Ordered from most to least specific: a file is attributed to the first rule that matches it,
 * so a `.pyc` inside a venv counts as venv bytes, not as `__pycache__` bytes.
 */
export const RULES: Rule[] = [
  {
    id: 'secret-files',
    ecosystem: 'Secrets',
    title: 'Secrets and private keys in the tree',
    explanation:
      '.env files, private keys, and cloud credential files should never be committed. Ignore them, and if they were ever pushed, rotate the secrets: removing a file from history does not un-leak it.',
    gitignore: ['.env', '.env.*', '!.env.example', '*.pem', '*.key', 'id_rsa', 'id_ed25519', '*.p12', '*.pfx', 'credentials.json', 'service-account*.json'],
    kind: 'secret',
    match: (f) => {
      const b = baseName(f.path);
      const lower = b.toLowerCase();
      if (lower === '.env.example' || lower === '.env.sample' || lower === '.env.template') return false;
      if (lower === '.env' || lower.startsWith('.env.')) return true;
      if (['pem', 'key', 'p12', 'pfx'].includes(extensionOf(f.path))) return true;
      if (lower === 'id_rsa' || lower === 'id_ed25519' || lower === 'id_ecdsa' || lower === 'id_dsa') return true;
      return lower === 'credentials.json' || /^service-account.*\.json$/.test(lower);
    },
  },
  {
    id: 'python-venv',
    ecosystem: 'Python',
    title: 'Committed virtualenv',
    explanation:
      'A virtual environment is a machine-specific copy of every installed package. Ignore it and list the dependencies in requirements.txt or pyproject.toml so anyone can recreate it with one command.',
    gitignore: ['venv/', '.venv/', 'env/', 'ENV/'],
    kind: 'ignore',
    match: (f, ctx) => ctx.venvRoots.some((r) => f.path.startsWith(r ? `${r}/` : '')) || hasDir(f.path, ['venv', '.venv', 'virtualenv', 'site-packages']),
  },
  {
    id: 'conda-env',
    ecosystem: 'Python',
    title: 'Committed conda environment',
    explanation: 'A conda environment directory is even larger than a venv. Export it with `conda env export > environment.yml` and ignore the directory.',
    gitignore: ['envs/', 'conda-meta/'],
    kind: 'ignore',
    match: (f) => hasDir(f.path, ['conda-meta']) || (hasDir(f.path, ['envs']) && hasDir(f.path, ['lib', 'bin', 'pkgs'])),
  },
  {
    id: 'python-cache',
    ecosystem: 'Python',
    title: 'Python bytecode and tool caches',
    explanation: '__pycache__, .pyc files, and pytest/mypy/ruff caches are regenerated on every run and differ per Python version.',
    gitignore: ['__pycache__/', '*.py[cod]', '.pytest_cache/', '.mypy_cache/', '.ruff_cache/', '.tox/', '.nox/', '.ipynb_checkpoints/'],
    kind: 'ignore',
    match: (f) =>
      hasDir(f.path, ['__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', '.nox', '.ipynb_checkpoints']) ||
      ['pyc', 'pyo', 'pyd'].includes(extensionOf(f.path)),
  },
  {
    id: 'python-build',
    ecosystem: 'Python',
    title: 'Python packaging output',
    explanation: 'Wheels, sdists, and *.egg-info directories are produced by `pip install -e .` or `python -m build` and belong on PyPI, not in git.',
    gitignore: ['*.egg-info/', '*.egg', '*.whl', 'build/', 'dist/'],
    kind: 'ignore',
    match: (f) => segs(f.path).some((d) => d.endsWith('.egg-info')) || ['whl', 'egg'].includes(extensionOf(f.path)),
  },
  {
    id: 'node-modules',
    ecosystem: 'Node',
    title: 'Committed node_modules',
    explanation:
      'node_modules is reproduced exactly by `npm ci` from package-lock.json. It is often the single largest thing in a student repo, and it contains platform-specific binaries that break on other machines.',
    gitignore: ['node_modules/'],
    kind: 'ignore',
    match: (f) => hasDir(f.path, ['node_modules']),
  },
  {
    id: 'node-caches',
    ecosystem: 'Node',
    title: 'Node tool caches and framework output',
    explanation: 'Framework build caches (.next, .nuxt, .parcel-cache, .turbo, .cache) and npm/yarn logs are regenerated on every build.',
    gitignore: ['.next/', '.nuxt/', '.svelte-kit/', '.parcel-cache/', '.turbo/', '.cache/', '.nyc_output/', 'npm-debug.log*', 'yarn-error.log*', '.pnpm-store/', '.yarn/cache/'],
    kind: 'ignore',
    match: (f) =>
      hasDir(f.path, ['.next', '.nuxt', '.svelte-kit', '.parcel-cache', '.turbo', '.cache', '.nyc_output', '.pnpm-store']) ||
      (hasDir(f.path, ['.yarn']) && hasDir(f.path, ['cache'])) ||
      /^(npm-debug|yarn-error)\.log/.test(baseName(f.path)),
  },
  {
    id: 'jvm-build',
    ecosystem: 'Java / JVM',
    title: 'Maven or Gradle build output',
    explanation: 'target/ (Maven), build/ and .gradle/ (Gradle) hold compiled classes and jars that every `mvn package` or `gradle build` recreates.',
    gitignore: ['target/', 'build/', '.gradle/', '*.class', '*.jar', '!gradle/wrapper/gradle-wrapper.jar'],
    kind: 'ignore',
    match: (f, ctx) => {
      if (extensionOf(f.path) === 'class') return true;
      if (hasDir(f.path, ['.gradle'])) return true;
      const s = segs(f.path);
      const i = s.findIndex((d) => d === 'target' || d === 'build');
      if (i < 0) return false;
      const prefix = i === 0 ? '' : `${s.slice(0, i).join('/')}/`;
      if (s[i] === 'target') return rootHas(ctx, prefix, 'pom.xml');
      return rootHas(ctx, prefix, 'build.gradle') || rootHas(ctx, prefix, 'build.gradle.kts');
    },
  },
  {
    id: 'dotnet-build',
    ecosystem: '.NET',
    title: 'bin/ and obj/ build output',
    explanation: 'bin/ and obj/ next to a .csproj are compiler output; Visual Studio and `dotnet build` regenerate them every time.',
    gitignore: ['bin/', 'obj/', '*.user', '*.suo', '.vs/'],
    kind: 'ignore',
    match: (f, ctx) => {
      if (hasDir(f.path, ['.vs'])) return true;
      const s = segs(f.path);
      const i = s.findIndex((d) => d === 'bin' || d === 'obj');
      if (i < 0) return false;
      const root = s.slice(0, i).join('/');
      return ctx.dotnetRoots?.includes(root) ?? false;
    },
  },
  {
    id: 'unity-generated',
    ecosystem: 'Unity',
    title: 'Unity Library, Temp, Logs, and Build folders',
    explanation:
      'Unity regenerates Library/ (the imported-asset cache, usually gigabytes) and Temp/ on every open. Only Assets/, Packages/, and ProjectSettings/ belong in git.',
    gitignore: ['[Ll]ibrary/', '[Tt]emp/', '[Oo]bj/', '[Bb]uild/', '[Bb]uilds/', '[Ll]ogs/', '[Uu]ser[Ss]ettings/', '*.csproj', '*.sln', '*.pidb', '*.booproj', '*.svd', '*.VC.db'],
    kind: 'ignore',
    match: (f, ctx) =>
      ['Library', 'Temp', 'Logs', 'Builds', 'UserSettings', 'obj'].some((d) => under(f.path, ctx.unityRoots, d)) ||
      (ctx.unityRoots.length > 0 && under(f.path, ctx.unityRoots, 'Build')),
  },
  {
    id: 'c-objects',
    ecosystem: 'C / C++',
    title: 'Compiled objects and CMake output',
    explanation: 'Object files, static libraries, and CMake build directories are compiler output; `make` or `cmake --build` recreates them.',
    gitignore: ['*.o', '*.obj', '*.a', '*.lo', '*.la', '*.gch', '*.pch', '*.d', 'CMakeFiles/', 'CMakeCache.txt', 'cmake-build-*/', 'Makefile.in', 'a.out'],
    kind: 'ignore',
    match: (f) => {
      const ext = extensionOf(f.path);
      const b = baseName(f.path);
      return (
        ['o', 'obj', 'a', 'lo', 'la', 'gch', 'pch', 'd'].includes(ext) ||
        b === 'CMakeCache.txt' ||
        b === 'a.out' ||
        hasDir(f.path, ['CMakeFiles']) ||
        segs(f.path).some((d) => d.startsWith('cmake-build-'))
      );
    },
  },
  {
    id: 'rust-go-target',
    ecosystem: 'Rust / Go',
    title: 'Cargo target/ output',
    explanation: 'Cargo writes every compiled crate and its incremental cache into target/, which quickly reaches gigabytes.',
    gitignore: ['target/'],
    kind: 'ignore',
    match: (f, ctx) => {
      const i = f.path.indexOf('target/');
      if (i < 0 || segs(f.path).indexOf('target') < 0) return false;
      const root = f.path.slice(0, i);
      return rootHas(ctx, root, 'Cargo.toml');
    },
  },
  {
    id: 'web-build',
    ecosystem: 'General',
    title: 'Build output directories',
    explanation: 'dist/, build/, and out/ hold bundled or compiled output that the build script recreates. Deploy them from CI, do not commit them.',
    gitignore: ['dist/', 'build/', 'out/'],
    kind: 'ignore',
    match: (f, ctx) => ['dist', 'build', 'out'].some((d) => inRootDir(f.path, d, ctx)) && !f.path.startsWith('src/'),
  },
  {
    id: 'coverage',
    ecosystem: 'General',
    title: 'Coverage reports',
    explanation: 'Coverage HTML and lcov output is a by-product of the test run; the CI job or a badge is where it belongs.',
    gitignore: ['coverage/', 'htmlcov/', '.coverage', '*.lcov'],
    kind: 'ignore',
    match: (f) => hasDir(f.path, ['coverage', 'htmlcov']) || baseName(f.path) === '.coverage' || extensionOf(f.path) === 'lcov',
  },
  {
    id: 'logs',
    ecosystem: 'General',
    title: 'Log files',
    explanation: 'Logs grow forever and are useless to anyone else. Ignore them or ship them to a log service.',
    gitignore: ['*.log', 'logs/'],
    kind: 'ignore',
    match: (f) => extensionOf(f.path) === 'log' || hasDir(f.path, ['logs']),
  },
  {
    id: 'os-cruft',
    ecosystem: 'macOS / Windows',
    title: 'Finder and Explorer metadata',
    explanation: '.DS_Store and Thumbs.db are written by the file manager and carry nothing about your project. They are small but appear in every folder.',
    gitignore: ['.DS_Store', '._*', 'Thumbs.db', 'ehthumbs.db', 'desktop.ini', '$RECYCLE.BIN/'],
    kind: 'ignore',
    match: (f) => {
      const b = baseName(f.path);
      const lower = b.toLowerCase();
      return lower === '.ds_store' || lower === 'thumbs.db' || lower === 'ehthumbs.db' || lower === 'desktop.ini' || b.startsWith('._') || hasDir(f.path, ['$RECYCLE.BIN', '__MACOSX']);
    },
  },
  {
    id: 'editor-cruft',
    ecosystem: 'Editors',
    title: 'Editor state and swap files',
    explanation: 'JetBrains .idea/ workspace state, Vim swap files, and backup files are personal and change constantly, so they cause pointless merge conflicts.',
    gitignore: ['.idea/', '*.swp', '*.swo', '*~', '.project', '.classpath', '.settings/'],
    kind: 'ignore',
    match: (f) => {
      const b = baseName(f.path);
      return hasDir(f.path, ['.idea']) || /\.sw[po]$/.test(b) || b.endsWith('~');
    },
  },
  {
    id: 'terraform',
    ecosystem: 'Infra',
    title: 'Terraform providers and state',
    explanation: '.terraform/ holds downloaded provider binaries (hundreds of MB) and *.tfstate can contain secrets. Use a remote backend for state.',
    gitignore: ['.terraform/', '*.tfstate', '*.tfstate.*'],
    kind: 'ignore',
    match: (f) => hasDir(f.path, ['.terraform']) || /\.tfstate(\.|$)/.test(baseName(f.path)),
  },
  {
    id: 'large-files',
    ecosystem: 'Large files',
    title: 'Large datasets, media, and archives',
    explanation:
      'Git stores every version of a file forever, so a large dataset or video makes every clone slow for good. Keep it out of the tree, or track it with Git LFS if it must be versioned.',
    gitignore: [],
    kind: 'large',
    match: (f, ctx) => f.size >= ctx.largeThreshold && !hasDir(f.path, ['.git']),
  },
];

function rootHas(ctx: MatchContext, root: string, file: string): boolean {
  return ctx.files?.has(root + file) ?? false;
}

/** Build the context the rules consult: directory set, venv roots, Unity roots, .NET roots, and the file set. */
export function buildContext(files: FileRecord[], largeThreshold: number): MatchContext {
  const dirs = new Set<string>(['']);
  const fileSet = new Set<string>();
  const venvRoots: string[] = [];
  const unityCandidates = new Set<string>();
  const dotnetRoots: string[] = [];
  for (const f of files) {
    fileSet.add(f.path);
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'));
    const base = parts[parts.length - 1];
    const dir = parts.slice(0, -1).join('/');
    if (base === 'pyvenv.cfg') venvRoots.push(dir);
    if (base.endsWith('.csproj') || base.endsWith('.fsproj') || base.endsWith('.vbproj')) dotnetRoots.push(dir);
    if (parts.length >= 2 && (parts[parts.length - 2] === 'Assets' || parts[parts.length - 2] === 'ProjectSettings')) {
      unityCandidates.add(parts.slice(0, -2).join('/'));
    }
  }
  const unityRoots = [...unityCandidates].filter((r) => dirs.has(r ? `${r}/Assets` : 'Assets') && dirs.has(r ? `${r}/ProjectSettings` : 'ProjectSettings'));
  return { dirs, venvRoots, unityRoots, dotnetRoots, files: fileSet, largeThreshold };
}
