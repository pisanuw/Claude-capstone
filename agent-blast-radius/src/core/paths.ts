export type PathScope = 'root' | 'home' | 'sensitive' | 'scoped';

const SENSITIVE = [
  /(^|[\\/])\.ssh([\\/]|$)/i,
  /(^|[\\/])\.aws([\\/]|$)/i,
  /(^|[\\/])\.gnupg([\\/]|$)/i,
  /(^|[\\/])\.kube([\\/]|$)/i,
  /(^|[\\/])\.docker([\\/]|$)/i,
  /(^|[\\/])\.config([\\/]|$)/i,
  /(^|[\\/])\.env(\.|$)/i,
  /(^|[\\/])Library[\\/](Keychains|Application Support)([\\/]|$)/i,
  /(^|[\\/])AppData([\\/]|$)/i,
  /^\/(etc|var|usr|System|private)([\\/]|$)/,
  /^[A-Z]:[\\/](Windows|Program Files)/i,
];

/**
 * How much of the machine a directory argument exposes. The home directory
 * alone is treated as nearly as bad as `/`: it holds ssh keys, cloud
 * credentials, browser profiles, and every other project.
 */
export function classifyPath(raw: string): PathScope {
  const p = raw.trim().replace(/[\\/]+$/, '') || '/';
  if (p === '/' || /^[A-Z]:$/i.test(p)) return 'root';
  if (SENSITIVE.some((re) => re.test(p))) return 'sensitive';
  if (
    p === '~' ||
    p === '$HOME' ||
    p === '${HOME}' ||
    p === '${userHome}' ||
    /^%USERPROFILE%$/i.test(p) ||
    /^\/(Users|home)\/[^\\/]+$/.test(p) ||
    /^[A-Z]:[\\/]Users[\\/][^\\/]+$/i.test(p) ||
    p === '/Users' ||
    p === '/home' ||
    /^[A-Z]:[\\/]Users$/i.test(p)
  ) {
    return 'home';
  }
  return 'scoped';
}

/** True when an argument is plausibly a filesystem path rather than a flag or package. */
export function looksLikePath(arg: string): boolean {
  const a = arg.trim();
  if (a.startsWith('-')) return false;
  return (
    a.startsWith('/') ||
    a.startsWith('~') ||
    a.startsWith('./') ||
    a.startsWith('../') ||
    a === '.' ||
    /^[A-Z]:[\\/]/i.test(a) ||
    /^[A-Z]:$/i.test(a) ||
    /^(\$HOME|\$\{HOME\}|\$\{userHome\}|\$\{workspaceFolder\}|%USERPROFILE%)/i.test(a)
  );
}
