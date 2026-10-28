/**
 * smoke-dom.mjs —— 无浏览器冒烟测试（沙箱里起不了 Chrome）。
 * 用极简 DOM 桩把 app.js 跑起来，验证 boot/render 链路不抛错且关键输出正确。
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const require = createRequire(import.meta.url);

class FakeEl {
  constructor(tag = 'div', id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.dataset = {};
    this.style = { setProperty() {} };
    this.classList = {
      _s: new Set(),
      add: (c) => this.classList._s.add(c),
      remove: (c) => this.classList._s.delete(c),
      toggle: (c) => (this.classList._s.has(c) ? (this.classList._s.delete(c), false) : (this.classList._s.add(c), true)),
      contains: (c) => this.classList._s.has(c)
    };
    this._html = '';
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.hidden = false;
    this.className = '';
    this.disabled = false;
    this.min = 0;
    this.max = 30;
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  appendChild(el) { this.children.push(el); return el; }
  removeChild(el) { this.children = this.children.filter((c) => c !== el); return el; }
  addEventListener() {}
  removeEventListener() {}
  setAttribute() {}
  getAttribute() { return null; }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  closest() { return null; }
  focus() {}
  select() {}
}

const els = new Map();
const doc = {
  readyState: 'complete',
  body: new FakeEl('body'),
  documentElement: new FakeEl('html'),
  getElementById(id) {
    if (!els.has(id)) els.set(id, new FakeEl('div', id));
    return els.get(id);
  },
  createElement(tag) { return new FakeEl(tag); },
  addEventListener() {},
  querySelectorAll() { return []; },
  execCommand() { return true; }
};

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.document = doc;
globalThis.location = { href: 'file:///index.html', hash: '' };
globalThis.history = { replaceState(_a, _b, url) { globalThis.location.hash = String(url); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: null }, configurable: true, writable: true });

for (const file of ['data/data.js', 'data/classes.js', 'data/zh-names.js']) {
  eval(fs.readFileSync(file, 'utf8'));
}
require('../assets/engine.js');
eval(fs.readFileSync('assets/app.js', 'utf8'));

const $ = (id) => doc.getElementById(id);

let pass = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
};

console.log('\n启动冒烟');
check('数据全部载入', () => {
  assert.equal(window.NEC_DATA.dungeons.length, 9);
  assert.equal(window.NEC_CLASSES.classes.length, 13);
  assert.ok(Object.keys(window.NEC_ZH_NAMES).length > 300);
});
check('副本下拉 9 项', () => assert.equal($('dungeon').children.length, 9));
check('职业下拉 13 项', () => assert.equal($('classSelect').children.length, 13));
check('专精下拉有 3 个（战士）', () => assert.equal($('specSelect').children.length, 3));
check('职业技能区已渲染', () => assert.ok($('specAbilities').innerHTML.includes('class="ab')));
check('团队技能区已渲染', () => assert.ok($('groupAbilities').innerHTML.includes('class="ab')));
check('层数显示 +21', () => assert.equal($('keyValue').textContent, '+21'));
check('血量提示 91.7 万血', () => assert.equal($('hpHint').textContent, '91.7 万血'));
check('必死计数为数字', () => assert.ok(/^\d+$/.test(String($('sumLethal').textContent))));
check('结果区已渲染', () => assert.ok($('rows').innerHTML.includes('class="row')));
check('中文名来自官方表（含「密谋小径」技能）', () =>
  assert.ok($('rows').innerHTML.includes('妙手空空')));
check('URL 含职业与专精', () => {
  const h = String(globalThis.location.hash);
  assert.ok(h.includes('c='), h);
  assert.ok(h.includes('s='), h);
});

console.log(`\n通过 ${pass} 项\n`);
