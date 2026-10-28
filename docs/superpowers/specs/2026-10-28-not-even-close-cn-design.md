# 大米致死计算器（Not Even Close 中文版）设计稿

- 日期：2026-10-28
- 状态：已确认，进入实现
- 范围：标准版，仅当前最新赛季

## 1. 目标

复刻 not-even-close.com 的核心能力：输入「副本 + 钥匙层数 + 我的血量」，判断每个怪物技能
打在自己身上会不会致死；并补齐中文技能名、分系减伤模拟、强韧词缀、结果分享。

## 2. 非目标（本期不做）

- 多赛季历史数据切换
- 账号体系、收藏、在线数据编辑后台
- 精确到每一条职业天赋的减伤模拟（只做通用减伤 + 自定义减伤条目）

## 3. 关键设计：伤害类型（法术系别）

伤害类型是一等公民，按暴雪 8 系建模：

| school | 中文 | 吃哪些减伤 |
|---|---|---|
| physical | 物理 | 护甲减免 |
| holy | 神圣 | 魔法减伤 × 分系抗性 |
| fire | 火焰 | 魔法减伤 × 分系抗性 |
| nature | 自然 | 魔法减伤 × 分系抗性 |
| frost | 冰霜 | 魔法减伤 × 分系抗性 |
| shadow | 暗影 | 魔法减伤 × 分系抗性 |
| arcane | 奥术 | 魔法减伤 × 分系抗性 |
| chaos | 混乱 | 仅通用魔法减伤（不吃分系抗性/免疫） |
| unknown | 未知 | 按魔法减伤处理，UI 标注待校对 |

减伤按乘法复合：`实际 = 原始 × (1-护甲或魔减) × (1-分系) × Π(1-主动减伤)`。
分系易伤为负减伤，同样进入乘法链（即 `1 - (-30%)`）。

数据侧：抓取结果里 `school` 缺失或只有二元（物理/魔法）时，先用技能名/ID 启发式推断，
推断不出的置 `unknown`，由 `zh-map.json` 的 `schoolOverride` 人工修正。

## 4. 数据结构

`data/data.js` 定义 `window.NEC_DATA`：

```js
{
  meta: { season, source, scrapedAt, keyMin, keyMax, fortifiedMultiplier, demo },
  dungeons: [{
    id, nameZh, nameEn,
    mobs: [{
      nameZh, nameEn, isBoss,
      abilities: [{
        id, nameZh, nameEn,
        school, castTime, targets, isBoss,
        damage: { "2": 120000, "10": 480000 },  // 稀疏，缺层取最近层
        note
      }]
    }]
  }]
}
```

中文映射单独放 `data/zh-map.json`，构建时合并，便于人工校对与增量维护。

## 5. 计算与判定

- `damageAtKey(k)`：取 `damage[k]`；缺省时取不超过 k 的最近层，再缺则取最小层
- 强韧周：非首领且开启强韧时，原始伤害 × `fortifiedMultiplier`（默认 1.2）
- `pct = 承伤 / 血量 × 100`
- 判定：`≥100%` 必死；`≥70%` 危险；其余安全
- 血量 ≤ 0 或伤害缺失时不参与排序，单独提示

## 6. 页面结构

1. 顶栏：品牌、赛季标签、数据状态（示例数据 / 已接入）
2. 查询区：副本、层数滑杆、血量、强韧开关
3. 高级面板（可折叠）：护甲减免、魔法减伤、8 系抗性/易伤、自定义减伤条目
4. 结果区：汇总计数、排序、搜索、系别筛选、结果行（技能中英文、来源怪、伤害、占比条、判定）
5. 结果行可展开明细（施法时间、目标、减伤链）
6. 底部：数据来源、中文名待校对条目数、免责声明
7. 状态写入 URL hash，可直接分享

## 7. 数据管线

1. 用户在原站导出 HAR（F12 → Network → Save all as HAR with content）
2. `tools/parse-har.mjs`：抽取 JSON 响应 → `data/raw/`
3. 人工/半自动补 `data/zh-map.json`（中文名、系别修正）
4. `tools/build-data.mjs`：合并 → `data/data.js`
5. 兜底：`tools/recon.mjs`（Playwright）遍历副本 × 层数扫表格

## 8. 交付物

见仓库根 `README.md`。

## 9. 验收标准

1. 双击 `index.html` 可离线打开并出结果
2. 示例数据下切换副本/层数/血量，占比与判定即时更新
3. 系别筛选、强韧开关、自定义减伤均影响结果
4. 分享链接打开后状态还原
5. 真实数据接入后，抽查 5 条与原站同层数值一致

## 10. 实现变更（2026-10-28 落地后追记）

设计阶段打算走「HAR 抓取 + 中文映射」的两段式，实际落地时找到原站开源仓库
[`acornellier/not_even_close`](https://github.com/acornellier/not_even_close)，
改为直接镜像源码数据，管线更短、数值更可信：

| 设计稿 | 实际实现 | 原因 |
|---|---|---|
| HAR 抓包 | `tools/fetch-source.mjs` 镜像 GitHub 源码（jsDelivr） | 数据本来就在仓库里，HAR 抓的是打包后的 JS |
| 手填血量 | 耐力 / 全能 / 闪避 / 护甲 四项，血量 = 耐力 × 20 | 原站就是这套输入，且公式在 `stats.ts` 里可查 |
| 每层 damage 表 | 基础伤害 + 缩放公式（`sim.ts`） | 源码只存基础值，缩放是纯函数 |
| 分系抗性输入 | 移除输入；系别保留为展示、筛选与护甲/AoE 判定依据 | 游戏内没有分系抗性，原站模型只有物理/魔法分支 |

数值校验：Kings' Rest · Serpentine Gust · +21 · 耐力 45859 · 护甲 2409 · 自定义减伤 5%+3%
→ 剩余 `-1,022,834 (-111.52%)`，与线上原站截图完全一致。

## 11. 第二轮迭代（同日）

1. **职业与团队减伤**：`tools/build-classes.mjs` 用 TypeScript 编译器把
   `classAbilities/*.ts`、`groupAbilities/*.ts`、`classes.ts` 转成 CJS 后求值，
   产出 13 职业 / 39 专精 / 390 条技能（含 `dr`、`aoeDr`、`damageDealtReduction`、
   `staminaIncrease`、`versIncrease`、`healthIncrease`、`armorIncrease`、`absorb`、`onByDefault`）。
   引擎按 `dr.ts` 的顺序复刻：降低伤害 → 全能/2 → 闪避(AoE) → 护甲(物理) → 职业减伤 → 自定义减伤。
2. **官方中文名**：`tools/fetch-zh-names.mjs` 从 wago.tools 的 `SpellName`（zhCN）按法术 ID 逐个查，
   拿到 394 条官方译名；`JournalInstance` 翻页对齐英文名拿到 8 个副本官方译名
   （Murder Row=密谋小径、The Blinding Vale=夺目谷、Altar of Fangs=毒牙祭坛 等）。
   人工译名降级为兜底。
3. 已知未实现：吸收类护盾（界面标注「仅吸收 · 未计入」）。

## 12. 风险

- 原站数据可能加密或按需计算 → Playwright 兜底
- 中文名依赖人工校对，首发必然有「待校对」条目
- 数值为暴雪游戏数据，定位 fan-made 非商用工具并标注来源
