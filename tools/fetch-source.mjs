#!/usr/bin/env node
/**
 * fetch-source.mjs —— 把 not-even-close 的源码/数据整棵镜像到 data/source/
 *
 * 走 jsDelivr 的 GitHub 镜像，只需要 Node 18+ 的 fetch，无需 token。
 * 用法：node tools/fetch-source.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const REPO = 'acornellier/not_even_close@master';
const BASE = `https://cdn.jsdelivr.net/gh/${REPO}/`;
const OUT = 'data/source';
const ROOTS = ['src/', 'package.json'];
const WANTED = /\.(ts|tsx|json)$/;

const seen = new Set();
const files = [];

function links(html) {
  const out = new Set();
  const re = /href="\/gh\/[^"]*?@master\/([^"#?]+)"/g;
  let m;
  while ((m = re.exec(html))) out.add(decodeURIComponent(m[1]));
  return [...out];
}

async function walk(dir) {
  if (seen.has(dir)) return;
  seen.add(dir);
  const res = await fetch(BASE + dir);
  if (!res.ok) throw new Error(`${res.status} ${dir}`);
  const html = await res.text();
  for (const rel of links(html)) {
    if (rel.endsWith('/')) {
      if (rel.startsWith('src/')) await walk(rel);
      continue;
    }
    if (!rel.startsWith('src/')) continue;
    if (WANTED.test(rel)) files.push(rel);
  }
}

async function main() {
  console.log('枚举 ' + BASE);
  for (const root of ROOTS) {
    if (root.endsWith('/')) await walk(root);
    else files.push(root);
  }
  console.log(`发现 ${files.length} 个文件，开始下载…`);

  let ok = 0;
  for (const rel of files) {
    const res = await fetch(BASE + rel);
    if (!res.ok) {
      console.warn(`  ✗ ${res.status} ${rel}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const dest = path.join(OUT, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buf);
    ok++;
  }
  console.log(`完成：${ok}/${files.length} → ${OUT}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
