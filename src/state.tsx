import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchRemoteHistory,
  loadBundledHistory,
  mergeDraws,
  normalizeHistory
} from './lib/history';
import { store } from './lib/storage';
import { DEFAULT_SETTINGS, type Draw, type HistoryFile, type Settings, type SimRecord } from './lib/types';
import { localDateKey, nextPeriod } from './lib/periods';
import { simulateTicket } from './lib/rng';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface AppContextValue {
  history: HistoryFile | null;
  drawsAsc: Draw[];
  overrides: Draw[];
  sims: SimRecord[];
  settings: Settings;
  loading: boolean;
  error: string | null;
  syncing: boolean;
  lastSync: string | null;
  syncOrigin: string | null;
  usingCache: boolean;
  today: string;
  nextMeta: ReturnType<typeof nextPeriod>;
  toasts: ToastItem[];
  actions: {
    sync: () => Promise<void>;
    archiveSim: (record: SimRecord) => void;
    removeSim: (period: string) => void;
    saveOverride: (draw: Draw) => void;
    deleteOverride: (id: string) => void;
    updateSettings: (patch: Partial<Settings>) => void;
    backfillRecent: (count?: number) => number;
    importBackup: (payload: unknown) => { imported: number; message: string };
    exportBackup: () => string;
    clearLocal: () => void;
    toast: (message: string, tone?: ToastTone) => void;
  };
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [bundled, setBundled] = useState<HistoryFile | null>(null);
  const [remoteDraws, setRemoteDraws] = useState<Draw[]>([]);
  const [overrides, setOverrides] = useState<Draw[]>(() => store.getOverrides());
  const [sims, setSims] = useState<SimRecord[]>(() => store.getSims());
  const [settings, setSettings] = useState<Settings>(() => store.getSettings());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(() => store.getLastSync());
  const [syncOrigin, setSyncOrigin] = useState<string | null>(null);
  const [usingCache, setUsingCache] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);
  const [today, setToday] = useState(() => localDateKey());

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  // 首次加载：内置快照 → 本机缓存 → 远端（可选）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = store.getRemoteCache();
        if (cached?.draws?.length) {
          setRemoteDraws(cached.draws);
          setUsingCache(true);
          setSyncOrigin(cached.origin);
        }
        const file = await loadBundledHistory();
        if (cancelled) return;
        setBundled(file);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '历史库加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const outcome = await fetchRemoteHistory();
      const draws = outcome.file.draws;
      setRemoteDraws(draws);
      setSyncOrigin(outcome.origin);
      setUsingCache(false);
      const fetchedAt = new Date().toISOString();
      store.saveRemoteCache({ fetchedAt, origin: outcome.origin, draws });
      store.saveLastSync(fetchedAt);
      setLastSync(fetchedAt);
      toast(`同步成功：${outcome.file.total} 期，最新 ${outcome.file.latest.id}`, 'success');
    } catch (err) {
      const detail =
        err && typeof err === 'object' && 'tried' in err
          ? (err as { tried: { url: string; error?: string }[] }).tried
              .map((t) => `${new URL(t.url).host}：${t.error ?? '失败'}`)
              .join('；')
          : err instanceof Error
            ? err.message
            : String(err);
      toast(`同步失败，继续使用本地数据。${detail}`, 'error');
    } finally {
      setSyncing(false);
    }
  }, [toast]);

  // 自动同步（不阻塞首屏）
  const autoSyncDone = useRef(false);
  useEffect(() => {
    if (!settings.autoSync || autoSyncDone.current || loading) return;
    autoSyncDone.current = true;
    const cachedAt = store.getRemoteCache()?.fetchedAt;
    const fresh = cachedAt && Date.now() - new Date(cachedAt).getTime() < 6 * 60 * 60 * 1000;
    if (!fresh) void sync();
  }, [settings.autoSync, loading, sync]);

  // 主题
  useEffect(() => {
    store.saveSettings(settings);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    if (settings.theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings]);

  // 跨零点后刷新「今天」
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = localDateKey();
      setToday((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const drawsAsc = useMemo(() => {
    const base = bundled ? bundled.draws : [];
    return mergeDraws(base, remoteDraws, overrides);
  }, [bundled, remoteDraws, overrides]);

  const history = useMemo<HistoryFile | null>(() => {
    if (!drawsAsc.length) return bundled;
    const desc = drawsAsc.slice().reverse();
    const latest = desc[0];
    const earliest = desc[desc.length - 1];
    const base = bundled;
    return {
      schema: 2,
      source: {
        repo: base?.source.repo ?? 'whitworthbassalips894-crypto/Number-selection-tool',
        path: base?.source.path ?? 'data/draws.json',
        url: base?.source.url ?? 'https://github.com/whitworthbassalips894-crypto/Number-selection-tool',
        upstreamUpdatedAt: base?.source.upstreamUpdatedAt ?? null,
        origin: syncOrigin ?? base?.source.origin ?? 'bundled',
        generatedAt: base?.source.generatedAt ?? new Date().toISOString()
      },
      total: desc.length,
      latest: { id: latest.id, date: latest.date },
      earliest: { id: earliest.id, date: earliest.date },
      draws: desc
    };
  }, [drawsAsc, bundled, syncOrigin]);

  const nextMeta = useMemo(() => nextPeriod(history?.latest), [history?.latest]);

  const archiveSim = useCallback((record: SimRecord) => {
    setSims((prev) => {
      const next = prev.filter((r) => !(r.period === record.period && r.attempt === record.attempt)).concat(record);
      store.saveSims(next);
      return next;
    });
  }, []);

  const removeSim = useCallback((period: string) => {
    setSims((prev) => {
      const next = prev.filter((r) => r.period !== period);
      store.saveSims(next);
      return next;
    });
  }, []);

  /** 用期号种子补齐最近 N 期（默认 20 期）的模拟号码，用于立即对照 */
  const backfillRecent = useCallback(
    (count = 20) => {
      const settled = drawsAsc.slice(-count);
      if (!settled.length) return 0;
      const has = new Set(sims.filter((s) => s.attempt === 0).map((s) => s.period));
      const created = settled
        .filter((draw) => !has.has(draw.id))
        .map((draw) => {
          const ticket = simulateTicket(draw.id, 0);
          return {
            period: draw.id,
            date: draw.date,
            attempt: 0,
            main: ticket.main,
            special: ticket.special,
            createdAt: new Date().toISOString(),
            auto: true
          } satisfies SimRecord;
        });
      if (!created.length) return 0;
      const next = sims.concat(created).sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : a.attempt - b.attempt));
      setSims(next);
      store.saveSims(next);
      return created.length;
    },
    [drawsAsc, sims]
  );

  // 首次打开：自动补齐最近 20 期，让「对照」立刻有内容
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (loading || !drawsAsc.length || bootstrapped.current) return;
    bootstrapped.current = true;
    if (store.getBootstrapped()) return;
    const added = backfillRecent(20);
    store.setBootstrapped(true);
    if (added) toast(`已自动补齐最近 ${added} 期的模拟号码，可直接对照`, 'success');
  }, [backfillRecent, drawsAsc.length, loading, toast]);

  const saveOverride = useCallback((draw: Draw) => {
    setOverrides((prev) => {
      const next = prev.filter((r) => r.id !== draw.id).concat(draw);
      store.saveOverrides(next);
      return next;
    });
  }, []);

  const deleteOverride = useCallback((id: string) => {
    setOverrides((prev) => {
      const next = prev.filter((r) => r.id !== id);
      store.saveOverrides(next);
      return next;
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const exportBackup = useCallback(() => {
    return JSON.stringify(
      {
        schema: 'drawlab-2',
        exportedAt: new Date().toISOString(),
        settings,
        sims,
        overrides,
        source: history?.source ?? null,
        latest: history?.latest ?? null
      },
      null,
      2
    );
  }, [settings, sims, overrides, history]);

  const importBackup = useCallback(
    (payload: unknown) => {
      if (!payload || typeof payload !== 'object') throw new Error('备份文件格式无法识别');
      const data = payload as Record<string, any>;
      let imported = 0;

      const incomingSims: SimRecord[] = Array.isArray(data.sims)
        ? data.sims
            .map((r: any) => ({
              period: String(r.period ?? r.id ?? ''),
              date: String(r.date ?? ''),
              attempt: Number(r.attempt ?? 0),
              main: Array.isArray(r.main) ? r.main.map(Number) : Array.isArray(r.numbers) ? r.numbers.slice(0, 6).map(Number) : [],
              special: Number(r.special ?? r.s ?? 0),
              createdAt: String(r.createdAt ?? new Date().toISOString())
            }))
            .filter((r: SimRecord) => /^\d{4}-\d{3}$/.test(r.period) && r.main.length === 6)
        : [];
      if (incomingSims.length) {
        setSims((prev) => {
          const map = new Map(prev.map((r) => [`${r.period}#${r.attempt}`, r]));
          incomingSims.forEach((r) => map.set(`${r.period}#${r.attempt}`, r));
          const next = [...map.values()].sort((a, b) => (a.period < b.period ? -1 : 1));
          store.saveSims(next);
          return next;
        });
        imported += incomingSims.length;
      }

      const incomingOverrides: Draw[] = Array.isArray(data.overrides) ? data.overrides : [];
      const normalized = incomingOverrides
        .map((d) => normalizeHistory({ draws: [d] })?.draws[0])
        .filter((d): d is Draw => Boolean(d));
      if (normalized.length) {
        setOverrides((prev) => {
          const map = new Map(prev.map((d) => [d.id, d]));
          normalized.forEach((d) => map.set(d.id, d));
          const next = [...map.values()];
          store.saveOverrides(next);
          return next;
        });
        imported += normalized.length;
      }

      if (data.settings && typeof data.settings === 'object') {
        setSettings((prev) => ({ ...prev, ...data.settings, theme: prev.theme }));
      }

      return {
        imported,
        message: imported ? `已导入 ${imported} 条本地记录` : '文件里没有可导入的模拟记录'
      };
    },
    []
  );

  const clearLocal = useCallback(() => {
    store.clearAll();
    setSims([]);
    setOverrides([]);
    setRemoteDraws([]);
    setLastSync(null);
    setSyncOrigin(null);
    setUsingCache(false);
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  const value: AppContextValue = {
    history,
    drawsAsc,
    overrides,
    sims,
    settings,
    loading,
    error,
    syncing,
    lastSync,
    syncOrigin,
    usingCache,
    today,
    nextMeta,
    toasts,
    actions: {
      sync,
      archiveSim,
      backfillRecent,
      removeSim,
      saveOverride,
      deleteOverride,
      updateSettings,
      importBackup,
      exportBackup,
      clearLocal,
      toast
    }
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用');
  return ctx;
}
