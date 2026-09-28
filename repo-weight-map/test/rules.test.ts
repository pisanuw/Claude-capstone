import { describe, expect, it } from 'vitest';
import { RULES, buildContext } from '../src/core/rules.js';
import { detect } from '../src/core/analyze.js';
import type { FileRecord } from '../src/core/types.js';

const f = (path: string, size = 10): FileRecord => ({ path, size });
const ruleOf = (files: FileRecord[], path: string): string | undefined =>
  detect(files, 1000).find((fd) => fd.files.includes(path))?.ruleId;

describe('buildContext', () => {
  it('finds venv, Unity, and .NET roots', () => {
    const ctx = buildContext(
      [f('venv/pyvenv.cfg'), f('game/Assets/a.cs'), f('game/ProjectSettings/p.asset'), f('api/Api.csproj'), f('half/Assets/x')],
      1,
    );
    expect(ctx.venvRoots).toEqual(['venv']);
    expect(ctx.unityRoots).toEqual(['game']);
    expect(ctx.dotnetRoots).toEqual(['api']);
    expect(ctx.dirs.has('game/Assets')).toBe(true);
    expect(ctx.files?.has('api/Api.csproj')).toBe(true);
  });
});

describe('rules', () => {
  it('every rule has an id, ecosystem, and explanation', () => {
    const ids = new Set(RULES.map((r) => r.id));
    expect(ids.size).toBe(RULES.length);
    for (const r of RULES) expect(r.explanation.length).toBeGreaterThan(20);
  });

  it('flags secrets but not the example file', () => {
    const files = [f('.env'), f('.env.local'), f('.env.example'), f('certs/server.pem'), f('keys/id_rsa'), f('gcp/service-account-prod.json'), f('gcp/credentials.json')];
    const found = detect(files, 1000).find((x) => x.ruleId === 'secret-files')!;
    expect(found.kind).toBe('secret');
    expect(found.files).toEqual(['.env', '.env.local', 'certs/server.pem', 'gcp/credentials.json', 'gcp/service-account-prod.json', 'keys/id_rsa']);
  });

  it('attributes a venv (by pyvenv.cfg or by name) as one finding', () => {
    const files = [f('myenv/pyvenv.cfg'), f('myenv/lib/python3.12/site-packages/x/__pycache__/a.pyc', 500), f('.venv/bin/python'), f('src/__pycache__/b.pyc')];
    expect(ruleOf(files, 'myenv/lib/python3.12/site-packages/x/__pycache__/a.pyc')).toBe('python-venv');
    expect(ruleOf(files, '.venv/bin/python')).toBe('python-venv');
    expect(ruleOf(files, 'src/__pycache__/b.pyc')).toBe('python-cache');
  });

  it('covers the Python, Node, JVM, .NET, Unity, C, Rust, and general rules', () => {
    const files = [
      f('envs/py311/conda-meta/history'),
      f('src/pkg.egg-info/PKG-INFO'),
      f('dist/pkg-1.0-py3-none-any.whl'),
      f('frontend/node_modules/react/index.js'),
      f('frontend/.next/cache/x'),
      f('frontend/npm-debug.log.1'),
      f('frontend/.yarn/cache/a.zip'),
      f('pom.xml'),
      f('target/classes/App.class'),
      f('target/app.jar'),
      f('svc/build.gradle'),
      f('svc/build/libs/svc.jar'),
      f('svc/.gradle/7.0/x'),
      f('api/Api.csproj'),
      f('api/bin/Debug/Api.dll'),
      f('api/obj/project.assets.json'),
      f('.vs/slnx.sqlite'),
      f('game/Assets/a.cs'),
      f('game/ProjectSettings/p.asset'),
      f('game/Library/metadata/x'),
      f('game/Temp/y'),
      f('game/Build/win/game.exe'),
      f('native/main.o'),
      f('native/CMakeFiles/x'),
      f('native/cmake-build-debug/y'),
      f('native/CMakeCache.txt'),
      f('native/a.out'),
      f('crate/Cargo.toml'),
      f('crate/target/debug/crate'),
      f('web/dist/index.html'),
      f('build/output.txt'),
      f('coverage/lcov.info'),
      f('htmlcov/index.html'),
      f('.coverage'),
      f('logs/app.log'),
      f('server.log'),
      f('.DS_Store'),
      f('docs/._thing'),
      f('Thumbs.db'),
      f('.idea/workspace.xml'),
      f('src/main.c.swp'),
      f('src/main.c~'),
      f('infra/.terraform/providers/x'),
      f('infra/terraform.tfstate.backup'),
      f('src/keep.py'),
      f('src/build/keep.py'),
    ];
    const r = (p: string): string | undefined => ruleOf(files, p);
    expect(r('envs/py311/conda-meta/history')).toBe('conda-env');
    expect(r('src/pkg.egg-info/PKG-INFO')).toBe('python-build');
    expect(r('dist/pkg-1.0-py3-none-any.whl')).toBe('python-build');
    expect(r('frontend/node_modules/react/index.js')).toBe('node-modules');
    expect(r('frontend/.next/cache/x')).toBe('node-caches');
    expect(r('frontend/npm-debug.log.1')).toBe('node-caches');
    expect(r('frontend/.yarn/cache/a.zip')).toBe('node-caches');
    expect(r('target/classes/App.class')).toBe('jvm-build');
    expect(r('target/app.jar')).toBe('jvm-build');
    expect(r('svc/build/libs/svc.jar')).toBe('jvm-build');
    expect(r('svc/.gradle/7.0/x')).toBe('jvm-build');
    expect(r('api/bin/Debug/Api.dll')).toBe('dotnet-build');
    expect(r('api/obj/project.assets.json')).toBe('dotnet-build');
    expect(r('.vs/slnx.sqlite')).toBe('dotnet-build');
    expect(r('game/Library/metadata/x')).toBe('unity-generated');
    expect(r('game/Temp/y')).toBe('unity-generated');
    expect(r('game/Build/win/game.exe')).toBe('unity-generated');
    expect(r('game/Assets/a.cs')).toBeUndefined();
    expect(r('native/main.o')).toBe('c-objects');
    expect(r('native/CMakeFiles/x')).toBe('c-objects');
    expect(r('native/cmake-build-debug/y')).toBe('c-objects');
    expect(r('native/CMakeCache.txt')).toBe('c-objects');
    expect(r('native/a.out')).toBe('c-objects');
    expect(r('crate/target/debug/crate')).toBe('rust-go-target');
    expect(r('web/dist/index.html')).toBe('web-build');
    expect(r('build/output.txt')).toBe('web-build');
    expect(r('coverage/lcov.info')).toBe('coverage');
    expect(r('htmlcov/index.html')).toBe('coverage');
    expect(r('.coverage')).toBe('coverage');
    expect(r('logs/app.log')).toBe('logs');
    expect(r('server.log')).toBe('logs');
    expect(r('.DS_Store')).toBe('os-cruft');
    expect(r('docs/._thing')).toBe('os-cruft');
    expect(r('Thumbs.db')).toBe('os-cruft');
    expect(r('.idea/workspace.xml')).toBe('editor-cruft');
    expect(r('src/main.c.swp')).toBe('editor-cruft');
    expect(r('src/main.c~')).toBe('editor-cruft');
    expect(r('infra/.terraform/providers/x')).toBe('terraform');
    expect(r('infra/terraform.tfstate.backup')).toBe('terraform');
    expect(r('src/keep.py')).toBeUndefined();
    expect(r('src/build/keep.py')).toBeUndefined(); // build/ under src/ is left alone
  });

  it('does not flag target/ or bin/ without the ecosystem marker', () => {
    const files = [f('target/notes.txt'), f('bin/tool.sh'), f('svc/build/x')];
    const found = detect(files, 1000);
    expect(found.find((x) => x.ruleId === 'jvm-build')).toBeUndefined();
    expect(found.find((x) => x.ruleId === 'dotnet-build')).toBeUndefined();
    expect(found.find((x) => x.ruleId === 'rust-go-target')).toBeUndefined();
    // plain build/ at any level is still generic build output
    expect(ruleOf(files, 'svc/build/x')).toBe('web-build');
  });

  it('flags large files, never .git internals, and sorts secrets first', () => {
    const files = [f('data/big.csv', 5000), f('.git/objects/pack/p.pack', 99999), f('.env', 5), f('node_modules/x.js', 800)];
    const found = detect(files, 1000);
    expect(found.map((x) => x.ruleId)).toEqual(['secret-files', 'large-files', 'node-modules']);
    const large = found[1];
    expect(large.kind).toBe('large');
    expect(large.files).toEqual(['data/big.csv']);
    expect(large.gitignore).toEqual([]);
    expect(found.every((x) => !x.files.some((p) => p.startsWith('.git/')))).toBe(true);
  });
});
