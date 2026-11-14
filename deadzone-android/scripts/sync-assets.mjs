#!/usr/bin/env node
/* Sincroniza o jogo web (../deadzone) para dentro do APK (app/src/main/assets/deadzone).
 *
 * Por que copiar em vez de symlink: o AGP não segue symlinks fora do módulo, e a
 * pasta de assets é ignorada pelo Git (fonte da verdade é ../deadzone).
 *
 * Uso: node scripts/sync-assets.mjs [--clean]
 */
import { readdir, mkdir, copyFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..');            // deadzone-android
const SRC = resolve(PROJECT, '..', 'deadzone');
const DEST = resolve(PROJECT, 'app/src/main/assets/deadzone');

/* Nada de código-fonte de ferramentas nem lixo de sistema no APK. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.github', '__pycache__', '.cache']);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db', '.gitignore']);
const SKIP_EXT = ['.md', '.log', '.map'];

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await walk(p, out);
    } else if (e.isFile()) {
      if (SKIP_FILES.has(e.name)) continue;
      if (SKIP_EXT.some((x) => e.name.endsWith(x))) continue;
      // scripts de dev não vão para o APK
      if (['serve.mjs', 'validate.mjs'].includes(e.name)) continue;
      out.push(p);
    }
  }
  return out;
}

const ok = await stat(SRC).then((s) => s.isDirectory()).catch(() => false);
if (!ok) {
  console.error(`ERRO: pasta do jogo não encontrada em ${SRC}`);
  process.exit(1);
}

if (process.argv.includes('--clean')) await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });

const files = await walk(SRC);
let bytes = 0;
for (const f of files) {
  const rel = relative(SRC, f);
  const target = join(DEST, rel);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(f, target);
  bytes += (await stat(target)).size;
}

/* Checagem de sanidade: o APK não pode sair sem o essencial. */
const must = ['index.html', 'js/game.js', 'js/world.js', 'css/style.css', 'assets/vendor/three.module.js'];
for (const m of must) {
  const exists = await stat(join(DEST, m)).then((s) => s.isFile()).catch(() => false);
  if (!exists) {
    console.error(`ERRO: asset obrigatório ausente após sync: ${m}`);
    process.exit(1);
  }
}

console.log(`DEADZONE assets: ${files.length} arquivos, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`  de ${SRC}\n  -> ${DEST}`);
