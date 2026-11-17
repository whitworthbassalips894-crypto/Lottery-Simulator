/**
 * 历史库：内置快照 + 远端同步 + 本机手工补录
 * ------------------------------------------------------------------
 * 唯一真源：Number-selection-tool 仓库 data/draws.json
 * 浏览器端依次尝试 jsDelivr / raw / GitHub API / GitHub Pages，
 * 全部失败时仍可使用内置快照（离线可用）。
 */

import type { Draw, HistoryFile } from './types';
import { pad3 } from './lottery';

export const SOURCE = {
  repo: 'whitworthbassalips894-crypto/Number-selection-tool',
  path: 'data/draws.json',
  url: 'https://github.com/whitworthbassalips894-crypto/Number-selection-tool'
};

const CANDIDATES = [
  `https://cdn.jsdelivr.net/gh/${SOURCE.repo}@main/${SOURCE.path}`,
  `https://raw.githubusercontent.com/${SOURCE.repo}/main/${SOURCE.path}`,
  `https://api.github.com/repos/${SOURCE.repo}/contents/${SOURCE.path}?ref=main`,
  `https://whitworthbassalips894-crypto.github.io/Number-selection-tool/${SOURCE.path}`
];

function isNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 49;
}

/** 兼容两种结构：本工具精简格式 {id,date,n,s} 与上游原始格式 {year,periodNum,numbers,special} */
export function normalizeDraw(raw: any): Draw | null {
  if (!raw || typeof raw !== 'object') return null;
  let id = '';
  if (typeof raw.id === 'string' && /^\d{4}-\d{1,3}$/.test(raw.id)) {
    const [y, p] = raw.id.split('-');
    id = `${y}-${pad3(Number(p))}`;
  } else if (raw.year && raw.periodNum) {
    id = `${Number(raw.year)}-${pad3(Number(raw.periodNum))}`;
  } else if (raw.year && raw.period) {
    id = `${Number(raw.year)}-${pad3(Number(raw.period))}`;
  }
  const date = String(raw.date ?? raw.drawDate ?? '').slice(0, 10);
  const main: number[] = Array.isArray(raw.n) ? raw.n.slice(0, 6) : Array.isArray(raw.numbers) ? raw.numbers.slice(0, 6) : [];
  const special = Number(raw.s ?? raw.special);
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (main.length !== 6 || !main.every(isNum) || !isNum(special)) return null;
  if (new Set([...main, special]).size !== 7) return null;
  return { id, date, n: main.slice(), s: special };
}

export function normalizeHistory(payload: any): HistoryFile | null {
  const list: any[] = Array.isArray(payload) ? payload : Array.isArray(payload?.draws) ? payload.draws : [];
  if (!list.length) return null;
  const byId = new Map<string, Draw>();
  for (const item of list) {
    const draw = normalizeDraw(item);
    if (!draw) continue;
    const prev = byId.get(draw.id);
    if (!prev || prev.date < draw.date) byId.set(draw.id, draw);
  }
  const draws = [...byId.values()].sort((a, b) => (a.id < b.id ? 1 : -1));
  if (!draws.length) return null;
  const latest = draws[0];
  const earliest = draws[draws.length - 1];
  return {
    schema: 2,
    source: {
      repo: payload?.source?.repo ?? SOURCE.repo,
      path: payload?.source?.path ?? SOURCE.path,
      url: payload?.source?.url ?? SOURCE.url,
      upstreamUpdatedAt: payload?.source?.upstreamUpdatedAt ?? payload?.updatedAt ?? null,
      origin: payload?.source?.origin ?? 'remote',
      generatedAt: payload?.source?.generatedAt ?? new Date().toISOString()
    },
    total: draws.length,
    latest: { id: latest.id, date: latest.date },
    earliest: { id: earliest.id, date: earliest.date },
    draws
  };
}

const baseUrl = (): string => (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

export async function loadBundledHistory(): Promise<HistoryFile> {
  const res = await fetch(`${baseUrl()}/data/history.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`内置历史库读取失败（HTTP ${res.status}）`);
  const file = normalizeHistory(await res.json());
  if (!file) throw new Error('内置历史库格式异常');
  return file;
}

async function fetchWithTimeout(url: string, ms = 9000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (url.includes('api.github.com')) headers.accept = 'application/vnd.github.raw';
    const res = await fetch(url, { headers, signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export interface SyncOutcome {
  file: HistoryFile;
  origin: string;
  tried: { url: string; ok: boolean; error?: string }[];
}

/** 远端同步：逐个源尝试，全部失败抛出最后一次错误 */
export async function fetchRemoteHistory(): Promise<SyncOutcome> {
  const tried: SyncOutcome['tried'] = [];
  for (const url of CANDIDATES) {
    try {
      const payload = await fetchWithTimeout(url);
      const file = normalizeHistory(payload);
      if (!file) throw new Error('返回内容不含有效开奖记录');
      tried.push({ url, ok: true });
      return { file, origin: url, tried };
    } catch (err) {
      tried.push({ url, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const outcome = new Error('所有同步源都不可用') as Error & { tried: typeof tried };
  outcome.tried = tried;
  throw outcome;
}

/** 合并：按 id 去重，日期较新者胜出，结果按时间升序 */
export function mergeDraws(...groups: Draw[][]): Draw[] {
  const map = new Map<string, Draw>();
  groups.flat().forEach((draw) => {
    if (!draw) return;
    const prev = map.get(draw.id);
    if (!prev || prev.date <= draw.date) map.set(draw.id, draw);
  });
  return [...map.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export const rawSourceUrls = CANDIDATES;
