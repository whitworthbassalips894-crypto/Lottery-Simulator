/** 可复现随机：同一期号 + 同一尝试次数永远得到同一注号码 */

export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRng(key: string): () => number {
  return mulberry32(hashString(key));
}

/** Fisher–Yates 洗牌（不修改原数组） */
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 随机取 6 个主号 + 1 个特码 */
export function randomTicket(rng: () => number, pool: number[] = Array.from({ length: 49 }, (_, i) => i + 1)) {
  const picked = shuffle(pool, rng).slice(0, 7);
  const main = picked.slice(0, 6).sort((a, b) => a - b);
  const special = picked[6];
  return { main, special };
}

/** 用哈希种子生成某期某次尝试的「模拟开奖」 */
export function simulateTicket(period: string, attempt = 0) {
  const rng = seededRng(`draw-lab:${period}:${attempt}`);
  return randomTicket(rng);
}

/** 生成与上传/浏览器一致的短 id */
export function uid(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
