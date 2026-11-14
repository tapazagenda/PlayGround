#!/usr/bin/env node
/* Servidor estático mínimo para o DEADZONE.
   Uso: node serve.mjs [porta]  (padrão 8080, host 0.0.0.0) */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(new URL('.', import.meta.url).pathname);
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('403'); return; }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }).end('404'); return; }
    const ext = extname(file).toLowerCase();
    const base = file.split(/[\\/]/).pop();
    // HTML, manifest e o service worker precisam ser sempre revalidados.
    const shouldRevalidate = ext === '.html' || ext === '.webmanifest' || base === 'sw.js';
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': shouldRevalidate ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end('500 ' + err.message);
  }
}).listen(PORT, HOST, () => {
  console.log(`DEADZONE em http://localhost:${PORT}  (bind ${HOST})`);
});
