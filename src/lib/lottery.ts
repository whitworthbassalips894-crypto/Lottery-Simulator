/** 六合彩基础表：波色、生肖、三区、号码格式化 */

export const ALL_NUMBERS: number[] = Array.from({ length: 49 }, (_, i) => i + 1);

export type Wave = 'red' | 'blue' | 'green';

export const WAVE_COLORS: Record<Wave, number[]> = {
  red: [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
  blue: [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
  green: [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]
};

export const WAVE_LABELS: Record<Wave, string> = {
  red: '红波',
  blue: '蓝波',
  green: '绿波'
};

export const WAVE_ORDER: Wave[] = ['red', 'blue', 'green'];

export const NUMBER_TO_WAVE: Record<number, Wave> = (() => {
  const map: Record<number, Wave> = {};
  (Object.keys(WAVE_COLORS) as Wave[]).forEach((wave) => {
    WAVE_COLORS[wave].forEach((n) => {
      map[n] = wave;
    });
  });
  return map;
})();

export function waveOf(n: number): Wave {
  return NUMBER_TO_WAVE[n] ?? 'blue';
}

export const ZODIACS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

const LUNAR_NEW_YEAR_DATES: Record<number, { date: string; zodiac: string; prevZodiac: string }> = {
  2020: { date: '2020-01-25', zodiac: '鼠', prevZodiac: '猪' },
  2021: { date: '2021-02-12', zodiac: '牛', prevZodiac: '鼠' },
  2022: { date: '2022-02-01', zodiac: '虎', prevZodiac: '牛' },
  2023: { date: '2023-01-22', zodiac: '兔', prevZodiac: '虎' },
  2024: { date: '2024-02-10', zodiac: '龙', prevZodiac: '兔' },
  2025: { date: '2025-01-29', zodiac: '蛇', prevZodiac: '龙' },
  2026: { date: '2026-02-17', zodiac: '马', prevZodiac: '蛇' },
  2027: { date: '2027-02-06', zodiac: '羊', prevZodiac: '马' },
  2028: { date: '2028-01-26', zodiac: '猴', prevZodiac: '羊' }
};

/** 指定日期所属农历年的生肖 */
export function yearZodiac(dateOrYear: string | number): string {
  const str = String(dateOrYear);
  const year = Number(str.slice(0, 4));
  const info = LUNAR_NEW_YEAR_DATES[year];
  if (info) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str >= info.date ? info.zodiac : info.prevZodiac;
    return info.zodiac;
  }
  return ZODIACS[((year - 2020) % 12 + 12) % 12];
}

/** 号码在指定日期的生肖（生肖随农历年轮换） */
export function zodiacOf(n: number, dateOrYear: string | number): string {
  const base = ZODIACS.indexOf(yearZodiac(dateOrYear));
  return ZODIACS[((base - (n - 1)) % 12 + 12) % 12];
}

export function zoneOf(n: number): 1 | 2 | 3 {
  return n <= 16 ? 1 : n <= 33 ? 2 : 3;
}

export const pad2 = (n: number | string): string => String(n).padStart(2, '0');
export const pad3 = (n: number | string): string => String(n).padStart(3, '0');

export const isOdd = (n: number) => n % 2 === 1;
export const isBig = (n: number) => n >= 25;
export const tailOf = (n: number) => n % 10;

/** 一组号码的形态摘要 */
export interface ShapeSummary {
  odd: number;
  even: number;
  big: number;
  small: number;
  sum: number;
  zones: [number, number, number];
  waves: Record<Wave, number>;
  tails: Record<number, number>;
  consecutivePairs: number;
  span: number;
  avg: number;
}

export function shapeOf(numbers: number[]): ShapeSummary {
  const zones: [number, number, number] = [0, 0, 0];
  const waves: Record<Wave, number> = { red: 0, blue: 0, green: 0 };
  const tails: Record<number, number> = {};
  let odd = 0;
  let big = 0;
  let sum = 0;
  let consecutivePairs = 0;
  const sorted = numbers.slice().sort((a, b) => a - b);
  sorted.forEach((n, i) => {
    zones[zoneOf(n) - 1]++;
    waves[waveOf(n)]++;
    tails[tailOf(n)] = (tails[tailOf(n)] ?? 0) + 1;
    if (isOdd(n)) odd++;
    if (isBig(n)) big++;
    sum += n;
    if (i > 0 && sorted[i] - sorted[i - 1] === 1) consecutivePairs++;
  });
  return {
    odd,
    even: numbers.length - odd,
    big,
    small: numbers.length - big,
    sum,
    zones,
    waves,
    tails,
    consecutivePairs,
    span: sorted.length ? sorted[sorted.length - 1] - sorted[0] : 0,
    avg: numbers.length ? sum / numbers.length : 0
  };
}
