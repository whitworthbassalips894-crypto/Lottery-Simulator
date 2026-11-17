/**
 * 回测引擎：逐期滚动、严格无未来函数
 * ------------------------------------------------------------------
 * 对每一期 i：
 *   1. 只用 draws[0..i-1] 的统计量给策略打分 → 生成 6+1 注单；
 *   2. 拿 draws[i] 核对命中；
 *   3. 再把 draws[i] 加入统计量。
 */

import { ALL_NUMBERS } from './lottery';
import { BASELINE, binomialPValue, hypergeometric, missStreaks, wilsonInterval } from './stats';
import {
  createStats,
  rankByStrategy,
  ticketFromRank,
  updateStats,
  type StrategyId
} from './strategies';
import type { Draw, HitSummary } from './types';

export interface BacktestOptions {
  strategyIds: StrategyId[];
  /** 只回测最近 N 期；0 或未传 = 全部 */
  periods?: number;
  /** 从某期开始（含），优先级高于 periods */
  fromPeriod?: string;
  /** 预热期：至少积累多少期历史才开始计入（默认 30） */
  warmup?: number;
}

export interface PickRow {
  period: string;
  date: string;
  main: number[];
  special: number;
  realMain: number[];
  realSpecial: number;
  mainHits: number;
  specialHit: boolean;
}

export interface YearRow {
  year: number;
  periods: number;
  specialHits: number;
  specialRate: number;
  mainMean: number;
}

export interface StrategyResult {
  id: StrategyId;
  periods: number;
  specialHits: number;
  specialRate: number;
  specialCi: [number, number];
  pValue: number;
  mainHitsTotal: number;
  mainMean: number;
  mainMeanCi: [number, number];
  mainDist: number[];
  mainExpectedDist: number[];
  main3Plus: number;
  main1Plus: number;
  maxMainHits: number;
  longestMiss: number;
  currentMiss: number;
  curve: number[];
  years: YearRow[];
  recent: PickRow[];
  best: PickRow | null;
  hitPeriods: PickRow[];
}

export interface BacktestResult {
  ranAt: string;
  range: { from: string; to: string; periods: number };
  baseline: typeof BASELINE;
  strategies: StrategyResult[];
}

function expectedMainDist(): number[] {
  return Array.from({ length: 7 }, (_, k) => hypergeometric(49, 6, 6, k));
}

export function mainMeanVariance(): number {
  const N = 49;
  const K = 6;
  const n = 6;
  return n * (K / N) * ((N - K) / N) * ((N - n) / (N - 1));
}

export function runBacktest(
  drawsAsc: Draw[],
  options: BacktestOptions,
  onProgress?: (ratio: number, label: string) => void
): BacktestResult {
  const ids = options.strategyIds.length ? options.strategyIds : (['random'] as StrategyId[]);
  const warmup = Math.max(1, options.warmup ?? 30);

  let startIndex = 0;
  if (options.fromPeriod) {
    const idx = drawsAsc.findIndex((d) => d.id === options.fromPeriod);
    if (idx >= 0) startIndex = idx;
  } else if (options.periods && options.periods > 0) {
    startIndex = Math.max(0, drawsAsc.length - options.periods);
  }
  startIndex = Math.max(startIndex, warmup);

  const stats = createStats();
  for (let i = 0; i < startIndex; i++) updateStats(stats, drawsAsc[i]);

  const acc = new Map<StrategyId, StrategyResult>();
  ids.forEach((id) => {
    acc.set(id, {
      id,
      periods: 0,
      specialHits: 0,
      specialRate: 0,
      specialCi: [0, 0],
      pValue: 1,
      mainHitsTotal: 0,
      mainMean: 0,
      mainMeanCi: [0, 0],
      mainDist: new Array(7).fill(0),
      mainExpectedDist: expectedMainDist(),
      main3Plus: 0,
      main1Plus: 0,
      maxMainHits: 0,
      longestMiss: 0,
      currentMiss: 0,
      curve: [],
      years: [],
      recent: [],
      best: null,
      hitPeriods: []
    });
  });

  const yearMaps = new Map<StrategyId, Map<number, YearRow>>();
  ids.forEach((id) => yearMaps.set(id, new Map()));
  const hitTrackers = new Map<StrategyId, HitSummary[]>();
  const recentRows = new Map<StrategyId, PickRow[]>();

  const total = Math.max(1, drawsAsc.length - startIndex);
  let done = 0;

  for (let i = startIndex; i < drawsAsc.length; i++) {
    const draw = drawsAsc[i];
    const seedKey = draw.id;
    for (const id of ids) {
      const result = acc.get(id)!;
      const ticket = ticketFromRank(rankByStrategy(stats, id, seedKey));
      const realMainSet = new Set(draw.n);
      const mainHits = ticket.main.filter((n) => realMainSet.has(n)).length;
      const specialHit = ticket.special === draw.s;

      result.periods++;
      result.mainHitsTotal += mainHits;
      result.mainDist[mainHits]++;
      if (specialHit) result.specialHits++;
      if (mainHits >= 3) result.main3Plus++;
      if (mainHits >= 1) result.main1Plus++;
      result.maxMainHits = Math.max(result.maxMainHits, mainHits);
      result.curve.push(result.specialHits);

      const row: PickRow = {
        period: draw.id,
        date: draw.date,
        main: ticket.main,
        special: ticket.special,
        realMain: draw.n,
        realSpecial: draw.s,
        mainHits,
        specialHit
      };
      if (specialHit) result.hitPeriods.push(row);
      const rows = recentRows.get(id) ?? [];
      rows.push(row);
      if (rows.length > 24) rows.shift();
      recentRows.set(id, rows);
      if (!result.best || mainHits > result.best.mainHits || (mainHits === result.best.mainHits && specialHit)) {
        result.best = row;
      }

      const year = Number(draw.id.slice(0, 4));
      const yearMap = yearMaps.get(id)!;
      const yearRow = yearMap.get(year) ?? { year, periods: 0, specialHits: 0, specialRate: 0, mainMean: 0 };
      yearRow.periods++;
      yearRow.specialHits += specialHit ? 1 : 0;
      yearRow.mainMean += mainHits;
      yearMap.set(year, yearRow);

      const tracker = hitTrackers.get(id) ?? [];
      tracker.push({ mainHits, specialHit, matchedMain: [] });
      hitTrackers.set(id, tracker);
    }
    done++;
    if (onProgress && (done % 80 === 0 || done === total)) onProgress(done / total, draw.id);
  }

  ids.forEach((id) => {
    const result = acc.get(id)!;
    const periods = result.periods || 1;
    result.specialRate = result.specialHits / periods;
    result.specialCi = wilsonInterval(result.specialHits, periods);
    result.pValue = binomialPValue(result.specialHits, periods, BASELINE.specialRate);
    result.mainMean = result.mainHitsTotal / periods;
    const se = Math.sqrt(mainMeanVariance() / periods);
    result.mainMeanCi = [result.mainMean - 1.96 * se, result.mainMean + 1.96 * se];
    result.main3Plus = result.main3Plus / periods;
    result.main1Plus = result.main1Plus / periods;
    result.recent = recentRows.get(id) ?? [];
    const streaks = missStreaks(hitTrackers.get(id) ?? []);
    result.longestMiss = streaks.longest;
    result.currentMiss = streaks.current;

    const yearMap = yearMaps.get(id)!;
    result.years = [...yearMap.values()]
      .sort((a, b) => a.year - b.year)
      .map((row) => ({
        ...row,
        specialRate: row.specialHits / row.periods,
        mainMean: row.mainMean / row.periods
      }));
  });

  const from = drawsAsc[startIndex]?.id ?? '—';
  const to = drawsAsc[drawsAsc.length - 1]?.id ?? '—';

  return {
    ranAt: new Date().toISOString(),
    range: { from, to, periods: Math.max(0, drawsAsc.length - startIndex) },
    baseline: BASELINE,
    strategies: ids.map((id) => acc.get(id)!)
  };
}

/** 单期推荐（线上/线下同一个函数，保证回测与展示一致） */
export function recommendTicket(drawsAsc: Draw[], strategyId: StrategyId): { main: number[]; special: number } {
  const stats = createStats();
  drawsAsc.forEach((d) => updateStats(stats, d));
  const seedKey = `next:${drawsAsc.length}`;
  return ticketFromRank(rankByStrategy(stats, strategyId, seedKey));
}

export const ALL_NUMBERS_LIST = ALL_NUMBERS;
