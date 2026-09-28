import type { Category } from './types.js';
import { baseName, extensionOf } from './format.js';

export const CATEGORY_ORDER: Category[] = [
  'source',
  'dependency',
  'generated',
  'data',
  'media',
  'binary',
  'docs',
  'config',
  'vcs',
  'other',
];

export const CATEGORY_LABEL: Record<Category, string> = {
  source: 'Source code',
  dependency: 'Dependencies',
  generated: 'Generated / build output',
  data: 'Data & archives',
  media: 'Media',
  binary: 'Binaries & fonts',
  docs: 'Docs',
  config: 'Config',
  vcs: 'Git internals (.git)',
  other: 'Other',
};

/** Colors chosen to keep "belongs in git" (source/docs/config) cool and "probably not" warm. */
export const CATEGORY_COLOR: Record<Category, string> = {
  source: '#3b82f6',
  dependency: '#f97316',
  generated: '#ef4444',
  data: '#a855f7',
  media: '#ec4899',
  binary: '#b45309',
  docs: '#0ea5e9',
  config: '#14b8a6',
  vcs: '#6b7280',
  other: '#94a3b8',
};

const DEPENDENCY_DIRS = new Set([
  'node_modules',
  'bower_components',
  'jspm_packages',
  'vendor',
  'venv',
  '.venv',
  'virtualenv',
  'site-packages',
  '.tox',
  '.nox',
  'pods',
  '.gradle',
  '.m2',
  '.cargo',
  '.bundle',
  'packages', // NuGet restore folder
  '.yarn',
  '.pnpm-store',
  'conda-meta',
  'envs',
]);

const GENERATED_DIRS = new Set([
  'dist',
  'build',
  'out',
  'target',
  'bin',
  'obj',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.angular',
  '.output',
  'coverage',
  '.nyc_output',
  'htmlcov',
  'library', // Unity
  'temp',
  'logs',
  'obj',
  'deriveddata',
  '.terraform',
  '.ipynb_checkpoints',
  'cmake-build-debug',
  'cmake-build-release',
  'cmakefiles',
  '.dart_tool',
  '.serverless',
  '.vercel',
  '.netlify',
]);

const GENERATED_EXT = new Set([
  'pyc',
  'pyo',
  'pyd',
  'o',
  'obj',
  'class',
  'log',
  'map',
  'tsbuildinfo',
  'gch',
  'pch',
  'd',
  'lo',
  'la',
]);

const SOURCE_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte', 'astro',
  'py', 'pyi', 'ipynb', 'rb', 'php', 'pl', 'pm', 'lua', 'r', 'jl',
  'java', 'kt', 'kts', 'scala', 'groovy', 'clj', 'cljs',
  'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'hxx', 'm', 'mm',
  'cs', 'fs', 'vb', 'go', 'rs', 'swift', 'dart', 'zig', 'nim',
  'hs', 'ml', 'mli', 'ex', 'exs', 'erl', 'elm', 'lisp', 'scm', 'rkt',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'styl',
  'sql', 'graphql', 'gql', 'proto', 'thrift',
  'asm', 's', 'v', 'sv', 'vhd', 'vhdl', 'cu', 'cl', 'glsl', 'hlsl', 'wgsl', 'shader', 'cginc',
  'tf', 'hcl', 'cmake', 'make', 'mk', 'gradle', 'sbt', 'bzl', 'nix',
  'tex', 'bib', 'sty', 'cls',
]);

const DOC_EXT = new Set(['md', 'markdown', 'rst', 'txt', 'adoc', 'org', 'pdf', 'doc', 'docx', 'rtf', 'odt', 'epub']);

const CONFIG_EXT = new Set([
  'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'properties', 'env',
  'lock', 'editorconfig', 'xml', 'plist', 'csproj', 'sln', 'vcxproj', 'pbxproj', 'xcconfig',
  'gitignore', 'gitattributes', 'npmrc', 'nvmrc', 'prettierrc', 'eslintrc', 'babelrc', 'meta',
]);

const DATA_EXT = new Set([
  'csv', 'tsv', 'parquet', 'arrow', 'feather', 'orc', 'avro', 'jsonl', 'ndjson',
  'sqlite', 'sqlite3', 'db', 'db3', 'mdb', 'accdb', 'dump', 'sql.gz',
  'h5', 'hdf5', 'npy', 'npz', 'pkl', 'pickle', 'joblib', 'pt', 'pth', 'ckpt', 'safetensors', 'onnx', 'pb', 'tflite', 'gguf', 'bin.gz',
  'xls', 'xlsx', 'ods', 'mat', 'rds', 'rdata', 'sav', 'dta',
  'zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', '7z', 'rar', 'lz4',
  'geojson', 'shp', 'kml', 'gpx', 'nc', 'fits', 'las', 'laz',
]);

const MEDIA_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'ico', 'icns', 'svg', 'psd', 'ai', 'heic', 'raw', 'cr2', 'exr', 'hdr', 'tga', 'dds',
  'mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'wma', 'aiff', 'opus', 'mid',
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'm4v', 'mpg', 'mpeg',
  'fbx', 'obj3d', 'blend', 'gltf', 'glb', 'dae', '3ds', 'stl', 'ply', 'usd', 'usdz',
]);

const BINARY_EXT = new Set([
  'exe', 'dll', 'so', 'dylib', 'a', 'lib', 'bin', 'wasm', 'jar', 'war', 'ear', 'aar', 'apk', 'ipa', 'aab', 'dmg', 'pkg', 'msi', 'deb', 'rpm', 'iso', 'img', 'elf', 'hex', 'rom',
  'ttf', 'otf', 'woff', 'woff2', 'eot', 'pfb', 'unitypackage', 'nupkg', 'whl', 'egg', 'gem', 'crate',
]);

const CONFIG_BASENAMES = new Set([
  'makefile', 'dockerfile', 'procfile', 'rakefile', 'gemfile', 'pipfile', 'brewfile', 'justfile', 'vagrantfile', 'cmakelists.txt', 'license', 'licence', 'notice', 'copying', 'codeowners', 'authors', 'readme',
]);

/**
 * Categorize a file by where it lives first and what it is second: a `.png` inside
 * `node_modules/` is a dependency, not media, because that is what you would delete.
 */
export function categorize(path: string): Category {
  const segments = path.split('/');
  const dirs = segments.slice(0, -1).map((s) => s.toLowerCase());
  const base = baseName(path);
  const lower = base.toLowerCase();
  const ext = extensionOf(path);

  if (dirs.includes('.git') || lower === '.git') return 'vcs';
  if (dirs.some((d) => DEPENDENCY_DIRS.has(d))) return 'dependency';
  if (dirs.some((d) => GENERATED_DIRS.has(d))) return 'generated';
  if (GENERATED_EXT.has(ext)) return 'generated';
  if (lower === '.ds_store' || lower === 'thumbs.db' || lower === 'desktop.ini' || lower.endsWith('~')) return 'generated';
  if (lower.endsWith('.min.js') || lower.endsWith('.min.css')) return 'generated';
  if (CONFIG_BASENAMES.has(lower)) return 'config';
  if (DATA_EXT.has(ext)) return 'data';
  if (MEDIA_EXT.has(ext)) return 'media';
  if (BINARY_EXT.has(ext)) return 'binary';
  if (SOURCE_EXT.has(ext)) return 'source';
  if (DOC_EXT.has(ext)) return 'docs';
  if (CONFIG_EXT.has(ext)) return 'config';
  if (lower.startsWith('.')) return 'config';
  return 'other';
}
