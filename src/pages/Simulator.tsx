import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BallRow, Badge, EmptyState, Panel, Segmented, Spinner } from '../components/primitives';
import { useApp } from '../state';
import { simulateTicket } from '../lib/rng';
import { useDrawAnimation } from '../lib/useDraw';
import { checkHit } from '../lib/stats';
import { dateForPeriod, formatDate, localDateKey, parsePeriod, periodForDate, addDays } from '../lib/periods';
import { pad2 } from '../lib/lottery';
import { copyText, ticketToText } from '../lib/clipboard';
import type { Draw, SimRecord } from '../lib/types';

const MAX_ATTEMPTS = 3;
const PAGE_SIZE = 8;

function NumberInputs({
  values,
  onChange,
  invalid
}: {
  values: string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const setAt = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    const next = values.slice();
    next[index] = digits;
    onChange(next);
    if (digits.length === 2 && index < values.length - 1) refs.current[index + 1]?.focus();
  };

  const handlePaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    const parts = text.split(/[^0-9]+/).filter(Boolean);
    if (parts.length < 2) return;
    event.preventDefault();
    const next = values.slice();
    parts.slice(0, values.length - index).forEach((part, i) => {
      const n = Number(part);
      if (n >= 1 && n <= 49) next[index + i] = pad2(n);
    });
    onChange(next);
    const lastFilled = Math.min(values.length - 1, index + parts.length - 1);
    refs.current[lastFilled]?.focus();
  };

  return (
    <div className={`num-inputs ${invalid ? 'is-invalid' : ''}`}>
      {values.map((value, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          value={value}
          placeholder={i === 6 ? '特' : pad2(i + 1)}
          aria-label={i === 6 ? '特码' : `第 ${i + 1} 个主号`}
          className={`num-input ${i === 6 ? 'is-special' : ''}`}
          onChange={(e) => setAt(i, e.target.value)}
          onPaste={(e) => handlePaste(i, e)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !values[i] && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowRight' && i < values.length - 1) refs.current[i + 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}

export default function Simulator() {
  const { drawsAsc, sims, nextMeta, settings, actions } = useApp();
  const [selectedDate, setSelectedDate] = useState(nextMeta.date);
  const [activeAttempt, setActiveAttempt] = useState(0);
  const [filter, setFilter] = useState<'all' | 'settled' | 'pending'>('all');
  const [page, setPage] = useState(1);
  const [manualOpen, setManualOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(['', '', '', '', '', '', '']);
  const [manualError, setManualError] = useState('');

  useEffect(() => {
    setSelectedDate(nextMeta.date);
  }, [nextMeta.date]);

  const periodMeta = parsePeriod(periodForDate(selectedDate));
  const period = periodMeta?.id ?? '';
  const byPeriod = useMemo(() => new Map(drawsAsc.map((d) => [d.id, d])), [drawsAsc]);
  const real = period ? byPeriod.get(period) ?? null : null;

  const periodSims = useMemo(
    () => sims.filter((s) => s.period === period).sort((a, b) => a.attempt - b.attempt),
    [sims, period]
  );
  const activeSim = periodSims.find((s) => s.attempt === activeAttempt) ?? periodSims[0] ?? null;
  const ticket = activeSim ?? simulateTicket(period || '2026-001', 0);
  const usedAttempts = new Set(periodSims.map((s) => s.attempt));
  const nextAttempt = [0, 1, 2].find((a) => !usedAttempts.has(a));
  const remaining = MAX_ATTEMPTS - usedAttempts.size;

  const compare = real && activeSim ? checkHit(real, activeSim) : null;

  const { display, drawing, play } = useDrawAnimation(settings.reduceMotion);
  const shown = display ?? ticket;

  useEffect(() => {
    if (periodSims.length && !periodSims.some((s) => s.attempt === activeAttempt)) {
      setActiveAttempt(periodSims[0].attempt);
    }
  }, [periodSims, activeAttempt]);

  useEffect(() => {
    if (real && !periodSims.length) setManualOpen(false);
  }, [real, periodSims.length]);

  useEffect(() => {
    if (period) {
      setDraft(real ? [...real.n.map((n) => pad2(n)), pad2(real.s)] : ['', '', '', '', '', '', '']);
      setManualError('');
    }
  }, [period, real]);

  const draw = useCallback(() => {
    if (!period) return;
    if (nextAttempt == null) {
      actions.toast(`${period} 的 ${MAX_ATTEMPTS} 次机会已用完，可以重播已有结果`, 'error');
      return;
    }
    const result = simulateTicket(period, nextAttempt);
    play(result);
    const record: SimRecord = {
      period,
      date: periodMeta?.date ?? selectedDate,
      attempt: nextAttempt,
      main: result.main,
      special: result.special,
      createdAt: new Date().toISOString()
    };
    window.setTimeout(() => {
      actions.archiveSim(record);
      setActiveAttempt(nextAttempt);
      actions.toast(`第 ${nextAttempt + 1} 次摇号已保存`, 'success');
    }, settings.reduceMotion ? 0 : 1500);
  }, [actions, nextAttempt, period, periodMeta?.date, play, selectedDate, settings.reduceMotion]);

  const handleCopy = async () => {
    const ok = await copyText(ticketToText(shown.main, shown.special));
    actions.toast(ok ? '号码已复制' : '复制失败', ok ? 'success' : 'error');
  };

  const submitManual = () => {
    const nums = draft.map((v) => Number(v));
    if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 49)) {
      setManualError('每个位置都要填 01~49 的号码');
      return;
    }
    const main = nums.slice(0, 6);
    const special = nums[6];
    if (new Set(main).size !== 6) {
      setManualError('6 个主号不能重复');
      return;
    }
    if (main.includes(special)) {
      setManualError('特码不能与主号重复');
      return;
    }
    const record: Draw = { id: period, date: periodMeta?.date ?? selectedDate, n: main.slice().sort((a, b) => a - b), s: special };
    actions.saveOverride(record);
    actions.toast(`已补录 ${period} 开奖结果`, 'success');
    setManualOpen(false);
  };

  const rows = useMemo(() => {
    const list = sims
      .slice()
      .sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : a.attempt - b.attempt))
      .map((sim) => ({ sim, draw: byPeriod.get(sim.period) ?? null }));
    if (filter === 'settled') return list.filter((r) => r.draw);
    if (filter === 'pending') return list.filter((r) => !r.draw);
    return list;
  }, [sims, byPeriod, filter]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);

  const shiftDate = (delta: number) => setSelectedDate((d) => addDays(d, delta));

  return (
    <div className="page-stack">
      <Panel
        kicker="PICK A PERIOD · 选期"
        title="选择期号"
        desc="按日期选期（期号 = 当年第几天）。历史期可以随时补摇，用来积累对照样本。"
        actions={
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSelectedDate(localDateKey())}>
            回到今天
          </button>
        }
      >
        <div className="period-bar">
          <button type="button" className="btn btn-secondary icon-btn" onClick={() => shiftDate(-1)} aria-label="前一天">
            ‹
          </button>
          <input
            type="date"
            className="input date-input"
            value={selectedDate}
            min="2022-01-01"
            max="2027-12-31"
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <button type="button" className="btn btn-secondary icon-btn" onClick={() => shiftDate(1)} aria-label="后一天">
            ›
          </button>
          <div className="period-info">
            <strong>{period || '无效日期'}</strong>
            <span>{period ? formatDate(periodMeta?.date ?? selectedDate) : '请选择 2022 年之后的日期'}</span>
          </div>
          <div className="period-status">
            {real ? <Badge tone="success" dot>已开奖</Badge> : <Badge tone="warn" dot>未开奖</Badge>}
            {real ? null : (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setManualOpen((v) => !v)}>
                {manualOpen ? '收起补录' : '手动补录'}
              </button>
            )}
          </div>
        </div>

        {manualOpen && !real ? (
          <div className="manual-box">
            <div className="manual-head">
              <strong>补录 {period} 开奖结果</strong>
              <span>支持直接粘贴「01,05,12,23,31,45,18」</span>
            </div>
            <NumberInputs values={draft} onChange={setDraft} invalid={Boolean(manualError)} />
            {manualError ? <p className="form-error">{manualError}</p> : null}
            <div className="manual-actions">
              <button type="button" className="btn btn-primary" onClick={submitManual}>
                保存开奖结果
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setManualOpen(false)}>
                取消
              </button>
            </div>
          </div>
        ) : null}
      </Panel>

      <div className="sim-grid">
        <section className={`sim-stage ${drawing ? 'is-drawing' : ''}`}>
          <header className="sim-head">
            <div>
              <span className="hero-kicker">SIMULATION · {period || '—'}</span>
              <h2>{activeSim ? `第 ${activeSim.attempt + 1} 次摇号` : '本期尚未摇号'}</h2>
            </div>
            <div className="sim-attempts">
              {[0, 1, 2].map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`attempt-dot ${usedAttempts.has(a) ? 'is-used' : ''} ${activeSim?.attempt === a ? 'is-active' : ''}`}
                  disabled={!periodSims.some((s) => s.attempt === a)}
                  onClick={() => setActiveAttempt(a)}
                  title={`第 ${a + 1} 次`}
                >
                  {a + 1}
                </button>
              ))}
            </div>
          </header>

          <div className="sim-balls">
            <BallRow main={shown.main} special={shown.special} size="lg" showZodiac={settings.showZodiac} date={periodMeta?.date} />
          </div>

          <div className="sim-actions">
            <button type="button" className="btn btn-primary" onClick={draw} disabled={drawing || !period || remaining <= 0}>
              {drawing ? <Spinner /> : null}
              {drawing ? '摇号中…' : remaining > 0 ? `摇号（剩 ${remaining} 次）` : '次数已用完'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => play(ticket)} disabled={drawing || !period}>
              重播
            </button>
            <button type="button" className="btn btn-quiet" onClick={handleCopy}>
              复制
            </button>
            {activeSim ? (
              <button
                type="button"
                className="btn btn-danger-quiet"
                onClick={() => {
                  actions.removeSim(activeSim.period);
                  actions.toast('已删除本期全部模拟记录', 'info');
                }}
              >
                删除本期
              </button>
            ) : null}
          </div>
          <footer className="sim-foot">
            结果由「期号 + 尝试次数」决定，同一组合永远得到同一注号码。每期最多 {MAX_ATTEMPTS} 次。
          </footer>
        </section>

        <Panel
          kicker="REAL RESULT · 真实开奖"
          title={real ? `${real.id} 开奖` : '等待开奖'}
          desc={real ? formatDate(real.date) : '可在上方「手动补录」或到数据页同步最新开奖。'}
          actions={real ? <Badge tone="success">数据源</Badge> : null}
        >
          {real ? (
            <>
              <BallRow
                main={real.n}
                special={real.s}
                size="md"
                showZodiac={settings.showZodiac}
                date={real.date}
                matched={compare?.matchedMain ?? []}
                specialMatched={compare?.specialHit ?? false}
              />
              <div className="hit-board">
                <div className="hit-main">
                  <span>主号命中</span>
                  <strong>
                    {compare ? compare.mainHits : '—'}
                    <em>/6</em>
                  </strong>
                </div>
                <div className={`hit-special ${compare?.specialHit ? 'is-hit' : ''}`}>
                  <span>特码</span>
                  <strong>{compare ? (compare.specialHit ? '命中' : '未中') : '—'}</strong>
                </div>
              </div>
              {!activeSim ? <p className="hint-line">先摇号，才能和这一期做对照。</p> : null}
            </>
          ) : (
            <EmptyState
              title="这一期还没有开奖数据"
              desc="开奖后会自动同步（数据来自 Number-selection-tool 仓库）。也可以手动补录。"
              icon="⌛"
            />
          )}
        </Panel>
      </div>

      <Panel
        kicker="ARCHIVE · 模拟档案"
        title="我的模拟记录"
        desc={`共 ${sims.length} 条摇号记录，其中 ${sims.filter((s) => byPeriod.has(s.period)).length} 条已开奖可对照。`}
        actions={
          <Segmented
            size="sm"
            ariaLabel="筛选记录"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: '全部' },
              { value: 'settled', label: '已开奖' },
              { value: 'pending', label: '待开奖' }
            ]}
          />
        }
        padded={false}
      >
        {rows.length ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>期号</th>
                    <th>模拟号码</th>
                    <th>真实开奖</th>
                    <th>结果</th>
                    <th aria-label="操作" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(({ sim, draw }) => {
                    const hit = draw ? checkHit(draw, sim) : null;
                    return (
                      <tr key={`${sim.period}-${sim.attempt}`} className={hit?.specialHit ? 'row-hit' : ''}>
                        <td>
                          <div className="cell-period">
                            <strong>{sim.period}</strong>
                            <span>
                              {formatDate(sim.date, { withYear: false })}
                              {sim.attempt > 0 ? ` · 第 ${sim.attempt + 1} 次` : ''}
                            </span>
                          </div>
                        </td>
                        <td>
                          <BallRow
                            main={sim.main}
                            special={sim.special}
                            size="xs"
                            matched={hit?.matchedMain ?? []}
                            specialMatched={hit?.specialHit}
                          />
                        </td>
                        <td>
                          {draw ? (
                            <BallRow main={draw.n} special={draw.s} size="xs" />
                          ) : (
                            <span className="muted-text">待开奖</span>
                          )}
                        </td>
                        <td>
                          {hit ? (
                            <div className="result-cell">
                              <Badge tone={hit.specialHit ? 'success' : 'neutral'}>{hit.mainHits} 主号</Badge>
                              <span className={hit.specialHit ? 'text-good' : 'muted-text'}>
                                {hit.specialHit ? '特码中' : '特码未中'}
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
                            onClick={() => {
                              setSelectedDate(sim.date);
                              setActiveAttempt(sim.attempt);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            查看
                          </button>
                          <button
                            type="button"
                            className="link-btn link-danger"
                            onClick={() => {
                              actions.removeSim(sim.period);
                              actions.toast('已删除', 'info');
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
                第 {Math.min(page, pageCount)} / {pageCount} 页 · 共 {rows.length} 条
              </span>
              <div className="pager">
                <button type="button" className="btn btn-quiet btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  上一页
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="panel-body">
            <EmptyState title="还没有模拟记录" desc="选一个日期，点「摇号」就会出现在这里。" icon="◍" />
          </div>
        )}
      </Panel>

      <p className="page-note">
        提示：历史期也允许补摇，但「{formatDate(dateForPeriod(period || '2026-001'), { withYear: false })}」这类旧期开奖早已公布，补摇不具备任何预测意义，只适合做样本对照。
      </p>
    </div>
  );
}
