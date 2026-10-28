#!/usr/bin/env node
/**
 * build-classes.mjs —— 从源码 TS 里抽出「职业/专精减伤 + 团队增益」数据。
 *
 * 做法：用 TypeScript 编译器把 .ts 转成 CommonJS，再用自带的 require 垫片求值，
 * 拿到 classSpecs / externals / groupBuffs / groupActives 的原始对象。
 *
 * 用法：node tools/build-classes.mjs
 * 产物：data/classes.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tsModule = require('typescript');
const ts = tsModule.default || tsModule;

const SRC = 'data/source/src/backend';
const OUT = 'data/classes.js';

const moduleCache = new Map();

function resolveTs(spec, fromFile) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function load(file) {
  const abs = path.resolve(file);
  if (moduleCache.has(abs)) return moduleCache.get(abs).exports;

  const src = fs.readFileSync(abs, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: abs
  }).outputText;

  const mod = { exports: {} };
  moduleCache.set(abs, mod);

  const localRequire = (spec) => {
    const target = resolveTs(spec, abs);
    if (!target) return {}; // ../ability 之类只有类型，运行时不需要
    return load(target);
  };

  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', js);
  fn(mod.exports, localRequire, mod, abs, path.dirname(abs));
  return mod.exports;
}

function pickAbility(a) {
  return {
    id: a.id,
    spellId: a.spellId ?? null,
    name: a.name,
    icon: a.icon || null,
    passive: !!a.passive,
    onByDefault: !!a.onByDefault,
    heroTree: a.heroTree || null,
    notes: a.notes || null,
    dr: a.dr ?? null,
    drType: a.drType || null,
    aoeDr: a.aoeDr ?? null,
    damageDealtReduction: a.damageDealtReduction ?? null,
    staminaIncrease: a.staminaIncrease ?? null,
    versIncrease: a.versIncrease ?? null,
    healthIncrease: a.healthIncrease ?? null,
    armorIncrease: a.armorIncrease ?? null,
    absorb: a.absorb || null,
    stacks: a.stacks || null
  };
}

function main() {
  // 先加载团队增益，druid.ts 会引用 markOfTheWild
  load(path.join(SRC, 'groupAbilities/groupBuffs.ts'));
  const externals = load(path.join(SRC, 'groupAbilities/externals.ts'));
  const groupBuffs = load(path.join(SRC, 'groupAbilities/groupBuffs.ts'));
  const groupActives = load(path.join(SRC, 'groupAbilities/groupActives.ts'));
  const classes = load(path.join(SRC, 'classes.ts'));

  const { classSpecs, classColors } = classes;
  const out = { classes: [], group: {} };

  for (const [className, specs] of Object.entries(classSpecs)) {
    const specList = [];
    for (const [specName, details] of Object.entries(specs)) {
      specList.push({
        spec: specName,
        displayName: details.displayName || specName,
        icon: details.icon || null,
        mainStat: details.mainStat || 'other',
        isTank: !!details.isTank,
        abilities: (details.abilities || []).map(pickAbility)
      });
    }
    out.classes.push({
      name: className,
      color: classColors?.[className] || '#cccccc',
      specs: specList
    });
  }

  out.group = {
    externals: (externals.externals || []).map(pickAbility),
    buffs: (groupBuffs.groupBuffs || []).map(pickAbility),
    actives: (groupActives.groupActives || []).map(pickAbility)
  };

  const all = [
    ...out.classes.flatMap((c) => c.specs.flatMap((s) => s.abilities)),
    ...out.group.externals,
    ...out.group.buffs,
    ...out.group.actives
  ];

  fs.writeFileSync(
    OUT,
    '/* 由 tools/build-classes.mjs 生成，请勿手改 */\n' +
      'window.NEC_CLASSES = ' + JSON.stringify(out, null, 2) + ';\n',
    'utf8'
  );

  const ids = new Set(all.map((a) => a.id));
  console.log(`✅ ${OUT}`);
  console.log(`   职业 ${out.classes.length} 个 · 专精 ${out.classes.reduce((n, c) => n + c.specs.length, 0)} 个`);
  console.log(`   职业技能 ${out.classes.reduce((n, c) => n + c.specs.reduce((m, s) => m + s.abilities.length, 0), 0)} 条`);
  console.log(`   团队：外部 ${out.group.externals.length} · 光环 ${out.group.buffs.length} · 主动 ${out.group.actives.length}`);
  console.log(`   唯一技能 ID ${ids.size} 个`);
}

main();
