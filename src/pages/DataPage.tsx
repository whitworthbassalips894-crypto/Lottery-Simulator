import { useMemo, useRef, useState } from 'react';
import { Badge, EmptyState, Panel, Segmented, Spinner, Toggle } from '../components/primitives';
import { useApp } from '../state';
import { SOURCE, rawSourceUrls } from '../lib/history';
import { formatDate } from '../lib/periods';
import { buildComparison } from '../lib/analysis';
import { copyText } from '../lib/clipboard';

export default function DataPage() {
  const { history, drawsAsc, sims, overrides, settings, actions, syncing, lastSync, syncOrigin, usingCache } = useApp();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const comparison = useMemo(() => buildComparison(sims, drawsAsc), [sims, drawsAsc]);
  const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

  const download = () => {
    const blob = new Blob([actions.exportBackup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drawlab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    actions.toast('备份已导出（含模拟记录与设置）', 'success');
  };

  const handleImport = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const result = actions.importBackup(payload);
      setImportResult(result.message);
      actions.toast(result.message, 'success');
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : '导入失败');
      actions.toast(err instanceof Error ? err.message : '导入失败', 'error');
    }
  };

  const lastSyncText = lastSync ? new Date(lastSync).toLocaleString('zh-CN', { hour12: false }) : '尚未同步';
  const upstreamText = history?.source.upstreamUpdatedAt
    ? new Date(history.source.upstreamUpdatedAt).toLocaleString('zh-CN', { hour12: false })
    : '未知';

  return (
    <div className="page-stack">
      <Panel
        kicker="DATA SOURCE · 数据源"
        title="历史库来自 Number-selection-tool"
        desc="唯一真源是该仓库的 data/draws.json；本站在构建时打包快照，运行时自动向 CDN / raw / GitHub API 依次请求最新数据。"
        actions={<Badge tone={usingCache ? 'warn' : 'success'} dot>{usingCache ? '本机缓存' : '在线'}</Badge>}
      >
        <div className="source-grid">
          <div className="source-card">
            <span className="source-label">仓库</span>
            <a href={SOURCE.url} target="_blank" rel="noreferrer" className="source-link">
              {SOURCE.repo} ↗
            </a>
            <code className="source-path">{SOURCE.path}</code>
          </div>
          <div className="source-card">
            <span className="source-label">最新一期</span>
            <strong>{history?.latest.id ?? '—'}</strong>
            <span className="source-sub">{history?.latest.date ? formatDate(history.latest.date) : '—'}</span>
          </div>
          <div className="source-card">
            <span className="source-label">记录总数</span>
            <strong>{history ? history.total.toLocaleString('zh-CN') : '—'} 期</strong>
            <span className="source-sub">
              {history ? `${history.earliest.id} → ${history.latest.id}` : '加载中'}
            </span>
          </div>
          <div className="source-card">
            <span className="source-label">上游更新</span>
            <strong className="source-time">{upstreamText}</strong>
            <span className="source-sub">本地同步：{lastSyncText}</span>
          </div>
        </div>

        <div className="sync-row">
          <button type="button" className="btn btn-primary" onClick={() => void actions.sync()} disabled={syncing}>
            {syncing ? <Spinner /> : null}
            {syncing ? '同步中…' : '立即同步最新开奖'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              const ok = await copyText(`${location.origin}${location.pathname}`);
              actions.toast(ok ? '站点地址已复制' : '复制失败', ok ? 'success' : 'error');
            }}
          >
            复制站点地址
          </button>
          <a className="btn btn-quiet" href={`${baseUrl}/legacy.html`} target="_blank" rel="noreferrer">
            打开旧版单文件
          </a>
        </div>

        <div className="sync-detail">
          <div>
            <span>当前来源</span>
            <code>{syncOrigin ?? history?.source.origin ?? '内置快照'}</code>
          </div>
          <div>
            <span>尝试顺序</span>
            <ul>
              {rawSourceUrls.map((url) => (
                <li key={url}>
                  <code>{url.replace('https://', '')}</code>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="page-note">
          仓库的开奖数据由 GitHub Actions 定时抓取上游并提交；本站同步只读，不会修改源仓库。同步失败时仍可使用内置快照（
          {history?.total ?? '—'} 期）。
        </p>
      </Panel>

      <div className="split-grid">
        <Panel kicker="LOCAL DATA · 本机数据" title="备份与恢复" desc="模拟记录只存在这台设备的浏览器里，换设备请先导出。">
          <div className="local-stats">
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
          <div className="button-row">
            <button type="button" className="btn btn-primary" onClick={download}>
              导出备份 JSON
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
              导入备份
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => void handleImport(e.target.files?.[0])}
            />
          </div>
          {importResult ? <p className="hint-line">{importResult}</p> : null}
          <div className="danger-zone">
            <div>
              <strong>清空本机数据</strong>
              <span>会删除模拟记录、补录、同步缓存与设置，不影响源仓库。</span>
            </div>
            {confirmClear ? (
              <div className="confirm-row">
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
        </Panel>

        <Panel kicker="PREFERENCES · 偏好" title="显示与同步" desc="设置只保存在本机。">
          <div className="settings-block">
            <span className="config-label">主题</span>
            <Segmented
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
            desc="超过 6 小时未同步才会发起请求"
          />
          <Toggle
            checked={settings.showZodiac}
            onChange={(showZodiac) => actions.updateSettings({ showZodiac })}
            label="号码显示生肖"
            desc="按农历年精确轮换，关闭可让界面更干净"
          />
          <Toggle
            checked={settings.reduceMotion}
            onChange={(reduceMotion) => actions.updateSettings({ reduceMotion })}
            label="减少动画"
            desc="摇号时直接给出结果，不做跳动动画"
          />
        </Panel>
      </div>

      <Panel
        kicker="OVERRIDES · 手工补录"
        title="本机补录的开奖结果"
        desc="当上游还没更新、但你已经知道开奖号码时，可以在这里核对。补录会覆盖同期的内置数据。"
        padded={!overrides.length}
      >
        {overrides.length ? (
          <div className="table-wrap">
            <table className="data-table">
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
                        <div className="override-balls">
                          {[...draw.n, draw.s].map((n, i) => (
                            <span key={n} className={`mini-num wave-${i === 6 ? 'special' : ''}`}>
                              {String(n).padStart(2, '0')}
                            </span>
                          ))}
                        </div>
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
          <EmptyState title="没有手工补录" desc="实时同步通常就够了；遇到上游延迟时再手动补录。" />
        )}
      </Panel>

      <Panel kicker="ABOUT · 关于" title="免责声明与数据说明">
        <div className="about-grid">
          <div>
            <strong>娱乐与研究用途</strong>
            <p>
              本站是「模拟摇号 + 历史对照 + 策略回测」工具，不售卖彩票、不提供投注建议。任何号码的出现概率在数学上都被固定为
              1/49 的特码与 6/49 的主号，历史数据无法改变这一点。
            </p>
          </div>
          <div>
            <strong>数据版权</strong>
            <p>
              开奖数据整理自公开渠道，经 Number-selection-tool 仓库清洗；本工具只读取、不写回。若发现期号或号码异常，请优先在源仓库修正。
            </p>
          </div>
          <div>
            <strong>技术栈</strong>
            <p>React + TypeScript + Vite，纯静态部署，无后端、无账号、无追踪。回测在 Web Worker 内完成，不阻塞界面。</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
