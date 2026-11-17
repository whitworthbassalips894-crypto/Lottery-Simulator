// 冒烟校验：node scripts/check.mjs
// 用 JSDOM 真跑 docs/index.html，校验「同款页面 + 换芯 + 与工具2 零重叠」三条底线。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(HERE, '..', 'docs', 'index.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

let failed = 0;
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) failed++;
};

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.com/Lottery-Simulator/',
  virtualConsole: vc,
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.scrollTo = () => {};
    w.fetch = () => Promise.reject(new Error('offline'));
  }
});
const w = dom.window;
const d = w.document;
const text = (id) => (d.getElementById(id)?.textContent || '').replace(/\s+/g, ' ').trim();

await new Promise((r) => setTimeout(r, 2200));

ok(errors.length === 0, '页面脚本无报错', errors.slice(0, 2).join(' | '));
ok(d.title.includes('盲区互补助手'), '标题已换成互补版宣发', d.title);
ok(text('appTitle').includes('盲区互补助手'), '页头 H1', text('appTitle'));
ok(/零重叠/.test(text('zeroOverlapLine')), '页头零重叠说明', text('zeroOverlapLine'));
ok(/零重叠.*剔除\d+码/.test(text('zeroOverlapTag')), '主推卡零重叠徽标', text('zeroOverlapTag'));

const copy = d.getElementById('copyMainBtn').getAttribute('data-copy') || '';
ok(/^\d{2}(,\d{2})+$/.test(copy), '主推号码可复制', copy);

// 三组面板 & 依据
ok(d.querySelectorAll('#tool2Panels .panel').length === 3, '选号依据三组面板');
ok(/双维核心/.test(text('tool2Summary')), '双维核心区块存在');

// 内核：逐期与工具2 零重叠
const recs = w.usableRecordsOf(w.allRecords());
let overlapBad = 0, sumOpt = 0, hits = 0, n = 0;
for (let i = 80; i < recs.length; i += 7) {
  const row = recs[i];
  const plan = w.computeBlindPlan(recs, i, row.year, row.periodNum, row.date);
  const base = w.runTool2At(recs, i, row.year, row.periodNum, row.date);
  if (plan.optPicks.some((x) => base.union.includes(x))) overlapBad++;
  sumOpt += plan.optPicks.length;
  if (plan.optPicks.includes(row.special)) hits++;
  n++;
}
ok(overlapBad === 0, `抽样 ${n} 期：提纯与工具2 零重叠`, `异常 ${overlapBad} 期`);
ok(sumOpt / n >= 6 && sumOpt / n <= 14, '提纯码数在合理区间', (sumOpt / n).toFixed(2) + ' 码');

// 档位切换
const tierBtn = d.querySelector('.tier-btn[data-tier="5"]');
tierBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 80));
ok(d.querySelectorAll('#optHero .pick-chip').length === 5, '切到 5 码档位生效');

// 历史弹窗 → 全量回放
d.getElementById('openHistoryModal').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 4500));
ok(!d.getElementById('historyModal').hidden, '完整历史弹窗可打开');
ok(d.querySelectorAll('#yearlyBody tr').length >= 5, '年份汇总表已生成');
ok(d.querySelectorAll('#fullHistoryBody tr').length > 0, '历史明细行已生成');

ok(errors.length === 0, '交互过程无报错', errors.slice(0, 2).join(' | '));

console.log(failed === 0 ? '\n全部通过' : `\n失败 ${failed} 项`);
process.exit(failed === 0 ? 0 : 1);
