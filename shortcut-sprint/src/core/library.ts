import type { Shortcut, ShortcutSet } from './types';
import { isBrowserReserved, parseCombo } from './keys';

export type ValidationResult =
  | { ok: true; set: ShortcutSet; warnings: string[] }
  | { ok: false; errors: string[] };

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Validate an uploaded (or persisted) custom set. Structural problems are
 * errors; shortcuts the browser cannot capture (Ctrl+W and friends) are
 * dropped with a warning instead of rejecting the whole set.
 */
export function validateSet(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (typeof raw !== 'object' || raw === null) return { ok: false, errors: ['not a JSON object'] };
  const o = raw as Record<string, unknown>;

  if (o.version !== 1) errors.push('"version" must be 1');
  if (typeof o.id !== 'string' || !ID_RE.test(o.id)) {
    errors.push('"id" must be lowercase letters, digits, and hyphens (max 64 chars)');
  }
  for (const field of ['name', 'tool'] as const) {
    if (typeof o[field] !== 'string' || (o[field] as string).trim() === '' || (o[field] as string).length > 80) {
      errors.push(`"${field}" must be a non-empty string (max 80 chars)`);
    }
  }
  if (!Array.isArray(o.shortcuts) || o.shortcuts.length === 0) {
    errors.push('"shortcuts" must be a non-empty array');
    return { ok: false, errors };
  }
  if (o.shortcuts.length > 500) errors.push('too many shortcuts (max 500)');

  const seen = new Set<string>();
  const shortcuts: Shortcut[] = [];
  o.shortcuts.forEach((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      errors.push(`shortcut ${i + 1}: not an object`);
      return;
    }
    const s = raw as Record<string, unknown>;
    const label = typeof s.id === 'string' ? s.id : `#${i + 1}`;
    if (typeof s.id !== 'string' || !ID_RE.test(s.id)) {
      errors.push(`shortcut ${label}: "id" must be lowercase letters, digits, and hyphens`);
      return;
    }
    if (seen.has(s.id)) {
      errors.push(`shortcut ${label}: duplicate id`);
      return;
    }
    seen.add(s.id);
    if (typeof s.task !== 'string' || s.task.trim() === '' || s.task.length > 120) {
      errors.push(`shortcut ${label}: "task" must be a non-empty string (max 120 chars)`);
      return;
    }
    if (typeof s.combo !== 'string') {
      errors.push(`shortcut ${label}: "combo" must be a string`);
      return;
    }
    try {
      parseCombo(s.combo);
    } catch (e) {
      errors.push(`shortcut ${label}: bad combo "${s.combo}" (${(e as Error).message})`);
      return;
    }
    if (s.mac !== undefined) {
      if (typeof s.mac !== 'string') {
        errors.push(`shortcut ${label}: "mac" must be a string`);
        return;
      }
      try {
        parseCombo(s.mac);
      } catch (e) {
        errors.push(`shortcut ${label}: bad mac combo "${s.mac}" (${(e as Error).message})`);
        return;
      }
    }
    if (s.hint !== undefined && (typeof s.hint !== 'string' || s.hint.length > 200)) {
      errors.push(`shortcut ${label}: "hint" must be a string (max 200 chars)`);
      return;
    }
    if (isBrowserReserved(s.combo) || (typeof s.mac === 'string' && isBrowserReserved(s.mac))) {
      warnings.push(`dropped "${s.task}" (${s.combo}): the browser reserves this combo, it cannot be practiced here`);
      return;
    }
    const shortcut: Shortcut = { id: s.id, task: s.task.trim(), combo: s.combo.trim() };
    if (typeof s.mac === 'string') shortcut.mac = s.mac.trim();
    if (typeof s.hint === 'string') shortcut.hint = s.hint.trim();
    shortcuts.push(shortcut);
  });

  if (o.notation !== undefined && o.notation !== 'vim') {
    errors.push('"notation" must be "vim" when present');
  }
  if (errors.length > 0) return { ok: false, errors };
  if (shortcuts.length === 0) return { ok: false, errors: ['every shortcut was dropped as browser-reserved'] };
  const set: ShortcutSet = {
    id: o.id as string,
    name: (o.name as string).trim(),
    tool: (o.tool as string).trim(),
    version: 1,
    shortcuts,
  };
  if (o.notation === 'vim') set.notation = 'vim';
  return { ok: true, set, warnings };
}
