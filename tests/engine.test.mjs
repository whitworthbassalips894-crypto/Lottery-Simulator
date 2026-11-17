/**
 * 回测与统计内核测试
 * 运行：npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'node_modules/.cache/engine-bundle.mjs');

const lib = await (async () => {
  await build({
    stdin: {
      contents: `
        export * from './src/lib/backtest.ts';
        export * from './src/lib/strategies.ts';
        export * from './src/lib/stats.ts';
        export * from './src/lib/rng.ts';
        export * from './src/lib/periods.ts';
      `,
      resolveDir: ROOT,
      loader: 'ts'
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: OUT,
    logLevel: 'error'
  });
  return import(OUT);
})();

const history = JSON.parse(await fs.readFile(path.join(ROOT, 'public/data/history.json'), 'utf8'));
const drawsAsc = history.draws.slice().reverse();

test('数据快照：1780 期、id 递增、每期 7 个不重复号码', () => {
  assert.equal(history.draws.length, 1780);
  let prev = '';
  for (const draw of drawsAsc) {
    assert.match(draw.id, /^\d{4}-\d{3}$/);
    assert.ok(draw.id > prev, `${draw.id} 应大于 ${prev}`);
    prev = draw.id;
    assert.equal(draw.n.length, 6);
    assert.equal(new Set([...draw.n, draw.s]).size, 7);
    for (const n of [...draw.n, draw.s]) assert.ok(n >= 1 && n <= 49);
  }
});

test('期号 ↔ 日期往返一致（含闰年）', () => {
  const cases = [
    ['2024-060', '2024-02-29'],
    ['2026-001', '2026-01-01'],
    ['2026-320', '2026-11-16'],
    ['2025-365', '2025-12-31']
  ];
  for (const [id, date] of cases) {
    assert.equal(lib.dateForPeriod(id), date);
    assert.equal(lib.parsePeriod(id).date, date);
    assert.equal(lib.periodForDate(date), id);
  }
});

test('模拟注单可复现：同一期 + 同一尝试次数结果固定', () => {
  const a = lib.simulateTicket('2026-321', 0);
  const b = lib.simulateTicket('2026-321', 0);
  const c = lib.simulateTicket('2026-321', 1);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(a.main.length, 6);
  assert.equal(new Set([...a.main, a.special]).size, 7);
});

test('统计基线：超几何分布求和为 1，且与随机期望一致', () => {
  let sum = 0;
  for (let k = 0; k <= 6; k++) sum += lib.hypergeometric(49, 6, 6, k);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  const expected = Array.from({ length: 7 }, (_, k) => k * lib.hypergeometric(49, 6, 6, k)).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(expected - (36 / 49)) < 1e-9, `期望 ${expected}`);
  const [lo, hi] = lib.wilsonInterval(7, 320);
  assert.ok(lo < 7 / 320 && hi > 7 / 320);
});

test('回测无未来函数：截断历史后，重叠区间的曲线完全一致', () => {
  const cut = 800;
  const full = lib.runBacktest(drawsAsc, { strategyIds: ['hot', 'balanced'], periods: 0, warmup: 30 });
  const part = lib.runBacktest(drawsAsc.slice(0, cut), { strategyIds: ['hot', 'balanced'], periods: 0, warmup: 30 });
  for (const id of ['hot', 'balanced']) {
    const fullRow = full.strategies.find((s) => s.id === id);
    const partRow = part.strategies.find((s) => s.id === id);
    assert.deepEqual(partRow.curve, fullRow.curve.slice(0, cut - 30));
  }
});

test('随机基线收敛：全量回测特码命中率接近 1/49', () => {
  const res = lib.runBacktest(drawsAsc, { strategyIds: ['random'], periods: 0, warmup: 30 });
  const random = res.strategies[0];
  assert.ok(random.periods > 1700);
  assert.ok(Math.abs(random.specialRate - 1 / 49) < 0.01, `实测 ${random.specialRate}`);
  assert.ok(Math.abs(random.mainMean - 36 / 49) < 0.06, `主号均值 ${random.mainMean}`);
  // 随机策略不应显著偏离基线
  assert.ok(random.pValue > 0.001);
});

test('形态均衡策略满足三区／波色／单双约束', () => {
  const stats = lib.createStats();
  drawsAsc.slice(0, 200).forEach((d) => lib.updateStats(stats, d));
  const rank = lib.rankByStrategy(stats, 'balanced', 'test');
  const main = rank.slice(0, 6);
  const zones = [0, 0, 0, 0];
  const waves = { red: 0, blue: 0, green: 0 };
  main.forEach((n) => {
    zones[n <= 16 ? 1 : n <= 33 ? 2 : 3]++;
    const wave = [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46].includes(n)
      ? 'red'
      : [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48].includes(n)
        ? 'blue'
        : 'green';
    waves[wave]++;
  });
  assert.equal(zones.slice(1).reduce((a, b) => a + b, 0), 6);
  for (const z of [1, 2, 3]) assert.ok(zones[z] >= 1 && zones[z] <= 3, `三区 ${z} = ${zones[z]}`);
  for (const w of ['red', 'blue', 'green']) assert.ok(waves[w] >= 1 && waves[w] <= 3, `${w} = ${waves[w]}`);
});

test('回测结果确定性：两次运行完全一致', () => {
  const a = lib.runBacktest(drawsAsc, { strategyIds: ['cold'], periods: 200, warmup: 30 });
  const b = lib.runBacktest(drawsAsc, { strategyIds: ['cold'], periods: 200, warmup: 30 });
  assert.deepEqual(a.strategies[0], b.strategies[0]);
});
