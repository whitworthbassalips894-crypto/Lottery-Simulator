/** 期号 / 日期工具：本工具沿用「当年第几天 = 第几期」的期号约定 */

import { pad3 } from './lottery';

export interface PeriodMeta {
  id: string;
  year: number;
  periodNum: number;
  date: string;
}

export function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const dt = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

export function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(dateKey: string, days = 1): string {
  const dt = parseIsoDate(dateKey);
  if (!dt) return '';
  dt.setDate(dt.getDate() + days);
  return localDateKey(dt);
}

export function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

/** 日期 → 期号（当年第几天） */
export function periodForDate(dateKey: string): string {
  const dt = parseIsoDate(dateKey);
  if (!dt) return '';
  const start = new Date(dt.getFullYear(), 0, 1);
  const day = Math.floor((dt.getTime() - start.getTime()) / 86400000) + 1;
  return `${dt.getFullYear()}-${pad3(day)}`;
}

/** 期号 → 日期 */
export function dateForPeriod(period: string): string {
  const meta = parsePeriod(period);
  if (!meta) return '';
  const dt = new Date(meta.year, 0, meta.periodNum);
  return localDateKey(dt);
}

export function parsePeriod(period: string): PeriodMeta | null {
  const match = String(period || '').trim().match(/^(\d{4})[-/](\d{1,3})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const periodNum = Number(match[2]);
  if (year < 2000 || year > 2100) return null;
  if (!Number.isInteger(periodNum) || periodNum < 1 || periodNum > daysInYear(year)) return null;
  // 直接由「当年第几天」得到日期，避免与 dateForPeriod 互相递归
  const date = localDateKey(new Date(year, 0, periodNum));
  return { id: `${year}-${pad3(periodNum)}`, year, periodNum, date };
}

export function periodFromId(id: string): { year: number; periodNum: number } {
  const [year, p] = String(id).split('-');
  return { year: Number(year), periodNum: Number(p) };
}

/** 最新一期的下一期（按日期推进，跨年从 001 重来） */
export function nextPeriod(latest: { id: string; date: string } | null | undefined): PeriodMeta {
  if (!latest) {
    const today = localDateKey();
    const period = periodForDate(today);
    return parsePeriod(period) as PeriodMeta;
  }
  const nextDate = addDays(latest.date, 1) || localDateKey();
  const period = periodForDate(nextDate);
  return parsePeriod(period) ?? (parsePeriod(periodForDate(localDateKey())) as PeriodMeta);
}

/** 距今多少天（负数为未来） */
export function daysBetween(a: string, b: string): number {
  const da = parseIsoDate(a);
  const db = parseIsoDate(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function formatDate(dateKey: string, opts: { withYear?: boolean; withWeekday?: boolean } = {}): string {
  const dt = parseIsoDate(dateKey);
  if (!dt) return dateKey || '—';
  const { withYear = true, withWeekday = true } = opts;
  const md = `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`;
  const head = withYear ? `${dt.getFullYear()}-${md}` : md;
  return withWeekday ? `${head} ${WEEKDAYS[dt.getDay()]}` : head;
}

export function shortDate(dateKey: string): string {
  const dt = parseIsoDate(dateKey);
  if (!dt) return dateKey;
  return `${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
