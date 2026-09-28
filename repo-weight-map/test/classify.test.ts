import { describe, expect, it } from 'vitest';
import { CATEGORY_COLOR, CATEGORY_LABEL, CATEGORY_ORDER, categorize } from '../src/core/classify.js';

describe('categorize', () => {
  it('uses location before extension', () => {
    expect(categorize('node_modules/react/logo.png')).toBe('dependency');
    expect(categorize('venv/lib/python3.12/site-packages/numpy/core.py')).toBe('dependency');
    expect(categorize('dist/assets/index.js')).toBe('generated');
    expect(categorize('frontend/build/static/main.css')).toBe('generated');
    expect(categorize('.git/objects/pack/x.pack')).toBe('vcs');
  });
  it('recognizes generated files by extension and name', () => {
    expect(categorize('src/__pycache__/a.cpython-312.pyc')).toBe('generated');
    expect(categorize('src/a.o')).toBe('generated');
    expect(categorize('train.log')).toBe('generated');
    expect(categorize('docs/.DS_Store')).toBe('generated');
    expect(categorize('src/app.py~')).toBe('generated');
    expect(categorize('public/vendor.min.js')).toBe('generated');
    expect(categorize('public/app.min.css')).toBe('generated');
  });
  it('splits the remaining kinds', () => {
    expect(categorize('data/train.csv')).toBe('data');
    expect(categorize('data/archive.tar.gz')).toBe('data');
    expect(categorize('models/best.pt')).toBe('data');
    expect(categorize('assets/hero.png')).toBe('media');
    expect(categorize('demo/clip.mp4')).toBe('media');
    expect(categorize('bin2/tool.exe')).toBe('binary');
    expect(categorize('fonts/inter.woff2')).toBe('binary');
    expect(categorize('src/main.ts')).toBe('source');
    expect(categorize('src/Main.java')).toBe('source');
    expect(categorize('index.html')).toBe('source');
    expect(categorize('README.md')).toBe('docs');
    expect(categorize('docs/report.pdf')).toBe('docs');
    expect(categorize('package.json')).toBe('config');
    expect(categorize('.gitignore')).toBe('config');
    expect(categorize('.env')).toBe('config');
    expect(categorize('Makefile')).toBe('config');
    expect(categorize('LICENSE')).toBe('config');
    expect(categorize('README')).toBe('config');
    expect(categorize('CMakeLists.txt')).toBe('config');
    expect(categorize('mystery')).toBe('other');
    expect(categorize('a/b.unknownext')).toBe('other');
  });
  it('has a label and color for every category', () => {
    for (const c of CATEGORY_ORDER) {
      expect(CATEGORY_LABEL[c]).toBeTruthy();
      expect(CATEGORY_COLOR[c]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
