/**
 * 核心逻辑测试：数据快照、期号换算、可复现摇号、命中核对、对照统计
 * 运行：npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'node_modules/.cache/lib-bundle.mjs');

const lib = await (async () => {
  await build({
    stdin: {
      contents: `
        export * from './src/lib/rng.ts';
        export * from './src/lib/periods.ts';
        export * from './src/lib/stats.ts';
        export * from './src/lib/analysis.ts';
        export * from './src/lib/lottery.ts';
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

test('历史快照：1780 期、期号递增、号码合法', () => {
  assert.equal(history.draws.length, 1780);
  let prev = '';
  for (const draw of drawsAsc) {
    assert.match(draw.id, /^\d{4}-\d{3}$/);
    assert.ok(draw.id > prev, `${draw.id} 应大于 ${prev}`);
    prev = draw.id;
    assert.equal(draw.n.length, 6);
    assert.equal(new Set([...draw.n, draw.s]).size, 7);
    for (const n of [...draw.n, draw.s]) assert.ok(Number.isInteger(n) && n >= 1 && n <= 49);
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
  assert.equal(lib.parsePeriod('2025-366'), null, '平年没有第 366 期');
});

test('摇号可复现：同一期结果固定，不同期不同', () => {
  const a = lib.simulateTicket('2026-321', 0);
  const b = lib.simulateTicket('2026-321', 0);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, lib.simulateTicket('2026-322', 0));
  assert.equal(a.main.length, 6);
  assert.equal(new Set([...a.main, a.special]).size, 7);
  assert.ok(a.main.every((n, i) => i === 0 || a.main[i - 1] <= n), '主号应升序');
});

test('摇号分布均匀：两万次抽样每码约 1/49', () => {
  const counts = new Map();
  for (let i = 0; i < 20000; i++) {
    const t = lib.simulateTicket(`2099-${i}`, 0);
    [...t.main, t.special].forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
  }
  assert.equal(counts.size, 49);
  const expected = (20000 * 7) / 49;
  for (const [n, count] of counts) {
    assert.ok(Math.abs(count - expected) / expected < 0.12, `${n} 号出现 ${count} 次，期望 ${expected.toFixed(0)}`);
  }
});

test('命中核对：主号与特码分别计算', () => {
  const real = { id: '2026-001', date: '2026-01-01', n: [1, 2, 3, 4, 5, 6], s: 7 };
  const hit = lib.checkHit(real, { main: [1, 2, 3, 10, 11, 12], special: 7 });
  assert.equal(hit.mainHits, 3);
  assert.equal(hit.specialHit, true);
  assert.deepEqual(hit.matchedMain, [1, 2, 3]);

  const miss = lib.checkHit(real, { main: [8, 9, 10, 11, 12, 13], special: 8 });
  assert.equal(miss.mainHits, 0);
  assert.equal(miss.specialHit, false);
});

test('对照统计：只取每期第一次摇号，未开奖的期不参与统计', () => {
  const sims = [
    { period: '2026-001', date: '2026-01-01', attempt: 0, main: [1, 2, 3, 4, 5, 6], special: 7, createdAt: '' },
    { period: '2026-001', date: '2026-01-01', attempt: 1, main: [1, 2, 3, 4, 5, 6], special: 8, createdAt: '' },
    { period: '2026-002', date: '2026-01-02', attempt: 0, main: [10, 11, 12, 13, 14, 15], special: 20, createdAt: '' },
    { period: '2099-001', date: '2099-01-01', attempt: 0, main: [1, 2, 3, 4, 5, 6], special: 7, createdAt: '' }
  ];
  const draws = [
    { id: '2026-001', date: '2026-01-01', n: [1, 2, 3, 30, 31, 32], s: 7 },
    { id: '2026-002', date: '2026-01-02', n: [1, 2, 3, 30, 31, 32], s: 21 }
  ];
  const rows = lib.buildComparison(sims, draws);
  assert.equal(rows.length, 2);
  const summary = lib.summarizeSims(rows);
  assert.equal(summary.periods, 2);
  assert.equal(summary.specialHits, 1);
  assert.equal(summary.mainMean, (3 + 0) / 2);
  assert.equal(summary.bestMainHits, 3);
});

test('随机基线口径正确', () => {
  assert.equal(lib.BASELINE.specialRate, 1 / 49);
  assert.ok(Math.abs(lib.BASELINE.mainMean - 36 / 49) < 1e-12);
});
