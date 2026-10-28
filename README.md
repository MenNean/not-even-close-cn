# 大米致死计算器（Not Even Close 中文版）

魔兽世界大秘境「这个技能会不会秒我」中文工具。选副本、拖层数、填角色属性、勾职业减伤，直接列出每个技能该层的伤害、占血量百分比、必死/危险/安全。

- 纯静态、零依赖，**双击 `index.html` 就能用**
- 数据来自 [not-even-close 开源仓库](https://github.com/acornellier/not_even_close)（Midnight S2，8 副本 184 条技能）
- **13 职业 / 39 专精 / 390 条减伤与团队增益**可勾选，含被动默认项
- 技能与副本中文名来自 **wago.tools 的官方简中数据表**（不是机翻）
- 计算口径与原站逐行对齐

> 数据版权归暴雪娱乐，本站为玩家自制中文工具，非官方、非商用。

---

## 快速开始

双击 `index.html`。没有构建步骤，没有服务器。

默认参数取自一张真实游戏截图（+21、耐力 45859、护甲 2409），动哪项都实时重算。

## 页面能做什么

| 区域 | 内容 |
|---|---|
| 角色与钥匙 | 副本、层数、耐力、暴君周开关；高级里是全能/闪避/护甲与手动减伤 |
| 职业与团队减伤 | 选职业+专精，勾选自带减伤（默认项自动勾上）；折叠区是团队增益/外部技能 |
| 承伤判定 | 必死/危险/安全汇总、按系别筛选、排除坦克技能、按占比或伤害排序、结果可展开明细 |
| 分享 | 全部状态写进 URL，复制即分享 |

## 计算口径（与源码一一对应）

| 项目 | 公式 | 源码位置 |
|---|---|---|
| 钥匙缩放 | `∏(k=2..层数) k>=11 ? 1.1 : 1.07` | `sim.ts` |
| 强韧 | 小怪 ×1.2（+10 起常驻） | `sim.ts` |
| 暴君 | 首领 ×1.15 | `sim.ts` |
| 血量 | `⌊耐力×(1+耐力增益)⌋ × 20 × (1+生命增益)` | `stats.ts` + `sim.ts` |
| 全能 | 分段递减换算，减伤 = 全能% ÷ 2 | `stats.ts` + `dr.ts` |
| 闪避 | 分段递减换算，只减 AoE | `dr.ts` |
| 护甲 | `护甲/(护甲+4464)`，只减物理且未标 `ignoresArmor` | `stats.ts` |
| 职业减伤 | 逐条乘法；`dr` 按物理/魔法过滤，`aoeDr` 只对 AoE 生效，两者同时存在取较大 | `dr.ts` |
| 降低伤害 | `damageDealtReduction` 在减伤链之前先削减 | `sim.ts` |
| 判定 | 承伤 ≥ 血量 = 必死；≥70% = 危险 | — |

> 吸收类（Ignore Pain、真言术：盾等）暂未建模，界面上会标注「仅吸收 · 未计入」。

## 数据管线

```bash
npm i                 # 只为 build-classes 需要 typescript
npm run source        # 镜像源码树 → data/source/
npm run classes       # 解析 TS → data/classes.js（13 职业 39 专精）
npm run zh            # 抓官方简中名 → data/zh-names.js + zh-dungeons.json
npm run data          # 合成 → data/data.js
npm test              # 16 项内核单测 + 12 项无头 DOM 冒烟
```

- `fetch-source.mjs`：走 jsDelivr 的 GitHub 镜像，枚举 `src/` 下全部 `.ts/.json` 并下载，无需 token
- `build-classes.mjs`：用 TypeScript 编译器把职业数据 TS 转成 CJS 后求值，拿到 `classSpecs` / `externals` / `groupBuffs` / `groupActives`
- `fetch-zh-names.mjs`：从 wago.tools 的 `SpellName` 表按法术 ID 查 zhCN 名；`JournalInstance` 表翻页取副本中文名
- 新赛季：改 `build-data.mjs` 的 `DUNGEONS` 与 `midnight_s2` 目录名即可

## 目录结构

```
not-even-close-cn/
├─ index.html              站点入口（双击即开）
├─ assets/
│  ├─ style.css            主题样式
│  ├─ engine.js            计算内核（纯函数）
│  └─ app.js               界面逻辑
├─ data/
│  ├─ data.js              副本与技能数据（184 条）
│  ├─ classes.js           职业/专精/团队技能（390 条）
│  ├─ zh-names.js          官方简中技能名
│  ├─ zh-names.json        同上，供构建使用
│  ├─ zh-dungeons.json     官方简中副本名
│  ├─ zh-map.json          人工译名兜底
│  └─ source/              原站源码镜像
├─ tools/                  抓取 / 构建 / 测试脚本
└─ docs/superpowers/specs/ 设计稿
```

## 自测

```bash
npm test
```

- 16 项内核：缩放、减伤链、职业减伤、判定、系别、与原站数值对账
- 12 项冒烟：启动、渲染、职业面板、官方中文名、分享链接

## 下一步可做

- 吸收类护盾建模（数据里已经抓到了 `absorb` 参数）
- 天赋点/英雄天赋的联动（数据自带 `heroTree` 与 `abilityAugmentations`）
- 多版本/多赛季切换

## 免责声明

技能数值版权归暴雪娱乐所有，本工具仅作社区参考。数值以游戏内实际为准。
