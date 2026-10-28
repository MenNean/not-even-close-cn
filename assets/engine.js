/**
 * 大米致死计算器 · 计算内核
 * 公式与 not-even-close 源码逐条对齐（stats.ts / sim.ts / dr.ts）：
 *   - 钥匙缩放：∏(k=2..层数) (k>=11 ? 1.1 : 1.07)，再乘强韧 1.2 / 暴君 1.15
 *   - 血量 = ⌊耐力×(1+耐力增益)⌋ × 20 × (1+生命增益)
 *   - 减伤链：全能/2 ×（AoE 时）闪避 ×（物理且不免甲时）护甲 × 各职业减伤 × 自定义减伤
 *   - 减伤前先结算 damageDealtReduction（如「巨像统御」）
 * 纯函数，可在 Node 中直接测试。
 */
(function (global) {
  'use strict';

  var SCHOOLS = {
    physical: { zh: '物理', color: '#9aa6b8' },
    holy: { zh: '神圣', color: '#f2d479' },
    fire: { zh: '火焰', color: '#ff7043' },
    nature: { zh: '自然', color: '#62c96a' },
    frost: { zh: '冰霜', color: '#63c6f2' },
    shadow: { zh: '暗影', color: '#a97cf8' },
    arcane: { zh: '奥术', color: '#ee86d8' },
    chaos: { zh: '混乱', color: '#ff5f7e' }
  };

  var SCHOOL_ORDER = ['physical', 'holy', 'fire', 'nature', 'frost', 'shadow', 'arcane', 'chaos'];

  var VERDICTS = {
    lethal: { zh: '必死', order: 0 },
    danger: { zh: '危险', order: 1 },
    safe: { zh: '安全', order: 2 },
    unknown: { zh: '无数据', order: 3 }
  };

  var DEFAULTS = {
    healthPerStamina: 20,
    armorK: 4464,
    versaConversion: 54,
    avoidanceConversion: 36.8,
    versaBrackets: [],
    avoidanceBrackets: []
  };

  /* ---------------- 属性换算 ---------------- */

  function rawToPercent(rawStat, conversionFactor, brackets) {
    var percent = 0;
    var remaining = Number(rawStat) || 0;
    if (!conversionFactor || !brackets || !brackets.length) {
      return Math.max(0, remaining / (conversionFactor || 1));
    }
    for (var i = 0; i < brackets.length; i++) {
      var b = brackets[i];
      if (remaining > b.rawValue) {
        remaining -= b.rawValue;
        percent = b.percent;
      } else {
        percent += (remaining / conversionFactor) * (1 - b.penalty);
        break;
      }
    }
    return Math.max(0, Math.round(percent * 100) / 100);
  }

  function versaPercent(rawVers, meta) {
    var m = meta || DEFAULTS;
    return rawToPercent(rawVers, m.versaConversion, m.versaBrackets);
  }

  function avoidancePercent(rawAvoid, meta) {
    var m = meta || DEFAULTS;
    return rawToPercent(rawAvoid, m.avoidanceConversion, m.avoidanceBrackets);
  }

  function healthFromStamina(stamina, meta) {
    var m = meta || DEFAULTS;
    return Math.floor(Number(stamina) || 0) * (m.healthPerStamina || 20);
  }

  function armorDr(armor, meta) {
    var m = meta || DEFAULTS;
    var a = Math.max(0, Number(armor) || 0);
    return a / (a + (m.armorK || 4464));
  }

  /* ---------------- 钥匙缩放 ---------------- */

  function scalingFactor(keyLevel, isTrash, isTyran) {
    var factor = 1;
    for (var k = 2; k <= keyLevel; k++) {
      factor *= k >= 11 ? 1.1 : 1.07;
    }
    var bothActive = keyLevel >= 10;
    var fortActive = !isTyran || bothActive;
    var tyranActive = isTyran || bothActive;

    if (fortActive && isTrash) {
      factor *= 1.2;
    } else if (tyranActive && !isTrash) {
      factor *= 1.15;
    }
    return Math.round(factor * 100) / 100;
  }

  function scaledDamage(ability, keyLevel, isTyran) {
    var variance = Number(ability.variance) || 0;
    var withVariance = Math.round(ability.damage * (1 + variance));
    var factor = scalingFactor(keyLevel, !!ability.trash, !!isTyran);
    return { factor: factor, damage: Math.round(withVariance * factor) };
  }

  /* ---------------- 承伤计算 ---------------- */

  /**
   * @param {object} ability 敌人技能
   * @param {object} state { key, isTyran, stamina, versRaw, avoidanceRaw, armor,
   *                        classAbilities:[], customDrs:[], meta }
   */
  function compute(ability, state) {
    var meta = state.meta || DEFAULTS;
    var scaled = scaledDamage(ability, Number(state.key), !!state.isTyran);
    var isPhysical = !!ability.physical;
    var isAoe = !!ability.aoe;

    // ---- 汇总职业/团队增益（对应 sim.ts getAdjustedStats / getStartingHealth） ----
    var staminaMul = 1;
    var armorMul = 1;
    var healthMul = 1;
    var extraVersPct = 0;
    var ddrInv = 1;
    var classDrs = [];
    var applied = [];

    (state.classAbilities || []).forEach(function (ab) {
      if (!ab) return;

      if (ab.staminaIncrease) {
        staminaMul *= 1 + ab.staminaIncrease;
        applied.push({ name: ab.name, kind: '耐力', value: ab.staminaIncrease, type: ab.drType });
      }
      if (ab.armorIncrease) {
        armorMul *= 1 + ab.armorIncrease;
        applied.push({ name: ab.name, kind: '护甲', value: ab.armorIncrease, type: ab.drType });
      }
      if (ab.healthIncrease) {
        healthMul *= 1 + ab.healthIncrease;
        applied.push({ name: ab.name, kind: '生命', value: ab.healthIncrease, type: ab.drType });
      }
      if (ab.versIncrease) {
        extraVersPct += ab.versIncrease * 100;
      }
      if (ab.damageDealtReduction) {
        if (!(ab.drType === 'magic' && isPhysical) && !(ab.drType === 'physical' && !isPhysical)) {
          ddrInv *= 1 - ab.damageDealtReduction;
          applied.push({ name: ab.name, kind: '降低伤害', value: ab.damageDealtReduction, type: ab.drType });
        }
      }
      if (ab.dr || ab.aoeDr) {
        classDrs.push(ab);
      }
    });

    var stamina = Math.floor((Number(state.stamina) || 0) * staminaMul);
    var health = Math.round(healthFromStamina(stamina, meta) * healthMul);
    var versPct = versaPercent(state.versRaw, meta) + extraVersPct;
    var avoidPct = avoidancePercent(state.avoidanceRaw, meta);
    var armor = (Number(state.armor) || 0) * armorMul;

    // ---- 降低伤害（dr.ts 之前先乘） ----
    var reducedDamage = Math.round(scaled.damage * ddrInv);

    // ---- 减伤链 ----
    var inverseDr = 1 - versPct / 2 / 100;
    var drParts = [{ kind: '全能', pct: versPct / 2 }];

    if (isAoe) {
      inverseDr *= 1 - avoidPct / 100;
      if (avoidPct) drParts.push({ kind: '闪避', pct: avoidPct });
    }
    if (isPhysical && !ability.ignoresArmor) {
      var ar = armorDr(armor, meta);
      inverseDr *= 1 - ar;
      drParts.push({ kind: '护甲', pct: ar * 100 });
    }

    classDrs.forEach(function (ab) {
      var dr = ab.dr || 0;
      var aoeDr = (ab.aoeDr || 0) * (ab.stacks ? (ab.stackCount || 1) : 1);

      // drType 过滤与源码一致
      if (ab.drType === 'magic' && isPhysical) dr = 0;
      if (ab.drType === 'physical' && !isPhysical) dr = 0;

      var eff = 0;
      if (dr && aoeDr && isAoe) eff = Math.max(dr, aoeDr);
      else if (dr) eff = dr;
      else if (aoeDr && isAoe) eff = aoeDr;

      if (!eff) return;
      inverseDr *= 1 - eff;
      drParts.push({ kind: ab.name, pct: eff * 100 });
    });

    (state.customDrs || []).forEach(function (c) {
      if (!c || !c.active) return;
      if (c.type === 'magic' && isPhysical) return;
      if (c.type === 'physical' && !isPhysical) return;
      var pct = Math.max(0, Math.min(100, Number(c.pct) || 0)) / 100;
      inverseDr *= 1 - pct;
      drParts.push({ kind: c.name, pct: pct * 100 });
    });

    var dr = 1 - inverseDr;
    var mitigated = Math.round(reducedDamage * dr);
    var taken = Math.round(reducedDamage - mitigated);
    var pct = health > 0 ? (taken / health) * 100 : null;

    return {
      schools: ability.schools || [],
      physical: isPhysical,
      aoe: isAoe,
      scaling: scaled.factor,
      scaled: scaled.damage,
      reducedDamage: reducedDamage,
      dr: dr,
      drPct: dr * 100,
      drParts: drParts,
      taken: taken,
      health: health,
      remaining: health - taken,
      remainingPct: health > 0 ? ((health - taken) / health) * 100 : null,
      pct: pct,
      verdict: verdictFor(pct),
      versPct: versPct,
      avoidPct: avoidPct,
      armorPct: (isPhysical && !ability.ignoresArmor) ? armorDr(armor, meta) * 100 : 0,
      applied: applied
    };
  }

  function verdictFor(pct) {
    if (pct == null || !isFinite(pct)) return 'unknown';
    if (pct >= 100) return 'lethal';
    if (pct >= 70) return 'danger';
    return 'safe';
  }

  /* ---------------- 系别展示 ---------------- */

  function schoolLabel(schools) {
    if (!schools || !schools.length) return { key: 'chaos', zh: '混乱' };
    if (schools.length > 1) return { key: 'chaos', zh: '混乱', multi: true };
    return SCHOOLS[schools[0]]
      ? { key: schools[0], zh: SCHOOLS[schools[0]].zh }
      : { key: 'chaos', zh: '混乱' };
  }

  /* ---------------- 格式化 ---------------- */

  function formatNumber(n) {
    if (n == null || !isFinite(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  }

  function formatWan(n) {
    if (n == null || !isFinite(n)) return '—';
    var wan = n / 10000;
    if (Math.abs(wan) >= 10000) return (wan / 10000).toFixed(2) + ' 亿';
    if (Math.abs(wan) >= 100) return Math.round(wan).toLocaleString('en-US') + ' 万';
    return wan.toFixed(1) + ' 万';
  }

  function formatPct(pct) {
    if (pct == null || !isFinite(pct)) return '—';
    if (pct >= 999.5) return '999%+';
    return Math.round(pct) + '%';
  }

  var api = {
    SCHOOLS: SCHOOLS,
    SCHOOL_ORDER: SCHOOL_ORDER,
    VERDICTS: VERDICTS,
    DEFAULTS: DEFAULTS,
    rawToPercent: rawToPercent,
    versaPercent: versaPercent,
    avoidancePercent: avoidancePercent,
    healthFromStamina: healthFromStamina,
    armorDr: armorDr,
    scalingFactor: scalingFactor,
    scaledDamage: scaledDamage,
    compute: compute,
    verdictFor: verdictFor,
    schoolLabel: schoolLabel,
    formatNumber: formatNumber,
    formatWan: formatWan,
    formatPct: formatPct
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.NECEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
