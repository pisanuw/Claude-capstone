import type { FileRecord } from './types.js';

/** Deterministic pseudo-random generator so the sample is identical on every load and in tests. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * A synthetic "student capstone" repo with every classic mistake: a committed venv, a
 * node_modules in the frontend, a build directory, a 180 MB dataset, __pycache__, .DS_Store
 * everywhere, a .env with keys, and a fat .git from all of the above. Sizes are plausible.
 */
export function sampleRepo(): FileRecord[] {
  const rnd = lcg(42);
  const files: FileRecord[] = [];
  const add = (path: string, size: number): void => {
    files.push({ path, size: Math.max(1, Math.round(size)) });
  };

  // Real project code
  add('README.md', 3_200);
  add('.gitignore', 0);
  add('requirements.txt', 410);
  add('pyproject.toml', 880);
  add('.env', 312);
  add('.env.example', 120);
  add('LICENSE', 1_070);
  add('Makefile', 640);
  const pySrc = ['__init__', 'app', 'models', 'train', 'evaluate', 'features', 'cli', 'config', 'utils', 'dataset'];
  for (const m of pySrc) add(`src/capstone/${m}.py`, 800 + rnd() * 9_000);
  for (const m of ['test_app', 'test_models', 'test_features', 'conftest']) add(`tests/${m}.py`, 500 + rnd() * 4_000);
  add('notebooks/exploration.ipynb', 4_800_000);
  add('notebooks/results.ipynb', 2_100_000);
  add('notebooks/.ipynb_checkpoints/exploration-checkpoint.ipynb', 4_700_000);
  add('docs/report.pdf', 1_900_000);
  add('docs/architecture.md', 6_000);
  add('docs/img/pipeline.png', 240_000);
  add('.github/workflows/ci.yml', 900);

  // Data that should never have been committed
  add('data/raw/train.csv', 180_000_000);
  add('data/raw/test.csv', 42_000_000);
  add('data/processed/features.parquet', 61_000_000);
  add('data/raw/archive.zip', 95_000_000);
  add('models/best_model.pt', 88_000_000);
  add('models/checkpoints/epoch_03.ckpt', 88_000_000);
  add('models/checkpoints/epoch_07.ckpt', 88_000_000);
  add('demo/screen-recording.mp4', 210_000_000);

  // A committed virtualenv
  add('venv/pyvenv.cfg', 180);
  add('venv/bin/python', 32_000);
  add('venv/bin/pip', 260);
  add('venv/bin/activate', 2_000);
  const pkgs: Array<[string, number, number]> = [
    ['numpy', 310, 28_000_000],
    ['pandas', 620, 55_000_000],
    ['torch', 1_900, 780_000_000],
    ['scipy', 900, 90_000_000],
    ['matplotlib', 480, 35_000_000],
    ['sklearn', 720, 60_000_000],
    ['pip', 380, 9_000_000],
    ['setuptools', 260, 4_000_000],
    ['requests', 40, 400_000],
    ['certifi', 6, 300_000],
  ];
  for (const [name, count, total] of pkgs) {
    for (let i = 0; i < count; i += 1) {
      const sub = i % 7 === 0 ? `${name}/__pycache__/mod${i}.cpython-312.pyc` : i % 11 === 0 ? `${name}/lib/${name}_${i}.so` : `${name}/mod${i}.py`;
      add(`venv/lib/python3.12/site-packages/${sub}`, (total / count) * (0.4 + rnd() * 1.2));
    }
  }

  // Python caches
  for (const m of pySrc) add(`src/capstone/__pycache__/${m}.cpython-312.pyc`, 1_500 + rnd() * 12_000);
  for (const m of ['test_app', 'test_models']) add(`tests/__pycache__/${m}.cpython-312-pytest-8.3.2.pyc`, 3_000 + rnd() * 6_000);
  add('.pytest_cache/v/cache/nodeids', 2_400);
  add('.pytest_cache/v/cache/lastfailed', 300);
  add('src/capstone.egg-info/PKG-INFO', 900);
  add('src/capstone.egg-info/SOURCES.txt', 700);

  // Frontend with node_modules and a build
  add('frontend/package.json', 1_100);
  add('frontend/package-lock.json', 380_000);
  add('frontend/vite.config.ts', 300);
  add('frontend/index.html', 600);
  for (const f of ['main.tsx', 'App.tsx', 'api.ts', 'Chart.tsx', 'Upload.tsx', 'styles.css']) add(`frontend/src/${f}`, 700 + rnd() * 5_000);
  add('frontend/public/logo.svg', 4_000);
  add('frontend/public/hero.png', 3_400_000);
  const nodePkgs: Array<[string, number, number]> = [
    ['react', 30, 300_000],
    ['react-dom', 40, 4_500_000],
    ['typescript', 120, 22_000_000],
    ['vite', 260, 12_000_000],
    ['esbuild', 8, 9_800_000],
    ['@types/node', 190, 2_400_000],
    ['tailwindcss', 340, 6_200_000],
    ['eslint', 410, 3_600_000],
    ['rollup', 70, 4_100_000],
    ['@rollup/rollup-linux-x64-gnu', 3, 3_200_000],
    ['caniuse-lite', 900, 2_300_000],
    ['lodash', 640, 1_400_000],
  ];
  for (const [name, count, total] of nodePkgs) {
    for (let i = 0; i < count; i += 1) {
      const sub = i === 0 ? 'package.json' : i % 5 === 0 ? `dist/chunk${i}.js.map` : i % 3 === 0 ? `dist/mod${i}.js` : `lib/mod${i}.js`;
      add(`frontend/node_modules/${name}/${sub}`, (total / count) * (0.3 + rnd() * 1.4));
    }
  }
  add('frontend/dist/index.html', 800);
  add('frontend/dist/assets/index-Bq3x.js', 890_000);
  add('frontend/dist/assets/index-Bq3x.js.map', 3_200_000);
  add('frontend/dist/assets/index-Cd1.css', 42_000);
  add('frontend/dist/assets/hero-9a2.png', 3_400_000);

  // OS and editor cruft
  for (const d of ['', 'src/', 'src/capstone/', 'data/', 'data/raw/', 'notebooks/', 'docs/', 'frontend/', 'frontend/src/', 'models/']) add(`${d}.DS_Store`, 6_148 + rnd() * 4_000);
  add('.idea/workspace.xml', 48_000);
  add('.idea/capstone.iml', 600);
  add('.idea/misc.xml', 300);
  add('train.log', 12_400_000);
  add('logs/run-2026-09-14.log', 5_100_000);
  add('logs/run-2026-09-15.log', 6_700_000);
  add('src/capstone/app.py~', 4_100);

  // A .git that already carries most of the above
  add('.git/HEAD', 23);
  add('.git/config', 300);
  add('.git/index', 210_000);
  add('.git/objects/pack/pack-8f1c.pack', 1_450_000_000);
  add('.git/objects/pack/pack-8f1c.idx', 4_900_000);
  add('.git/objects/pack/pack-2a77.pack', 610_000_000);
  add('.git/objects/pack/pack-2a77.idx', 1_800_000);
  for (let i = 0; i < 120; i += 1) add(`.git/objects/${(i * 37 % 256).toString(16).padStart(2, '0')}/obj${i}`, 200 + rnd() * 90_000);
  add('.git/refs/heads/main', 41);
  add('.git/logs/HEAD', 9_000);

  return files;
}

export const SAMPLE_GITIGNORE = `# Byte-compiled / optimized\n*.py[cod]\n__pycache__/\n`;
