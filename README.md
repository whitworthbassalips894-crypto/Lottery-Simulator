# 摇号实验室 · Draw Lab

> 每天一注 6+1 的模拟摇号工具，开奖后自动和真实开奖对照。
> 纯娱乐、无投注、无账号、无追踪。

线上地址：<https://whitworthbassalips894-crypto.github.io/Lottery-Simulator/>

---

## 三个页面

| 页面 | 内容 |
| --- | --- |
| **今日摇号** | 选中某一天 → 摇出一注 6+1（由期号决定，刷新不变）→ 展示当期真实开奖并标出命中的号码 |
| **对照记录** | 最近 20 期（含首次打开自动补齐）的模拟号码 vs 真实开奖，逐期显示主号命中数与特码是否命中 |
| **数据与设置** | 一键同步最新开奖、导出/导入备份、补齐最近 20 期、清空本机数据、主题与显示偏好 |

首次打开时会用「期号种子」**自动补齐最近 20 期**的模拟号码，所以一进来就有对照可看，不用等 20 天；删掉后可以随时在数据页重新补齐。

## 数据

- 唯一数据源：[`Number-selection-tool`](https://github.com/whitworthbassalips894-crypto/Number-selection-tool) 的 `data/draws.json`
- 构建时打包快照（清洗越界／重复／缺号，1780 期有效，2022-001 → 2026-320）
- 打开页面时按 jsDelivr → raw.githubusercontent → GitHub API → GitHub Pages 顺序尝试最新数据；全部失败也能离线使用快照
- 同步只读，绝不写回源仓库；上游记录数异常减少 30 期以上会中止覆盖

## 视觉

扁平化：纯色号码球、1px 描边、小圆角、无投影、无渐变，明暗主题共用一套设计变量，手机与桌面同一套布局。

## 本地开发

```bash
npm ci
npm run dev        # http://localhost:5173
npm run build      # 类型检查 + 生产构建 → dist/
npm run build:docs # 构建到 docs/（GitHub Pages 用）
npm run test       # 7 项核心逻辑测试
npm run smoke      # jsdom 冒烟测试：三页渲染 + 自动补齐 20 期
npm run data:sync  # 从远端同步最新开奖
```

需要 Node 20+。

## 部署

GitHub Pages 已经在用 **Deploy from a branch → main /docs**：合并到 `main` 后会自动重建。

想换成 Actions 自动构建（含每日定时同步）：把 `ci/deploy.yml` 复制到 `.github/workflows/deploy.yml` 推一次，然后在 Settings → Pages 选择 “GitHub Actions”。纯静态产物也可以直接丢到 Vercel / Netlify / Cloudflare Pages。

## 目录

```
src/
  App.tsx                 顶部导航 + 三个页面
  state.tsx               历史库合并、同步、模拟记录、首次自动补齐 20 期
  styles.css              扁平设计系统（明暗主题 + 响应式）
  components/ui.tsx       号码球、卡片、按钮、标签、分段控件
  components/NumberInputs.tsx  7 位号码输入（支持整串粘贴）
  pages/Today.tsx         今日摇号 + 当期开奖对照
  pages/Records.tsx       最近记录与统计
  pages/DataPage.tsx      同步、备份、偏好
  lib/                    期号、随机、命中、数据同步、本地存储
scripts/
  sync-history.mjs        历史库同步与清洗
  smoke.mjs               jsdom 全站冒烟测试
public/
  data/history.json       历史库快照
  legacy.html             旧版单文件摇号器
```

## 概率口径

- 特码（1 个号）命中概率 **1/49 ≈ 2.04%**
- 6 个主号的单期期望命中 **36/49 ≈ 0.735 个**
- 6+1 全中概率约 **1/49,000,000**

工具只负责模拟、对照和统计展示；任何选号方法都不会改变这些概率。请理性娱乐。
