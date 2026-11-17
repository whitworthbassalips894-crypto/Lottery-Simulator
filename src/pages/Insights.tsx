import { useMemo, useState } from 'react';
import { BallRow, Badge, EmptyState, Panel, Segmented } from '../components/primitives';
import { DistributionBars, Heatmap, LineChart } from '../components/charts';
import { useApp } from '../state';
import {
  frequency,
  mean,
  parityDistribution,
  sizeDistribution,
  sumSeries,
  tailDistribution,
  waveDistribution,
  zoneDistribution
} from '../lib/stats';
import { shapeOf, pad2, waveOf, WAVE_LABELS, zodiacOf, ZODIACS } from '../lib/lottery';
import { formatDate } from '../lib/periods';

const RANGES = [
  { value: 30, label: '近 30 期' },
  { value: 100, label: '近 100 期' },
  { value: 300, label: '近 300 期' },
  { value: 0, label: '全部期数' }
];

export default function Insights() {
  const { drawsAsc, history } = useApp();
  const [range, setRange] = useState(100);
  const [heatMode, setHeatMode] = useState<'frequency' | 'omission'>('frequency');
  const [selected, setSelected] = useState<number | null>(null);
  const [year, setYear] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const windowDraws = useMemo(() => (range > 0 ? drawsAsc.slice(-range) : drawsAsc), [drawsAsc, range]);
  const rows = useMemo(() => frequency(windowDraws), [windowDraws]);
  const latest = drawsAsc[drawsAsc.length - 1] ?? null;

  const hotList = useMemo(() => rows.slice().sort((a, b) => b.count - a.count).slice(0, 8), [rows]);
  const coldList = useMemo(() => rows.slice().sort((a, b) => b.omission - a.omission).slice(0, 8), [rows]);

  const selectedRow = selected ? rows.find((r) => r.number === selected) ?? null : null;

  const waves = useMemo(() => waveDistribution(windowDraws), [windowDraws]);
  const parity = useMemo(() => parityDistribution(windowDraws), [windowDraws]);
  const sizes = useMemo(() => sizeDistribution(windowDraws), [windowDraws]);
  const zones = useMemo(() => zoneDistribution(windowDraws), [windowDraws]);
  const tails = useMemo(() => tailDistribution(windowDraws), [windowDraws]);

  const zodiacs = useMemo(() => {
    const counts = new Map<string, number>(ZODIACS.map((z) => [z, 0]));
    windowDraws.forEach((draw) => {
      [...draw.n, draw.s].forEach((n) => {
        const z = zodiacOf(n, draw.date);
        counts.set(z, (counts.get(z) ?? 0) + 1);
      });
    });
    const max = Math.max(1, ...counts.values());
    return ZODIACS.map((z) => ({ label: z, count: counts.get(z) ?? 0, max }));
  }, [windowDraws]);

  const sumData = useMemo(() => sumSeries(drawsAsc.slice(-60)), [drawsAsc]);
  const avgSum = useMemo(() => mean(sumData), [sumData]);
  const repeated = useMemo(() => {
    const slice = drawsAsc.slice(-Math.min(60, drawsAsc.length));
    const values: number[] = [];
    for (let i = 1; i < slice.length; i++) {
      const prev = new Set(slice[i - 1].n);
      values.push(slice[i].n.filter((n) => prev.has(n)).length);
    }
    return { avg: mean(values), values };
  }, [drawsAsc]);

  const years = useMemo(() => {
    const set = new Set<string>();
    drawsAsc.forEach((d) => set.add(d.id.slice(0, 4)));
    return [...set].sort((a, b) => Number(b) - Number(a));
  }, [drawsAsc]);

  const filteredDraws = useMemo(() => {
    const list = drawsAsc
      .slice()
      .reverse()
      .filter((d) => (year === 'all' ? true : d.id.startsWith(year)))
      .filter((d) => (query ? d.id.includes(query.trim()) : true));
    return list;
  }, [drawsAsc, year, query]);

  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filteredDraws.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageDraws = filteredDraws.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (!drawsAsc.length) {
    return (
      <Panel title="暂无历史数据" kicker="INSIGHTS">
        <EmptyState title="历史库还没加载" desc="请稍等，或到「数据与设置」手动同步。" />
      </Panel>
    );
  }

  return (
    <div className="page-stack">
      <Panel
        kicker="INSIGHTS · 数据洞察"
        title="号码结构与分布"
        desc="所有统计只描述过去，不预测下一期。样本越大越接近理论均匀分布。"
        actions={
          <Segmented
            size="sm"
            value={range}
            onChange={(v) => setRange(v)}
            ariaLabel="统计区间"
            options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
          />
        }
      >
        <div className="insight-top">
          <div className="heat-wrap">
            <div className="heat-head">
              <div>
                <strong>49 码分布网格</strong>
                <span>颜色越深 = {heatMode === 'frequency' ? '出现越频繁' : '遗漏期数越大'}</span>
              </div>
              <Segmented
                size="sm"
                value={heatMode}
                onChange={(v) => setHeatMode(v)}
                options={[
                  { value: 'frequency', label: '出现次数' },
                  { value: 'omission', label: '当前遗漏' }
                ]}
              />
            </div>
            <Heatmap rows={rows} mode={heatMode} selected={selected} onSelect={(n) => setSelected(n === selected ? null : n)} />
            <div className="heat-legend">
              <span>
                <i className="heat-swatch" style={{ opacity: 0.15 }} /> 低
              </span>
              <span>
                <i className="heat-swatch" style={{ opacity: 0.5 }} /> 中
              </span>
              <span>
                <i className="heat-swatch" style={{ opacity: 1 }} /> 高
              </span>
              <span className="heat-tip">点击号码查看详情</span>
            </div>
          </div>

          <aside className="number-detail">
            {selectedRow ? (
              <>
                <div className="detail-head">
                  <span className={`detail-ball ball-${waveOf(selectedRow.number)}`}>{pad2(selectedRow.number)}</span>
                  <div>
                    <strong>{pad2(selectedRow.number)} 号</strong>
                    <span>
                      {WAVE_LABELS[waveOf(selectedRow.number)]} · {zodiacOf(selectedRow.number, latest.date)} ·{' '}
                      {selectedRow.number <= 16 ? '一区' : selectedRow.number <= 33 ? '二区' : '三区'}
                    </span>
                  </div>
                </div>
                <dl className="detail-stats">
                  <div>
                    <dt>出现次数</dt>
                    <dd>{selectedRow.count}</dd>
                  </div>
                  <div>
                    <dt>当前遗漏</dt>
                    <dd>{selectedRow.omission} 期</dd>
                  </div>
                  <div>
                    <dt>特码次数</dt>
                    <dd>{selectedRow.specialCount}</dd>
                  </div>
                  <div>
                    <dt>平均间隔</dt>
                    <dd>{selectedRow.count ? (windowDraws.length / selectedRow.count).toFixed(1) : '—'} 期</dd>
                  </div>
                </dl>
                <p className="detail-note">
                  {selectedRow.omission > 2 * (windowDraws.length / 7)
                    ? '当前遗漏明显长于平均间隔，但「该出了」是错觉。'
                    : '遗漏处于正常范围，符合随机分布。'}
                </p>
              </>
            ) : (
              <div className="detail-empty">
                <strong>选择一个号码</strong>
                <p>查看它的出现次数、遗漏与间隔。号码颜色沿用红／蓝／绿波。</p>
              </div>
            )}

            <div className="detail-lists">
              <div>
                <span className="config-label">最热 8 码</span>
                <ul className="num-chips">
                  {hotList.map((r) => (
                    <li key={r.number}>
                      <button type="button" onClick={() => setSelected(r.number)} className={`num-chip ball-${waveOf(r.number)}`}>
                        {pad2(r.number)}
                        <em>{r.count}</em>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="config-label">遗漏最久 8 码</span>
                <ul className="num-chips">
                  {coldList.map((r) => (
                    <li key={r.number}>
                      <button type="button" onClick={() => setSelected(r.number)} className={`num-chip ball-${waveOf(r.number)}`}>
                        {pad2(r.number)}
                        <em>{r.omission}</em>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </Panel>

      <div className="split-grid">
        <Panel kicker="STRUCTURE · 结构" title="波色 / 单双 / 大小" desc={`统计 ${windowDraws.length} 期的全部 7 个号码。`}>
          <div className="dist-block">
            <span className="config-label">波色分布</span>
            <DistributionBars
              data={waves.map((w) => ({ ...w, color: `var(--wave-${w.key})` }))}
              max={Math.max(...waves.map((w) => w.count))}
            />
          </div>
          <div className="dist-split">
            <div>
              <span className="config-label">单双</span>
              <DistributionBars data={parity} max={Math.max(...parity.map((p) => p.count))} />
            </div>
            <div>
              <span className="config-label">大小</span>
              <DistributionBars data={sizes} max={Math.max(...sizes.map((p) => p.count))} />
            </div>
          </div>
        </Panel>

        <Panel kicker="ZONES · 区间" title="三区 · 尾数 · 生肖" desc="用于判断号码是否集中在某个区间、尾数或生肖。">
          <div className="dist-block">
            <span className="config-label">三区分布</span>
            <DistributionBars data={zones} max={Math.max(...zones.map((z) => z.count))} tone="good" />
          </div>
          <div className="dist-block">
            <span className="config-label">尾数分布</span>
            <ul className="tail-grid">
              {tails.map((t) => (
                <li key={t.key}>
                  <span className="tail-label">尾{t.key}</span>
                  <span className="tail-bar">
                    <span style={{ width: `${(t.count / Math.max(...tails.map((x) => x.count))) * 100}%` }} />
                  </span>
                  <span className="tail-count">{t.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="dist-block">
            <span className="config-label">生肖分布（按开奖当天农历年）</span>
            <ul className="zodiac-grid">
              {zodiacs.map((z) => (
                <li key={z.label} title={`${z.label}：${z.count} 次`}>
                  <span className="zodiac-name">{z.label}</span>
                  <span className="zodiac-bar">
                    <span style={{ height: `${(z.count / z.max) * 100}%` }} />
                  </span>
                  <span className="zodiac-count">{z.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>

      <div className="split-grid">
        <Panel
          kicker="SUM · 和值"
          title="近 60 期和值走势"
          desc={`6 主号和值，均值 ${avgSum.toFixed(1)}。理论期望 150。`}
        >
          <LineChart
            ariaLabel="主号和值走势"
            height={230}
            labels={drawsAsc.slice(-60).map((d) => d.id)}
            series={[{ name: '和值', color: 'var(--accent)', values: sumData }]}
            yFormat={(v) => v.toFixed(0)}
            xFormat={(label) => (label ? label.slice(5) : '')}
          />
        </Panel>

        <Panel kicker="REPEAT · 重号" title="与上期的重复号码" desc="随机情况下，平均约有 0.73 个号码与上期相同。">
          <div className="repeat-stats">
            <div>
              <span>近 60 期平均</span>
              <strong>{repeated.avg.toFixed(2)} 个</strong>
            </div>
            <div>
              <span>理论上限期望</span>
              <strong>0.73 个</strong>
            </div>
            <div>
              <span>0 重号占比</span>
              <strong>
                {repeated.values.length
                  ? `${((repeated.values.filter((v) => v === 0).length / repeated.values.length) * 100).toFixed(0)}%`
                  : '—'}
              </strong>
            </div>
          </div>
          <ul className="repeat-bars">
            {[0, 1, 2, 3, 4, 5, 6].map((count) => {
              const n = repeated.values.filter((v) => v === count).length;
              const total = Math.max(1, repeated.values.length);
              return (
                <li key={count}>
                  <span>{count}</span>
                  <span className="repeat-track">
                    <span style={{ width: `${(n / total) * 100}%` }} />
                  </span>
                  <em>{n}</em>
                </li>
              );
            })}
          </ul>
          <p className="hint-line">近期均值越接近 0.73，说明走势越「平常」；明显偏离通常只是样本太小。</p>
        </Panel>
      </div>

      <Panel
        kicker="HISTORY · 历史开奖"
        title="全量开奖记录"
        desc={`数据源 ${history?.source.repo ?? 'Number-selection-tool'} · 最新 ${history?.latest.id ?? '—'}`}
        actions={
          <div className="filter-row">
            <input
              className="input"
              placeholder="搜索期号，如 2026-3"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
            <select
              className="input select"
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">全部年份</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y} 年
                </option>
              ))}
            </select>
          </div>
        }
        padded={false}
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>期号 / 日期</th>
                <th>开奖号码</th>
                <th>和值</th>
                <th>单双</th>
                <th>大小</th>
                <th>波色</th>
              </tr>
            </thead>
            <tbody>
              {pageDraws.map((draw) => {
                const shape = shapeOf(draw.n);
                return (
                  <tr key={draw.id}>
                    <td>
                      <div className="cell-period">
                        <strong>{draw.id}</strong>
                        <span>{formatDate(draw.date, { withYear: false })}</span>
                      </div>
                    </td>
                    <td>
                      <BallRow main={draw.n} special={draw.s} size="xs" />
                    </td>
                    <td className="mono">{shape.sum}</td>
                    <td className="mono">
                      {shape.odd}:{shape.even}
                    </td>
                    <td className="mono">
                      {shape.big}:{shape.small}
                    </td>
                    <td>
                      <div className="wave-dots">
                        {(['red', 'blue', 'green'] as const).map((w) => (
                          <span key={w} className={`wave-dot wave-${w}`}>
                            {shape.waves[w]}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>
            第 {currentPage} / {pageCount} 页 · 共 {filteredDraws.length} 期
          </span>
          <div className="pager">
            <button type="button" className="btn btn-quiet btn-sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
              上一页
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      </Panel>

      <div className="notice">
        <Badge tone="accent">统计口径</Badge>
        <span>
          频率统计包含每期 6 个主号 + 1 个特码；波色按 {WAVE_LABELS.red}／{WAVE_LABELS.blue}／{WAVE_LABELS.green} 固定表；
          生肖随农历年轮换。所有指标都是描述性统计，不构成投注建议。
        </span>
      </div>
    </div>
  );
}
