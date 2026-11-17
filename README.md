# 特码盲区互补助手（Number-selection-tool 镜像 · 换芯版）

线上：<https://whitworthbassalips894-crypto.github.io/Lottery-Simulator/>

这是 [Number-selection-tool](https://whitworthbassalips894-crypto.github.io/Number-selection-tool/) 的**同款页面镜像**：
版式、卡片、球、热度格、两个弹窗、交互全部照原版，**只把算法内核换掉**，宣发改成互补版。两套页面可以一起开着对照。

## 和原版的关系

| | 原版（工具2） | 本页（盲区互补版） |
|---|---|---|
| #1 | 热态（近期活跃） | **正码传导**（近 1~3 期正码预热 + 30 期全奖托底 + 夹号/合50 联动） |
| #2 | 遗漏（冷号回补） | **中段蓄力**（特码遗漏 16~30 期断层窗） |
| #3 | 周期（反向杀号池） | **肖热透支**（近 25 期过热生肖剩余球 + 7~15 期浅冷 + 全奖沉寂） |
| 提纯 | #1∪#2 − #3 − 近5期已开 | **#1∪#2 − #3 − 近5期已开，且只在工具2 三组并集之外选号** |

核心一句话：**先算出工具2 当期三组并集（约 16~18 码）当作盲区，本页只在这些号码之外选。**
所以两边当期推荐**恒为零重叠**（1720 期回测，异常 0 期），命中互不干扰。

- 提纯平均 9.0 码，1772 期历史命中率 20.0%（≈ 9/49，属正常水位，不是"优势"）。
- 两套并行等于覆盖约 2 倍号码，命中频率接近翻倍，**成本也翻倍**；单码期望不变。
- 每期开奖独立随机，本页仅作历史统计与娱乐参考。

## 目录

```
docs/             ← GitHub Pages 直接发布的静态站（根目录即站点根）
  index.html        单页应用（内联样式 + 内联引擎，1780 期底库内置）
  assets/           icon.svg / styles.css / six-tier.css（原版照搬）
  src/              note-sync.js 等数据同步模块（原版照搬）
  data/draws.json   ┐ 仓库数据源，供「一键同步」读取
  data/draws.js     ┘
  manifest.webmanifest / sw.js / .nojekyll
scripts/
  serve.mjs         本地预览（0.0.0.0:4173）
  check.mjs         JSDOM 冒烟：页面无报错 / 零重叠 / 档位 / 历史回放
```

## 本地

```bash
npm install
npm start      # http://localhost:4173/
npm run check  # 冒烟校验
```

## 改了哪段代码

只在 `docs/index.html` 内联脚本里：

1. 新增 `selectPoolSeven()` + `computeBlindPlan()`（紧跟原版 `runTool2At()` 之后）。
   `computeBlindPlan` 先调 `runTool2At` 拿工具2 三组并集当盲区，再算传导/蓄力/杀号池，返回**与原版完全相同的 plan 结构**，所以渲染层一行没改。
2. 两处调用点：`renderMainPick()` 与 `cacheReplayRow()` 由 `runTool2At(...)` 改为 `computeBlindPlan(...)`。
3. 文案：标题/H1/组名/标签/依据/页脚改成互补版说法，其余 UI 不动。

## 数据

内置底库 1780 期（内联在 `index.html` 的 `COMPRESSED_DATA`）。
「一键同步」优先读本站 `./data/draws.json`，落后时再回源仓库原始文件；也可在「数据管理」里手动补录 / 导入导出 / 撤销本机新增。

## 部署

GitHub Pages，source = `main` 分支 `/docs` 目录。推到 `main` 后自动生效，无需构建。
