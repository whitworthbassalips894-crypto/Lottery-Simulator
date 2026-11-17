import { useMemo, useRef, useState } from 'react';
import { Card, Chip, Empty, Segmented, Spinner, Toggle } from '../components/ui';
import { useApp } from '../state';
import { SOURCE, rawSourceUrls } from '../lib/history';
import { formatDate } from '../lib/periods';
import { buildComparison } from '../lib/analysis';

export default function DataPage() {
  const { history, drawsAsc, sims, overrides, settings, actions, syncing, lastSync, syncOrigin, usingCache } = useApp();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const comparison = useMemo(() => buildComparison(sims, drawsAsc), [sims, drawsAsc]);
  const lastSyncText = lastSync ? new Date(lastSync).toLocaleString('zh-CN', { hour12: false }) : '尚未同步';

  const download = () => {
    const blob = new Blob([actions.exportBackup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drawlab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    actions.toast('备份已导出', 'success');
  };

  const handleImport = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const result = actions.importBackup(JSON.parse(await file.text()));
      setImportMsg(result.message);
      actions.toast(result.message, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : '导入失败';
      setImportMsg(message);
      actions.toast(message, 'error');
    }
  };

  return (
    <div className="stack">
      <Card
        kicker="数据源"
        title="开奖数据来自 Number-selection-tool"
        desc="构建时打包一份快照，打开页面时自动向 CDN / raw / GitHub API 依次请求最新数据；全部失败也能离线使用。"
        actions={<Chip tone={usingCache ? 'warn' : 'success'} dot>{usingCache ? '本机缓存' : '在线'}</Chip>}
      >
        <dl className="info-list">
          <div>
            <dt>仓库</dt>
            <dd>
              <a href={SOURCE.url} target="_blank" rel="noreferrer">
                {SOURCE.repo} ↗
              </a>
            </dd>
          </div>
          <div>
            <dt>最新一期</dt>
            <dd>
              {history?.latest.id ?? '—'} · {history?.latest.date ? formatDate(history.latest.date) : '—'}
            </dd>
          </div>
          <div>
            <dt>记录总数</dt>
            <dd>
              {history ? history.total.toLocaleString('zh-CN') : '—'} 期（{history?.earliest.id} → {history?.latest.id}）
            </dd>
          </div>
          <div>
            <dt>上次同步</dt>
            <dd>{lastSyncText}</dd>
          </div>
          <div>
            <dt>当前来源</dt>
            <dd className="mono small">{syncOrigin ?? history?.source.origin ?? '内置快照'}</dd>
          </div>
        </dl>

        <div className="action-row">
          <button type="button" className="btn btn-primary" onClick={() => void actions.sync()} disabled={syncing}>
            {syncing ? <Spinner /> : null}
            {syncing ? '同步中…' : '同步最新开奖'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const added = actions.backfillRecent(20);
              actions.toast(added ? `已补齐 ${added} 期` : '最近 20 期都已有记录', added ? 'success' : 'info');
            }}
          >
            补齐最近 20 期
          </button>
          <a className="btn btn-quiet" href="./legacy.html" target="_blank" rel="noreferrer">
            旧版单文件
          </a>
        </div>

        <details className="source-detail">
          <summary>同步源与回退顺序</summary>
          <ol>
            {rawSourceUrls.map((url) => (
              <li key={url}>
                <code>{url.replace('https://', '')}</code>
              </li>
            ))}
          </ol>
        </details>
      </Card>

      <div className="two-col">
        <Card kicker="本机数据" title="备份与恢复" desc="模拟记录只存在这台设备的浏览器里。">
          <div className="mini-stats">
            <div>
              <span>模拟记录</span>
              <strong>{sims.length}</strong>
            </div>
            <div>
              <span>可对照</span>
              <strong>{comparison.length}</strong>
            </div>
            <div>
              <span>手工补录</span>
              <strong>{overrides.length}</strong>
            </div>
          </div>
          <div className="action-row">
            <button type="button" className="btn btn-secondary" onClick={download}>
              导出 JSON
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
              导入 JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => void handleImport(e.target.files?.[0])}
            />
          </div>
          {importMsg ? <p className="footnote">{importMsg}</p> : null}

          <div className="danger-zone">
            <span>清空本机数据（模拟记录、补录、缓存与设置）</span>
            {confirmClear ? (
              <div className="action-row">
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    actions.clearLocal();
                    setConfirmClear(false);
                    actions.toast('已清空本机数据', 'info');
                  }}
                >
                  确认清空
                </button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirmClear(false)}>
                  取消
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-danger-quiet btn-sm" onClick={() => setConfirmClear(true)}>
                清空
              </button>
            )}
          </div>
        </Card>

        <Card kicker="偏好" title="显示与同步" desc="设置只保存在本机。">
          <div className="field-block">
            <span className="field-label">主题</span>
            <Segmented
              label="主题"
              value={settings.theme}
              onChange={(theme) => actions.updateSettings({ theme })}
              options={[
                { value: 'light', label: '浅色' },
                { value: 'dark', label: '深色' },
                { value: 'system', label: '跟随系统' }
              ]}
            />
          </div>
          <Toggle
            checked={settings.autoSync}
            onChange={(autoSync) => actions.updateSettings({ autoSync })}
            label="打开页面时自动同步"
            desc="超过 6 小时未同步才请求"
          />
          <Toggle
            checked={settings.showZodiac}
            onChange={(showZodiac) => actions.updateSettings({ showZodiac })}
            label="号码显示生肖"
          />
          <Toggle
            checked={settings.reduceMotion}
            onChange={(reduceMotion) => actions.updateSettings({ reduceMotion })}
            label="减少动画"
            desc="摇号时直接给出结果"
          />
        </Card>
      </div>

      <Card
        kicker="手工补录"
        title="本机补录的开奖结果"
        desc="上游延迟时可以自己录入，会覆盖同期的内置数据。"
        flush={!overrides.length}
      >
        {overrides.length ? (
          <div className="table-wrap">
            <table className="flat-table">
              <thead>
                <tr>
                  <th>期号</th>
                  <th>日期</th>
                  <th>号码</th>
                  <th aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {overrides
                  .slice()
                  .sort((a, b) => (a.id < b.id ? 1 : -1))
                  .map((draw) => (
                    <tr key={draw.id}>
                      <td className="mono">{draw.id}</td>
                      <td>{formatDate(draw.date)}</td>
                      <td>
                        <span className="mono">
                          {[...draw.n, draw.s].map((n) => String(n).padStart(2, '0')).join(' · ')}
                        </span>
                      </td>
                      <td className="cell-actions">
                        <button
                          type="button"
                          className="link-btn link-danger"
                          onClick={() => {
                            actions.deleteOverride(draw.id);
                            actions.toast('已删除补录', 'info');
                          }}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="没有手工补录" />
        )}
      </Card>

      <p className="footnote">
        本工具只做模拟与对照：特码概率恒为 1/49（≈2.04%），6+1 全中约 1/4,900 万，任何选号方法都改变不了它。理性娱乐。
      </p>
    </div>
  );
}
