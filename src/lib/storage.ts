/** 本地存储：模拟注单、手工补录、设置、同步缓存 */

import { DEFAULT_SETTINGS, type Draw, type Settings, type SimRecord } from './types';

const KEYS = {
  sims: 'drawlab:v2:sims',
  overrides: 'drawlab:v2:overrides',
  settings: 'drawlab:v2:settings',
  remote: 'drawlab:v2:remote',
  lastSync: 'drawlab:v2:lastSync',
  bootstrapped: 'drawlab:v2:bootstrapped'
};

export interface RemoteCache {
  fetchedAt: string;
  origin: string;
  draws: Draw[];
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const store = {
  getSettings(): Settings {
    return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEYS.settings, {}) };
  },
  saveSettings(settings: Settings) {
    write(KEYS.settings, settings);
  },
  getSims(): SimRecord[] {
    const list = read<SimRecord[]>(KEYS.sims, []);
    return Array.isArray(list) ? list.filter((r) => r && r.period && Array.isArray(r.main)) : [];
  },
  saveSims(sims: SimRecord[]) {
    write(KEYS.sims, sims.slice(-1200));
  },
  getOverrides(): Draw[] {
    const list = read<Draw[]>(KEYS.overrides, []);
    return Array.isArray(list) ? list : [];
  },
  saveOverrides(list: Draw[]) {
    write(KEYS.overrides, list);
  },
  getRemoteCache(): RemoteCache | null {
    return read<RemoteCache | null>(KEYS.remote, null);
  },
  saveRemoteCache(cache: RemoteCache) {
    try {
      localStorage.setItem(KEYS.remote, JSON.stringify(cache));
    } catch {
      // 超配额时丢弃缓存，不影响主流程
      localStorage.removeItem(KEYS.remote);
    }
  },
  /** 是否已经做过「首次打开自动补齐最近 20 期」 */
  getBootstrapped(): boolean {
    return read<boolean>(KEYS.bootstrapped, false);
  },
  setBootstrapped(value: boolean) {
    write(KEYS.bootstrapped, value);
  },
  getLastSync(): string | null {
    return read<string | null>(KEYS.lastSync, null);
  },
  saveLastSync(iso: string) {
    write(KEYS.lastSync, iso);
  },
  clearAll() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  }
};
