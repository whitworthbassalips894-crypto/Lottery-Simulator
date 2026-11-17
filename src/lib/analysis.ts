/** 页面级派生计算：模拟注单与真实开奖的对照、冷热与形态摘要 */

import { BASELINE, checkHit, frequency, missStreaks, type FrequencyRow } from './stats';
import type { Draw, HitSummary, SimRecord } from './types';
import { shapeOf } from './lottery';

export function indexDraws(draws: Draw[]): Map<string, Draw> {
  const map = new Map<string, Draw>();
  draws.forEach((d) => map.set(d.id, d));
  return map;
}

/** 每期只取最早一次（attempt 最小）的模拟注单作为「当期主推」 */
export function officialSims(sims: SimRecord[]): SimRecord[] {
  const map = new Map<string, SimRecord>();
  sims.forEach((s) => {
    const prev = map.get(s.period);
    if (!prev || s.attempt < prev.attempt) map.set(s.period, s);
  });
  return [...map.values()].sort((a, b) => (a.period < b.period ? -1 : 1));
}

export interface ComparisonRow {
  sim: SimRecord;
  draw: Draw;
  hit: HitSummary;
}

export function buildComparison(sims: SimRecord[], drawsAsc: Draw[]): ComparisonRow[] {
  const byPeriod = indexDraws(drawsAsc);
  return officialSims(sims)
    .map((sim) => {
      const draw = byPeriod.get(sim.period);
      if (!draw) return null;
      return { sim, draw, hit: checkHit(draw, sim) };
    })
    .filter((row): row is ComparisonRow => Boolean(row));
}

export interface SimSummary {
  periods: number;
  specialHits: number;
  specialRate: number;
  mainMean: number;
  mainDist: number[];
  longestMiss: number;
  currentMiss: number;
}

export function summarizeSims(rows: ComparisonRow[]): SimSummary {
  const periods = rows.length;
  const specialHits = rows.filter((r) => r.hit.specialHit).length;
  const mainDist = new Array(7).fill(0);
  let mainTotal = 0;
  rows.forEach((r) => {
    mainDist[r.hit.mainHits]++;
    mainTotal += r.hit.mainHits;
  });
  const streaks = missStreaks(rows.map((r) => r.hit));
  return {
    periods,
    specialHits,
    specialRate: periods ? specialHits / periods : 0,
    mainMean: periods ? mainTotal / periods : 0,
    mainDist,
    longestMiss: streaks.longest,
    currentMiss: streaks.current
  };
}

/** 近 N 期频率（按时间升序输入） */
export function recentFrequency(drawsAsc: Draw[], window: number): FrequencyRow[] {
  const slice = window > 0 ? drawsAsc.slice(-window) : drawsAsc;
  return frequency(slice);
}

export interface HotCold {
  hot: FrequencyRow[];
  cold: FrequencyRow[];
  missing: FrequencyRow[];
}

export function hotCold(rows: FrequencyRow[]): HotCold {
  const hot = rows.slice().sort((a, b) => b.count - a.count || a.omission - b.omission).slice(0, 6);
  const cold = rows.slice().sort((a, b) => a.count - b.count || b.omission - a.omission).slice(0, 6);
  const missing = rows.slice().sort((a, b) => b.omission - a.omission).slice(0, 6);
  return { hot, cold, missing };
}

export function latestShapes(drawsAsc: Draw[], count = 8) {
  return drawsAsc.slice(-count).reverse().map((d) => ({ draw: d, shape: shapeOf(d.n) }));
}

export const BASELINE_LINE = (n: number): number => n * BASELINE.specialRate;
