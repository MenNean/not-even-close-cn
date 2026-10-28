/**
 * 大米致死计算器 · 界面逻辑
 */
(function () {
  'use strict';

  var E = window.NECEngine;
  var SCHOOLS = E.SCHOOLS;
  var SCHOOL_ORDER = E.SCHOOL_ORDER;
  var CLASSES = window.NEC_CLASSES || { classes: [], group: { externals: [], buffs: [], actives: [] } };
  var ZH_NAMES = window.NEC_ZH_NAMES || {};

  var state = {
    dungeonKey: null,
    key: 21,
    stamina: 45859,
    versRaw: 0,
    avoidRaw: 0,
    armor: 2409,
    isTyran: false,
    customDrs: [],
    className: null,
    specName: null,
    specSel: {},
    groupSel: {},
    schoolFilter: 'all',
    excludeTank: false,
    search: '',
    sort: 'pct-desc'
  };

  var data = null;
  var meta = null;
  var dungeonNameById = {};

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- 启动 ---------------- */

  function boot() {
    data = window.NEC_DATA;
    if (!data || !Array.isArray(data.dungeons) || !data.dungeons.length) {
      document.body.innerHTML =
        '<p style="padding:40px;color:#8a93a5">没有找到数据。先运行 <code>node tools/fetch-source.mjs</code>、<code>node tools/build-classes.mjs</code>、<code>node tools/build-data.mjs</code>。</p>';
      return;
    }
    meta = data.meta || {};

    buildIndex();
    applyMeta();
    buildDungeonOptions();
    buildClassSelect();
    buildBuffList();
    bindEvents();
    applyHash();
    syncControls();
    refresh();
  }

  function buildIndex() {
    data.dungeons.forEach(function (d) {
      d.abilities.forEach(function (a) {
        if (!(a.id in dungeonNameById)) dungeonNameById[a.id] = d.nameZh || d.nameEn;
      });
    });
  }

  function applyMeta() {
    $('seasonBadge').textContent = meta.season || '当前赛季';
    var status = $('dataStatus');
    status.textContent = '数据 ' + (meta.gameVersion || '—');
    status.className = 'data-status ok';

    var banner = $('dataBanner');
    banner.hidden = false;
    banner.innerHTML =
      '数据版本 <strong>' + esc(meta.gameVersion || '—') + '</strong> · 构建于 ' +
      esc(meta.builtAt || '—') + ' · 技能中文名来自 <strong>wago.tools</strong> 的简中数据表 · 来源 ' +
      '<a href="https://github.com/acornellier/not_even_close" target="_blank" rel="noopener">acornellier/not_even_close</a>';
  }

  function buildDungeonOptions() {
    var sel = $('dungeon');
    sel.innerHTML = '';
    data.dungeons.forEach(function (d) {
      var opt = document.createElement('option');
      opt.value = d.key;
      opt.textContent = d.nameZh || d.nameEn;
      sel.appendChild(opt);
    });
    state.dungeonKey = data.dungeons[0].key;
    sel.value = state.dungeonKey;
  }

  function buildBuffList() {
    var list = $('buffList');
    list.innerHTML = '';
    if (!state.customDrs.length) {
      var p = document.createElement('p');
      p.className = 'buff-empty';
      p.textContent = '额外的手动减伤（如饰品、特殊 buff），一般用上面职业面板就够了。';
      list.appendChild(p);
      return;
    }
    state.customDrs.forEach(function (dr, idx) {
      var row = document.createElement('div');
      row.className = 'buff-item';

      var check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !!dr.active;
      check.addEventListener('change', function () {
        state.customDrs[idx].active = check.checked;
        refresh();
      });

      var name = document.createElement('span');
      name.className = 'buff-name';
      name.textContent = dr.name + (dr.type === 'all' ? '' : dr.type === 'physical' ? '（物理）' : '（魔法）');

      var val = document.createElement('span');
      val.className = 'buff-val';
      val.textContent = dr.pct + '%';

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'buff-del';
      del.textContent = '×';
      del.addEventListener('click', function () {
        state.customDrs.splice(idx, 1);
        buildBuffList();
        refresh();
      });

      row.appendChild(check);
      row.appendChild(name);
      row.appendChild(val);
      row.appendChild(del);
      list.appendChild(row);
    });
  }

  /* ---------------- 职业面板 ---------------- */

  function nameOf(ability) {
    return ZH_NAMES[ability.spellId || ability.id] || ability.nameZh || ability.name || ('#' + ability.id);
  }

  function isUsable(ability) {
    return !!(ability.dr || ability.aoeDr || ability.damageDealtReduction ||
      ability.staminaIncrease || ability.versIncrease || ability.healthIncrease || ability.armorIncrease);
  }

  function abilityValue(ability) {
    var parts = [];
    if (ability.dr) parts.push('减伤 ' + Math.round(ability.dr * 100) + '%');
    if (ability.aoeDr) parts.push('AoE ' + Math.round(ability.aoeDr * 100) + '%');
    if (ability.damageDealtReduction) parts.push('敌方伤害 -' + Math.round(ability.damageDealtReduction * 100) + '%');
    if (ability.staminaIncrease) parts.push('耐力 +' + Math.round(ability.staminaIncrease * 100) + '%');
    if (ability.versIncrease) parts.push('全能 +' + (ability.versIncrease * 100).toFixed(1) + '%');
    if (ability.healthIncrease) parts.push('生命 +' + Math.round(ability.healthIncrease * 100) + '%');
    if (ability.armorIncrease) parts.push('护甲 +' + Math.round(ability.armorIncrease * 100) + '%');
    if (!parts.length && ability.absorb) parts.push('仅吸收 · 未计入');
    return parts.join(' · ') || '—';
  }

  function currentClass() {
    for (var i = 0; i < CLASSES.classes.length; i++) {
      if (CLASSES.classes[i].name === state.className) return CLASSES.classes[i];
    }
    return CLASSES.classes[0];
  }

  function currentSpec() {
    var cls = currentClass();
    if (!cls) return null;
    for (var i = 0; i < cls.specs.length; i++) {
      if (cls.specs[i].spec === state.specName) return cls.specs[i];
    }
    return cls.specs[0];
  }

  function buildClassSelect() {
    var sel = $('classSelect');
    sel.innerHTML = '';
    CLASSES.classes.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = classZh(c.name);
      sel.appendChild(opt);
    });
    state.className = CLASSES.classes[0].name;
    sel.value = state.className;
    buildSpecSelect();
  }

  function buildSpecSelect() {
    var cls = currentClass();
    var sel = $('specSelect');
    sel.innerHTML = '';
    cls.specs.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.spec;
      opt.textContent = specZh(s.spec) + (s.isTank ? ' · 坦克' : '');
      sel.appendChild(opt);
    });
    state.specName = cls.specs[0].spec;
    sel.value = state.specName;
    resetSpecSelection();
  }

  function resetSpecSelection() {
    var spec = currentSpec();
    state.specSel = {};
    if (!spec) return;
    spec.abilities.forEach(function (a) {
      if (a.onByDefault) state.specSel[a.id] = true;
    });
    renderSpecAbilities();
  }

  function renderSpecAbilities() {
    var spec = currentSpec();
    var wrap = $('specAbilities');
    if (!spec) { wrap.innerHTML = ''; return; }

    var html = '';
    spec.abilities.forEach(function (a) {
      var usable = isUsable(a);
      var checked = !!state.specSel[a.id];
      var title = a.notes ? ' title="' + esc(a.notes) + '"' : '';
      html += '<label class="ab' + (usable ? '' : ' disabled') + '"' + title + '>';
      html += '<input type="checkbox" data-id="' + a.id + '"' + (checked ? ' checked' : '') + (usable ? '' : ' disabled') + '>';
      html += '<span class="ab-name">' + esc(nameOf(a)) + (a.passive ? '<i class="ab-passive">被动</i>' : '') + '</span>';
      html += '<span class="ab-val">' + esc(abilityValue(a)) + '</span>';
      html += '</label>';
    });
    wrap.innerHTML = html;

    Array.prototype.forEach.call(wrap.querySelectorAll('input[data-id]'), function (input) {
      input.addEventListener('change', function () {
        var id = Number(input.dataset.id);
        if (input.checked) state.specSel[id] = true;
        else delete state.specSel[id];
        refresh();
      });
    });
  }

  function renderGroupAbilities() {
    var wrap = $('groupAbilities');
    var list = [].concat(
      CLASSES.group.externals || [],
      CLASSES.group.buffs || [],
      CLASSES.group.actives || []
    );
    var html = '';
    list.forEach(function (a) {
      var usable = isUsable(a);
      var checked = !!state.groupSel[a.id];
      var title = a.notes ? ' title="' + esc(a.notes) + '"' : '';
      html += '<label class="ab' + (usable ? '' : ' disabled') + '"' + title + '>';
      html += '<input type="checkbox" data-id="' + a.id + '"' + (checked ? ' checked' : '') + (usable ? '' : ' disabled') + '>';
      html += '<span class="ab-name">' + esc(nameOf(a)) + '</span>';
      html += '<span class="ab-val">' + esc(abilityValue(a)) + '</span>';
      html += '</label>';
    });
    wrap.innerHTML = html;

    Array.prototype.forEach.call(wrap.querySelectorAll('input[data-id]'), function (input) {
      input.addEventListener('change', function () {
        var id = Number(input.dataset.id);
        if (input.checked) state.groupSel[id] = true;
        else delete state.groupSel[id];
        refresh();
      });
    });
  }

  function selectedAbilities() {
    var spec = currentSpec();
    var out = [];
    if (spec) {
      spec.abilities.forEach(function (a) {
        if (state.specSel[a.id]) out.push(a);
      });
    }
    var list = [].concat(
      CLASSES.group.externals || [],
      CLASSES.group.buffs || [],
      CLASSES.group.actives || []
    );
    list.forEach(function (a) {
      if (state.groupSel[a.id]) out.push(a);
    });
    return out;
  }

  function renderDrSummary() {
    var list = selectedAbilities().filter(isUsable);
    var el = $('drSummary');
    if (!list.length) { el.textContent = '未选'; el.className = 'derived'; return; }
    el.textContent = list.map(function (a) { return nameOf(a); }).join(' · ');
    el.className = 'derived ok';
  }

  /* ---------------- 事件 ---------------- */

  function bindEvents() {
    $('dungeon').addEventListener('change', function (e) {
      state.dungeonKey = e.target.value;
      refresh();
    });

    $('classSelect').addEventListener('change', function (e) {
      state.className = e.target.value;
      buildSpecSelect();
      state.specSel = {};
      var spec = currentSpec();
      if (spec) spec.abilities.forEach(function (a) { if (a.onByDefault) state.specSel[a.id] = true; });
      renderSpecAbilities();
      refresh();
    });

    $('specSelect').addEventListener('change', function (e) {
      state.specName = e.target.value;
      resetSpecSelection();
      refresh();
    });

    $('keyInput').addEventListener('input', function (e) {
      state.key = Number(e.target.value);
      $('keyValue').textContent = '+' + state.key;
      updateRangeFill();
      refresh();
    });

    $('staminaInput').addEventListener('input', function (e) {
      var v = Number(e.target.value);
      state.stamina = isFinite(v) && v > 0 ? v : 0;
      refresh();
    });

    $('tyranToggle').addEventListener('change', function (e) {
      state.isTyran = e.target.checked;
      refresh();
    });

    $('versInput').addEventListener('input', function (e) {
      state.versRaw = Math.max(0, Number(e.target.value) || 0);
      refresh();
    });

    $('avoidInput').addEventListener('input', function (e) {
      state.avoidRaw = Math.max(0, Number(e.target.value) || 0);
      refresh();
    });

    $('armorInput').addEventListener('input', function (e) {
      state.armor = Math.max(0, Number(e.target.value) || 0);
      refresh();
    });

    $('addBuff').addEventListener('click', function () {
      var nameEl = $('buffName');
      var pctEl = $('buffPct');
      var name = nameEl.value.trim();
      var pct = Number(pctEl.value);
      if (!name) { toast('先填个名字'); nameEl.focus(); return; }
      if (!isFinite(pct) || pct <= 0 || pct >= 100) { toast('减伤要在 1–99 之间'); pctEl.focus(); return; }
      state.customDrs.push({ name: name, pct: pct, type: $('buffType').value, active: true });
      nameEl.value = '';
      pctEl.value = 5;
      buildBuffList();
      refresh();
      toast('已添加：' + name + ' ' + pct + '%');
    });

    $('buffName').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('addBuff').click(); }
    });

    $('searchInput').addEventListener('input', function (e) {
      state.search = e.target.value.trim().toLowerCase();
      render();
    });

    $('excludeTank').addEventListener('change', function (e) {
      state.excludeTank = e.target.checked;
      render();
    });

    $('sortSelect').addEventListener('change', function (e) {
      state.sort = e.target.value;
      render();
    });

    $('shareBtn').addEventListener('click', share);

    window.addEventListener('hashchange', function () {
      applyHash();
      syncControls();
      render();
    });
  }

  /* ---------------- 状态同步 ---------------- */

  function syncControls() {
    $('dungeon').value = state.dungeonKey;
    $('keyInput').value = state.key;
    $('keyValue').textContent = '+' + state.key;
    $('staminaInput').value = state.stamina || '';
    $('tyranToggle').checked = state.isTyran;
    $('versInput').value = state.versRaw;
    $('avoidInput').value = state.avoidRaw;
    $('armorInput').value = state.armor;
    $('searchInput').value = state.search || '';
    $('sortSelect').value = state.sort;
    $('excludeTank').checked = state.excludeTank;
    $('classSelect').value = state.className;
    $('specSelect').value = state.specName;
    updateRangeFill();
    updateHints();
    renderSpecAbilities();
    renderGroupAbilities();
    renderDrSummary();
  }

  function updateHints() {
    var acts = selectedAbilities();
    var staminaMul = 1;
    acts.forEach(function (a) { if (a.staminaIncrease) staminaMul *= 1 + a.staminaIncrease; });
    var hp = E.healthFromStamina(state.stamina * staminaMul, meta);
    $('hpHint').textContent = E.formatWan(hp) + '血';
    var extraVers = 0;
    acts.forEach(function (a) { if (a.versIncrease) extraVers += a.versIncrease * 100; });
    $('versPct').textContent = (E.versaPercent(state.versRaw, meta) + extraVers).toFixed(2) + '%';
    $('avoidPct').textContent = E.avoidancePercent(state.avoidRaw, meta).toFixed(2) + '%';
    $('armorPct').textContent = (E.armorDr(state.armor, meta) * 100).toFixed(1) + '%';
  }

  function updateRangeFill() {
    var el = $('keyInput');
    var min = Number(el.min) || 0;
    var max = Number(el.max) || 30;
    var pct = ((Number(el.value) - min) / (max - min)) * 100;
    el.style.setProperty('--fill', pct + '%');
  }

  function applyHash() {
    if (!location.hash || location.hash.length < 2) return;
    var p = new URLSearchParams(location.hash.slice(1));

    if (p.get('c') && CLASSES.classes.some(function (x) { return x.name === p.get('c'); })) {
      state.className = p.get('c');
      $('classSelect').value = state.className;
      buildSpecSelect();
    }
    if (p.get('s')) {
      var cls = currentClass();
      if (cls.specs.some(function (x) { return x.spec === p.get('s'); })) {
        state.specName = p.get('s');
        $('specSelect').value = state.specName;
      }
    }
    if (p.get('ab')) {
      state.specSel = {};
      p.get('ab').split(',').forEach(function (v) { if (v) state.specSel[Number(v)] = true; });
    }
    if (p.get('gp')) {
      state.groupSel = {};
      p.get('gp').split(',').forEach(function (v) { if (v) state.groupSel[Number(v)] = true; });
    }
    if (p.get('d') && data.dungeons.some(function (x) { return x.key === p.get('d'); })) {
      state.dungeonKey = p.get('d');
    }
    if (p.get('k')) {
      var k = Number(p.get('k'));
      if (isFinite(k)) state.key = Math.min(Math.max(k, 2), 30);
    }
    if (p.get('st')) { var st = Number(p.get('st')); if (isFinite(st) && st > 0) state.stamina = st; }
    if (p.get('vs')) state.versRaw = Math.max(0, Number(p.get('vs')) || 0);
    if (p.get('av')) state.avoidRaw = Math.max(0, Number(p.get('av')) || 0);
    if (p.get('ar')) state.armor = Math.max(0, Number(p.get('ar')) || 0);
    if (p.get('t')) state.isTyran = p.get('t') === '1';
    if (p.get('et')) state.excludeTank = p.get('et') === '1';
    if (p.get('dr')) {
      var list = [];
      p.get('dr').split(',').forEach(function (part) {
        var kv = part.split(':');
        if (kv.length === 3 && kv[0]) {
          list.push({ name: decodeURIComponent(kv[0]), pct: Number(kv[1]), type: kv[2], active: true });
        }
      });
      if (list.length) state.customDrs = list;
    }
  }

  function writeHash() {
    var p = new URLSearchParams();
    p.set('d', state.dungeonKey);
    p.set('k', state.key);
    p.set('st', state.stamina);
    p.set('vs', state.versRaw);
    p.set('av', state.avoidRaw);
    p.set('ar', state.armor);
    p.set('t', state.isTyran ? '1' : '0');
    p.set('et', state.excludeTank ? '1' : '0');
    if (state.className) p.set('c', state.className);
    if (state.specName) p.set('s', state.specName);

    var ab = Object.keys(state.specSel).filter(function (id) { return state.specSel[id]; });
    if (ab.length) p.set('ab', ab.join(','));
    var gp = Object.keys(state.groupSel).filter(function (id) { return state.groupSel[id]; });
    if (gp.length) p.set('gp', gp.join(','));

    var drs = state.customDrs
      .filter(function (d) { return d.active; })
      .map(function (d) { return encodeURIComponent(d.name) + ':' + d.pct + ':' + d.type; });
    if (drs.length) p.set('dr', drs.join(','));

    var next = '#' + p.toString();
    if (location.hash !== next) history.replaceState(null, '', next);
  }

  /* ---------------- 计算与渲染 ---------------- */

  function currentDungeon() {
    for (var i = 0; i < data.dungeons.length; i++) {
      if (data.dungeons[i].key === state.dungeonKey) return data.dungeons[i];
    }
    return data.dungeons[0];
  }

  function refresh() {
    updateHints();
    renderDrSummary();
    writeHash();
    render();
  }

  function computeAll() {
    var dungeon = currentDungeon();
    var acts = selectedAbilities();
    return (dungeon.abilities || []).map(function (ability) {
      var r = E.compute(ability, {
        key: state.key,
        isTyran: state.isTyran,
        stamina: state.stamina,
        versRaw: state.versRaw,
        avoidanceRaw: state.avoidRaw,
        armor: state.armor,
        classAbilities: acts,
        customDrs: state.customDrs,
        meta: meta
      });
      return { ability: ability, result: r };
    });
  }

  function render() {
    var all = computeAll();

    var filtered = all.filter(function (item) {
      if (state.excludeTank && item.ability.tankOnly) return false;
      var label = E.schoolLabel(item.ability.schools);
      if (state.schoolFilter !== 'all' && label.key !== state.schoolFilter) return false;
      if (!state.search) return true;
      var hay = [item.ability.nameZh, item.ability.nameEn].join(' ').toLowerCase();
      return hay.indexOf(state.search) !== -1;
    });

    filtered.sort(function (a, b) {
      if (state.sort === 'name') {
        return String(a.ability.nameZh || a.ability.nameEn).localeCompare(
          String(b.ability.nameZh || b.ability.nameEn), 'zh-CN');
      }
      if (state.sort === 'dmg-desc') return b.result.scaled - a.result.scaled;
      var pa = a.result.pct, pb = b.result.pct;
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return state.sort === 'pct-asc' ? pa - pb : pb - pa;
    });

    renderSummary(all);
    renderSchoolFilter(all);
    renderRows(filtered);
    renderFootNote(all);

    $('empty').hidden = filtered.length > 0;
    if (!filtered.length) $('empty').textContent = '没有匹配的技能，换个筛选条件试试。';
  }

  function renderSummary(all) {
    var counts = { lethal: 0, danger: 0, safe: 0 };
    all.forEach(function (i) { if (counts[i.result.verdict] != null) counts[i.result.verdict]++; });
    $('sumLethal').textContent = counts.lethal;
    $('sumDanger').textContent = counts.danger;
    $('sumSafe').textContent = counts.safe;
  }

  function renderSchoolFilter(all) {
    var wrap = $('schoolFilter');
    var present = {};
    all.forEach(function (i) { present[E.schoolLabel(i.ability.schools).key] = true; });

    var html = '<button type="button" class="chip" data-school="all" aria-pressed="' +
      (state.schoolFilter === 'all') + '">全部 <span class="dot" style="background:#8a93a5"></span></button>';

    SCHOOL_ORDER.forEach(function (s) {
      if (!present[s]) return;
      html += '<button type="button" class="chip" data-school="' + s + '" aria-pressed="' +
        (state.schoolFilter === s) + '">' + SCHOOLS[s].zh +
        ' <span class="dot" style="background:' + SCHOOLS[s].color + '"></span></button>';
    });

    wrap.innerHTML = html;
    Array.prototype.forEach.call(wrap.querySelectorAll('.chip'), function (chip) {
      chip.addEventListener('click', function () {
        state.schoolFilter = chip.dataset.school;
        render();
      });
    });
  }

  function renderRows(list) {
    var wrap = $('rows');
    var isAll = state.dungeonKey === 'all';
    var html = '';

    list.forEach(function (item, idx) {
      var a = item.ability;
      var r = item.result;
      var label = E.schoolLabel(a.schools);
      var color = (SCHOOLS[label.key] || SCHOOLS.physical).color;
      var rowId = 'row-' + idx;
      var pctWidth = r.pct == null ? 0 : Math.min(r.pct, 100);
      var tagTitle = a.notes ? ' title="' + esc(a.notes) + '"' : '';

      html += '<div class="row ' + r.verdict + '" tabindex="0" role="button" aria-expanded="false" aria-controls="' + rowId + '">';
      html += '  <div class="cell-name">';
      html += '    <span class="dot" style="color:' + color + ';background:' + color + '" title="' + label.zh + '伤害"></span>';
      html += '    <span class="names">';
      html += '      <span class="zh">' + esc(a.nameZh || a.nameEn) + '</span>';
      html += '      <span class="en">' + esc(a.nameEn) + '</span>';
      html += '    </span>';
      html += '  </div>';

      html += '  <div class="tags"' + tagTitle + '>';
      html += '    <span class="tag-s school" style="color:' + color + ';border-color:' + color + '55">' + label.zh + '</span>';
      if (!a.trash) html += '    <span class="tag-s boss">首领</span>';
      if (a.aoe) html += '    <span class="tag-s">AoE</span>';
      if (a.tankOnly) html += '    <span class="tag-s">坦克</span>';
      if (a.avoidable) html += '    <span class="tag-s">可躲</span>';
      if (isAll) html += '    <span class="tag-s dim">' + esc(dungeonNameById[a.id] || '') + '</span>';
      html += '  </div>';

      html += '  <div class="dmg">' + E.formatNumber(r.scaled) + '</div>';
      html += '  <div class="pct-cell">';
      html += '    <div class="bar"><span style="width:' + pctWidth + '%"></span></div>';
      html += '    <span class="pct-val">' + E.formatPct(r.pct) + '</span>';
      html += '  </div>';
      html += '  <div class="right"><span class="tag ' + r.verdict + '">' + E.VERDICTS[r.verdict].zh + '</span></div>';
      html += '</div>';

      html += '<div class="row-detail" id="' + rowId + '">';
      html += '<span class="k">基础伤害</span> <code>' + E.formatNumber(a.damage) + '</code>';
      html += '　<span class="k">缩放</span> <code>×' + r.scaling.toFixed(2) + '</code>';
      html += '　<span class="k">该层伤害</span> <code>' + E.formatNumber(r.scaled) + '</code><br>';
      if (r.reducedDamage !== r.scaled) {
        html += '<span class="k">敌方伤害削减后</span> <code>' + E.formatNumber(r.reducedDamage) + '</code>　';
      }
      html += '<span class="k">减伤</span> ';
      html += (r.drParts || []).map(function (p) {
        return esc(p.kind) + ' ' + p.pct.toFixed(1) + '%';
      }).join(' × ');
      html += ' → 合计 <code>' + r.drPct.toFixed(1) + '%</code><br>';
      html += '<span class="k">实承伤</span> <code>' + E.formatNumber(r.taken) + '</code>';
      html += '　<span class="k">剩余血量</span> <code>' +
        (r.remaining >= 0 ? '+' : '') + E.formatNumber(r.remaining) + '</code>' +
        '（' + (r.remainingPct >= 0 ? '+' : '') + r.remainingPct.toFixed(2) + '%）<br>';
      html += '<span class="k">血量</span> ' + E.formatNumber(r.health) +
        '（耐力 ' + state.stamina + ' × ' + (meta.healthPerStamina || 20) + '）';
      if (a.periodicDamage) html += '　<span class="k">持续伤害</span> <code>' + E.formatNumber(a.periodicDamage) + '</code> / ' + a.ticks + ' 跳';
      if (a.notes) html += '<br><span class="k">备注</span> ' + esc(a.notes);
      html += '<br><span class="k">法术 ID</span> <code>' + a.id + '</code>';
      html += '</div>';
    });

    wrap.innerHTML = html;

    Array.prototype.forEach.call(wrap.querySelectorAll('.row'), function (row) {
      row.addEventListener('click', function () {
        row.setAttribute('aria-expanded', String(row.classList.toggle('open')));
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          row.setAttribute('aria-expanded', String(row.classList.toggle('open')));
        }
      });
    });
  }

  function renderFootNote(all) {
    var total = all.length;
    var hp = E.healthFromStamina(state.stamina, meta);
    var acts = selectedAbilities().filter(isUsable).length;
    var parts = [total + ' 条技能', '血量 ' + E.formatWan(hp), '已选减伤 ' + acts + ' 项'];
    $('footNote').textContent = parts.join(' · ') + '。';
  }

  /* ---------------- 名称本地化 ---------------- */

  var CLASS_ZH = {
    'Death Knight': '死亡骑士', 'Demon Hunter': '恶魔猎手', Druid: '德鲁伊', Evoker: '唤魔师',
    Hunter: '猎人', Mage: '法师', Monk: '武僧', Paladin: '圣骑士', Priest: '牧师',
    Rogue: '潜行者', Shaman: '萨满祭司', Warlock: '术士', Warrior: '战士'
  };
  var SPEC_ZH = {
    Blood: '鲜血', Frost: '冰霜', Unholy: '邪恶', Devourer: '噬灭', Havoc: '浩劫', Vengeance: '复仇',
    Balance: '平衡', Feral: '野性', Guardian: '守护', Restoration: '恢复',
    Augmentation: '增辉', Devastation: '湮灭', Preservation: '恩护',
    'Beast Mastery': '兽王', Marksmanship: '射击', Survival: '生存',
    Arcane: '奥术', Fire: '火焰', Mistweaver: '织雾', Windwalker: '踏风',
    Holy: '神圣', Protection: '防护', Retribution: '惩戒',
    Discipline: '戒律', Shadow: '暗影', Assassination: '刺杀', Outlaw: '狂徒', Subtlety: '敏锐',
    Enhancement: '增强', Elemental: '元素', Affliction: '痛苦', Demonology: '恶魔学识', Destruction: '毁灭',
    Arms: '武器', Fury: '狂怒'
  };

  function classZh(name) { return CLASS_ZH[name] || name; }
  function specZh(name) { return SPEC_ZH[name] || name; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------------- 分享 / 提示 ---------------- */

  function share() {
    writeHash();
    var url = location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        toast('链接已复制');
      }, function () { fallbackCopy(url); });
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('链接已复制');
    } catch (err) {
      toast('复制失败，手动复制地址栏吧');
    }
    document.body.removeChild(ta);
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
