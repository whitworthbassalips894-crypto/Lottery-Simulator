/**
 * 选号策略引擎
 * ------------------------------------------------------------------
 * 所有策略都只使用「目标期之前」的开奖数据（无未来函数），
 * 输出 49 个号码的偏好排序，取前 6 个为主号、第 7 个为特码。
 *
 * 策略刻意保持「可解释 + 不调参」：回测要回答的是「这些民间思路能否
 * 稳定超过随机基线」，而不是把参数拟合到历史上再宣称命中率高。
 */

import { ALL_NUMBERS, type Wave, waveOf, zoneOf, isBig, isOdd, tailOf } from './lottery';
import { mulberry32, hashString } from './rng';
import type { Draw } from './types';

export type StrategyId = 'random' | 'hot' | 'cold' | 'cycle' | 'balanced' | 'ensemble';

export interface Strategy {
  id: StrategyId;
  name: string;
  short: string;
  tagline: string;
  desc: string;
  tone: 'neutral' | 'hot' | 'cold' | 'cycle' | 'shape' | 'mix';
}

export const STRATEGIES: Strategy[] = [
  {
    id: 'random',
    name: '随机基线',
    short: '随机',
    tagline: '对照组',
    desc: '用期号做种子做等概率抽样。它不代表任何方法，只用来校准「运气本身能长什么样」。',
    tone: 'neutral'
  },
  {
    id: 'hot',
    name: '热号追踪',
    short: '热号',
    tagline: '近 50 期高频',
    desc: '按近 50 期出现次数排序，追最近活跃的号码。常见说法是「热号继续热」。',
    tone: 'hot'
  },
  {
    id: 'cold',
    name: '冷号回补',
    short: '冷号',
    tagline: '最大遗漏优先',
    desc: '按遗漏期数从大到小排序，押「该出来了」。本质是赌徒谬误的温和版本，回测可以验证。',
    tone: 'cold'
  },
  {
    id: 'cycle',
    name: '周期衰减',
    short: '周期',
    tagline: '半衰期 14 期',
    desc: '对每一次出现做指数加权（14 期半衰期），既保留长期结构又更重视近期节奏。',
    tone: 'cycle'
  },
  {
    id: 'balanced',
    name: '形态均衡',
    short: '均衡',
    tagline: '评分 + 硬约束',
    desc: '在热号与周期混合评分上求解：三区／波色各至少 1 个、单双与大小各 2~4 个、同尾不超过 2 个。',
    tone: 'shape'
  },
  {
    id: 'ensemble',
    name: '三路合议',
    short: '合议',
    tagline: '排序融合',
    desc: '把热号、遗漏、周期三张榜单做排名融合（Borda），减少单一指标波动带来的极端选择。',
    tone: 'mix'
  }
];

export const STRATEGY_MAP: Record<StrategyId, Strategy> = Object.fromEntries(
  STRATEGIES.map((s) => [s.id, s])
) as Record<StrategyId, Strategy>;

/** 增量维护的历史统计，回测时逐期滚动更新，避免重复扫描 */
export interface HistoryStats {
  periods: number;
  counts: Float64Array; // 全部历史出现次数（含特码）
  specialCounts: Float64Array;
  lastSeen: Int32Array; // 最近出现的期序号，-1 表示没出现过
  decay: Float64Array; // 指数衰减权重
  recent: number[][]; // 最近 window 期（升序，最后一个是最近）
  windows: number[]; // 需要维护的窗口长度
  windowCounts: Map<number, Float64Array>;
}

const HALF_LIFE = 14;
const DECAY = Math.pow(0.5, 1 / HALF_LIFE);
const MAX_WINDOW = 100;

export function createStats(): HistoryStats {
  const windowCounts = new Map<number, Float64Array>();
  [30, 50, 100].forEach((w) => windowCounts.set(w, new Float64Array(50)));
  return {
    periods: 0,
    counts: new Float64Array(50),
    specialCounts: new Float64Array(50),
    lastSeen: new Int32Array(50).fill(-1),
    decay: new Float64Array(50),
    recent: [],
    windows: [30, 50, 100],
    windowCounts
  };
}

export function updateStats(stats: HistoryStats, draw: Draw): void {
  const idx = stats.periods;
  const numbers = [...draw.n, draw.s];
  for (let n = 1; n <= 49; n++) stats.decay[n] *= DECAY;
  for (const n of numbers) {
    stats.counts[n] += 1;
    stats.lastSeen[n] = idx;
    stats.decay[n] += 1;
    stats.windowCounts.forEach((arr) => {
      arr[n] += 1;
    });
  }
  stats.specialCounts[draw.s] += 1;
  stats.recent.push(numbers);

  if (stats.recent.length > MAX_WINDOW) {
    const dropped = stats.recent.shift()!;
    stats.windowCounts.forEach((arr) => {
      dropped.forEach((n) => {
        arr[n] -= 1;
      });
    });
  }
  stats.periods += 1;
}

function windowCount(stats: HistoryStats, window: number, n: number): number {
  if (window === MAX_WINDOW) return stats.windowCounts.get(100)![n];
  const arr = stats.windowCounts.get(window);
  if (arr) return arr[n];
  // 任意窗口：直接从 recent 尾部统计
  const slice = stats.recent.slice(-window);
  let count = 0;
  for (const row of slice) if (row.includes(n)) count++;
  return count;
}

function tieBreak(seedKey: string, n: number): number {
  return mulberry32(hashString(`${seedKey}:${n}`))();
}

/** 把分数表转成排序后的号码数组（分数高者在前，同分用确定性随机打散） */
function rankByScore(score: (n: number) => number, seedKey: string): number[] {
  return ALL_NUMBERS.slice().sort((a, b) => {
    const diff = score(b) - score(a);
    if (Math.abs(diff) > 1e-12) return diff;
    const tb = tieBreak(seedKey, a) - tieBreak(seedKey, b);
    if (Math.abs(tb) > 1e-12) return tb;
    return a - b;
  });
}

function normalize(values: Map<number, number>): Map<number, number> {
  let lo = Infinity;
  let hi = -Infinity;
  values.forEach((v) => {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  });
  const span = hi - lo;
  const out = new Map<number, number>();
  values.forEach((v, k) => out.set(k, span > 1e-12 ? (v - lo) / span : 0.5));
  return out;
}

/** 形态约束求解：在评分表上选出 size 个号，尽量满足区间／波色／单双／大小／尾数约束 */
export function selectConstrained(
  scoreMap: Map<number, number>,
  size = 6,
  opts: {
    minPerZone?: number;
    maxPerZone?: number;
    minPerWave?: number;
    maxPerWave?: number;
    oddRange?: [number, number];
    bigRange?: [number, number];
    maxTailRepeat?: number;
  } = {}
): number[] {
  const minPerZone = opts.minPerZone ?? 1;
  const maxPerZone = opts.maxPerZone ?? 3;
  const minPerWave = opts.minPerWave ?? 1;
  const maxPerWave = opts.maxPerWave ?? 3;
  const oddRange = opts.oddRange ?? [2, 4];
  const bigRange = opts.bigRange ?? [2, 4];
  const maxTailRepeat = opts.maxTailRepeat ?? 2;

  const norm = normalize(scoreMap);
  const score = (n: number) => norm.get(n) ?? 0.5;

  const chosen: number[] = [];
  const chosenSet = new Set<number>();
  const candidates = ALL_NUMBERS.slice().sort((a, b) => score(b) - score(a) || a - b);

  const state = (list: number[]) => {
    const zones = [0, 0, 0, 0];
    const waves: Record<Wave, number> = { red: 0, blue: 0, green: 0 };
    const tails = new Array(10).fill(0);
    let odd = 0;
    let big = 0;
    list.forEach((n) => {
      zones[zoneOf(n)]++;
      waves[waveOf(n)]++;
      tails[n % 10]++;
      if (isOdd(n)) odd++;
      if (isBig(n)) big++;
    });
    return { zones, waves, tails, odd, big };
  };

  while (chosen.length < size) {
    const st = state(chosen);
    const rem = size - chosen.length;
    let best: number | null = null;
    let bestVal = -Infinity;

    for (const strict of [true, false]) {
      for (const n of candidates) {
        if (chosenSet.has(n)) continue;
        const z = zoneOf(n);
        const w = waveOf(n);
        const t = tailOf(n);
        if (strict) {
          if (st.zones[z] + 1 > maxPerZone) continue;
          if (st.waves[w] + 1 > maxPerWave) continue;
          if (st.tails[t] + 1 > maxTailRepeat) continue;
          const zoneDeficit = [1, 2, 3].reduce((acc, k) => acc + Math.max(0, minPerZone - st.zones[k]), 0);
          if (zoneDeficit > rem) continue;
          const waveDeficit = (['red', 'blue', 'green'] as Wave[]).reduce(
            (acc, k) => acc + Math.max(0, minPerWave - st.waves[k]),
            0
          );
          if (waveDeficit > rem) continue;
          if (st.odd + 1 > oddRange[1] || st.odd + rem < oddRange[0]) continue;
          if (st.big + 1 > bigRange[1] || st.big + rem < bigRange[0]) continue;
        }
        let val = score(n);
        if (st.zones[z] < minPerZone) val += 0.16;
        if (st.waves[w] < minPerWave) val += 0.12;
        if (st.tails[t] > 0) val -= 0.1 * st.tails[t];
        val -= 0.04 * Math.abs(st.odd + (isOdd(n) ? 1 : 0) - size / 2);
        val -= 0.04 * Math.abs(st.big + (isBig(n) ? 1 : 0) - size / 2);
        if (val > bestVal) {
          bestVal = val;
          best = n;
        }
      }
      if (best != null) break;
    }
    if (best == null) break;
    chosen.push(best);
    chosenSet.add(best);
  }

  return chosen;
}

/** 按策略给出完整偏好排序（长度 49） */
export function rankByStrategy(stats: HistoryStats, id: StrategyId, seedKey: string): number[] {
  switch (id) {
    case 'random': {
      const rng = mulberry32(hashString(`random:${seedKey}`));
      const arr = ALL_NUMBERS.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    case 'hot':
      return rankByScore((n) => windowCount(stats, 50, n), seedKey);
    case 'cold':
      return rankByScore(
        (n) => (stats.lastSeen[n] < 0 ? stats.periods + 1 : stats.periods - 1 - stats.lastSeen[n]),
        seedKey
      );
    case 'cycle':
      return rankByScore((n) => stats.decay[n], seedKey);
    case 'balanced': {
      const hot = normalize(new Map(ALL_NUMBERS.map((n) => [n, windowCount(stats, 30, n)])));
      const cyc = normalize(new Map(ALL_NUMBERS.map((n) => [n, stats.decay[n]])));
      const map = new Map<number, number>();
      ALL_NUMBERS.forEach((n) => map.set(n, (hot.get(n) ?? 0) * 0.55 + (cyc.get(n) ?? 0) * 0.45));
      const picked = selectConstrained(map, 6);
      const pickedSet = new Set(picked);
      const rest = rankByScore((n) => map.get(n) ?? 0, seedKey).filter((n) => !pickedSet.has(n));
      return [...picked, ...rest];
    }
    case 'ensemble': {
      const boards = ([
        rankByScore((n) => windowCount(stats, 30, n), seedKey),
        rankByScore((n) => (stats.lastSeen[n] < 0 ? stats.periods + 1 : stats.periods - 1 - stats.lastSeen[n]), seedKey),
        rankByScore((n) => stats.decay[n], seedKey)
      ] as number[][]).map((board) => {
        const rank = new Map<number, number>();
        board.forEach((n, i) => rank.set(n, i));
        return rank;
      });
      return rankByScore(
        (n) => boards.reduce((acc, board) => acc + (48 - (board.get(n) ?? 48)), 0) / boards.length,
        seedKey
      );
    }
    default:
      return rankByScore(() => 0, seedKey);
  }
}

/** 排序 → 6 主号 + 1 特码 */
export function ticketFromRank(rank: number[]): { main: number[]; special: number } {
  const main = rank.slice(0, 6).sort((a, b) => a - b);
  const special = rank[6] ?? rank[0];
  return { main, special };
}
