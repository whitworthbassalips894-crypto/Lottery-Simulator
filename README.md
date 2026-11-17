# 摇号实验室 · Draw Lab

> 每日 **6+1 模拟摇号** × **1780 期真实开奖对照** × **多策略历史回测**
> 把「选号玄学」放进历史数据里跑一遍，看清随机到底长什么样。

线上地址：<https://whitworthbassalips894-crypto.github.io/Lottery-Simulator/>

---

## 这是什么

原版是一个单文件 HTML「每日摇号模拟器」：每天摇一组 6+1，再手动录入真实开奖做对照。v2 在原玩法上做三件事：

1. **换成真实数据**：历史库直接取自
   [`whitworthbassalips894-crypto/Number-selection-tool`](https://github.com/whitworthbassalips894-crypto/Number-selection-tool)
   的 `data/draws.json`（1780 期有效开奖，2022-001 → 2026-320），并在构建时与打开页面时自动同步。
2. **加了严谨的回测**：热号、冷号、周期、形态均衡、三路合议、随机基线六种策略，逐期滚动、无未来函数地跑完整段历史，给出命中率、95% 置信区间与 p 值。
3. **重做界面**：React + TypeScript 单页应用，桌面侧边栏 + 手机底部导航，明暗双主题，红/蓝/绿波色球体，独立 SVG 图表，无第三方 UI 库。

---

## 五个模块

| 模块 | 内容 |
| --- | --- |
| **总览** | 今日模拟号码（期号种子固定，刷新不变）、最新真实开奖、KPI、累计命中曲线 vs 随机期望、近期对照 |
| **模拟摇号** | 按日期选期、每期 3 次摇号机会、重播、复制号码、开奖号码自动/手动补录、逐期命中核对、模拟档案表 |
| **策略回测** | 6 种策略 × 可选区间（近 100 / 近 300 / 全量），成绩单、累计命中曲线、主号命中分布、分年表现、命中样例 |
| **数据洞察** | 49 码 7×7 热力网格（次数/遗漏）、单码详情、波色/单双/大小/三区/尾数分布、和值走势、重号统计、全量开奖检索 |
| **数据与设置** | 数据源状态与同步、四路回退诊断、备份导出/导入、手工补录管理、主题/生肖/动画偏好、免责声明 |

---

## 数据管道

```
Number-selection-tool/data/draws.json   ← 上游 GitHub Actions 每日抓取
        │
        ├─ jsDelivr CDN ─┐
        ├─ raw.github ───┤  浏览器运行时按顺序回退，任一成功即合并
        ├─ GitHub API ───┤
        └─ GitHub Pages ─┘
        │
public/data/history.json  ← 构建时快照（清洗：越界/重复/缺号剔除，按 id 去重）
        │
浏览器 localStorage 缓存 + 手工补录 → 合并成最终历史库
```

- 同步只读，绝不写回源仓库。
- 上游记录数异常减少 30 期以上会中止覆盖（防止上游回滚把本站数据冲掉）。
- 断网或同步失败时自动使用内置快照，功能不受影响。

---

## 本地开发

```bash
npm ci
npm run dev        # http://localhost:5173
npm run build      # 类型检查 + 生产构建 → dist/
npm run preview    # 预览生产包
npm run smoke      # jsdom 冒烟测试：五个页面全部渲染一遍
npm run data:sync  # 从远端拉最新开奖写入 public/data/history.json
npm run data:sync:local -- ../Number-selection-tool   # 从本地 clone 读取
```

要求 Node 20+。

---

## 部署

仓库自带 `.github/workflows/deploy.yml`：

1. 推送到 `main`（或 PR 合并）→ 自动执行
2. 安装依赖 → 同步最新开奖 → 冒烟测试 → 构建 → 发布到 GitHub Pages
3. 每天 01:30（北京时间）定时重建一次，保证开奖数据不过夜

首次启用：仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions** 即可。

产物是纯静态文件，也可以直接丢到 Vercel / Netlify / Cloudflare Pages（`dist/` 目录）。

---

## 目录结构

```
index.html               入口（含主题防闪烁脚本）
src/
  App.tsx                布局、导航、主题
  state.tsx              全局状态：历史库合并、同步、模拟记录、设置
  styles.css             设计系统（明暗主题、组件、响应式）
  components/            号码球、面板、图表（折线/柱状/热力/迷你走势）
  pages/                 总览 / 模拟摇号 / 策略回测 / 数据洞察 / 数据与设置
  lib/
    history.ts           数据源回退、清洗、合并
    periods.ts           期号 ↔ 日期（当年第几天）
    stats.ts             频率、遗漏、超几何、Wilson 区间、p 值
    strategies.ts        六种选号策略 + 形态约束求解
    backtest.ts          逐期回测引擎（无未来函数）
    analysis.ts          页面派生统计
    storage.ts           本地存储
  workers/backtest.worker.ts   回测放到 Web Worker，不阻塞界面
scripts/
  sync-history.mjs       历史库同步与清洗
  smoke.mjs              jsdom 全站冒烟测试
public/
  data/history.json      历史库快照
  legacy.html            旧版单文件模拟器（保留可访问）
```

---

## 数学口径（重要）

- 特码（1 个号）命中概率 **1/49 ≈ 2.04%**，公平赔率 49 倍。
- 6 个主号对 49 选 6 的开奖，单期期望命中 **36/49 ≈ 0.735 个**。
- 主号命中数服从超几何分布，至少中 3 个的概率仅约 **1.87%**。
- 6+1 全中概率约 **1/49,000,000**。

因此：

- 回测里任何策略的长期命中率都会向基线收敛；样本小的时候领先/落后都正常，请结合置信区间与 p 值判断。
- 本工具**不预测、不推荐投注**，只做模拟、对照与统计学习。请理性娱乐。

---

## 旧版

`public/legacy.html` 保留了最初的单文件版本（离线可用、localStorage 存档、导入导出、每日 3 次摇号）。新版在「数据与设置」页可以直接打开它。
