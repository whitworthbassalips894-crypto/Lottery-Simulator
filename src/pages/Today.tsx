import { useEffect, useMemo, useState } from 'react';
import { BallRow, Card, Chip, Empty, Spinner } from '../components/ui';
import { NumberInputs } from '../components/NumberInputs';
import { useApp } from '../state';
import { simulateTicket } from '../lib/rng';
import { useDrawAnimation } from '../lib/useDraw';
import { checkHit } from '../lib/stats';
import { BASELINE } from '../lib/stats';
import { addDays, formatDate, localDateKey, parsePeriod, periodForDate } from '../lib/periods';
import { copyText, ticketToText } from '../lib/clipboard';
import { pad2 } from '../lib/lottery';
import { buildComparison, summarizeSims } from '../lib/analysis';
import type { Draw } from '../lib/types';

export default function Today({
  onOpenRecords,
  focusDate
}: {
  onOpenRecords: () => void;
  focusDate: string;
}) {
  const { drawsAsc, sims, settings, actions, syncing, history } = useApp();
  const [selectedDate, setSelectedDate] = useState(focusDate);
  const [manualOpen, setManualOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(['', '', '', '', '', '', '']);
  const [manualError, setManualError] = useState('');

  const periodMeta = parsePeriod(periodForDate(selectedDate));
  const period = periodMeta?.id ?? '';
  const byPeriod = useMemo(() => new Map(drawsAsc.map((d) => [d.id, d])), [drawsAsc]);
  const real = period ? byPeriod.get(period) ?? null : null;

  const official = useMemo(() => {
    const map = new Map<string, (typeof sims)[number]>();
    sims.forEach((s) => {
      const prev = map.get(s.period);
      if (!prev || s.attempt < prev.attempt) map.set(s.period, s);
    });
    return map;
  }, [sims]);

  const recorded = period ? official.get(period) ?? null : null;
  const ticket = recorded ?? simulateTicket(period || '2026-001', 0);
  const hit = real && recorded ? checkHit(real, recorded) : null;

  const { display, drawing, play } = useDrawAnimation(settings.reduceMotion);
  const shown = display ?? ticket;

  const comparisons = useMemo(() => buildComparison(sims, drawsAsc), [sims, drawsAsc]);
  const summary = useMemo(() => summarizeSims(comparisons), [comparisons]);

  useEffect(() => {
    setSelectedDate(focusDate);
  }, [focusDate]);

  useEffect(() => {
    if (real) setManualOpen(false);
    setDraft(real ? [...real.n.map((n) => pad2(n)), pad2(real.s)] : ['', '', '', '', '', '', '']);
    setManualError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, real?.id]);

  const draw = () => {
    if (!period) return;
    play(ticket);
    const record = {
      period,
      date: periodMeta?.date ?? selectedDate,
      attempt: 0,
      main: ticket.main,
      special: ticket.special,
      createdAt: new Date().toISOString()
    };
    window.setTimeout(
      () => {
        actions.archiveSim(record);
        actions.toast(`${period} 的模拟号码已记录`, 'success');
      },
      settings.reduceMotion ? 0 : 1800
    );
  };

  const copy = async () => {
    const ok = await copyText(ticketToText(ticket.main, ticket.special));
    actions.toast(ok ? '号码已复制（6+1，逗号分隔）' : '复制失败，请手动选择', ok ? 'success' : 'error');
  };

  const submitManual = () => {
    const nums = draft.map((v) => Number(v));
    if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 49)) {
      setManualError('每个位置都要填 01~49 的号码');
      return;
    }
    if (new Set(nums.slice(0, 6)).size !== 6) {
      setManualError('6 个主号不能重复');
      return;
    }
    if (nums.slice(0, 6).includes(nums[6])) {
      setManualError('特码不能与主号重复');
      return;
    }
    const record: Draw = {
      id: period,
      date: periodMeta?.date ?? selectedDate,
      n: nums.slice(0, 6).sort((a, b) => a - b),
      s: nums[6]
    };
    actions.saveOverride(record);
    setManualOpen(false);
    actions.toast(`已补录 ${period} 的开奖结果`, 'success');
  };

  const isToday = selectedDate === localDateKey();
  const canGoLater = selectedDate < addDays(localDateKey(), 7);

  return (
    <div className="stack">
      <div className="period-switch">
        <button type="button" className="btn btn-secondary btn-icon" onClick={() => setSelectedDate(addDays(selectedDate, -1))} aria-label="上一天">
          ‹
        </button>
        <div className="period-main">
          <strong>{period || '无效日期'}</strong>
          <span>{period ? formatDate(periodMeta?.date ?? selectedDate) : '请选择有效日期'}</span>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          disabled={!canGoLater}
          aria-label="下一天"
        >
          ›
        </button>
        <input
          type="date"
          className="input date-input"
          value={selectedDate}
          min="2022-01-01"
          max="2027-12-31"
          onChange={(e) => setSelectedDate(e.target.value)}
          aria-label="选择日期"
        />
        {!isToday ? (
          <button type="button" className="btn btn-quiet" onClick={() => setSelectedDate(localDateKey())}>
            回到今天
          </button>
        ) : null}
      </div>

      <Card
        kicker="模拟号码"
        title={`${period || '—'} 这一期`}
        actions={recorded ? <Chip tone="success" dot>已记录</Chip> : <Chip tone="warn" dot>未摇号</Chip>}
      >
        <div className={drawing ? 'draw-stage is-drawing' : 'draw-stage'}>
          <BallRow main={shown.main} special={shown.special} size="lg" showZodiac={settings.showZodiac} date={periodMeta?.date} />
        </div>

        <div className="action-row">
          <button type="button" className="btn btn-primary" onClick={draw} disabled={drawing || !period}>
            {drawing ? <Spinner /> : null}
            {drawing ? '摇号中…' : recorded ? '再播一次' : '摇号'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={copy}>
            复制号码
          </button>
        </div>

        <p className="footnote">
          号码由「期号」决定：{period || '—'} 永远是这一注，刷新不会变。共 49 选 6 + 1 个特码。
        </p>
      </Card>

      <Card
        kicker="开奖对照"
        title={real ? `${real.id} 真实开奖` : '等待开奖'}
        desc={real ? formatDate(real.date) : '上游同步到这一期后会自动对照，也可以手动补录。'}
        actions={
          real ? (
            <Chip tone="success">已开奖</Chip>
          ) : (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setManualOpen((v) => !v)}>
              {manualOpen ? '收起' : '手动补录'}
            </button>
          )
        }
      >
        {real ? (
          <>
            <BallRow
              main={real.n}
              special={real.s}
              size="md"
              showZodiac={settings.showZodiac}
              date={real.date}
              matched={hit?.matchedMain ?? []}
              specialMatched={hit?.specialHit ?? false}
            />
            <div className="result-strip">
              <div>
                <span>主号命中</span>
                <strong>{hit ? `${hit.mainHits}/6` : '未摇号'}</strong>
              </div>
              <div>
                <span>特码</span>
                <strong className={hit?.specialHit ? 'text-good' : ''}>
                  {hit ? (hit.specialHit ? '命中' : '未中') : '—'}
                </strong>
              </div>
              <div>
                <span>随机期望</span>
                <strong className="muted">{BASELINE.mainMean.toFixed(2)} / 6</strong>
              </div>
            </div>
            {!recorded ? <p className="footnote">这一期还没有模拟号码，点上面的「摇号」即可对照。</p> : null}
          </>
        ) : manualOpen ? (
          <div className="manual">
            <NumberInputs values={draft} onChange={setDraft} invalid={Boolean(manualError)} />
            {manualError ? <p className="form-error">{manualError}</p> : null}
            <div className="action-row">
              <button type="button" className="btn btn-primary btn-sm" onClick={submitManual}>
                保存开奖结果
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setManualOpen(false)}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <Empty title="这一期还没开奖" desc="可以先去「对照记录」看看最近 20 期的战绩。" />
        )}
      </Card>

      <button type="button" className="stat-strip" onClick={onOpenRecords}>
        <span>
          已对照 <b>{summary.periods}</b> 期
        </span>
        <span>
          特码命中 <b>{summary.specialHits}</b> 次
          <em>{(summary.specialRate * 100).toFixed(1)}%</em>
        </span>
        <span>
          主号均值 <b>{summary.mainMean.toFixed(2)}</b>
          <em>/ 6</em>
        </span>
        <i className="chev">全部记录 ›</i>
      </button>

      <p className="footnote">
        数据源 {history?.source.repo ?? 'Number-selection-tool'} · 最新 {history?.latest.id ?? '—'}
        {syncing ? ' · 正在同步…' : ''} · 仅用于娱乐与统计学习，不构成投注建议
      </p>
    </div>
  );
}
