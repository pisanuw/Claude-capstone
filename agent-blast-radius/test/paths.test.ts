import { describe, expect, it } from 'vitest';
import { classifyPath, looksLikePath } from '../src/core/paths.js';

describe('classifyPath', () => {
  it('flags the filesystem root', () => {
    for (const p of ['/', 'C:', 'C:\\', '//']) expect(classifyPath(p), p).toBe('root');
  });

  it('flags home directories on every OS', () => {
    for (const p of ['~', '~/', '$HOME', '${HOME}', '${userHome}', '%USERPROFILE%', '/Users/alex', '/home/alex/', 'C:\\Users\\alex', '/Users', '/home', 'C:\\Users']) {
      expect(classifyPath(p), p).toBe('home');
    }
  });

  it('flags credential and system directories', () => {
    for (const p of ['~/.ssh', '/Users/alex/.aws/credentials', '~/.config', '/etc', '/var/lib', 'C:\\Windows\\System32', '~/Library/Keychains', '/Users/a/project/.env', '~/.kube']) {
      expect(classifyPath(p), p).toBe('sensitive');
    }
  });

  it('treats project directories as scoped', () => {
    for (const p of ['/Users/alex/code/app', '~/projects', './data', 'D:\\work\\repo']) expect(classifyPath(p), p).toBe('scoped');
  });
});

describe('looksLikePath', () => {
  it('accepts path-shaped arguments', () => {
    for (const a of ['/tmp', '~/x', './x', '../x', '.', 'C:\\x', 'C:', '$HOME/x', '${workspaceFolder}']) expect(looksLikePath(a), a).toBe(true);
  });

  it('rejects flags and package names', () => {
    for (const a of ['-y', '--port', '@modelcontextprotocol/server-filesystem', 'mcp-server-time']) expect(looksLikePath(a), a).toBe(false);
  });
});
