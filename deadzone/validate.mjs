#!/usr/bin/env node
/* Validador estático do DEADZONE.
   Uso: node validate.mjs
   Verifica: sintaxe de todos os módulos, resolução dos imports, existência dos assets
   referenciados pelo HTML/CSS/JS, IDs duplicados/faltantes e arquivos órfãos. */
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(new URL('.', import.meta.url).pathname);
const problems = [];
const warns = [];
const fail = (m) => problems.push(m);
const warn = (m) => warns.push(m);

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'assets' && dir === ROOT) { continue; }
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = await walk(ROOT);
const js = files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));
const html = await readFile(join(ROOT, 'index.html'), 'utf8');

/* 1. sintaxe */
for (const f of js) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    fail(`sintaxe: ${relative(ROOT, f)}\n${e.stderr?.toString().split('\n').slice(0, 4).join('\n')}`);
  }
}

/* 2. imports resolvem */
const bare = new Set();
for (const f of js) {
  const src = await readFile(f, 'utf8');
  const re = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of src.matchAll(re)) {
    const spec = m[1] || m[2];
    if (!spec) continue;
    if (!spec.startsWith('.') && !spec.startsWith('/')) { bare.add(`${relative(ROOT, f)} -> ${spec}`); continue; }
    const target = resolve(dirname(f), spec);
    const ok = await stat(target).then((s) => s.isFile()).catch(() => false);
    if (!ok) fail(`import não resolve: ${relative(ROOT, f)} -> ${spec}`);
  }
}

/* 3. assets citados no HTML/CSS existem */
const assetRe = /(?:src|href)\s*=\s*['"]([^'"]+)['"]|url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
for (const [name, src] of [['index.html', html],
  ...(await Promise.all(files.filter((f) => f.endsWith('.css')).map(async (f) => [relative(ROOT, f), await readFile(f, 'utf8')])))]) {
  for (const m of src.matchAll(assetRe)) {
    const ref = (m[1] || m[2] || '').trim();
    if (!ref || ref.startsWith('data:') || ref.startsWith('#') || /^(https?:)?\/\//.test(ref)) continue;
    const target = resolve(dirname(join(ROOT, name)), ref.split('?')[0].split('#')[0]);
    const ok = await stat(target).catch(() => null);
    if (!ok) fail(`asset ausente (${name}): ${ref}`);
  }
}

/* 4. IDs: duplicados e referências no JS */
const ids = [...html.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
const idSet = new Set(ids);
const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dups.length) fail(`IDs duplicados no HTML: ${[...new Set(dups)].join(', ')}`);

const jsAll = (await Promise.all(js.map((f) => readFile(f, 'utf8')))).join('\n');
for (const m of jsAll.matchAll(/\$\(\s*['"]([a-z0-9_-]+)['"]\s*\)|getElementById\(\s*['"]([a-z0-9_-]+)['"]\s*\)/g)) {
  const id = m[1] || m[2];
  if (!idSet.has(id)) fail(`ID usado no JS mas ausente no HTML: #${id}`);
}
for (const m of html.matchAll(/data-act\s*=\s*["']([^"']+)["']/g)) {
  const act = m[1];
  if (!jsAll.includes(`'${act}'`) && !jsAll.includes(`"${act}"`)) warn(`data-act sem handler: ${act}`);
}

/* 5. arquivos órfãos (não referenciados por ninguém) */
const allSrc = [html, ...(await Promise.all(files.filter((f) => /\.(css|js|mjs)$/.test(f)).map(async (f) => await readFile(f, 'utf8'))))].join('\n');
for (const f of files.filter((f) => f.endsWith('.js'))) {
  const base = relative(ROOT, f).replace(/\\/g, '/');
  if (!allSrc.includes(base.split('/').pop())) warn(`possível módulo órfão: ${base}`);
}

/* relatório */
console.log(`arquivos analisados: ${files.length} (${js.length} módulos)`);
console.log(`IDs no HTML: ${idSet.size}`);
if (warns.length) { console.log(`\n${warns.length} aviso(s):`); warns.forEach((w) => console.log('  ! ' + w)); }
if (problems.length) {
  console.log(`\n${problems.length} ERRO(S):`);
  problems.forEach((p) => console.log('  x ' + p));
  process.exit(1);
}
console.log('\nOK — nenhum erro encontrado.');
