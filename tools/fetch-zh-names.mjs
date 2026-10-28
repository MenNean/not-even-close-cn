#!/usr/bin/env node
/**
 * fetch-zh-names.mjs —— 从 wago.tools 抓官方简体中文名。
 *
 * 1) SpellName 表：按法术 ID 逐个查技能中文名
 * 2) JournalInstance 表：翻页取全部副本，英文名对齐后取中文名
 *
 * 用法：node tools/fetch-zh-names.mjs
 * 产物：
 *   data/zh-names.json      { "<spellId>": "官方中文名" }
 *   data/zh-names.js        window.NEC_ZH_NAMES = { ... }
 *   data/zh-dungeons.json   { "English Name": "中文名" }
 */
import fs from 'node:fs';

const SPELL_BASE = 'https://wago.tools/db2/SpellName?locale=zhCN&filter%5BID%5D=';
const JOURNAL = 'https://wago.tools/db2/JournalInstance';
const CONCURRENCY = 6;

const DUNGEON_NAMES = [
  'Murder Row', 'Den of Nalorakk', 'The Blinding Vale', 'Voidscar Arena',
  'Altar of Fangs', 'Ruby Life Pools', 'Temple of Sethraliss', "Kings' Rest"
];

function loadBrowserJson(file, globalName) {
  const src = fs.readFileSync(file, 'utf8');
  const wrap = {};
  new Function('window', src)(wrap);
  return wrap[globalName];
}

function pageProps(html) {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return null;
  const raw = m[1]
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return JSON.parse(raw).props;
}

function collectIds() {
  const ids = new Set();
  const data = loadBrowserJson('data/data.js', 'NEC_DATA');
  data.dungeons.forEach((d) => d.abilities.forEach((a) => ids.add(a.id)));

  if (fs.existsSync('data/classes.js')) {
    const classes = loadBrowserJson('data/classes.js', 'NEC_CLASSES');
    const all = [
      ...classes.classes.flatMap((c) => c.specs.flatMap((s) => s.abilities)),
      ...classes.group.externals, ...classes.group.buffs, ...classes.group.actives
    ];
    all.forEach((a) => ids.add(a.spellId || a.id));
  }
  return [...ids].filter((id) => Number.isFinite(id));
}

async function fetchSpellName(id) {
  const res = await fetch(SPELL_BASE + id, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const props = pageProps(await res.text());
  const rows = (props && props.data.data) || [];
  const hit = rows.find((r) => Number(r.ID) === Number(id));
  return hit ? hit.Name_lang : null;
}

async function fetchJournal(locale) {
  const rows = [];
  let page = 1;
  let last = 1;
  do {
    const url = `${JOURNAL}?locale=${locale}${page > 1 ? '&page=' + page : ''}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const props = pageProps(await res.text());
    rows.push(...props.data.data);
    last = props.data.last_page;
    page++;
  } while (page <= last);
  return rows;
}

async function main() {
  // --- 技能名 ---
  const ids = collectIds();
  console.log(`待查 ${ids.length} 个法术 ID`);

  const names = {};
  const failed = [];
  let done = 0;
  const queue = [...ids];

  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      try {
        const name = await fetchSpellName(id);
        if (name) names[id] = name; else failed.push(id);
      } catch {
        try {
          await new Promise((r) => setTimeout(r, 700));
          const name = await fetchSpellName(id);
          if (name) names[id] = name; else failed.push(id);
        } catch { failed.push(id); }
      }
      done++;
      if (done % 100 === 0) console.log(`  ${done}/${ids.length} …`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  fs.writeFileSync('data/zh-names.json', JSON.stringify(names, null, 2), 'utf8');
  fs.writeFileSync(
    'data/zh-names.js',
    '/* 由 tools/fetch-zh-names.mjs 生成：官方简体中文技能名（wago.tools SpellName zhCN） */\n' +
      'window.NEC_ZH_NAMES = ' + JSON.stringify(names) + ';\n',
    'utf8'
  );
  console.log(`✅ 技能中文名 ${Object.keys(names).length} 条`);
  if (failed.length) console.log(`   ⚠️ ${failed.length} 条没查到：${failed.slice(0, 8).join(', ')}…`);

  // --- 副本名 ---
  console.log('抓副本名（JournalInstance，翻页）…');
  const [zhRows, enRows] = await Promise.all([fetchJournal('zhCN'), fetchJournal('enUS')]);
  const zhById = new Map(zhRows.map((r) => [r.ID, r.Name_lang]));
  const dungeons = {};
  for (const want of DUNGEON_NAMES) {
    const hit = enRows.find((r) => r.Name_lang === want);
    if (hit && zhById.get(hit.ID)) dungeons[want] = zhById.get(hit.ID);
  }
  fs.writeFileSync('data/zh-dungeons.json', JSON.stringify(dungeons, null, 2), 'utf8');
  console.log(`✅ 副本中文名 ${Object.keys(dungeons).length}/${DUNGEON_NAMES.length} 条`);
  for (const [k, v] of Object.entries(dungeons)) console.log('   ' + k + ' → ' + v);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
