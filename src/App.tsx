import React, { useEffect, useState } from 'react';
import { useApp } from './state';
import Dashboard from './pages/Dashboard';
import Simulator from './pages/Simulator';
import Backtest from './pages/Backtest';
import Insights from './pages/Insights';
import DataPage from './pages/DataPage';
import { Spinner } from './components/primitives';

export type TabId = 'dashboard' | 'simulator' | 'backtest' | 'insights' | 'data';

interface TabMeta {
  id: TabId;
  label: string;
  short: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
}

const icon = (paths: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

export const TABS: TabMeta[] = [
  {
    id: 'dashboard',
    label: '总览',
    short: '总览',
    title: '总览',
    desc: '今天的模拟号码、最新开奖与对照进度',
    icon: icon(
      <>
        <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
      </>
    )
  },
  {
    id: 'simulator',
    label: '模拟摇号',
    short: '摇号',
    title: '模拟摇号',
    desc: '选期、摇号、归档，再与真实开奖逐期核对',
    icon: icon(
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
        <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
      </>
    )
  },
  {
    id: 'backtest',
    label: '策略回测',
    short: '回测',
    title: '策略回测',
    desc: '让热号、冷号、周期等思路在历史里跑一遍',
    icon: icon(
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M7 15l3.5-4 3 2.6L20 6.5" />
      </>
    )
  },
  {
    id: 'insights',
    label: '数据洞察',
    short: '洞察',
    title: '数据洞察',
    desc: '49 码分布、波色结构、和值与遗漏',
    icon: icon(
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5L21 21" />
      </>
    )
  },
  {
    id: 'data',
    label: '数据与设置',
    short: '数据',
    title: '数据与设置',
    desc: '同步状态、备份恢复与显示偏好',
    icon: icon(
      <>
        <ellipse cx="12" cy="6" rx="7.5" ry="3" />
        <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
        <path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
      </>
    )
  }
];

function readHash(): TabId {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return (TABS.find((t) => t.id === raw)?.id ?? 'dashboard') as TabId;
}

export default function App() {
  const { history, settings, actions, syncing, lastSync, toasts, loading, error } = useApp();
  const [tab, setTab] = useState<TabId>(() => readHash());

  useEffect(() => {
    const onHash = () => setTab(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (next: TabId) => {
    window.location.hash = `#/${next}`;
    setTab(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    document.title = `${TABS.find((t) => t.id === tab)?.title ?? '总览'} · 摇号实验室`;
  }, [tab]);

  const meta = TABS.find((t) => t.id === tab)!;
  const resolvedTheme =
    settings.theme === 'system'
      ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : settings.theme;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <circle cx="11" cy="11" r="4.6" fill="url(#g1)" />
              <circle cx="21.5" cy="14" r="3.4" fill="url(#g2)" />
              <circle cx="13.5" cy="22" r="3.1" fill="url(#g3)" />
              <defs>
                <linearGradient id="g1" x1="6" y1="6" x2="16" y2="16">
                  <stop stopColor="#ffd27a" />
                  <stop offset="1" stopColor="#f0a44b" />
                </linearGradient>
                <linearGradient id="g2" x1="18" y1="11" x2="25" y2="18">
                  <stop stopColor="#8fd0ff" />
                  <stop offset="1" stopColor="#3f7fe0" />
                </linearGradient>
                <linearGradient id="g3" x1="10" y1="19" x2="17" y2="26">
                  <stop stopColor="#7be3b6" />
                  <stop offset="1" stopColor="#0f9d74" />
                </linearGradient>
              </defs>
            </svg>
          </span>
          <span className="brand-copy">
            <strong>摇号实验室</strong>
            <em>DRAW LAB · v2.0</em>
          </span>
        </div>

        <nav className="nav" aria-label="主导航">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${tab === item.id ? 'is-active' : ''}`}
              onClick={() => navigate(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.id === 'data' && syncing ? <span className="nav-dot" /> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="sidebar-card-label">历史库</span>
          <strong>{history ? `${history.total.toLocaleString('zh-CN')} 期` : loading ? '载入中…' : '—'}</strong>
          <span>{history ? `${history.earliest.id} → ${history.latest.id}` : 'Number-selection-tool'}</span>
          <button type="button" className="sidebar-sync" onClick={() => void actions.sync()} disabled={syncing}>
            {syncing ? <Spinner size={12} /> : <span className="ping" />}
            {syncing ? '同步中' : '已同步'}
          </button>
        </div>

        <footer className="sidebar-foot">
          <span>数据源 Number-selection-tool</span>
          <span>{lastSync ? `同步 ${new Date(lastSync).toLocaleString('zh-CN', { hour12: false })}` : '使用内置快照'}</span>
        </footer>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-text">
            <h1>{meta.title}</h1>
            <p>{meta.desc}</p>
          </div>
          <div className="topbar-actions">
            {error ? <span className="top-error">{error}</span> : null}
            <span className="status-chip">
              <i className="status-dot" />
              {history ? `${history.latest.id} 期` : '数据加载中'}
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={() => actions.updateSettings({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' })}
              title={resolvedTheme === 'dark' ? '切换浅色' : '切换深色'}
              aria-label="切换主题"
            >
              {resolvedTheme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </header>

        {loading ? (
          <div className="page-loading">
            <Spinner size={22} />
            <span>正在载入历史库…</span>
          </div>
        ) : (
          <div className="page">
            {tab === 'dashboard' ? <Dashboard onNavigate={navigate} /> : null}
            {tab === 'simulator' ? <Simulator /> : null}
            {tab === 'backtest' ? <Backtest /> : null}
            {tab === 'insights' ? <Insights /> : null}
            {tab === 'data' ? <DataPage /> : null}
          </div>
        )}

        <footer className="app-foot">
          <span>© {new Date().getFullYear()} 摇号实验室 · 仅供娱乐与统计学习</span>
          <span className="foot-sep">·</span>
          <span>概率不会因为算法改变：特码 1/49，6+1 全中 1/49,000,000</span>
        </footer>
      </main>

      <nav className="tabbar" aria-label="底部导航">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tabbar-item ${tab === item.id ? 'is-active' : ''}`}
            onClick={() => navigate(item.id)}
          >
            {item.icon}
            <span>{item.short}</span>
          </button>
        ))}
      </nav>

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
