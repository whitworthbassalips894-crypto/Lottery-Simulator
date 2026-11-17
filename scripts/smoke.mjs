#!/usr/bin/env node
/**
 * 冒烟测试：把整站打进 jsdom 里跑一遍，确认首屏与各页面渲染不报错。
 * 用法：npm run smoke
 */
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FAKE_RESULT = {
  ranAt: new Date().toISOString(),
  range: { from: '2026-001', to: '2026-320', periods: 320 },
  baseline: { specialRate: 1 / 49, mainMean: 36 / 49, main3Plus: 0.02, main1Plus: 0.58, jackpot: 1 / 49000000 },
  strategies: [
    {
      id: 'hot',
      periods: 320,
      specialHits: 7,
      specialRate: 7 / 320,
      specialCi: [0.01, 0.045],
      pValue: 0.72,
      mainHitsTotal: 240,
      mainMean: 0.75,
      mainMeanCi: [0.66, 0.84],
      mainDist: [120, 120, 60, 18, 2, 0, 0],
      mainExpectedDist: [0.37, 0.4, 0.16, 0.03, 0.003, 0.0001, 0.000001],
      main3Plus: 0.06,
      main1Plus: 0.62,
      maxMainHits: 4,
      longestMiss: 40,
      currentMiss: 3,
      curve: Array.from({ length: 320 }, (_, i) => Math.floor(i / 45)),
      years: [{ year: 2026, periods: 320, specialHits: 7, specialRate: 7 / 320, mainMean: 0.75 }],
      recent: [],
      best: {
        period: '2026-200',
        date: '2026-07-19',
        main: [1, 2, 3, 4, 5, 6],
        special: 7,
        realMain: [1, 2, 3, 10, 11, 12],
        realSpecial: 7,
        mainHits: 3,
        specialHit: true
      },
      hitPeriods: [
        {
          period: '2026-200',
          date: '2026-07-19',
          main: [1, 2, 3, 4, 5, 6],
          special: 7,
          realMain: [1, 2, 3, 10, 11, 12],
          realSpecial: 7,
          mainHits: 3,
          specialHit: true
        }
      ]
    }
  ]
};

async function main() {
  const outfile = path.join(ROOT, 'node_modules/.cache/smoke-bundle.js');
  await fs.mkdir(path.dirname(outfile), { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, 'tests/smoke-entry.tsx')],
    bundle: true,
    format: 'iife',
    outfile,
    jsx: 'automatic',
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.BASE_URL': '"/"',
      'import.meta.url': '"file:///app.js"'
    },
    logLevel: 'error'
  });

  const history = await fs.readFile(path.join(ROOT, 'public/data/history.json'), 'utf8');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => errors.push((err.stack || err.message || '').slice(0, 4000)));
  virtualConsole.on('error', (msg) => errors.push(String(msg)));

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://example.github.io/Lottery-Simulator/',
    virtualConsole
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('data/history.json')) {
      return { ok: true, status: 200, json: async () => JSON.parse(history), text: async () => history };
    }
    throw new Error(`离线环境不发起请求：${url}`);
  };
  window.Worker = class {
    postMessage(msg) {
      setTimeout(() => {
        this.onmessage?.({ data: { type: 'progress', requestId: msg.requestId, ratio: 0.5 } });
        this.onmessage?.({ data: { type: 'done', requestId: msg.requestId, result: FAKE_RESULT } });
      }, 0);
    }
    terminate() {}
  };
  window.addEventListener('error', (event) => errors.push(event.message));
  window.scrollTo = () => {};

  const bundle = await fs.readFile(outfile, 'utf8');
  const script = window.document.createElement('script');
  script.textContent = bundle;
  window.document.body.appendChild(script);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await wait(600);

  const checks = [];
  const text = () => window.document.body.textContent ?? '';
  if (process.env.SMOKE_DEBUG) {
    console.log('--- body html ---');
    console.log(window.document.body.innerHTML.slice(0, 1200));
    console.log('--- errors ---');
    console.log(errors);
  }
  checks.push(['首屏渲染品牌', text().includes('摇号实验室')]);
  checks.push(['历史库加载', text().includes('2026-320')]);
  checks.push(['显示今日模拟', text().includes('模拟')]);

  const clickTab = async (label) => {
    const button = [...window.document.querySelectorAll('.nav-item')].find((el) => el.textContent?.includes(label));
    if (!button) throw new Error(`找不到导航：${label}`);
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await wait(350);
  };

  await clickTab('模拟摇号');
  checks.push(['摇号页渲染', text().includes('本期尚未摇号') || text().includes('真实开奖')]);
  await clickTab('策略回测');
  checks.push(['回测页渲染', text().includes('随机基线')]);
  await clickTab('数据洞察');
  checks.push(['洞察页渲染', text().includes('49 码分布网格')]);
  await clickTab('数据与设置');
  checks.push(['数据页渲染', text().includes('Number-selection-tool')]);

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? '✓' : '✗'} ${name}`);
    if (!ok) failed++;
  }
  const fatal = errors.filter((e) => !/Not implemented|Could not parse CSS|offline|离线环境/.test(e));
  if (fatal.length) {
    failed++;
    console.log('✗ 运行时错误：');
    fatal.slice(0, 8).forEach((e) => console.log(`   ${e}`));
  } else {
    console.log('✓ 无运行时错误');
  }
  dom.window.close();
  if (failed) {
    console.error(`\n冒烟测试失败：${failed} 项`);
    process.exit(1);
  }
  console.log('\n冒烟测试通过');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
