#!/usr/bin/env node
/**
 * build-data.mjs —— 把镜像下来的 not-even-close 源码数据，合成站点用的 data/data.js
 *
 * 数据源：data/source/src/backend/enemyAbilities/midnight_s2/*.json
 *         （由 tools/fetch-source.mjs 从 GitHub 镜像拉取）
 * 中文名：data/zh-map.json
 *
 * 用法：node tools/build-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = 'data/source/src/backend/enemyAbilities/midnight_s2';
const ZH_FILE = 'data/zh-map.json';
const OUT_FILE = 'data/data.js';

// 顺序与源码 dungeons.ts 一致
const DUNGEONS = [
  ['murd', 'Murder Row', 'inv_achievement_dungeon_murderrow'],
  ['nalo', 'Den of Nalorakk', 'inv_achievement_dungeon_proveyourworth'],
  ['vale', 'The Blinding Vale', 'inv_achievement_dungeon_lightbloom'],
  ['void', 'Voidscar Arena', 'inv_achievement_dungeon_voidscararena'],
  ['fang', 'Altar of Fangs', 'inv_achievement_dungeon_altaroffangs'],
  ['rlp', 'Ruby Life Pools', 'achievement_dungeon_lifepools'],
  ['tos', 'Temple of Sethraliss', 'achievement_dungeon_templeofsethraliss'],
  ['kr', "Kings' Rest", 'achievement_dungeon_kingsrest']
];

// 与源码 stats.ts 保持一致
const HEALTH_PER_STAMINA = 20;
const VERS_CONVERSION = 54;
const AVOIDANCE_CONVERSION = 36.80052531;
const ARMOR_K = 4464;

const SECONDARY = [
  { size: 30, penalty: 0 },
  { size: 9, penalty: 0.1 },
  { size: 8, penalty: 0.2 },
  { size: 7, penalty: 0.3 },
  { size: 12, penalty: 0.4 },
  { size: 60, penalty: 0.5 },
  { size: 60, penalty: 1.0 },
  { size: 100000, penalty: 1.0 }
];

const TERTIARY = [
  { size: 10, penalty: 0 },
  { size: 4, penalty: 0.2 },
  { size: 3, penalty: 0.4 },
  { size: 2, penalty: 0.6 },
  { size: 100000, penalty: 0.6 }
];

/** 复刻 stats.ts 的 makeStatBrackets + rawToPercent 所需的断点表 */
function makeBrackets(conversionFactor, basic) {
  let prev = { percent: 0 };
  return basic.map((bracket) => {
    prev = {
      penalty: bracket.penalty,
      percent: prev.percent + bracket.size,
      rawValue: bracket.size * conversionFactor * (1 / (1 - bracket.penalty))
    };
    return prev;
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function main() {
  const zh = readJson(ZH_FILE);
  const zhDungeons = zh.dungeons || {};
  const zhAbilities = zh.abilities || {};
  const officialDungeons = fs.existsSync('data/zh-dungeons.json') ? readJson('data/zh-dungeons.json') : {};
  const officialNames = fs.existsSync('data/zh-names.json') ? readJson('data/zh-names.json') : {};

  let gameVersion = null;
  let total = 0;
  let missingZh = 0;
  const seen = new Set();

  const dungeons = DUNGEONS.map(([key, nameEn]) => {
    const file = path.join(SRC_DIR, `${key}.json`);
    if (!fs.existsSync(file)) {
      console.error(`缺少数据文件：${file}（先跑 node tools/fetch-source.mjs）`);
      process.exit(1);
    }
    const raw = readJson(file);
    gameVersion = gameVersion || raw.grimoire;

    const abilities = raw.abilities.map((a) => {
      const zhAbility = zhAbilities[a.name] || {};
      // 优先官方中文名（wago.tools SpellName zhCN），退回人工翻译
      const nameZh = officialNames[a.id] || zhAbility.nameZh || '';
      if (!nameZh && !seen.has(a.name)) {
        seen.add(a.name);
        missingZh++;
        console.warn(`  ⚠️ 缺中文名：${a.name}`);
      }
      total++;
      return {
        id: a.id,
        nameEn: a.name,
        nameZh,
        nameOfficial: !!officialNames[a.id],
        damage: a.damage,
        variance: a.variance || 0,
        physical: !!a.physical,
        aoe: !!a.aoe,
        schools: a.schools || [],
        trash: !!a.trashAbility,
        tankOnly: !!a.tankOnly,
        avoidable: !!a.avoidable,
        ignoresArmor: !!a.ignoresArmor,
        periodicDamage: a.periodicDamage || 0,
        ticks: a.ticks || 0,
        notes: a.notes || ''
      };
    });

    const zd = zhDungeons[nameEn] || {};
    return {
      key,
      nameEn,
      nameZh: officialDungeons[nameEn] || zd.nameZh || '',
      verified: !!officialDungeons[nameEn] || zd.verified === true,
      abilities
    };
  });

  // 「全部副本」聚合，方便跨本搜技能
  dungeons.push({
    key: 'all',
    nameEn: 'All dungeons',
    nameZh: '全部副本',
    verified: true,
    abilities: dungeons.flatMap((d) => d.abilities)
  });

  const data = {
    meta: {
      season: 'Midnight 第 2 赛季',
      gameVersion,
      source: 'github.com/acornellier/not_even_close · midnight_s2',
      builtAt: new Date().toISOString().slice(0, 10),
      healthPerStamina: HEALTH_PER_STAMINA,
      armorK: ARMOR_K,
      versaConversion: VERS_CONVERSION,
      avoidanceConversion: AVOIDANCE_CONVERSION,
      versaBrackets: makeBrackets(VERS_CONVERSION, SECONDARY),
      avoidanceBrackets: makeBrackets(AVOIDANCE_CONVERSION, TERTIARY),
      demo: false
    },
    dungeons
  };

  fs.writeFileSync(
    OUT_FILE,
    '/* 由 tools/build-data.mjs 生成，请勿手改。数据来自 not-even-close 源码镜像 + data/zh-map.json */\n' +
      'window.NEC_DATA = ' + JSON.stringify(data, null, 2) + ';\n',
    'utf8'
  );

  console.log(`\n✅ ${OUT_FILE}`);
  console.log(`   赛季 ${data.meta.season} · 数据版本 ${gameVersion}`);
  console.log(`   副本 ${dungeons.length - 1} 个 · 技能 ${total} 条 · 去重后 ${total - (dungeons[dungeons.length - 1].abilities.length - total)}`);
  if (missingZh) console.log(`   ⚠️ ${missingZh} 条技能缺中文名（会回落英文显示）`);
}

main();
