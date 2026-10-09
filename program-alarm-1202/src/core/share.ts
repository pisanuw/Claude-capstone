// Settings travel in the URL hash, e.g. #s=agc&steal=15&mon=1&tab=fly.

import { DEFAULT_CONFIG, SCHEDULERS, type SchedulerKind, type SimConfig } from './sim';

export type Tab = 'fly' | 'compare' | 'apollo';
const TABS: readonly Tab[] = ['fly', 'compare', 'apollo'];

export interface ShareState {
  config: SimConfig;
  tab: Tab;
}

export const MAX_STEAL = 30;

export function clampSteal(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_CONFIG.stealPct;
  return Math.max(0, Math.min(MAX_STEAL, Math.round(v)));
}

export function encodeShare(state: ShareState): string {
  const p = new URLSearchParams();
  p.set('s', state.config.scheduler);
  p.set('steal', String(clampSteal(state.config.stealPct)));
  p.set('mon', state.config.monitorOn ? '1' : '0');
  p.set('tab', state.tab);
  return `#${p.toString()}`;
}

export function decodeShare(hash: string): ShareState {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const s = p.get('s');
  const scheduler: SchedulerKind = SCHEDULERS.some((x) => x.id === s) ? (s as SchedulerKind) : DEFAULT_CONFIG.scheduler;
  const stealRaw = p.get('steal');
  const stealPct = stealRaw === null ? DEFAULT_CONFIG.stealPct : clampSteal(Number(stealRaw));
  const mon = p.get('mon');
  const monitorOn = mon === null ? DEFAULT_CONFIG.monitorOn : mon !== '0';
  const t = p.get('tab');
  const tab: Tab = TABS.includes(t as Tab) ? (t as Tab) : 'fly';
  return { config: { scheduler, stealPct, monitorOn }, tab };
}
