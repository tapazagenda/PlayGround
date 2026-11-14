#!/usr/bin/env node
/* Copia o jogo web (../deadzone) para deadzone-app/src/main/assets/deadzone.
 *
 * O APK embarca o jogo inteiro: nada é baixado no aparelho, então o app é
 * 100% offline. Este script é a única fonte do que entra nos assets — rode-o
 * antes de build.sh para que o APK não fique com uma cópia velha do jogo.
 *
 * Uso: node scripts/sync-assets.mjs [--clean]
 */
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..');
const SRC = resolve(PROJECT, '..', 'deadzone');
const DEST = resolve(PROJECT, 'src', 'main', 'assets', 'deadzone');

// Nada disso precisa ir para o APK: fontes de ferramenta e docs.
const SKIP_DIRS = new Set(['node_modules', '.git']);
const SKIP_FILES = new Set(['serve.mjs', 'validate.mjs', 'package.json', 'package-lock.json']);

const clean = process.argv.includes('--clean');

/** Arquivos que o jogo precisa ter; se faltar um, o app abriria em branco. */
const REQUIRED = [
  'index.html',
  'css/style.css',
  'js/game.js',
  'js/world.js',
  'js/render.js',
  'js/player.js',
  'js/weapons.js',
  'js/zombies.js',
  'js/hud.js',
  'js/controls.js',
  'js/audio.js',
  'assets/vendor/three.module.js',
];

async function walk(dir, base = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...await walk(join(dir, entry.name), rel));
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name) || entry.name.endsWith('.md')) continue;
      out.push(rel);
    }
  }
  return out;
}

async function main() {
  const info = await stat(SRC).catch(() => null);
  if (!info || !info.isDirectory()) {
    console.error(`origem não encontrada: ${SRC}`);
    process.exit(1);
  }

  const files = await walk(SRC);
  const missing = REQUIRED.filter((f) => !files.includes(f));
  if (missing.length) {
    console.error('faltam arquivos obrigatórios: ' + missing.join(', '));
    process.exit(1);
  }

  if (clean) await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });

  for (const rel of files) {
    const to = join(DEST, rel);
    await mkdir(dirname(to), { recursive: true });
    await cp(join(SRC, rel), to);
  }

  const bytes = await Promise.all(files.map(async (f) => (await stat(join(DEST, f))).size));
  const total = bytes.reduce((a, b) => a + b, 0);

  // sw.js e manifest só fazem sentido fora do app; dentro do APK eles são
  // inofensivos (o SW não registra na origem do WebView), então ficam.
  console.log(`DEADZONE assets: ${files.length} arquivos, ${(total / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  de ${SRC}`);
  console.log(`  -> ${DEST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
