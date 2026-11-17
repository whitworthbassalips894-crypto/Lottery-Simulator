import { useCallback, useMemo } from 'react';
import { BallRow, Badge, EmptyState, Panel, Spinner, Stat } from '../components/primitives';
import { LineChart, Sparkline } from '../components/charts';
import { useApp } from '../state';
import { simulateTicket } from '../lib/rng';
import { useDrawAnimation } from '../lib/useDraw';
import { buildComparison, summarizeSims } from '../lib/analysis';
import { BASELINE } from '../lib/stats';
import { formatDate, shortDate } from '../lib/periods';
import { shapeOf, WAVE_LABELS } from '../lib/lottery';
import { copyText, ticketToText } from '../lib/clipboard';
import type { TabId } from '../App';
import type { SimRecord } from '../lib/types';

export default function Dashboard({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const { history, drawsAsc, sims, nextMeta, settings, actions, syncing, lastSync, usingCache } = useApp();

  const official = useMemo(() => {
    const map = new Map<string, SimRecord>();
    sims.forEach((s) => {
      const prev = map.get(s.period);
      if (!prev || s.attempt < prev.attempt) map.set(s.period, s);
    });
    return [...map.values()];
  }, [sims]);

  const archived = official.find((s) => s.period === nextMeta.id) ?? null;
  const todayTicket = useMemo(() => archived ?? simulateTicket(nextMeta.id, 0), [archived, nextMeta.id]);

  const { display, drawing, play } = useDrawAnimation(settings.reduceMotion, () => {
    const record: SimRecord = {
      period: nextMeta.id,
      date: nextMeta.date,
      attempt: 0,
      main: todayTicket.main,
      special: todayTicket.special,
      createdAt: new Date().toISOString()
    };
    actions.archiveSim(record);
    actions.toast(`已归档 ${nextMeta.id} 的模拟号码`, 'success');
  });

  const shown = display ?? todayTicket;
  const latest = drawsAsc[drawsAsc.length - 1] ?? null;
  const latestShape = latest ? shapeOf(latest.n) : null;
  const latestIsTodayTicket = latest ? latest.id === nextMeta.id : false;

  const comparisons = useMemo(() => buildComparison(sims, drawsAsc), [sims, drawsAsc]);
  const summary = useMemo(() => summarizeSims(comparisons), [comparisons]);

  const curve = useMemo(() => {
    let acc = 0;
    return comparisons.map((row) => (acc += row.hit.specialHit ? 1 : 0));
  }, [comparisons]);
  const expected = useMemo(() => comparisons.map((_, i) => (i + 1) * BASELINE.specialRate), [comparisons]);

  const recent = comparisons.slice(-6).reverse();
  const recentDraws = drawsAsc.slice(-7).reverse();
  const sums = useMemo(() => drawsAsc.slice(-30).map((d) => d.n.reduce((a, b) => a + b, 0)), [drawsAsc]);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(ticketToText(shown.main, shown.special));
    actions.toast(ok ? '号码已复制（6+1，逗号分隔）' : '复制失败，请手动选择', ok ? 'success' : 'error');
  }, [actions, shown]);

  const lastSyncLabel = lastSync
    ? new Date(lastSync).toLocaleString('zh-CN', { hour12: false })
    : '尚未同步';

  return (
    <div className="page-stack">
      <div className="dashboard-top">
        <section className="hero-draw">
          <div className="hero-orbit" aria-hidden="true" />
          <header className="hero-head">
            <div>
              <span className="hero-kicker">TODAY · 每日模拟摇号</span>
              <h2 className="hero-title">
                {nextMeta.id}
                <span className="hero-title-sub">{formatDate(nextMeta.date)}</span>
              </h2>
            </div>
            <div className="hero-chips">
              <span className={`hero-chip ${archived ? 'is-ok' : ''}`}>{archived ? '已归档' : '待摇号'}</span>
              <span className="hero-chip">3 次机会</span>
            </div>
          </header>

          <div className={`hero-stage ${drawing ? 'is-drawing' : ''}`}>
            <BallRow
              main={shown.main}
              special={shown.special}
              size="xl"
              showZodiac={settings.showZodiac}
              date={nextMeta.date}
              className="hero-balls"
            />
          </div>

          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => play(todayTicket)} disabled={drawing}>
              {drawing ? <Spinner /> : <span className="btn-glyph">◉</span>}
              {drawing ? '摇号中…' : archived ? '再播一次' : '开始摇号'}
            </button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={handleCopy}>
              复制号码
            </button>
            <button type="button" className="btn btn-quiet btn-lg" onClick={() => onNavigate('simulator')}>
              挑选其它期 →
            </button>
          </div>

          <footer className="hero-foot">
            <span>
              种子 <code>draw-lab:{nextMeta.id}:0</code>
            </span>
            <span className="dot-sep" />
            <span>同一期结果固定，刷新不会变</span>
            <span className="dot-sep" />
            <span>{settings.showZodiac ? '生肖随农历年切换' : '生肖已隐藏'}</span>
          </footer>
        </section>

        <Panel
          className="latest-panel"
          kicker="LATEST DRAW · 真实开奖"
          title={latest ? `${latest.id}` : '暂无数据'}
          desc={latest ? `${formatDate(latest.date)} · 数据源 Number-selection-tool` : '正在加载历史库…'}
          actions={
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => void actions.sync()} disabled={syncing}>
              {syncing ? <Spinner size={12} /> : '同步'}
            </button>
          }
        >
          {latest ? (
            <>
              <BallRow
                main={latest.n}
                special={latest.s}
                size="md"
                showZodiac={settings.showZodiac}
                date={latest.date}
                className="latest-balls"
              />
              <div className="latest-shape">
                <div>
                  <span>和值</span>
                  <strong>{latestShape?.sum}</strong>
                </div>
                <div>
                  <span>单双</span>
                  <strong>
                    {latestShape?.odd}:{latestShape?.even}
                  </strong>
                </div>
                <div>
                  <span>大小</span>
                  <strong>
                    {latestShape?.big}:{latestShape?.small}
                  </strong>
                </div>
                <div>
                  <span>波色</span>
                  <strong>
                    {latestShape
                      ? `${latestShape.waves.red}-${latestShape.waves.blue}-${latestShape.waves.green}`
                      : '—'}
                  </strong>
                </div>
              </div>
              <div className="latest-wave">
                {(['red', 'blue', 'green'] as const).map((wave) => (
                  <span key={wave} className={`wave-pill wave-${wave}`}>
                    {WAVE_LABELS[wave]}
                  </span>
                ))}
              </div>
              <div className="latest-foot">
                <Badge tone={usingCache ? 'warn' : 'success'} dot>
                  {usingCache ? '本机缓存' : '已同步'}
                </Badge>
                <span>{lastSyncLabel}</span>
              </div>
            </>
          ) : (
            <EmptyState title="历史库加载中" desc="首次进入需要载入内置快照（约 120 KB）" />
          )}
        </Panel>
      </div>

      {latest && latestIsTodayTicket ? (
        <div className="notice notice-good">
          <strong>今日开奖已到手</strong>
          <span>可以把「{nextMeta.id}」的模拟号码与真实开奖做对照了。</span>
          <button type="button" onClick={() => onNavigate('simulator')}>
            查看对照 →
          </button>
        </div>
      ) : null}

      <div className="kpi-grid">
        <Stat
          label="历史库"
          value={history ? history.total.toLocaleString('zh-CN') : '—'}
          unit="期"
          hint={history ? `${history.earliest.id} → ${history.latest.id}` : '加载中'}
        />
        <Stat
          label="已对照"
          value={summary.periods}
          unit="期"
          hint={summary.periods ? `最近 ${comparisons[comparisons.length - 1]?.sim.period}` : '摇号后自动对照'}
        />
        <Stat
          label="模拟特码命中"
          value={summary.periods ? `${(summary.specialRate * 100).toFixed(1)}%` : '—'}
          tone={summary.periods && summary.specialRate > BASELINE.specialRate ? 'good' : 'default'}
          hint={`随机基线 ${(BASELINE.specialRate * 100).toFixed(2)}% · 命中 ${summary.specialHits} 次`}
        />
        <Stat
          label="主号平均命中"
          value={summary.periods ? summary.mainMean.toFixed(2) : '—'}
          unit="/ 6"
          hint={`随机基线 ${BASELINE.mainMean.toFixed(2)} · 最长连错 ${summary.longestMiss} 期`}
        />
      </div>

      <div className="split-grid">
        <Panel
          kicker="TRACK RECORD · 对照曲线"
          title="模拟 vs 随机基线"
          desc="累计特码命中数。虚线是按 1/49 计算的期望值，贴线才是正常表现。"
          actions={
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => onNavigate('simulator')}>
              管理记录
            </button>
          }
        >
          {comparisons.length >= 2 ? (
            <LineChart
              ariaLabel="累计特码命中曲线"
              height={244}
              labels={comparisons.map((r) => r.sim.period)}
              series={[
                { name: '模拟累计命中', color: 'var(--accent)', values: curve, width: 2.6 },
                { name: '随机期望', color: 'var(--muted)', values: expected, dashed: true, width: 1.8 }
              ]}
              yFormat={(v) => v.toFixed(1)}
              xFormat={(label) => (label ? label.slice(5) : '')}
            />
          ) : (
            <EmptyState
              title={summary.periods ? '再对照一期就能看到曲线' : '还没有可对照的记录'}
              desc="去「模拟摇号」选一期摇号，等真实开奖同步后即可自动对照。"
            />
          )}
        </Panel>

        <Panel kicker="RECENT · 近期对照" title="最近 6 期" desc="模拟号码与真实开奖的逐期核对结果。">
          {recent.length ? (
            <ul className="recent-list">
              {recent.map((row) => (
                <li key={row.sim.period}>
                  <div className="recent-meta">
                    <strong>{row.sim.period}</strong>
                    <span>{shortDate(row.sim.date)}</span>
                  </div>
                  <BallRow
                    main={row.sim.main}
                    special={row.sim.special}
                    size="xs"
                    matched={row.hit.matchedMain}
                    specialMatched={row.hit.specialHit}
                    className="recent-balls"
                  />
                  <span className={`hit-pill ${row.hit.specialHit ? 'is-hit' : ''}`}>
                    {row.hit.specialHit ? '特码中' : `${row.hit.mainHits}/6`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="暂无对照记录"
              desc="第一期摇号会出现在这里。"
              icon="◍"
            />
          )}
        </Panel>
      </div>

      <div className="split-grid">
        <Panel kicker="NUMBERS · 近 30 期" title="和值走势" desc="6 个主号之和，用于观察整体大小结构。">
          <div className="sum-strip">
            <div className="sum-value">
              <strong>{sums.length ? Math.round(sums.reduce((a, b) => a + b, 0) / sums.length) : '—'}</strong>
              <span>近 30 期均值</span>
            </div>
            <Sparkline values={sums} width={260} height={64} color="var(--accent)" baseline={150} />
          </div>
          <div className="mini-table">
            {recentDraws.slice(0, 5).map((draw) => (
              <button key={draw.id} type="button" className="mini-row" onClick={() => onNavigate('insights')}>
                <span className="mini-period">{draw.id}</span>
                <BallRow main={draw.n} special={draw.s} size="xs" className="mini-balls" />
              </button>
            ))}
          </div>
        </Panel>

        <Panel
          kicker="HONEST NOTE · 顾问提醒"
          title="这些数字改变不了概率"
          desc="工具的价值是「看清随机」，不是「战胜随机」。"
        >
          <ul className="honest-list">
            <li>
              <strong>单注特码概率恒为 1/49 ≈ 2.04%</strong>
              <span>无论用热号、冷号还是 AI 打分，长期命中率都收敛到同一条线。</span>
            </li>
            <li>
              <strong>6+1 全中概率约 1/4,900 万</strong>
              <span>比被雷击还稀有，任何「必中」说法都值得怀疑。</span>
            </li>
            <li>
              <strong>回测能筛掉的是玄学，不是运气</strong>
              <span>样本少于 300 期时，领先基线也可能纯属波动，请看置信区间与 p 值。</span>
            </li>
          </ul>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => onNavigate('backtest')}>
            去做一次严谨回测 →
          </button>
        </Panel>
      </div>
    </div>
  );
}
