/** 模拟注单与真实开奖的对照统计 */

import { checkHit } from './stats';
import type { Draw, HitSummary, SimRecord } from './types';

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
  bestMainHits: number;
}

export function summarizeSims(rows: ComparisonRow[]): SimSummary {
  const periods = rows.length;
  let specialHits = 0;
  let mainTotal = 0;
  let bestMainHits = 0;
  rows.forEach((r) => {
    if (r.hit.specialHit) specialHits++;
    mainTotal += r.hit.mainHits;
    bestMainHits = Math.max(bestMainHits, r.hit.mainHits);
  });
  return {
    periods,
    specialHits,
    specialRate: periods ? specialHits / periods : 0,
    mainMean: periods ? mainTotal / periods : 0,
    bestMainHits
  };
}
