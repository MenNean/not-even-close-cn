import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const E = require('../assets/engine.js');

// 载入真实数据
globalThis.window = globalThis;
window.NEC_DATA = null;
const src = fs.readFileSync('data/data.js', 'utf8');
new Function('window', src)(window);
const DATA = window.NEC_DATA;
const meta = DATA.meta;

const kr = DATA.dungeons.find((d) => d.key === 'kr');
const serpentine = kr.abilities.find((a) => a.nameEn === 'Serpentine Gust');

let pass = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const base = {
  key: 21, isTyran: false, stamina: 45859,
  versRaw: 0, avoidanceRaw: 0, armor: 2409,
  customDrs: [], meta
};

console.log('\n与原站对账（Kings\' Rest · 蛇形疾风 · +21）');
check('该层伤害 = 2,105,278（原站显示 2.11M）', () => {
  assert.equal(E.scaledDamage(serpentine, 21, false).damage, 2105278);
});
check('血量 = 耐力 45859 × 20 = 917,180', () => {
  assert.equal(E.healthFromStamina(45859, meta), 917180);
});
check('5% + 3% 减伤后剩余 -1,022,834（原站 -111.52%）', () => {
  const r = E.compute(serpentine, {
    ...base,
    customDrs: [
      { name: '老兵', pct: 5, type: 'all', active: true },
      { name: 'X', pct: 3, type: 'all', active: true }
    ]
  });
  assert.equal(r.remaining, -1022834);
  assert.equal(r.remainingPct.toFixed(2), '-111.52');
});

console.log('\n缩放');
check('+2 层 = 1.07（源码从 2 开始累乘）', () => assert.equal(E.scalingFactor(2, false, false), 1.07));
check('+10 层 = 1.07^9，双词缀生效', () => {
  assert.equal(E.scalingFactor(10, false, false), Math.round(Math.pow(1.07, 9) * 1.15 * 100) / 100);
});
check('强韧对小怪 ×1.2、暴君对首领 ×1.15', () => {
  const k = 4;
  const trash = E.scalingFactor(k, true, false);
  const boss = E.scalingFactor(k, false, false);
  assert.ok(trash > boss, '低层强韧应高于首领');
});

console.log('\n减伤链');
check('护甲只吃物理', () => {
  const phys = E.compute({ ...serpentine, physical: true, schools: ['physical'] }, base);
  const magic = E.compute(serpentine, base);
  assert.ok(phys.taken < magic.taken);
});
check('闪避只吃 AoE', () => {
  const withAvoid = E.compute(serpentine, { ...base, avoidanceRaw: 2000 });
  const single = E.compute({ ...serpentine, aoe: false }, { ...base, avoidanceRaw: 2000 });
  assert.ok(withAvoid.taken < E.compute(serpentine, base).taken, 'AoE 应被闪避降低');
  assert.equal(single.taken, E.compute({ ...serpentine, aoe: false }, base).taken, '单体不受闪避影响');
});
check('ignoresArmor 时护甲失效', () => {
  const a = E.compute({ ...serpentine, physical: true, ignoresArmor: true }, base);
  const b = E.compute({ ...serpentine, physical: true, ignoresArmor: false }, base);
  assert.ok(a.taken > b.taken);
});
check('仅魔法的减伤不作用于物理技能', () => {
  const phys = { ...serpentine, physical: true, schools: ['physical'] };
  const withMagicDr = E.compute(phys, { ...base, customDrs: [{ name: '魔抗', pct: 50, type: 'magic', active: true }] });
  assert.equal(withMagicDr.taken, E.compute(phys, base).taken);
});

console.log('\n职业减伤');
const arms = (() => {
  const src = fs.readFileSync('data/classes.js', 'utf8');
  const w = {};
  new Function('window', src)(w);
  return w.NEC_CLASSES.classes.find((c) => c.name === 'Warrior').specs.find((s) => s.spec === 'Arms').abilities;
})();
const seasoned = arms.find((a) => a.name === 'Seasoned Soldier');
const mountain = arms.find((a) => a.name === 'Mountain of Muscle and Scars');
const colossus = arms.find((a) => a.name === 'Dominance of the Colossus');

check('老兵只减 AoE，单体不受影响', () => {
  const aoe = E.compute(serpentine, { ...base, classAbilities: [seasoned] });
  const single = E.compute({ ...serpentine, aoe: false }, { ...base, classAbilities: [seasoned] });
  assert.ok(aoe.taken < E.compute(serpentine, base).taken);
  assert.equal(single.taken, E.compute({ ...serpentine, aoe: false }, base).taken);
});
check('两条 5% 按乘法叠加', () => {
  const r = E.compute(serpentine, { ...base, classAbilities: [seasoned, mountain] });
  assert.equal(r.drPct.toFixed(2), ((1 - 0.95 * 0.95) * 100).toFixed(2));
});
check('damageDealtReduction 在减伤前结算', () => {
  const r = E.compute(serpentine, { ...base, classAbilities: [colossus] });
  assert.equal(r.reducedDamage, Math.round(2105278 * 0.8));
});

console.log('\n判定');
check('超过血量判必死', () => {
  const r = E.compute(serpentine, base);
  assert.equal(r.verdict, 'lethal');
  assert.ok(r.pct > 100);
});
check('低于 70% 判安全', () => {
  const r = E.compute(serpentine, { ...base, stamina: 45859 * 4 });
  assert.equal(r.verdict, 'safe');
});

console.log('\n系别');
check('多系算混乱', () => {
  assert.equal(E.schoolLabel(['fire', 'nature', 'frost', 'shadow', 'arcane']).key, 'chaos');
  assert.equal(E.schoolLabel(['nature']).zh, '自然');
});

console.log(`\n通过 ${pass} 项\n`);
