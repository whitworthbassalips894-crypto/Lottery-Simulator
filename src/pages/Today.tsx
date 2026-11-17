import { useEffect, useMemo, useState } from 'react';
import { Ball, BallRow, Card, Chip, Empty, Spinner } from '../components/ui';
import { NumberInputs } from '../components/NumberInputs';
import { useApp } from '../state';
import { simulateTicket } from '../lib/rng';
import { useReveal } from '../lib/useReveal';
import { BASELINE, checkHit } from '../lib/stats';
import { addDays, formatDate, localDateKey, parsePeriod, periodForDate } from '../lib/periods';
import { copyText, ticketToText } from '../lib/clipboard';
import { pad2, zodiacOf } from '../lib/lottery';
import { buildComparison, summarizeSims } from '../lib/analysis';
import type { Draw } from '../lib/types';

const TOTAL = 7;

export default function Today({
  onOpenRecords,
  focusDate
}: {
  onOpenRecords: () => void;
  focusDate: string;
}) {
  const { drawsAsc, sims, checkedPeriods, settings, actions, syncing, history } = useApp();
  const [selectedDate, setSelectedDate] = useState(focusDate);
  const [phase, setPhase] = useState<'idle' | 'revealing' | 'done'>('idle');
  const [checkedLocal, setCheckedLocal] = useState(false);
  const [checking, setChecking] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(['', '', '', '', '', '', '']);
  const [manualError, setManualError] = useState('');

  const reveal = useReveal(TOTAL, settings.reduceMotion);
  const check = useReveal(TOTAL, settings.reduceMotion);

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
  const isChecked = checkedLocal || (period ? checkedPeriods.includes(period) : false);

  const comparisons = useMemo(() => buildComparison(sims, drawsAsc), [sims, drawsAsc]);
  const summary = useMemo(() => summarizeSims(comparisons), [comparisons]);

  const isToday = selectedDate === localDateKey();
  const showCount = phase === 'done' ? TOTAL : phase === 'revealing' ? reveal.step : 0;
  const checkStep = checking ? check.step : isChecked ? TOTAL : 0;

  // 切换日期时重置仪式状态；已有记录的期直接呈现结果
  useEffect(() => {
    setSelectedDate(focusDate);
  }, [focusDate]);

  useEffect(() => {
    setChecking(false);
    setCheckedLocal(false);
    check.setStep(0);
    if (recorded) {
      setPhase('done');
      reveal.setStep(TOTAL);
    } else {
      setPhase('idle');
      reveal.setStep(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, recorded?.createdAt]);

  useEffect(() => {
    setManualOpen(false);
    setDraft(real ? [...real.n.map((n) => pad2(n)), pad2(real.s)] : ['', '', '', '', '', '', '']);
    setManualError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, real?.id]);

  // 自动补齐的历史期：直接显示对奖结果，不需要再走仪式
  useEffect(() => {
    if (recorded?.auto && real && !isChecked) {
      setCheckedLocal(true);
      actions.markChecked(period);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorded?.auto, real?.id, isChecked, period]);

  const startDraw = () => {
    if (!period || recorded || phase === 'revealing') return;
    setPhase('revealing');
    reveal.play(() => {
      actions.archiveSim({
        period,
        date: periodMeta?.date ?? selectedDate,
        attempt: 0,
        main: ticket.main,
        special: ticket.special,
        createdAt: new Date().toISOString()
      });
      setPhase('done');
      actions.toast(`${period} 已落定 · 明天再来`, 'success');
    });
  };

  const replay = () => {
    if (!period) return;
    setPhase('revealing');
    reveal.play(() => setPhase('done'));
  };

  const startCheck = () => {
    if (!recorded || !real) return;
    setChecking(true);
    check.play(() => {
      setChecking(false);
      setCheckedLocal(true);
      actions.markChecked(period);
    });
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

  const renderSlot = (index: number) => {
    const special = index === 6;
    const number = special ? ticket.special : ticket.main[index];
    const visible = index < showCount;

    if (!visible) {
      return (
        <span key={index} className={special ? 'slot is-special' : 'slot'} aria-hidden="true">
          {special ? '特' : index + 1}
        </span>
      );
    }

    const matched = Boolean(
      real &&
        recorded &&
        index < checkStep &&
        (special ? recorded.special === real.s : real.n.includes(number))
    );

    return (
      <Ball
        key={index}
        number={number}
        special={special}
        size="lg"
        matched={matched}
        zodiac={settings.showZodiac ? zodiacOf(number, periodMeta?.date ?? selectedDate) : undefined}
      />
    );
  };

  const title =
    phase === 'idle'
      ? isToday
        ? '今日尚未开摇'
        : `${period || '这一期'} 尚未开摇`
      : phase === 'revealing'
        ? '揭晓中…'
        : recorded?.auto
          ? '这一期已经揭晓'
          : '今日号码已定';

  const desc =
    phase === 'idle'
      ? '每天只有一次。点「开摇」，6 个主号依次落位，最后揭晓特码。'
      : phase === 'revealing'
        ? undefined
        : '号码由期号决定，刷新、换设备都是同一注。';

  return (
    <div className="stack">
      <div className="period-switch">
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          onClick={() => setSelectedDate(addDays(selectedDate, -1))}
          aria-label="上一天"
        >
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
          disabled={selectedDate >= addDays(localDateKey(), 7)}
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
        kicker={`${isToday ? 'TODAY' : 'PERIOD'} · ${period || '—'}`}
        title={title}
        desc={desc}
        actions={recorded ? <Chip tone="success" dot>已锁定</Chip> : <Chip>今日一次</Chip>}
        className="ceremony-card"
      >
        <div
          className={[
            'slots',
            phase === 'revealing' ? 'is-revealing' : '',
            settings.reduceMotion ? 'is-reduced' : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {Array.from({ length: TOTAL }, (_, i) => renderSlot(i))}
        </div>

        {phase === 'revealing' ? (
          <p className="reveal-status">
            正在揭晓 <b>{reveal.step}</b> / {TOTAL}
          </p>
        ) : null}

        <div className="action-row action-row-center">
          {phase === 'idle' ? (
            <button type="button" className="btn btn-primary btn-lg" onClick={startDraw} disabled={!period}>
              开摇
            </button>
          ) : null}
          {phase === 'done' ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={replay}>
                回看揭晓
              </button>
              <button type="button" className="btn btn-secondary" onClick={copy}>
                复制号码
              </button>
            </>
          ) : null}
        </div>

        {phase === 'done' ? (
          <div className="stamp">
            <span className="stamp-period">{period}</span>
            <span className="stamp-date">{formatDate(periodMeta?.date ?? selectedDate)}</span>
            <span className="stamp-line" />
            <span className="stamp-note">{recorded?.auto ? '自动补齐 · 可删除重摇' : '已落定 · 每天一次'}</span>
          </div>
        ) : (
          <p className="footnote center">
            号码由期号决定：{period || '—'} 永远是这一注，无法重抽。
          </p>
        )}
      </Card>

      <Card
        kicker="开奖对照"
        title={real ? `${real.id} 真实开奖` : '等待开奖'}
        desc={real ? formatDate(real.date) : '上游同步到这一期后会自动对照，也可以手动补录。'}
        actions={
          real ? (
            recorded ? (
              isChecked ? (
                <>
                  <Chip tone={hit?.specialHit ? 'accent' : 'neutral'}>
                    {hit?.mainHits ?? 0} 主号 · {hit?.specialHit ? '特码中' : '特码未中'}
                  </Chip>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={startCheck}>
                    再对一次
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={startCheck} disabled={checking}>
                  {checking ? <Spinner size={11} /> : null}
                  {checking ? `对奖中 ${check.step}/7` : '对奖'}
                </button>
              )
            ) : (
              <Chip>待摇号</Chip>
            )
          ) : (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setManualOpen((v) => !v)}>
              {manualOpen ? '收起' : '手动补录'}
            </button>
          )
        }
      >
        {real ? (
          <>
            <BallRow main={real.n} special={real.s} size="md" showZodiac={settings.showZodiac} date={real.date} />

            {recorded ? (
              isChecked ? (
                <div className="result-strip">
                  <div>
                    <span>主号命中</span>
                    <strong>
                      {hit?.mainHits ?? 0}
                      <em>/6</em>
                    </strong>
                  </div>
                  <div>
                    <span>特码</span>
                    <strong className={hit?.specialHit ? 'text-good' : ''}>{hit?.specialHit ? '命中' : '未中'}</strong>
                  </div>
                  <div>
                    <span>随机期望</span>
                    <strong className="muted">{BASELINE.mainMean.toFixed(2)} / 6</strong>
                  </div>
                </div>
              ) : (
                <p className="footnote">
                  {checking ? '正在逐个核对…' : '号码已锁定，点右上角「对奖」逐号核对。'}
                </p>
              )
            ) : (
              <p className="footnote">这一期还没有模拟号码，先在上方摇一注。</p>
            )}
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
          <Empty title="这一期还没开奖" desc="开奖后回来，会有一次逐号对奖。" />
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
