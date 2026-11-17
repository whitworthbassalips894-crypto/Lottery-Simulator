/** 统计工具：频率 / 遗漏 / 组合概率 / 置信区间 / 显著性 */

import { ALL_NUMBERS, isBig, isOdd, shapeOf, tailOf, waveOf, WAVE_ORDER, zoneOf, type Wave } from './lottery';
import type { Draw, HitSummary } from './types';

export interface FrequencyRow {
  number: number;
  count: number;
  specialCount: number;
  rate: number;
  lastSeenIndex: number;
  omission: number;
}

/** 号码频率与遗漏（draws 按时间升序） */
export function frequency(draws: Draw[], specialWeight = false): FrequencyRow[] {
  const counts = new Map<number, { count: number; specialCount: number; last: number }>();
  ALL_NUMBERS.forEach((n) => counts.set(n, { count: 0, specialCount: 0, last: -1 }));
  draws.forEach((draw, idx) => {
    draw.n.forEach((n) => {
      const row = counts.get(n);
      if (row) {
        row.count++;
        row.last = idx;
      }
    });
    const sp = counts.get(draw.s);
    if (sp) {
      sp.specialCount++;
      sp.count += specialWeight ? 2 : 1;
      sp.last = idx;
    }
  });
  const total = Math.max(1, draws.length);
  return ALL_NUMBERS.map((n) => {
    const row = counts.get(n)!;
    return {
      number: n,
      count: row.count,
      specialCount: row.specialCount,
      rate: row.count / total,
      lastSeenIndex: row.last,
      omission: row.last < 0 ? total : draws.length - 1 - row.last
    };
  });
}

/** 每个号码的遗漏期数（从未出现 = 样本长度） */
export function omissions(draws: Draw[]): Map<number, number> {
  const map = new Map<number, number>();
  ALL_NUMBERS.forEach((n) => map.set(n, draws.length));
  for (let i = draws.length - 1; i >= 0; i--) {
    const draw = draws[i];
    const seen = new Set([...draw.n, draw.s]);
    seen.forEach((n) => {
      if (map.get(n) === draws.length) map.set(n, draws.length - 1 - i);
    });
  }
  return map;
}

export function averageOmission(draws: Draw[]): number {
  return draws.length ? draws.length / 7 : 0;
}

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

/** 组合数 */
export function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  const m = Math.min(k, n - k);
  for (let i = 1; i <= m; i++) result = (result * (n - m + i)) / i;
  return Math.round(result);
}

/** 超几何分布：从 N 个号中开的 K 个号里，命中用户选 n 个号中的 k 个 */
export function hypergeometric(N: number, K: number, n: number, k: number): number {
  return (comb(K, k) * comb(N - K, n - k)) / comb(N, n);
}

export const BASELINE = {
  /** 特码单注命中率 1/49 */
  specialRate: 1 / 49,
  /** 6 个主号的平均命中数 6 × 6/49 */
  mainMean: (6 * 6) / 49,
  /** 主号命中数 ≥3 的随机概率 */
  main3Plus: 1 - [0, 1, 2].reduce((acc, k) => acc + hypergeometric(49, 6, 6, k), 0),
  /** 主号至少中 1 个的随机概率 */
  main1Plus: 1 - hypergeometric(49, 6, 6, 0),
  /** 6+1 全中的概率（纯理论） */
  jackpot: 1 / (comb(49, 6) * 43)
};

/** 正态分布 CDF（Abramowitz-Stegun 近似） */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** 二项检验的双侧 p 值（正态近似） */
export function binomialPValue(hits: number, trials: number, p: number): number {
  if (!trials) return 1;
  const mean = trials * p;
  const sd = Math.sqrt(trials * p * (1 - p));
  if (sd < 1e-9) return 1;
  const z = (hits - mean) / sd;
  return Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
}

/** Wilson 置信区间 */
export function wilsonInterval(hits: number, trials: number, z = 1.96): [number, number] {
  if (!trials) return [0, 0];
  const p = hits / trials;
  const denom = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/** 移动平均 */
export function movingAverage(values: number[], window: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(sum / Math.min(i + 1, window));
  }
  return out;
}

export interface DistributionBucket {
  key: string;
  label: string;
  count: number;
  rate: number;
}

function bucketOf(draws: Draw[], totalNumbers: number, classify: (n: number) => string, labels: Record<string, string>): DistributionBucket[] {
  const counts = new Map<string, number>();
  Object.keys(labels).forEach((k) => counts.set(k, 0));
  draws.forEach((d) => {
    [...d.n, d.s].forEach((n) => {
      const key = classify(n);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });
  const total = Math.max(1, draws.length * totalNumbers);
  return Object.keys(labels).map((key) => ({
    key,
    label: labels[key],
    count: counts.get(key) ?? 0,
    rate: (counts.get(key) ?? 0) / total
  }));
}

/** 波色分布 */
export function waveDistribution(draws: Draw[]): DistributionBucket[] {
  const labels: Record<Wave, string> = { red: '红波', blue: '蓝波', green: '绿波' };
  return bucketOf(draws, 7, (n) => waveOf(n), labels).sort(
    (a, b) => WAVE_ORDER.indexOf(a.key as Wave) - WAVE_ORDER.indexOf(b.key as Wave)
  );
}

/** 奇偶 / 大小 */
export function parityDistribution(draws: Draw[]): DistributionBucket[] {
  return bucketOf(draws, 1, (n) => (isOdd(n) ? 'odd' : 'even'), { odd: '单数', even: '双数' });
}

export function sizeDistribution(draws: Draw[]): DistributionBucket[] {
  return bucketOf(draws, 1, (n) => (isBig(n) ? 'big' : 'small'), { big: '大数 25-49', small: '小数 1-24' });
}

/** 三区分布 */
export function zoneDistribution(draws: Draw[]): DistributionBucket[] {
  return bucketOf(draws, 1, (n) => String(zoneOf(n)), { '1': '一区 01-16', '2': '二区 17-33', '3': '三区 34-49' });
}

/** 尾数分布 */
export function tailDistribution(draws: Draw[]): DistributionBucket[] {
  const labels: Record<string, string> = {};
  for (let i = 0; i <= 9; i++) labels[String(i)] = `尾 ${i}`;
  return bucketOf(draws, 1, (n) => String(tailOf(n)), labels);
}

/** 和值序列 */
export function sumSeries(draws: Draw[]): number[] {
  return draws.map((d) => [...d.n, d.s].reduce((a, b) => a + b, 0));
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 命中分布（0..6 主号命中次数） */
export function mainHitDistribution(records: HitSummary[]): number[] {
  const dist = new Array(7).fill(0);
  records.forEach((r) => dist[r.mainHits]++);
  return dist;
}

/** 最长连错 / 当前连错（特码） */
export function missStreaks(records: HitSummary[]): { longest: number; current: number } {
  let longest = 0;
  let run = 0;
  records.forEach((r) => {
    if (r.specialHit) {
      longest = Math.max(longest, run);
      run = 0;
    } else {
      run++;
    }
  });
  longest = Math.max(longest, run);
  return { longest, current: run };
}

/** 整组形态统计（每期 6 主号） */
export function shapeSeries(draws: Draw[]) {
  return draws.map((d) => shapeOf(d.n));
}
