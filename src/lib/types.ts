/** 核心数据类型：开奖记录、历史库、模拟注单、设置 */

export interface Draw {
  id: string;
  date: string;
  n: number[];
  s: number;
}

export interface HistorySource {
  repo: string;
  path: string;
  url: string;
  upstreamUpdatedAt: string | null;
  origin: string;
  generatedAt: string;
}

export interface HistoryFile {
  schema: number;
  source: HistorySource;
  total: number;
  latest: { id: string; date: string };
  earliest: { id: string; date: string };
  draws: Draw[];
}

export interface SimRecord {
  /** 期号，如 2026-321 */
  period: string;
  /** 该期对应日期 */
  date: string;
  /** 第几次尝试，0 为当期主推 */
  attempt: number;
  main: number[];
  special: number;
  createdAt: string;
  /** 是否为首次打开时自动补齐的历史期 */
  auto?: boolean;
}

export interface HitSummary {
  mainHits: number;
  specialHit: boolean;
  matchedMain: number[];
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Settings {
  theme: ThemeMode;
  autoSync: boolean;
  reduceMotion: boolean;
  showZodiac: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  autoSync: true,
  reduceMotion: false,
  showZodiac: true
};
