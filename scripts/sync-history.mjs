#!/usr/bin/env node
/**
 * 历史开奖同步脚本
 * ------------------------------------------------------------------
 * 数据源：Number-selection-tool 仓库的 data/draws.json（唯一真源）
 *   https://github.com/whitworthbassalips894-crypto/Number-selection-tool
 *
 * 用法：
 *   npm run data:sync                 # 依次尝试 CDN / raw / GitHub API
 *   npm run data:sync:local -- ../nst # 从本地已 clone 的仓库读取（离线可用）
 *   GITHUB_TOKEN=xxx npm run data:sync
 *
 * 输出：
 *   public/data/history.json   精简后的历史库（前端直接 fetch）
 *   public/data/meta.json      数据源元信息（期数 / 覆盖区间 / 更新时间）
 *
 * 设计原则：
 *   1. 只做「清洗 + 精简」，绝不修改开奖号码；
 *   2. 任何一期号码非法（越界 / 重复 / 缺失）都会被剔除并记录，而不是静默写入；
 *   3. 期号重复时保留日期更新的一条；
 *   4. 若远端数据比本地少（上游异常回滚），拒绝覆盖并退出码 1。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'data');

const SOURCE_REPO = process.env.SOURCE_REPO || 'whitworthbassalips894-crypto/Number-selection-tool';
const SOURCE_BRANCH = process.env.SOURCE_BRANCH || 'main';
const SOURCE_PATH = process.env.SOURCE_PATH || 'data/draws.json';
const [owner, repo] = SOURCE_REPO.split('/');

const CANDIDATES = [
  `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${SOURCE_BRANCH}/${SOURCE_PATH}`,
  `https://raw.githubusercontent.com/${owner}/${repo}/${SOURCE_BRANCH}/${SOURCE_PATH}`,
  `https://api.github.com/repos/${owner}/${repo}/contents/${SOURCE_PATH}?ref=${SOURCE_BRANCH}`,
  `https://${owner}.github.io/${repo}/${SOURCE_PATH}`
];

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const args = process.argv.slice(2);
const localIdx = args.indexOf('--from');
const LOCAL_DIR = localIdx >= 0 ? path.resolve(ROOT, args[localIdx + 1] || '') : '';

function isIntInRange(n) {
  return Number.isInteger(n) && n >= 1 && n <= 49;
}

/** 从任意形态的 JSON 中提取开奖数组 */
function extractDraws(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.draws)) return raw.draws;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  throw new Error('无法识别的数据结构：缺少 draws / data / results 数组');
}

function normalizeDraw(item) {
  if (!item || typeof item !== 'object') return null;
  const year = Number(item.year);
  const periodNum = Number(item.periodNum ?? item.period);
  const date = String(item.date || item.drawDate || '').slice(0, 10);
  const numbers = Array.isArray(item.numbers) ? item.numbers.map(Number) : [];
  const special = item.special == null ? NaN : Number(item.special);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(periodNum) || periodNum < 1 || periodNum > 366) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (numbers.length !== 6 || !numbers.every(isIntInRange)) return null;
  if (!isIntInRange(special)) return null;
  if (new Set([...numbers, special]).size !== 7) return null;
  if (new Set(numbers).size !== 6) return null;

  return {
    id: `${year}-${String(periodNum).padStart(3, '0')}`,
    date,
    year,
    periodNum,
    n: numbers.slice(),
    s: special
  };
}

async function fetchJson(url) {
  const headers = { 'user-agent': 'lottery-draw-lab/2.0' };
  if (url.includes('api.github.com')) {
    headers.accept = TOKEN ? 'application/vnd.github.raw' : 'application/vnd.github+json';
    if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let text = await res.text();
    if (!TOKEN && url.includes('api.github.com')) {
      const payload = JSON.parse(text);
      if (payload.encoding === 'base64' && payload.content) {
        text = Buffer.from(payload.content, 'base64').toString('utf8');
      }
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function loadRaw() {
  const errors = [];
  if (LOCAL_DIR) {
    const file = path.join(LOCAL_DIR, SOURCE_PATH);
    const text = await fs.readFile(file, 'utf8');
    return { raw: JSON.parse(text), origin: `local:${file}` };
  }
  for (const url of CANDIDATES) {
    try {
      process.stdout.write(`→ 尝试 ${url}\n`);
      const raw = await fetchJson(url);
      return { raw, origin: url };
    } catch (err) {
      errors.push(`${url} :: ${err.message}`);
      process.stdout.write(`  ✗ ${err.message}\n`);
    }
  }
  throw new Error(`所有数据源均失败：\n  ${errors.join('\n  ')}`);
}

function summarize(draws) {
  const sorted = draws.slice().sort((a, b) => (a.date === b.date ? b.periodNum - a.periodNum : a.date < b.date ? 1 : -1));
  const latest = sorted[0];
  const earliest = sorted[sorted.length - 1];
  return { sorted, latest, earliest };
}

async function main() {
  const { raw, origin } = await loadRaw();
  const list = extractDraws(raw);

  let invalid = 0;
  const byId = new Map();
  for (const item of list) {
    const norm = normalizeDraw(item);
    if (!norm) {
      invalid++;
      continue;
    }
    const prev = byId.get(norm.id);
    if (!prev || prev.date < norm.date) byId.set(norm.id, norm);
  }

  const { sorted, latest, earliest } = summarize([...byId.values()]);
  if (!sorted.length) throw new Error('清洗后没有任何有效开奖记录');

  // 防回滚：远端比本地少 30 期以上视为上游异常
  const outFile = path.join(OUT_DIR, 'history.json');
  let previousCount = 0;
  try {
    const prev = JSON.parse(await fs.readFile(outFile, 'utf8'));
    previousCount = Array.isArray(prev.draws) ? prev.draws.length : 0;
  } catch {
    /* 首次生成 */
  }
  if (previousCount && sorted.length < previousCount - 30 && !process.env.FORCE) {
    throw new Error(`上游记录数异常减少（本地 ${previousCount} → 远端 ${sorted.length}），已中止；确认无误可用 FORCE=1 覆盖`);
  }

  const generatedAt = new Date().toISOString();
  const history = {
    schema: 2,
    source: {
      repo: SOURCE_REPO,
      path: SOURCE_PATH,
      url: `https://github.com/${SOURCE_REPO}`,
      upstreamUpdatedAt: raw && raw.updatedAt ? raw.updatedAt : null,
      origin,
      generatedAt
    },
    total: sorted.length,
    latest: { id: latest.id, date: latest.date },
    earliest: { id: earliest.id, date: earliest.date },
    draws: sorted.map((d) => ({ id: d.id, date: d.date, n: d.n, s: d.s }))
  };

  const meta = {
    total: sorted.length,
    invalidCount: invalid,
    latest: history.latest,
    earliest: history.earliest,
    generatedAt,
    origin,
    previousCount,
    added: previousCount ? Math.max(0, sorted.length - previousCount) : null
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(history) + '\n');
  await fs.writeFile(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');

  console.log(`\n✅ 已写入 ${history.total} 期（剔除非法 ${invalid} 条）`);
  console.log(`   覆盖 ${history.earliest.id} (${history.earliest.date}) → ${history.latest.id} (${history.latest.date})`);
  console.log(`   来源 ${origin}`);
  if (previousCount && sorted.length > previousCount) console.log(`   新增 ${sorted.length - previousCount} 期`);
}

main().catch((err) => {
  console.error(`\n❌ 同步失败：${err.message}`);
  process.exit(1);
});
