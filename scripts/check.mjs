// 用 JSDOM 运行实际发布页面，核对评分、互补范围、五档交互与回放。
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { APP_BUILD } from '../docs/src/constants.js';

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
const tab = tier => d.querySelector(`.tier-btn[data-tier="${tier}"]`);
const switchTo = tier => tab(tier).click();
const strategies = [['hot', '正码传导'], ['cold', '中段蓄力'], ['cycle', '肖热透支']];
const readSources = chip => Array.from(chip.querySelectorAll('.pick-source'), label => label.textContent);
function cardsMatch(picks, groups) {
  const chips = [...d.querySelectorAll('#optHero .pick-chip')];
  return same(numbers('#optHero .ball'), picks) && chips.length === picks.length && chips.every((chip, i) => {
    const expected = strategies.filter(([group]) => groups[group].includes(picks[i])).map(([, name]) => name);
    return same(readSources(chip), expected) && chip.textContent.replace(/\s/g, '') === w.pad2(picks[i]) + expected.join('');
  });
}

function groupDetailsMatch(groups, label) {
  const rows = [...el('strategyGroups').children];
  return text('strategyPeriod') === label && rows.length === strategies.length && strategies.every(([key, name], i) => {
    const balls = Array.from(rows[i].querySelectorAll('dd .ball'), b => b.textContent);
    return rows[i].querySelector('dt')?.textContent === `#${i + 1} ${name}` && same(balls, ascending(groups[key]).map(w.pad2));
  });
}

ok(d.title.includes('盲区互补助手') && text('appTitle').includes('盲区互补助手'), '页头和标题');
const sw = fs.readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8');
const versionedUrls = [...d.querySelectorAll('link[rel="manifest"], script[type="module"][src]')].map(e => new URL(e.href || e.src));
ok(text('footerVersion') === APP_BUILD && d.querySelector('meta[name="app-version"]').content === `v${APP_BUILD}`
  && versionedUrls.every(url => url.searchParams.get('v') === APP_BUILD) && sw.includes(`const BUILD_ID = '${APP_BUILD}'`), `页脚、资源和缓存版本一致：${APP_BUILD}`);
ok([text('zeroOverlapLine'), text('zeroOverlapTag')].every(t => t.includes('零重叠')), '显示互补范围');
ok(!d.querySelector('#deriveFold, #deriveToggle, #tool2Panels, #tool2Summary') && !/选号依据|杀[号码]/.test(html), '旧面板和旧排除文案均已移除');
ok(same(Array.from(d.querySelectorAll('.tier-btn'), b => +b.dataset.tier), tiers), '五个评分档位');

// —— 首屏决策区（本轮改版新增）——
ok(!el('heroSection').hidden && d.querySelector('#heroSection').dataset.module === 'main-pick', '主推卡片已上移到首屏');
const heroText = text('heroMeta');
ok(/覆盖/.test(heroText) && /命中率/.test(heroText), '首屏显示覆盖码数与理论命中率');
ok(/每期/.test(text('costLine')) && /返奖率/.test(text('costLine')) && /97\.96%/.test(text('costLine')), '主推下方显示每期成本与返奖率');
ok(/预计开奖|后开奖|已过/.test(text('heroCountdown')) || /开奖/.test(text('heroCountdown')), '首屏有开奖时间提示');

// —— 粘贴整段开奖文本：期号/日期不能被当成开奖号 ——
const parsedPaste = w.parseDrawPaste('第321期 2026-11-17 开奖结果：05 12 18 27 33 41 + 特码 07');
ok(same(parsedPaste.nums, [5,12,18,27,33,41,7]) && parsedPaste.issue === '2026-321' && parsedPaste.date === '2026-11-17',
  '整段粘贴时只取 7 个开奖号码，期号与日期被识别而非入号');
ok(same(w.extractDrawNumbers('2026-11-17 322期 03,09,14,22,31,40 + 18'), [3,9,14,22,31,40,18]), '含日期与期号的号码串解析正确');
ok(same(w.extractDrawNumbers('第 001 期 开奖 01 10 19 28 37 46 49'), [1,10,19,28,37,46,49]), '期号 001 不会被当成号码 01');

// —— 逐格校验给的是可读原因，而不是只抖一下 ——
el('openDataModal').click();
w.fillBallsFromText('05 05 50 27 33 41');
const problems = w.validateBallInputs();
ok(problems.length === 3 && problems.every(x => typeof x.text === 'string' && x.text.length > 0), '重复号/越界号给出逐格中文原因');
w.showBallProblems(problems);
ok(!el('ballProblems').hidden && text('ballProblems').includes('重复'), '错误原因显示在号码格下方');
w.showBallProblems([]);
ok(el('ballProblems').hidden, '修正后可清除错误提示');
el('closeDataModal').click();

// —— 近30期摘要：带理论命中率与置信区间，避免小样本误读 ——
ok(/理论/.test(text('recent30Baseline')) && /区间/.test(text('recent30Baseline')), '近30期摘要给出理论命中率与 95% 区间');

// —— 三策略温度计：近200期 + 区间条 ——
ok(d.querySelectorAll('#thermometerList .ci-bar').length === 3 && /95% 置信区间/.test(text('thermometerList')), '三策略温度计给出 95% 置信区间');
ok(/随机基线/.test(text('thermoBaseline')), '温度计基线文案随样本变化');

// —— 修复缓存按钮（原来 SW 文案提到但页面没有）——
ok(!!el('repairCacheBtn'), '页面上有「修复缓存」按钮');

// —— Service Worker 预缓存列表不再包含页面未引用的死文件 ——
const swSrc = fs.readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8');
const shellList = [...swSrc.matchAll(/'\.\/(src\/[^']+)'/g)].map(m => m[1]);
const filesExist = shellList.every(rel => fs.existsSync(new URL(`../docs/${rel}`, import.meta.url)));
ok(shellList.length > 0 && filesExist, `SW 预缓存只含真实存在的模块（${shellList.length} 个）`);
ok(!/src\/(six-tier|app|dailyfive|tool1)/.test(swSrc), 'SW 不再预缓存页面未加载的历史文件');

// —— 数据源瘦身：draws.json 只保留 7 个号码字段 ——
const dbJson = JSON.parse(fs.readFileSync(new URL('../docs/data/draws.json', import.meta.url), 'utf8'));
ok(dbJson.draws.length >= 1781 && dbJson.draws.every(x => x.numbers.length === 6 && Number.isInteger(x.special)), '数据源仍是完整 1781 期且字段可用');

// 两个不同量纲、组内并列的策略，加一个组内原分递增的策略。
const fixtureGroups = { hot: [1,2,3,4,5,6,7], cold: [1,8,9,10,11,12,13], cycle: [1,2,14,15,16,17,18] };
const fixture = w.scoreStrategyPicks(fixtureGroups, {
  hot: Array(50).fill(1), cold: Array(50).fill(100), cycle: Array.from({ length: 50 }, (_, n) => n)
});
ok(fixture.points.get(1) === 75 && fixture.points.get(2) === 49 && fixture.points.get(14) === 23,
  '三策略都正向加分：跨组相加，第三组独有号码也得分');
ok(same(fixture.ranked.slice(0, 3), [1, 2, 3]) && fixture.points.get(3) === fixture.points.get(18),
  '组内同分同奖，总分相同按号码升序');
const sampleCards = d.createElement('div');
sampleCards.innerHTML = [1, 2, 14].map(n => w.pickChipHtml(n, fixtureGroups)).join('');
ok(same(Array.from(sampleCards.children, readSources), [['正码传导', '中段蓄力', '肖热透支'], ['正码传导', '肖热透支'], ['肖热透支']]), '多组推荐时逐一标注全部来源，单组不多标');

ok(same(w.picksOfRow({ union: [32, 5, 14, 5], ranked: [14, 32] }, 18), [5, 14, 32]), '并集取号只读当期 union，去重并按号码升序');

const recs = w.usableRecordsOf(w.allRecords());
const next = w.parseLabel(w.expectedNextLabel());
const nextDate = w.periodToDate(next.year, next.periodNum);
const current = w.computeBlindPlan(recs, recs.length, next.year, next.periodNum, nextDate);
let rangeOk = true, prefixOk = true, unionOk = true, over18 = 0, below18 = 0, extraHits = 0;
let outsidePoolPeriods = 0;
const unionSizes = [];
for (let i = 0; i < recs.length; i++) {
  const r = recs[i], row = w.cacheReplayRow(recs, i);
  const base = w.runTool2At(recs, i, r.year, r.periodNum, r.date);
  const groups = [row.hot, row.cold, row.cycle];
  const expectedUnion = ascending(new Set(groups.flat()));
  const picks = w.picksOfRow(row, 18);
  if (expectedUnion.some(n => !Number.isInteger(n) || n < 1 || n > 49 || base.union.includes(n))) outsidePoolPeriods++;
  unionSizes.push(picks.length);
  rangeOk &&= groups.every(g => g.length === 7 && new Set(g).size === 7) && same(ascending(row.ranked), expectedUnion);
  prefixOk &&= prefixTiers.every(t => same(w.picksOfRow(row, t), row.ranked.slice(0, t)))
    && w.picksOfRow(row, 5).every(n => picks.includes(n));
  unionOk &&= same(row.union, expectedUnion) && same(picks, expectedUnion)
    && w.tierHitOf(row, 18) === expectedUnion.includes(r.special) && w.tierHitOf(row, 18) === row.hitUnion;
  if (expectedUnion.length > 18) over18++;
  if (expectedUnion.length < 18) below18++;
  if (w.tierHitOf(row, 18) && row.ranked.indexOf(r.special) >= 18) extraHits++;
}
ok(rangeOk && recs.length >= 1700 && outsidePoolPeriods === 0, `逐期回放 ${recs.length} 期：越界（含与工具2重叠）${outsidePoolPeriods} 期`);
const last1700 = unionSizes.slice(-1700);
const mean = last1700.reduce((sum, n) => sum + n, 0) / last1700.length;
const min = Math.min(...last1700), max = Math.max(...last1700);
ok(last1700.length === 1700 && min === 12 && max === 21 && Math.abs(mean - 16.4) < 0.1,
  `最近 ${last1700.length} 期：并集 ${min}～${max} 码，平均 ${mean.toFixed(2)} 码`);
ok(prefixOk, '5/7/10/12 档仍是总分前缀，5 档始终包含在并集档内');
ok(unionOk && over18 > 0 && below18 > 0, `第五档等于当期完整去重并集：${over18} 期超过 18 码，第 19 名及以后命中 ${extraHits} 期`);

// 独立取每期之前的历史作为输入，与页面上的逐期回放、摘要核对。
const recent = recs.slice(-30).reverse().map((r, j) => {
  const past = recs.slice(0, recs.length - 1 - j);
  const { ranked, union } = w.computeBlindPlan(past, past.length, r.year, r.periodNum, r.date);
  return { ...r, ranked, union };
});
const fold = el('strategyFold'), toggle = fold.querySelector('summary');
ok(!fold.hidden && !fold.open && toggle.textContent.includes('三策略号码明细'), '本期三策略明细默认收起');
toggle.click();
ok(fold.open && groupDetailsMatch(current.groups, next.label), '点开显示当期三个策略各自的完整 7 码，跨组同号分别保留');
let groupsStable = true;
for (const tier of tiers) {
  switchTo(tier);
  groupsStable &&= fold.open && groupDetailsMatch(current.groups, next.label);
  const expected = tier === 18 ? current.union : current.ranked.slice(0, tier);
  const tabText = tier === 18 ? `并集全取 ${expected.length}码` : `${tier}码 高分前${tier}`;
  const tierText = tier === 18 ? `并集全取 ${expected.length}码` : `${tier}码档`;
  ok(tab(tier).textContent.trim() === tabText && d.querySelector('.pick-heading b').textContent === `当前${tierText}`, `${tabText}：档位及主推标题`);
  // 复制内容 = 「期号｜N码｜号码」，号码仍是两位 + 中文逗号
  const numbersText = ascending(expected).map(w.pad2).join('，');
  const copy = `${next.label}｜${expected.length}码｜${numbersText}`;
  el('copyMainBtn').click();
  ok(cardsMatch(expected, current.groups), `${tierText}：号码顺序不变，下方只标注推荐策略`);
  ok(copied === copy && d.querySelector('.copy-preview code').textContent === copy && d.querySelector('.copy-preview').textContent.includes('期号 + 码数 + 号码'),
    `${tierText}：预览与实际复制文本一致，带期号与码数、中文逗号`);
  const hits = recent.map(r => (tier === 18 ? r.union : r.ranked.slice(0, tier)).includes(r.special));
  const hitLabel = tier === 18 ? '三组并集中' : `当前${tier}码档命中`;
  const rows = [...d.querySelectorAll('#historyBody tr.main-row')];
  const expectSummary = `最近 30 期 · ${hitLabel} ${hits.filter(Boolean).length} 期（${(hits.filter(Boolean).length / 30 * 100).toFixed(1)}%）`;
  ok(rows.length === 30 && rows.every((tr, j) => tr.dataset.lbl === recent[j].label && !!tr.querySelector('.tier-hit') === hits[j])
    && text('recent30Summary') === expectSummary, `${tierText}：近30期倒序明细与命中数正确`);
}

ok(groupsStable, '切换五档不截取分组号码，也不收起已展开的明细');

const heading = `当前并集（${current.union.length}码）`;
ok(text('recentTierColHead') === heading && text('modalTableTierHead') === heading && text('modalYearlyTierHead') === heading + '并集去重'
  && w.tierLabel(18) === `并集全取 ${current.union.length}码`, '并集档实际码数与首页、历史、年度表头一致');
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
ok(fold.open && groupDetailsMatch(wide.groups, following.label), '录入开奖后分组明细自动切换到新目标期及其实际提名');
toggle.click();
ok(!fold.open, '再次点击可收起三策略明细');
const count = union.length, lockText = `已锁定 三组并集 ${count} 码`;
el('copyMainBtn').click();
ok(count > 18 && cardsMatch(union, wide.groups) && text('optHero').includes(`三组共 ${count} 个候选 · 并集全取`)
  && tab(18).textContent.trim() === `并集全取 ${count}码` && text('recentTierColHead') === `当前并集（${count}码）`
  && copied === `${following.label}｜${count}码｜${union.map(n => String(n).padStart(2, '0')).join('，')}` && d.querySelector('.copy-preview code').textContent === copied,
  `并集大于18时完整展示并复制 ${count} 码：两位数字、中文逗号、升序、无重复`);
el('lockBtn').click();
switchTo(5);
ok(text('lockCurrent').includes(lockText) && same(numbers('#lockCurrent .lock-ball'), union) && tab(18).textContent.trim() === `并集全取 ${count}码`, '锁定卡片保留当期完整并集和实际码数');
// 旧快照恰好有 18 个号码，也不能靠码数反推出它用了并集档。
const saved18 = union.slice(0, 18);
const unmarked = w.sanitizeLockSnapshot({ label: following.label, opt: saved18, union: saved18 });
ok(unmarked.tier == null && w.lockedTierLabel(unmarked, unmarked.picks) === '18 码', '无档位的旧锁定按实际号码数显示');
const sp = wide.ranked[18];
const legacy = w.sanitizeLockSnapshot({ label: following.label, tier: 18, picks: wide.ranked.slice(0, 18), union, special: sp });
ok(!legacy.hitPicks && legacy.hitUnion && !w.lockedTierLabel(legacy, legacy.picks).includes('三组并集'), '旧版前18快照不改号、不误标为完整并集');
enterDraw([...Array.from({ length: 7 }, (_, i) => i + 1).filter(n => n !== sp).slice(0, 6), sp]);
ok(text('lockHistory').includes(lockText + '命中'), '锁定记录按原并集核对，排名第19也计命中');
switchTo(18);
d.querySelector('#historyBody button[data-exp]').click();
const detail = '#historyBody .detail-row .dg-item:first-child';
ok(same(numbers(detail + ' .ball'), union) && d.querySelector(detail + ' .dg-label').textContent === `三组并集 ${count}码`, '逐期展开显示当期完整并集及码数');
el('openHistoryModal').click();
const total = w.usableRecordsOf(w.allRecords()).length;
const deadline = Date.now() + 30000;
while (text('modalTotalBadge') !== `${total} 期` && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
ok(!el('historyModal').hidden && text('modalTotalBadge') === `${total} 期` && d.querySelectorAll('#yearlyBody tr').length >= 5, '完整历史与年度汇总未受30期窗口限制');
const latestRow = d.querySelector('#fullHistoryBody .main-row');
ok(latestRow?.dataset.lbl === following.label && !!latestRow.querySelector('.tier-hit'), '完整历史显示新期的档位命中');
ok([...el('yearlyBody').rows].every(tr => tr.cells[2].textContent === tr.cells[6].textContent), '年度及总计的当前档命中率与三组并集一致');

// —— 一键同步：解析器必须兼容上游改版后的 DOM 结构 ——
const { parseAmHtml } = await import('../docs/src/parser.js');
const mkDraw = (nums, inner) =>
  `<dt><b>327</b>期(开奖时间:2026-11-23)</dt><dl>${inner}</dl>`;
const asBall = (nums) => nums.map((n) => `<div class="ball"><span class="red">${String(n).padStart(2, '0')}</span><b>狗</b></div>`).join('');
const asDdEm = (nums) => nums.map((n) => `<dd><em>${String(n).padStart(2, '0')}</em><em>狗</em></dd>`).join('');
const seven = [21, 49, 7, 41, 46, 36, 45];
ok(parseAmHtml(mkDraw(seven, asBall(seven))).length === 1, '上游旧结构（div.ball）仍可解析');
ok(parseAmHtml(mkDraw(seven, asDdEm(seven))).length === 1, '上游新结构（dd>em）可解析');
ok(parseAmHtml(mkDraw(seven, seven.map((n) => `<i>${n}</i>`).join(''))).length === 1, '未知 HTML 结构也能兜底解析');
const parsedSeven = parseAmHtml(mkDraw(seven, asDdEm(seven)))[0];
ok(parsedSeven?.id === '2026-327' && parsedSeven.special === 45 && parsedSeven.date === '2026-11-23'
  && same(parsedSeven.numbers, [21, 49, 7, 41, 46, 36]), '新结构解析出的号码/期号/日期完全正确');
ok(parseAmHtml(mkDraw(seven, [21, 49, 7, 41, 46, 21].map((n) => `<dd>${n}</dd>`).join(''))).length === 0,
  '号码重复时宁可不解析，也不写错数据');

// —— 一键同步：raw.githubusercontent 兜底地址必须带 docs/ 前缀 ——
const { rawGithubDbUrl } = await import('../docs/src/sync.js');
const rawUrl = rawGithubDbUrl('https://user.github.io/Lottery-Simulator/');
ok(rawUrl === 'https://raw.githubusercontent.com/user/Lottery-Simulator/main/docs/data/draws.json',
  '仓库兜底地址指向真实存在的 docs/data/draws.json');
ok(rawGithubDbUrl('http://localhost:4173/') === '', '本地/自建域名不推导仓库地址');

// —— 一键同步：定时任务存在，且不会写坏数据 ——
// 注：workflow 文件需仓库具备 workflows 权限才能提交；未提交时跳过，
// 不能因为缺文件就让整个 check 崩掉（其余断言仍要能跑）。
const workflowFile = new URL('../.github/workflows/sync-draws.yml', import.meta.url);
if (fs.existsSync(workflowFile)) {
  const workflowSrc = fs.readFileSync(workflowFile, 'utf8');
  ok(/schedule:/.test(workflowSrc) && /cron:/.test(workflowSrc), 'workflow 配置了定时触发');
  ok(/workflow_dispatch/.test(workflowSrc), 'workflow 支持手动触发');
  ok(/sync-draws\.mjs/.test(workflowSrc), 'workflow 调用仓库内的同步脚本');
} else {
  console.log('· 跳过 workflow 断言（.github/workflows/sync-draws.yml 尚未提交）');
}
const syncScriptPath = new URL('../scripts/sync-draws.mjs', import.meta.url);
ok(fs.existsSync(syncScriptPath), '同步脚本存在');
const syncSrc = fs.readFileSync(syncScriptPath, 'utf8');
ok(/期号不连续/.test(syncSrc) && /日期与期号不符/.test(syncSrc) && /与底库不一致/.test(syncSrc),
  '同步脚本对缺期/日期错位/与底库冲突都会拒绝写入');
ok(/patchInlineDb/.test(syncSrc), '同步脚本会同时更新 index.html 内联底库（页面首屏读它）');

// —— 内联底库结构完好（这是首屏数据的唯一来源）——
const htmlSrc = fs.readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const cdOpen = htmlSrc.indexOf('const COMPRESSED_DATA = [') + 'const COMPRESSED_DATA = ['.length;
const cdEnd = htmlSrc.indexOf('\n];', cdOpen);
const cdBlock = htmlSrc.slice(cdOpen, cdEnd);
const cdLoose = (cdBlock.match(/\[\d{4},/g) || []).length;
const cdStrict = [...cdBlock.matchAll(/\[\d{4},\d{1,3}(?:,\d{1,2}){7}\]/g)].length;
ok(cdLoose === cdStrict && cdLoose > 1780, `内联底库元组完整无空槽（${cdStrict} 条）`);
ok(!/,\s*\n\s*,/.test(cdBlock) && !/\[,/g.test(cdBlock), '内联底库不存在空槽（连续逗号）');

ok(errors.length === 0, `页面及交互无脚本错误${errors.length ? '：' + errors.join(' | ') : ''}`);
dom.window.close();
console.log(failed === 0 ? '\n全部通过' : `\n失败 ${failed} 项`);
process.exitCode = failed ? 1 : 0;
