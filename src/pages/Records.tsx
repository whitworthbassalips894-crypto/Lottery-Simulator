import { useMemo, useState } from 'react';
import { BallRow, Card, Chip, Empty, Segmented } from '../components/ui';
import { useApp } from '../state';
import { buildComparison, summarizeSims } from '../lib/analysis';
import { shortDate } from '../lib/periods';
import { BASELINE } from '../lib/stats';

const PAGE_SIZE = 10;

export default function Records({ onOpenPeriod }: { onOpenPeriod: (date: string) => void }) {
  const { sims, drawsAsc, actions } = useApp();
  const [filter, setFilter] = useState<'all' | 'settled' | 'pending'>('settled');
  const [page, setPage] = useState(1);

  const comparison = useMemo(() => buildComparison(sims, drawsAsc), [sims, drawsAsc]);
  const summary = useMemo(() => summarizeSims(comparison), [comparison]);

  const rows = useMemo(() => {
    const byPeriod = new Map(drawsAsc.map((d) => [d.id, d]));
    const list = sims
      .filter((s) => s.attempt === 0)
      .map((sim) => ({ sim, draw: byPeriod.get(sim.period) ?? null }))
      .sort((a, b) => (a.sim.period < b.sim.period ? 1 : -1));
    if (filter === 'settled') return list.filter((r) => r.draw);
    if (filter === 'pending') return list.filter((r) => !r.draw);
    return list;
  }, [sims, drawsAsc, filter]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const autoCount = sims.filter((s) => s.auto).length;

  return (
    <div className="stack">
      <div className="summary-grid">
        <div className="summary-cell">
          <span>已对照</span>
          <strong>{summary.periods}</strong>
          <em>期</em>
        </div>
        <div className="summary-cell">
          <span>特码命中</span>
          <strong>{summary.specialHits}</strong>
          <em>{(summary.specialRate * 100).toFixed(1)}%</em>
        </div>
        <div className="summary-cell">
          <span>主号均值</span>
          <strong>{summary.mainMean.toFixed(2)}</strong>
          <em>基线 {BASELINE.mainMean.toFixed(2)}</em>
        </div>
        <div className="summary-cell">
          <span>单期最好</span>
          <strong>{summary.bestMainHits}</strong>
          <em>个主号</em>
        </div>
      </div>

      <Card
        kicker="对照记录"
        title="模拟号码 vs 真实开奖"
        desc={
          autoCount
            ? `其中 ${autoCount} 期是首次打开时自动补齐的（按期号种子生成），可随时删除重摇。`
            : '每期一条模拟号码，开奖后自动核对主号与特码。'
        }
        actions={
          <Segmented
            label="筛选记录"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
            options={[
              { value: 'settled', label: '已开奖' },
              { value: 'pending', label: '待开奖' },
              { value: 'all', label: '全部' }
            ]}
          />
        }
        flush
      >
        {rows.length ? (
          <>
            <div className="table-wrap">
              <table className="flat-table">
                <thead>
                  <tr>
                    <th>期号 / 日期</th>
                    <th>模拟号码</th>
                    <th>真实开奖</th>
                    <th>结果</th>
                    <th aria-label="操作" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(({ sim, draw }) => {
                    const hit = draw
                      ? {
                          main: sim.main.filter((n) => draw.n.includes(n)),
                          mainHits: sim.main.filter((n) => draw.n.includes(n)).length,
                          special: sim.special === draw.s
                        }
                      : null;
                    return (
                      <tr key={sim.period} className={hit?.special ? 'row-hit' : ''}>
                        <td>
                          <div className="cell-period">
                            <strong>{sim.period}</strong>
                            <span>
                              {shortDate(sim.date)}
                              {sim.auto ? ' · 自动补齐' : ''}
                            </span>
                          </div>
                        </td>
                        <td>
                          <BallRow main={sim.main} special={sim.special} size="sm" matched={hit?.main ?? []} specialMatched={hit?.special} />
                        </td>
                        <td>
                          {draw ? (
                            <BallRow main={draw.n} special={draw.s} size="sm" />
                          ) : (
                            <span className="muted-text">待开奖</span>
                          )}
                        </td>
                        <td>
                          {hit ? (
                            <div className="result-cell">
                              <Chip tone={hit.mainHits >= 3 ? 'accent' : 'neutral'}>{hit.mainHits} 主号</Chip>
                              <span className={hit.special ? 'text-good' : 'muted-text'}>
                                {hit.special ? '特码中' : '特码未中'}
                              </span>
                            </div>
                          ) : (
                            <span className="muted-text">—</span>
                          )}
                        </td>
                        <td className="cell-actions">
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => onOpenPeriod(sim.date)}
                          >
                            查看
                          </button>
                          <button
                            type="button"
                            className="link-btn link-danger"
                            onClick={() => {
                              actions.removeSim(sim.period);
                              actions.toast(`已删除 ${sim.period} 的模拟号码`, 'info');
                            }}
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span>
                第 {current} / {pageCount} 页 · 共 {rows.length} 条
              </span>
              <div className="pager">
                <button type="button" className="btn btn-secondary btn-sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                  上一页
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={current >= pageCount}
                  onClick={() => setPage(current + 1)}
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="card-body">
            <Empty
              title={filter === 'pending' ? '没有待开奖的记录' : '还没有模拟记录'}
              desc="回到「今日摇号」摇一次，或到「数据」页补齐最近 20 期。"
            />
          </div>
        )}
      </Card>

      <p className="footnote">
        主号均值对照随机基线 {BASELINE.mainMean.toFixed(2)}（6 × 6/49）；特码随机基线 {(BASELINE.specialRate * 100).toFixed(2)}%。
        样本小的时候起落都正常，别把运气当规律。
      </p>
    </div>
  );
}
