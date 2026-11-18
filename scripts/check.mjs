// 用 JSDOM 运行实际发布页面，核对评分、互补范围、五档交互与回放。
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = fs.readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
let failed = 0;
const ok = (cond, label) => {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failed++;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ascending = nums => [...nums].sort((a, b) => a - b);
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
let copied = '';
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.com/Lottery-Simulator/',
  virtualConsole: vc,
  beforeParse(w) {
    Object.defineProperty(w.navigator, 'clipboard', { value: { async writeText(text) { copied = text; } } });
    w.fetch = () => Promise.reject(new Error('offline'));
  }
});
const w = dom.window, d = w.document;
const el = id => d.getElementById(id);
const text = id => el(id).textContent.trim();
const numbers = selector => Array.from(d.querySelectorAll(selector), e => Number(e.textContent));
const tiers = [5, 7, 10, 12, 18];
const switchTo = tier => d.querySelector(`.tier-btn[data-tier="${tier}"]`).click();

ok(d.title.includes('盲区互补助手') && text('appTitle').includes('盲区互补助手'), '页头和标题');
ok([text('zeroOverlapLine'), text('zeroOverlapTag')].every(t => t.includes('零重叠')), '显示互补范围');
ok(!d.querySelector('#deriveFold, #deriveToggle, #tool2Panels, #tool2Summary') && !/选号依据|杀[号码]/.test(html), '旧面板和旧排除文案均已移除');
ok(same(Array.from(d.querySelectorAll('.tier-btn'), b => +b.dataset.tier), tiers), '五个评分档位');

// 两个不同量纲、组内并列的策略，加一个组内原分递增的策略。
const fixture = w.scoreStrategyPicks({ hot: [1,2,3,4,5,6,7], cold: [1,8,9,10,11,12,13], cycle: [1,2,14,15,16,17,18] }, {
  hot: Array(50).fill(1), cold: Array(50).fill(100), cycle: Array.from({ length: 50 }, (_, n) => n)
});
ok(fixture.points.get(1) === 75 && fixture.points.get(2) === 49 && fixture.points.get(14) === 23,
  '三策略都正向加分：跨组相加，第三组独有号码也得分');
ok(same(fixture.ranked.slice(0, 3), [1, 2, 3]) && fixture.points.get(3) === fixture.points.get(18),
  '组内同分同奖，总分相同按号码升序');

const recs = w.usableRecordsOf(w.allRecords());
const next = w.parseLabel(w.expectedNextLabel());
const current = w.computeBlindPlan(recs, recs.length, next.year, next.periodNum, w.periodToDate(next.year, next.periodNum));
let rangeOk = true, tiersOk = true, minCount = 49, maxCount = 0, samples = 0;
for (let i = 0; i < recs.length; i += 7) {
  const r = recs[i];
  const args = [recs, i, r.year, r.periodNum, r.date];
  const plan = w.computeBlindPlan(...args), base = w.runTool2At(...args);
  const groups = Object.values(plan.groups), union = [...new Set(groups.flat())];
  rangeOk &&= groups.every(g => g.length === 7 && new Set(g).size === 7)
    && same(ascending(plan.ranked), ascending(union)) && !union.some(n => base.union.includes(n));
  tiersOk &&= tiers.every(t => same(w.picksOfRow(plan, t), plan.ranked.slice(0, t)));
  minCount = Math.min(minCount, union.length); maxCount = Math.max(maxCount, union.length); samples++;
}
ok(rangeOk, `抽查 ${samples} 期：排名恰好包含三组候选，与工具2零重叠`);
ok(tiersOk && minCount < 18 && maxCount > 18, `五档均按分截取，不补号、不超额（样本并集 ${minCount}～${maxCount} 码）`);

// 独立取每期之前的历史作为输入，与页面上的逐期回放、摘要核对。
const recent = recs.slice(-30).reverse().map((r, j) => {
  const past = recs.slice(0, recs.length - 1 - j);
  return { ...r, ranked: w.computeBlindPlan(past, past.length, r.year, r.periodNum, r.date).ranked };
});
for (const tier of tiers) {
  switchTo(tier);
  const expected = current.ranked.slice(0, tier);
  const copy = ascending(expected).map(w.pad2).join(',');
  el('copyMainBtn').click();
  ok(same(numbers('#optHero .ball'), expected) && same(Array.from(d.querySelectorAll('.pick-score'), e => parseInt(e.textContent)), expected.map(n => current.points.get(n)))
    && copied === copy && d.querySelector('.copy-preview code').textContent === copy, `${tier}码档：展示得分和复制号码一致`);
  const hits = recent.map(r => r.ranked.slice(0, tier).includes(r.special));
  const rows = [...d.querySelectorAll('#historyBody tr.main-row')];
  ok(rows.length === 30 && rows.every((tr, j) => tr.dataset.lbl === recent[j].label && !!tr.querySelector('.tier-hit') === hits[j])
    && text('recent30Summary').includes(`当前${tier}码档命中 ${hits.filter(Boolean).length} 期`), `${tier}码档：近30期倒序明细与命中数正确`);
}

// 锁定 5 码后切到 18 码；录入排名第六的特码，锁定档未中而当前档命中。
switchTo(5);
el('lockBtn').click();
const saved = ascending(current.ranked.slice(0, 5));
switchTo(18);
ok(same(numbers('#lockCurrent .lock-ball'), saved), '切换档位不改变已锁号码');
const sp = current.ranked[5];
el('openDataModal').click();
w.fillBallsFromText([...Array.from({ length: 7 }, (_, i) => i + 1).filter(n => n !== sp).slice(0, 6), sp].join(','));
el('submitDraw').click();
el('closeDataModal').click();
ok(text('lockHistory').includes('5码档未中') && text('entryFlash').includes('18码档'), '录入按原锁定快照核对，同时报告当前档命中');
ok(same(w.sanitizeLockSnapshot({ label: next.label, opt: saved }).picks, saved), '兼容旧版只有 opt 的锁定快照');

d.querySelector('#historyBody button[data-exp]').click();
const detailBalls = '#historyBody .detail-row .dg-item:first-child .ball';
ok(same(numbers(detailBalls), current.ranked.slice(0, 18)), '新录入期的回放与开奖前显示的评分档一致');
el('openHistoryModal').click();
const total = w.usableRecordsOf(w.allRecords()).length;
const deadline = Date.now() + 30000;
while (text('modalTotalBadge') !== `${total} 期` && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
ok(!el('historyModal').hidden && text('modalTotalBadge') === `${total} 期` && d.querySelectorAll('#yearlyBody tr').length >= 5, '完整历史与年度汇总未受30期窗口限制');
const latestRow = d.querySelector('#fullHistoryBody .main-row');
ok(latestRow?.dataset.lbl === next.label && !!latestRow.querySelector('.tier-hit'), '完整历史显示新期的档位命中');

ok(errors.length === 0, `页面及交互无脚本错误${errors.length ? '：' + errors.join(' | ') : ''}`);
dom.window.close();
console.log(failed === 0 ? '\n全部通过' : `\n失败 ${failed} 项`);
process.exitCode = failed ? 1 : 0;
