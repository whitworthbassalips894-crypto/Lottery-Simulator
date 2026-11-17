import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BallRow, Badge, EmptyState, Panel, Segmented, Spinner } from '../components/primitives';
import { BarChart, LineChart, Meter } from '../components/charts';
import { useApp } from '../state';
import { STRATEGIES, STRATEGY_MAP, type StrategyId } from '../lib/strategies';
import type { BacktestResult, StrategyResult } from '../lib/backtest';
import { shortDate } from '../lib/periods';
import { pad2 } from '../lib/lottery';

const RANGES = [
  { value: 100, label: '近 100 期' },
  { value: 300, label: '近 300 期' },
  { value: 0, label: '全量回测' }
];

const SERIES_COLORS = ['#5b7cfa', '#e0455f', '#12a06f', '#f0a44b', '#8b5cf6', '#0ea5b7'];

function pct(value: number, digits = 2) {
  return `${(value * 100).toFixed(digits)}%`;
}

function verdict(row: StrategyResult) {
  if (row.periods < 100) return { tone: 'neutral' as const, text: '样本偏小，仅供观察' };
  if (row.pValue < 0.05 && row.specialHits > row.periods / 49) return { tone: 'good' as const, text: '显著高于基线' };
  if (row.pValue < 0.05 && row.specialHits < row.periods / 49) return { tone: 'bad' as const, text: '显著低于基线' };
  return { tone: 'neutral' as const, text: '与随机波动一致' };
}

export default function Backtest() {
  const { drawsAsc, settings } = useApp();
  const [selected, setSelected] = useState<StrategyId[]>(['hot', 'cold', 'cycle', 'balanced', 'ensemble']);
  const [range, setRange] = useState(300);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<StrategyId>('hot');
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);

  const ensureWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../workers/backtest.worker.ts', import.meta.url), { type: 'module' });
    }
    return workerRef.current;
  }, []);

  const run = useCallback(
    (ids: StrategyId[], rng: number) => {
      if (!drawsAsc.length) return;
      const worker = ensureWorker();
      const id = ++requestId.current;
      setRunning(true);
      setProgress(0);
      setError(null);
      worker.onmessage = (event: MessageEvent) => {
        const data = event.data as any;
        if (data.requestId !== id) return;
        if (data.type === 'progress') setProgress(data.ratio);
        if (data.type === 'done') {
          setResult(data.result);
          setRunning(false);
          setProgress(1);
          const first = data.result.strategies[0];
          if (first && !ids.includes(focus)) setFocus(first.id);
        }
        if (data.type === 'error') {
          setError(data.message);
          setRunning(false);
        }
      };
      const payloadIds = ids.length ? ids : (['random'] as StrategyId[]);
      worker.postMessage({
        requestId: id,
        draws: drawsAsc,
        options: { strategyIds: payloadIds, periods: rng, warmup: 30 }
      });
    },
    [drawsAsc, ensureWorker, focus]
  );

  useEffect(() => {
    if (drawsAsc.length > 40 && !result && !running) run(selected, range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawsAsc.length]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    []
  );

  const toggleStrategy = (id: StrategyId) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const strategies = result?.strategies ?? [];
  const baseline = result?.baseline;
  const focused = strategies.find((s) => s.id === focus) ?? strategies[0] ?? null;

  const leader = useMemo(() => {
    if (!strategies.length) return null;
    return strategies.slice().sort((a, b) => b.specialHits / (b.periods || 1) - a.specialHits / (a.periods || 1))[0];
  }, [strategies]);

  const lineSeries = useMemo(() => {
    if (!strategies.length) return [];
    const withRandom = strategies;
    return [
      ...withRandom.map((row, index) => ({
        name: STRATEGY_MAP[row.id]?.short ?? row.id,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
        values: row.curve
      })),
      {
        name: '随机期望',
        color: 'var(--muted)',
        dashed: true,
        width: 1.6,
        values: withRandom[0].curve.map((_, i) => (i + 1) * (baseline?.specialRate ?? 1 / 49))
      }
    ];
  }, [strategies, baseline]);

  const mainBars = useMemo(() => {
    if (!focused) return [];
    return focused.mainDist.map((count, hits) => ({
      label: `${hits}`,
      value: count,
      color: hits >= 3 ? 'var(--good)' : 'var(--accent)',
      hint: `主号命中 ${hits} 个：${count} 期（${pct(count / Math.max(1, focused.periods), 1)}），随机期望 ${(
        focused.mainExpectedDist[hits] * 100
      ).toFixed(1)}%`
    }));
  }, [focused]);

  return (
    <div className="page-stack">
      <Panel
        kicker="BACKTEST LAB · 策略回测"
        title="把「选号玄学」交给历史检验"
        desc="逐期滚动、严格不用未来数据：每一期只拿之前的历史打分，再和当期开奖核对。"
      >
        <div className="config-grid">
          <div className="config-block">
            <span className="config-label">选择策略</span>
            <div className="chip-grid">
              {STRATEGIES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`strategy-chip tone-${s.tone} ${selected.includes(s.id) ? 'is-active' : ''}`}
                  onClick={() => toggleStrategy(s.id)}
                  title={s.desc}
                >
                  <strong>{s.name}</strong>
                  <span>{s.tagline}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="config-block config-side">
            <span className="config-label">回测区间</span>
            <Segmented
              value={range}
              onChange={setRange}
              options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
            />
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={running || !selected.length || !drawsAsc.length}
              onClick={() => run(selected, range)}
            >
              {running ? <Spinner /> : null}
              {running ? '回测中…' : '开始回测'}
            </button>
            <span className="config-hint">
              预热 30 期 · 共 {drawsAsc.length.toLocaleString('zh-CN')} 期可用
              {result ? ` · 上次回测 ${result.range.periods} 期` : ''}
            </span>
          </div>
        </div>

        {running ? <Meter value={progress} label="计算进度" caption={`${Math.round(progress * 100)}%`} /> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </Panel>

      {result && strategies.length ? (
        <>
          <section className="insight-banner">
            <div className="insight-main">
              <span className="kicker">VERDICT · 结论</span>
              <h3>
                {leader && leader.specialHits / leader.periods > (baseline?.specialRate ?? 0)
                  ? `${STRATEGY_MAP[leader.id].name} 暂时领先`
                  : '没有任何策略稳定跑赢随机'}
                ，但差距仍在噪声里
              </h3>
              <p>
                {leader ? (
                  <>
                    区间 {result.range.from} → {result.range.to}（{result.range.periods} 期）。
                    {STRATEGY_MAP[leader.id].name} 特码命中 {leader.specialHits} 次（
                    {pct(leader.specialRate)}，95% 置信区间 {pct(leader.specialCi[0])}–{pct(leader.specialCi[1])}，
                    p = {leader.pValue.toFixed(3)}），随机基线为 {pct(baseline?.specialRate ?? 1 / 49)}。
                  </>
                ) : null}
              </p>
            </div>
            <div className="insight-side">
              <div>
                <span>随机基线</span>
                <strong>{pct(baseline?.specialRate ?? 0)}</strong>
              </div>
              <div>
                <span>6+1 全中理论概率</span>
                <strong>1 / 4,900 万</strong>
              </div>
              <div>
                <span>主号随机期望</span>
                <strong>{(baseline?.mainMean ?? 0).toFixed(2)} / 6</strong>
              </div>
            </div>
          </section>

          <Panel
            kicker="SCORECARD · 成绩单"
            title="各策略指标对比"
            desc="特码命中率是核心指标；p 值回答「这差距会不会只是运气」。"
            padded={false}
          >
            <div className="table-wrap">
              <table className="data-table score-table">
                <thead>
                  <tr>
                    <th>策略</th>
                    <th>特码命中</th>
                    <th>命中率（95% CI）</th>
                    <th>p 值</th>
                    <th>主号均值</th>
                    <th>≥3 主号</th>
                    <th>最长连错</th>
                    <th>判定</th>
                  </tr>
                </thead>
                <tbody>
                  {strategies.map((row) => {
                    const v = verdict(row);
                    return (
                      <tr key={row.id} className={row.id === focused.id ? 'is-focused' : ''}>
                        <td>
                          <button type="button" className="link-btn" onClick={() => setFocus(row.id)}>
                            {STRATEGY_MAP[row.id].name}
                          </button>
                          <span className="cell-sub">{row.periods} 期</span>
                        </td>
                        <td className="mono">{row.specialHits}</td>
                        <td className="mono">
                          {pct(row.specialRate)}
                          <span className="cell-sub">
                            {pct(row.specialCi[0])} – {pct(row.specialCi[1])}
                          </span>
                        </td>
                        <td className="mono">{row.pValue < 0.001 ? '<0.001' : row.pValue.toFixed(3)}</td>
                        <td className="mono">
                          {row.mainMean.toFixed(2)}
                          <span className="cell-sub">
                            {row.mainMeanCi[0].toFixed(2)} – {row.mainMeanCi[1].toFixed(2)}
                          </span>
                        </td>
                        <td className="mono">{pct(row.main3Plus, 1)}</td>
                        <td className="mono">{row.longestMiss}</td>
                        <td>
                          <Badge tone={v.tone === 'good' ? 'success' : v.tone === 'bad' ? 'danger' : 'neutral'}>{v.text}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            kicker="CURVE · 累计命中"
            title="累计特码命中 vs 随机期望"
            desc="曲线越陡说明当期命中越密；长期应当与虚线平行。"
          >
            <LineChart
              ariaLabel="各策略累计特码命中"
              height={300}
              labels={
                focused.periodsList?.length === focused.curve.length
                  ? focused.periodsList
                  : focused.curve.map((_, i) => `#${i + 1}`)
              }
              series={lineSeries}
              yFormat={(v) => v.toFixed(0)}
              xFormat={(label, index) => (index % 50 === 0 ? label.slice(-3) : '')}
            />
          </Panel>

          <div className="split-grid">
            <Panel
              kicker="FOCUS · 单策略"
              title={`${STRATEGY_MAP[focused.id].name} · 主号命中分布`}
              desc={STRATEGY_MAP[focused.id].desc}
              actions={
                <select className="input select" value={focused.id} onChange={(e) => setFocus(e.target.value as StrategyId)}>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {STRATEGY_MAP[s.id].name}
                    </option>
                  ))}
                </select>
              }
            >
              <BarChart data={mainBars} height={196} expected={focused.mainExpectedDist.map((p) => p * focused.periods)} />
              <div className="legend-note">
                <span>
                  <i className="dot dot-expected" />
                  细线 = 随机期望
                </span>
                <span>
                  <i className="dot dot-good" />
                  命中 ≥3 个主号的期数
                </span>
              </div>
              <div className="mini-stats">
                <div>
                  <span>至少中 1 主号</span>
                  <strong>{pct(focused.main1Plus, 1)}</strong>
                </div>
                <div>
                  <span>单期最高</span>
                  <strong>{focused.maxMainHits} 个</strong>
                </div>
                <div>
                  <span>当前连错</span>
                  <strong>{focused.currentMiss} 期</strong>
                </div>
              </div>
            </Panel>

            <Panel kicker="BY YEAR · 分年" title="年度表现" desc="样本按年份拆开后，波动通常更大。">
              <div className="table-wrap table-compact">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>年份</th>
                      <th>期数</th>
                      <th>特码命中</th>
                      <th>命中率</th>
                      <th>主号均值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {focused.years.map((y) => (
                      <tr key={y.year}>
                        <td>{y.year}</td>
                        <td className="mono">{y.periods}</td>
                        <td className="mono">{y.specialHits}</td>
                        <td className="mono">{pct(y.specialRate)}</td>
                        <td className="mono">{y.mainMean.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <Panel
            kicker="SAMPLES · 明细"
            title={`${STRATEGY_MAP[focused.id].name} · 最近命中与最好一期`}
            desc="回测过程中的真实选号记录，可逐期核对。"
          >
            <div className="sample-grid">
              <div>
                <span className="config-label">特码命中样例（最近 6 期）</span>
                {focused.hitPeriods.length ? (
                  <ul className="sample-list">
                    {focused.hitPeriods.slice(-6).reverse().map((row) => (
                      <li key={row.period}>
                        <div className="sample-head">
                          <strong>{row.period}</strong>
                          <span>{shortDate(row.date)}</span>
                        </div>
                        <BallRow main={row.main} special={row.special} size="xs" specialMatched />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="区间内没有特码命中" desc="换一个策略或扩大区间再看看。" />
                )}
              </div>
              <div>
                <span className="config-label">最好的一期</span>
                {focused.best ? (
                  <div className="best-card">
                    <div className="sample-head">
                      <strong>{focused.best.period}</strong>
                      <Badge tone={focused.best.specialHit ? 'success' : 'neutral'}>
                        {focused.best.mainHits} 主号{focused.best.specialHit ? ' + 特码' : ''}
                      </Badge>
                    </div>
                    <div className="best-row">
                      <span>策略选号</span>
                      <BallRow
                        main={focused.best.main}
                        special={focused.best.special}
                        size="sm"
                        matched={focused.best.main}
                        specialMatched={focused.best.specialHit}
                      />
                    </div>
                    <div className="best-row">
                      <span>真实开奖</span>
                      <BallRow main={focused.best.realMain} special={focused.best.realSpecial} size="sm" />
                    </div>
                  </div>
                ) : null}
                <p className="page-note">
                  样例里的号码都用 {pad2(focused.best?.realSpecial ?? 0)} 这类两位格式显示，方便和历史库对账。
                </p>
              </div>
            </div>
          </Panel>

          {!settings.reduceMotion ? null : <span className="sr-only">已开启减少动画</span>}
        </>
      ) : (
        <Panel title="准备中" kicker="LOADING">
          <EmptyState title={running ? '正在跑回测…' : '历史库加载中'} desc="首次回测需要遍历全部历史期，通常 1~3 秒。" />
        </Panel>
      )}
    </div>
  );
}
