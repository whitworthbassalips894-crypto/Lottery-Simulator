/** 命中核对与随机基线（只保留本工具用得到的最小集合） */

import type { Draw, HitSummary } from './types';

export const BASELINE = {
  /** 特码单注命中率 1/49 */
  specialRate: 1 / 49,
  /** 6 个主号的平均命中数 6 × 6/49 */
  mainMean: (6 * 6) / 49
};

/** 命中核对：6 个主号 + 1 个特码 */
export function checkHit(real: Draw, pick: { main: number[]; special: number }): HitSummary {
  const realMain = new Set(real.n);
  const matchedMain = pick.main.filter((n) => realMain.has(n));
  return {
    mainHits: matchedMain.length,
    specialHit: pick.special === real.s,
    matchedMain
  };
}
