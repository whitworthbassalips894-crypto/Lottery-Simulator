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
const prefixTiers = [5, 7, 10, 12];
const tiers = [...prefixTiers, 18];
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
const nextDate = w.periodToDate(next.year, next.periodNum);
const current = w.computeBlindPlan(recs, recs.length, next.year, next.periodNum, nextDate);
let rangeOk = true, prefixOk = true, unionOk = true, over18 = 0, below18 = 0, extraHits = 0;
for (let i = 0; i < recs.length; i++) {
  const r = recs[i], row = w.cacheReplayRow(recs, i);
  const base = w.runTool2At(recs, i, r.year, r.periodNum, r.date);
  const groups = [row.hot, row.cold, row.cycle];
  const expectedUnion = ascending(new Set(groups.flat()));
  const picks = w.picksOfRow(row, 18);
  rangeOk &&= groups.every(g => g.length === 7 && new Set(g).size === 7)
    && !expectedUnion.some(n => base.union.includes(n)) && same(ascending(row.ranked), expectedUnion);
  prefixOk &&= prefixTiers.every(t => same(w.picksOfRow(row, t), row.ranked.slice(0, t)))
    && w.picksOfRow(row, 5).every(n => picks.includes(n));
  unionOk &&= same(row.union, expectedUnion) && same(ascending(picks), expectedUnion)
    && w.tierHitOf(row, 18) === expectedUnion.includes(r.special) && w.tierHitOf(row, 18) === row.hitUnion;
  if (expectedUnion.length > 18) over18++;
  if (expectedUnion.length < 18) below18++;
  if (w.tierHitOf(row, 18) && row.ranked.indexOf(r.special) >= 18) extraHits++;
}
ok(rangeOk && recs.length >= 1700, `逐期回放 ${recs.length} 期：三组候选与工具2零重叠`);
ok(prefixOk, '5/7/10/12 档仍是总分前缀，5 档始终包含在并集档内');
ok(unionOk && over18 > 0 && below18 > 0, `18 档等于当期完整去重并集：${over18} 期超过 18 码，第 19 名及以后命中 ${extraHits} 期`);

// 独立取每期之前的历史作为输入，与页面上的逐期回放、摘要核对。
const recent = recs.slice(-30).reverse().map((r, j) => {
  const past = recs.slice(0, recs.length - 1 - j);
  const { ranked, union } = w.computeBlindPlan(past, past.length, r.year, r.periodNum, r.date);
  return { ...r, ranked, union };
});
for (const tier of tiers) {
  switchTo(tier);
  const expected = tier === 18 ? current.ranked : current.ranked.slice(0, tier);
  const copy = ascending(expected).map(w.pad2).join(',');
  el('copyMainBtn').click();
  ok(same(numbers('#optHero .ball'), expected) && same(Array.from(d.querySelectorAll('.pick-score'), e => parseInt(e.textContent)), expected.map(n => current.points.get(n)))
    && copied === copy && d.querySelector('.copy-preview code').textContent === copy, `${tier}码档：展示得分和复制号码一致`);
  const hits = recent.map(r => (tier === 18 ? r.union : r.ranked.slice(0, tier)).includes(r.special));
  const hitLabel = tier === 18 ? '三组并集中' : `当前${tier}码档命中`;
  const rows = [...d.querySelectorAll('#historyBody tr.main-row')];
  ok(rows.length === 30 && rows.every((tr, j) => tr.dataset.lbl === recent[j].label && !!tr.querySelector('.tier-hit') === hits[j])
    && text('recent30Summary') === `最近 30 期 · ${hitLabel} ${hits.filter(Boolean).length} 期`, `${tier}码档：近30期倒序明细与命中数正确`);
}

const heading = `当前并集（${current.union.length}码）`;
ok(text('recentTierColHead') === heading && text('modalTableTierHead') === heading && text('modalYearlyTierHead') === heading + '并集去重'
  && d.querySelector('.tier-btn.active small').textContent === '并集全取', '并集档按钮及首页、历史、年度表头一致');
ok(text('recentHitBadge') === `近20期三组并集中 ${recent.slice(0, 20).filter(r => r.union.includes(r.special)).length} 期`, '参考信号按近20期完整并集计算');

function enterDraw(nums) {
  el('openDataModal').click();
  w.fillBallsFromText(nums.join(','));
  el('submitDraw').click();
  el('closeDataModal').click();
}

// 在隔离页面中试录一条已有的七球组合：本期5档未中、并集命中，下期产生超过18码的并集。
const following = w.parseLabel(w.nextLabelOf(next.label));
const followingDate = w.periodToDate(following.year, following.periodNum);
const outsideFive = current.ranked.slice(5);
const draw = recs.find(r => outsideFive.includes(r.special) && w.computeBlindPlan(
  [...recs, { ...r, ...next, date: nextDate }], recs.length + 1, following.year, following.periodNum, followingDate
).union.length > 18);
if (!draw) throw new Error('未找到能覆盖跨档锁定和大并集的录入样本');
switchTo(5);
el('lockBtn').click();
const saved = ascending(current.ranked.slice(0, 5));
switchTo(18);
ok(same(numbers('#lockCurrent .lock-ball'), saved), '切换档位不改变已锁号码');
enterDraw(draw.raw7);
ok(text('lockHistory').includes('5码档未中') && text('entryFlash').includes('三组并集'), '录入按原锁定快照核对，同时报告当前并集命中');
ok(same(w.sanitizeLockSnapshot({ label: next.label, opt: saved }).picks, saved), '兼容旧版只有 opt 的锁定快照');

const updated = w.usableRecordsOf(w.allRecords());
const wide = w.computeBlindPlan(updated, updated.length, following.year, following.periodNum, followingDate);
const union = ascending(new Set(Object.values(wide.groups).flat()));
const count = union.length, lockText = `已锁定 三组并集 ${count} 码`;
el('copyMainBtn').click();
ok(count > 18 && same(numbers('#optHero .ball'), wide.ranked) && text('optHero').includes(`三组共 ${count} 个候选 · 并集全取`)
  && /^\d{2}(,\d{2})*$/.test(copied) && copied === union.map(n => String(n).padStart(2, '0')).join(',') && d.querySelector('.copy-preview code').textContent === copied,
  `并集大于18时完整展示并复制 ${count} 码：两位数字、英文逗号、升序、无重复`);
el('lockBtn').click();
switchTo(5);
ok(text('lockCurrent').includes(lockText) && same(numbers('#lockCurrent .lock-ball'), union), '锁定卡片保留当期完整并集和实际码数');
const sp = wide.ranked[18];
const legacy = w.sanitizeLockSnapshot({ label: following.label, tier: 18, picks: wide.ranked.slice(0, 18), union, special: sp });
ok(!legacy.hitPicks && legacy.hitUnion && !w.lockedTierLabel(legacy, legacy.picks).includes('三组并集'), '旧版前18快照不改号、不误标为完整并集');
enterDraw([...Array.from({ length: 7 }, (_, i) => i + 1).filter(n => n !== sp).slice(0, 6), sp]);
ok(text('lockHistory').includes(lockText + '命中'), '锁定记录按原并集核对，排名第19也计命中');
switchTo(18);
d.querySelector('#historyBody button[data-exp]').click();
const detail = '#historyBody .detail-row .dg-item:first-child';
ok(same(numbers(detail + ' .ball'), wide.ranked) && d.querySelector(detail + ' .dg-label').textContent === `三组并集 ${count}码`, '逐期展开显示当期完整并集及码数');
el('openHistoryModal').click();
const total = w.usableRecordsOf(w.allRecords()).length;
const deadline = Date.now() + 30000;
while (text('modalTotalBadge') !== `${total} 期` && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
ok(!el('historyModal').hidden && text('modalTotalBadge') === `${total} 期` && d.querySelectorAll('#yearlyBody tr').length >= 5, '完整历史与年度汇总未受30期窗口限制');
const latestRow = d.querySelector('#fullHistoryBody .main-row');
ok(latestRow?.dataset.lbl === following.label && !!latestRow.querySelector('.tier-hit'), '完整历史显示新期的档位命中');
ok([...el('yearlyBody').rows].every(tr => tr.cells[2].textContent === tr.cells[6].textContent), '年度及总计的当前档命中率与三组并集一致');

ok(errors.length === 0, `页面及交互无脚本错误${errors.length ? '：' + errors.join(' | ') : ''}`);
dom.window.close();
console.log(failed === 0 ? '\n全部通过' : `\n失败 ${failed} 项`);
process.exitCode = failed ? 1 : 0;
