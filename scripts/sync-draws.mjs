#!/usr/bin/env node
/**
 * 开奖数据同步脚本（供 GitHub Actions 定时调用，亦可在本地手动执行）
 *
 * 做的事：
 *   1. 拉取上游开奖页（网络失败时依次退到公共 CORS/文本代理）
 *   2. 用仓库里同一套 docs/src/parser.js 解析（与浏览器端口径完全一致）
 *   3. 只把「比现有最新一期更新」的期次合并进 docs/data/draws.json
 *   4. 严格校验：期号连续、无重复、号码合法、日期与期号自洽
 *   5. 有变化时用 --write 落盘，并退出码 0 + 标准输出 CHANGED=1
 *
 * 设计原则：宁可什么都不写，也绝不写错数据。
 * 任何一条校验不通过 → 退出码 1，workflow 失败并保留现场。
 *
 * 用法：
 *   node scripts/sync-draws.mjs           # 只检查，打印将要发生的变更
 *   node scripts/sync-draws.mjs --write   # 实际写入 docs/data/draws.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = path.join(ROOT, 'docs/data/draws.json');
const DEFAULT_SOURCE_URL = 'https://2026kj.zkclhb.com:2025/am.html';
const WRITE = process.argv.includes('--write');

/** --url 可覆盖数据源（自测/换源用），否则用默认上游 */
const urlArgIdx = process.argv.indexOf('--url');
const SOURCE_URL = urlArgIdx > -1 && process.argv[urlArgIdx + 1]
  ? process.argv[urlArgIdx + 1]
  : DEFAULT_SOURCE_URL;
/** 自定义 --url 时不走公共代理（否则代理仍会去抓默认地址） */
const USE_PROXIES = SOURCE_URL === DEFAULT_SOURCE_URL;

// 惰性导入：让 --help / 本地无网时的报错更干净
const { parseDrawsInput } = await import(path.join(ROOT, 'docs/src/parser.js'));

const log = (...a) => console.log(...a);
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

/** 带超时的 fetch，返回文本；非 2xx 视为失败 */
async function fetchText(url, timeoutMs = 20000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: {
        // 上游是普通 HTML 站，给个常规 UA 避免被反爬直接掐断
        'user-agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,text/plain,*/*',
        'accept-language': 'zh-CN,zh;q=0.9'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text || text.length < 200) throw new Error(`响应过短（${text.length} 字节）`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 依次尝试直连与多个公共代理。
 * r.jina.ai 会把页面转成 markdown，而 parseDrawsInput 本身支持该形态（含 ** 粗体），
 * 因此即使直连被墙也能拿到数据。
 */
async function fetchUpstream() {
  const sources = [['直连', SOURCE_URL]];
  if (USE_PROXIES) {
    sources.push(
      ['allorigins', `https://api.allorigins.win/raw?url=${encodeURIComponent(SOURCE_URL)}`],
      ['corsproxy', `https://corsproxy.io/?${encodeURIComponent(SOURCE_URL)}`],
      ['jina-reader', `https://r.jina.ai/${SOURCE_URL}`]
    );
  }
  const errors = [];
  for (const [name, url] of sources) {
    try {
      const text = await fetchText(url);
      const rows = parseDrawsInput(text);
      if (rows.length >= 7) {
        log(`  数据源「${name}」解析成功：${rows.length} 期`);
        return { name, rows };
      }
      errors.push(`${name}: 仅解析出 ${rows.length} 期`);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  fail(`所有数据源均不可用：\n  - ${errors.join('\n  - ')}`);
}

/** 期号 → 该年第几天（与站点口径一致：2026-001 = 2026-01-01） */
function periodToDate(year, periodNum) {
  const d = new Date(Date.UTC(year, 0, periodNum));
  return d.toISOString().slice(0, 10);
}

function maxPeriodOfYear(year) {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 366 : 365;
}

function nextLabelOf(year, periodNum) {
  return periodNum + 1 > maxPeriodOfYear(year)
    ? `${year + 1}-001`
    : `${year}-${String(periodNum + 1).padStart(3, '0')}`;
}

const asLabel = (year, periodNum) => `${year}-${String(periodNum).padStart(3, '0')}`;

async function main() {
  if (!fs.existsSync(DB_PATH)) fail(`找不到底库文件：${DB_PATH}`);

  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  if (!Array.isArray(db.draws) || !db.draws.length) fail('底库结构异常：draws 不是非空数组');

  // 底库按月/期降序（最新在前），取最大期号作为基准
  const known = new Map(db.draws.map((d) => [d.id, d]));
  const latest = db.draws.reduce((a, b) =>
    a.year > b.year || (a.year === b.year && a.periodNum > b.periodNum) ? a : b
  );
  log(`底库：${db.draws.length} 期，最新 ${latest.id}（${latest.date}）`);

  log('拉取上游开奖页…');
  const { name: sourceName, rows } = await fetchUpstream();

  // —— 1. 与已有记录做一致性校验：同号期次必须完全一致 ——
  for (const row of rows) {
    const old = known.get(row.id);
    if (!old) continue;
    const sig = (d) => [...d.numbers, d.special].join(',');
    if (sig(old) !== sig(row)) {
      fail(`期号 ${row.id} 与底库不一致：底库 ${sig(old)} / 上游 ${sig(row)}`);
    }
  }

  // —— 2. 只取比底库更新的期次，按期号升序处理 ——
  const newer = rows
    .filter((d) => d.year > latest.year || (d.year === latest.year && d.periodNum > latest.periodNum))
    .sort((a, b) => a.year - b.year || a.periodNum - b.periodNum);

  if (!newer.length) {
    log(`没有新期次（上游最新 ${rows[0]?.id || '—'}）。`);
    log('CHANGED=0');
    return;
  }

  // —— 3. 严格连续性校验：不允许跳期，否则说明上游解析漏了 ——
  let cursor = { year: latest.year, periodNum: latest.periodNum };
  const accepted = [];
  const seen = new Set();
  for (const d of newer) {
    const expected = nextLabelOf(cursor.year, cursor.periodNum);
    if (d.id !== expected) {
      fail(`期号不连续：期望 ${expected}，上游给出 ${d.id}。为避免写入缺期数据，本次不更新。`);
    }
    if (seen.has(d.id)) fail(`上游出现重复期号 ${d.id}`);
    seen.add(d.id);

    // 数据合法性
    const seven = [...d.numbers, d.special];
    if (d.numbers.length !== 6) fail(`${d.id} 正码不是 6 个`);
    if (seven.some((n) => !Number.isInteger(n) || n < 1 || n > 49)) fail(`${d.id} 号码越界`);
    if (new Set(seven).size !== 7) fail(`${d.id} 号码有重复：${seven.join(',')}`);
    if (d.date !== periodToDate(d.year, d.periodNum)) {
      fail(`${d.id} 日期与期号不符：${d.date}（按规则应为 ${periodToDate(d.year, d.periodNum)}）`);
    }

    accepted.push(d);
    cursor = { year: d.year, periodNum: d.periodNum };
  }

  log(`\n将写入 ${accepted.length} 期：`);
  for (const d of accepted) log(`  ${d.id}  ${d.date}  ${d.numbers.join(' ')} + ${d.special}`);

  // —— 4. 合并并重建索引字段（保持与现有底库一致的字段顺序与精简结构）——
  const slim = (d) => ({
    id: d.id,
    year: d.year,
    period: String(d.periodNum).padStart(3, '0'),
    periodNum: d.periodNum,
    date: d.date,
    numbers: d.numbers,
    special: d.special
  });

  const merged = [...accepted.map(slim).reverse(), ...db.draws];
  const newest = merged[0];
  const nextDb = {
    updatedAt: new Date().toISOString(),
    source: SOURCE_URL,
    totalCount: merged.length,
    latestId: newest.id,
    latestDate: newest.date,
    years: [...new Set(merged.map((d) => d.year))].sort((a, b) => b - a),
    draws: merged
  };

  if (!WRITE) {
    log('\n（未加 --write，仅演练，不写入文件）');
    log('CHANGED=1');
    return;
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(nextDb), 'utf8');
  log(`\n✓ 已写入 ${DB_PATH}`);

  // —— 5. 同步更新 index.html 内联底库 COMPRESSED_DATA ——
  // 页面首屏读的是这段内联数据（不是 draws.json），不更新它，用户依然看到旧期次。
  const patched = patchInlineDb(accepted);
  log(`✓ 已更新 ${patched ? 'index.html 内联底库' : '（内联底库无需改动）'}`);

  log(`  总期数 ${db.draws.length} → ${nextDb.totalCount}，最新 ${latest.id} → ${newest.id}（数据源：${sourceName}）`);
  log('CHANGED=1');
}

/**
 * 把新期次追加进 docs/index.html 的 COMPRESSED_DATA 数组。
 * 每条 [年,期,正码×6,特码]，整体按期号升序，最后一条为最新。
 *
 * 做法：先解析出全部已有元组 → 追加新元组 → 按 6 条一行重新排版，
 * 而不是在原文本上做字符串拼接（那样极易产生空槽/重复/丢行）。
 */
function patchInlineDb(newRows) {
  const htmlPath = path.join(ROOT, 'docs/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const startMarker = 'const COMPRESSED_DATA = [';
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) throw new Error('index.html 里找不到 COMPRESSED_DATA');
  const openIdx = startIdx + startMarker.length;
  const endIdx = html.indexOf('\n];', openIdx);
  if (endIdx === -1) throw new Error('找不到 COMPRESSED_DATA 的结束标记');

  const block = html.slice(openIdx, endIdx);
  const tuples = [...block.matchAll(/\[(\d{4}),(\d{1,3})((?:,\d{1,2}){7})\]/g)].map((m) => ({
    year: Number(m[1]),
    periodNum: Number(m[2]),
    values: [Number(m[1]), Number(m[2]), ...m[3].split(',').slice(1).map(Number)]
  }));

  const total = (block.match(/\[\d{4},/g) || []).length;
  if (tuples.length !== total) throw new Error(`内联底库解析不完整：匹配 ${tuples.length}/${total} 条`);

  const seen = new Set(tuples.map((t) => `${t.year}-${t.periodNum}`));
  const toAdd = newRows.filter((d) => !seen.has(`${d.year}-${d.periodNum}`));
  if (!toAdd.length) return false;

  for (const d of toAdd) {
    const key = `${d.year}-${d.periodNum}`;
    if (seen.has(key)) throw new Error(`内联底库出现重复期号 ${key}`);
    seen.add(key);
    tuples.push({ year: d.year, periodNum: d.periodNum, values: [d.year, d.periodNum, ...d.numbers, d.special] });
  }

  // 按期号升序（原文件即此顺序），再按每行 6 条重排
  tuples.sort((a, b) => a.year - b.year || a.periodNum - b.periodNum);
  const lines = [];
  for (let i = 0; i < tuples.length; i += 6) {
    // 行内用逗号连接；行与行之间也要有逗号（换行只是排版，不是分隔符）
    lines.push('  ' + tuples.slice(i, i + 6).map((t) => `[${t.values.join(',')}]`).join(','));
  }

  // openIdx 是 '[' 之后的位置；endIdx 是结尾换行的位置。
  // 两侧换行都要显式补上，否则会整体错位（产生空槽 / 首行粘连）。
  const newBlock = '\n' + lines.join(',\n') + '\n';
  fs.writeFileSync(htmlPath, html.slice(0, openIdx) + newBlock + html.slice(endIdx + 1), 'utf8');

  // 回写后立刻复核：条数与新元组数必须一致，否则宁可报错让 workflow 失败
  const check = fs.readFileSync(htmlPath, 'utf8');
  const checkBlock = check.slice(check.indexOf(startMarker) + startMarker.length, check.indexOf('\n];', check.indexOf(startMarker)));
  const checkCount = (checkBlock.match(/\[\d{4},/g) || []).length;
  if (checkCount !== tuples.length) {
    throw new Error(`内联底库写回后条数不符：${checkCount} / 期望 ${tuples.length}`);
  }
  return true;
}

main().catch((e) => fail(e.stack || e.message));
