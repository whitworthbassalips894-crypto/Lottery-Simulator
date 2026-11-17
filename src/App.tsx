import { useEffect, useState } from 'react';
import { useApp } from './state';
import Today from './pages/Today';
import Records from './pages/Records';
import DataPage from './pages/DataPage';
import { Spinner } from './components/ui';

export type TabId = 'today' | 'records' | 'data';

const TABS: { id: TabId; label: string; desc: string }[] = [
  { id: 'today', label: '今日摇号', desc: '每天一注模拟号码，开奖后自动对照' },
  { id: 'records', label: '对照记录', desc: '最近 20 期的模拟与真实开奖逐期核对' },
  { id: 'data', label: '数据与设置', desc: '同步开奖、备份本机记录、显示偏好' }
];

function readHash(): TabId {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return TABS.some((t) => t.id === raw) ? (raw as TabId) : 'today';
}

export default function App() {
  const { history, settings, actions, syncing, loading, error, toasts, today } = useApp();
  const [tab, setTab] = useState<TabId>(() => readHash());
  const [focusDate, setFocusDate] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setTab(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const meta = TABS.find((t) => t.id === tab)!;
    document.title = `${meta.label} · 摇号实验室`;
  }, [tab]);

  const resolvedTheme =
    settings.theme === 'system'
      ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : settings.theme;

  const navigate = (next: TabId) => {
    if (next === 'today') setFocusDate(null);
    window.location.hash = `#/${next}`;
    setTab(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openPeriod = (date: string) => {
    setFocusDate(date);
    window.location.hash = '#/today';
    setTab('today');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <i className="dot dot-a" />
              <i className="dot dot-b" />
              <i className="dot dot-c" />
            </span>
            <span className="brand-text">
              <strong>摇号实验室</strong>
              <em>每天一注 6+1，看看运气</em>
            </span>
          </div>

          <nav className="tabs" aria-label="主导航">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? 'tab is-active' : 'tab'}
                onClick={() => navigate(item.id)}
                aria-current={tab === item.id ? 'page' : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="topbar-right">
            <span className="status">
              {syncing ? <Spinner size={11} /> : <i className="status-dot" />}
              {history ? `${history.latest.id}` : '载入中'}
            </span>
            <button
              type="button"
              className="btn btn-icon btn-secondary"
              onClick={() => actions.updateSettings({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' })}
              aria-label={resolvedTheme === 'dark' ? '切换到浅色' : '切换到深色'}
              title={resolvedTheme === 'dark' ? '浅色' : '深色'}
            >
              {resolvedTheme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="page-intro">
          <h1>{TABS.find((t) => t.id === tab)!.label}</h1>
          <p>{TABS.find((t) => t.id === tab)!.desc}</p>
        </div>

        {error ? <div className="banner">{error}</div> : null}

        {loading ? (
          <div className="loading">
            <Spinner size={18} />
            <span>正在载入历史库…</span>
          </div>
        ) : (
          <div className="page">
            {tab === 'today' ? <Today onOpenRecords={() => navigate('records')} focusDate={focusDate ?? today} /> : null}
            {tab === 'records' ? <Records onOpenPeriod={openPeriod} /> : null}
            {tab === 'data' ? <DataPage /> : null}
          </div>
        )}

        <footer className="foot">
          <span>仅供娱乐与统计学习 · 不提供投注建议</span>
          <span>特码 1/49 · 6+1 全中约 1/4,900 万</span>
        </footer>
      </main>

      <div className="toast-host" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
