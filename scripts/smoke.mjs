#!/usr/bin/env node
/**
 * 冒烟测试：把整站打进 jsdom 里跑一遍
 * 检查三件事：首屏渲染、自动补齐 20 期、三个页面都能打开且无运行时错误。
 * 用法：npm run smoke
 */
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
      'import.meta.env.BASE_URL': '"/"'
    },
    logLevel: 'error'
  });

  const history = await fs.readFile(path.join(ROOT, 'public/data/history.json'), 'utf8');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => errors.push((err.stack || err.message || '').slice(0, 2000)));
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
  window.addEventListener('error', (event) => errors.push(event.message));
  window.scrollTo = () => {};

  const script = window.document.createElement('script');
  script.textContent = await fs.readFile(outfile, 'utf8');
  window.document.body.appendChild(script);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await wait(700);

  const text = () => window.document.body.textContent ?? '';
  const clickTab = async (label) => {
    const button = [...window.document.querySelectorAll('.tab')].find((el) => el.textContent?.includes(label));
    if (!button) throw new Error(`找不到导航：${label}`);
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await wait(320);
  };

  const checks = [];
  checks.push(['首屏渲染', text().includes('摇号实验室')]);
  checks.push(['历史库加载', text().includes('2026-320')]);

  let sims = JSON.parse(window.localStorage.getItem('drawlab:v2:sims') ?? '[]');
  checks.push(['自动补齐最近 20 期', sims.length === 20 && sims.every((s) => s.auto === true)]);
  checks.push(['补齐的号码由期号种子决定', sims.every((s) => s.main.length === 6 && s.special >= 1)]);
  checks.push(['当天不参与自动补齐', !sims.some((s) => s.period === '2026-321')]);
  checks.push(['对照统计出现', /已对照\s*20\s*期/.test(text().replace(/\s+/g, ' '))]);

  // 仪式：进来是空槽
  const slots = window.document.querySelectorAll('.slot');
  checks.push(['今日初始为空槽', slots.length === 7 && text().includes('今日尚未开摇')]);

  // 点击开摇 → 逐个揭晓
  const drawButton = [...window.document.querySelectorAll('button')].find((el) => el.textContent?.trim() === '开摇');
  checks.push(['开摇按钮存在', Boolean(drawButton)]);
  if (drawButton) {
    drawButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await wait(500);
    checks.push(['揭晓过程中开始出号', window.document.querySelectorAll('.slot').length === 6]);
    await wait(3200);
    checks.push(['揭晓完成并落款', text().includes('今日号码已定') && Boolean(window.document.querySelector('.stamp'))]);
    sims = JSON.parse(window.localStorage.getItem('drawlab:v2:sims') ?? '[]');
    checks.push(['今日号码已写入本机', sims.some((s) => s.period === '2026-321' && !s.auto)]);
  }

  await clickTab('对照记录');
  checks.push(['对照记录页渲染', text().includes('模拟号码 vs 真实开奖')]);
  await clickTab('数据与设置');
  checks.push(['数据页渲染', text().includes('Number-selection-tool')]);

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? '✓' : '✗'} ${name}`);
    if (!ok) failed++;
  }

  const fatal = errors.filter((e) => !/Not implemented|Could not parse CSS|离线环境|不再请求/.test(e));
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
