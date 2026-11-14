#!/usr/bin/env node
/* Gera os ícones PNG do DEADZONE (192/512, normais e maskable) sem dependências.
   Desenha em buffer RGBA e codifica PNG na mão (zlib do Node).
   Uso: node tools/gen-icons.mjs */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'assets', 'icons');
mkdirSync(OUT, { recursive: true });

const BG = [10, 18, 14, 255];
const ACID = [183, 224, 74, 255];
const BONE = [201, 216, 184, 255];
const BONE_D = [168, 184, 153, 255];
const BLOOD = [217, 69, 46, 255];

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function draw(size, pad) {
  const px = new Uint8Array(size * size * 4);
  const put = (x, y, c, alpha = 1) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    if (alpha >= 1) { px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; return; }
    const a = alpha;
    px[i] = Math.round(px[i] * (1 - a) + c[0] * a);
    px[i + 1] = Math.round(px[i + 1] * (1 - a) + c[1] * a);
    px[i + 2] = Math.round(px[i + 2] * (1 - a) + c[2] * a);
    px[i + 3] = 255;
  };
  const S = size;
  const c = S / 2;
  const R = (S / 2) * (1 - pad);       // raio útil
  const aa = (d, edge) => Math.max(0, Math.min(1, (edge - d) * 1.4)); // anti-alias simples

  // fundo com vinheta radial
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - c, y - c) / (S / 2);
      const g = mix([18, 30, 24, 255], BG, Math.min(1, d * 1.15));
      put(x, y, g);
    }
  }

  // anel externo tracejado
  const ringR = R * 0.92;
  for (let a = 0; a < Math.PI * 2; a += 0.004) {
    const on = (Math.floor((a / (Math.PI * 2)) * 36) % 2) === 0;
    if (!on) continue;
    for (let w = -1.2; w <= 1.2; w += 0.4) {
      const x = Math.round(c + Math.cos(a) * (ringR + w));
      const y = Math.round(c + Math.sin(a) * (ringR + w));
      put(x, y, mix(BG, [123, 224, 160, 255], 0.75));
    }
  }

  // marcas de mira (4 traços)
  const tickIn = R * 0.96, tickOut = R * 1.02, tickW = Math.max(2, S * 0.012);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let t = tickIn; t <= tickOut; t += 0.5) {
      for (let w = -tickW; w <= tickW; w += 0.5) {
        const x = Math.round(c + dx * t + (dy !== 0 ? w : 0));
        const y = Math.round(c + dy * t + (dx !== 0 ? w : 0));
        put(x, y, ACID);
      }
    }
  }

  // silhueta: cabeça + ombros + braço erguido
  const headR = R * 0.30, headY = c - R * 0.30;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // cabeça
      const dh = Math.hypot(x - c, y - headY);
      if (dh < headR + 1) put(x, y, BONE, aa(dh, headR));
      // tronco/ombros (trapézio arredondado)
      const top = headY + headR * 0.62;
      const bottom = c + R * 0.62;
      if (y > top && y < bottom) {
        const t = (y - top) / (bottom - top);
        const halfW = R * (0.30 + 0.34 * Math.min(1, t * 2.2));
        const over = Math.abs(x - c) - halfW;
        if (over < 1) put(x, y, BONE, aa(Math.abs(x - c), halfW));
      }
      // braço erguido à direita
      const ax = c + R * 0.46, ay = c - R * 0.02;
      const armD = Math.abs((x - ax) * 0.5 + (y - ay) * 0.86);
      const armLen = Math.hypot(x - ax, y - ay);
      if (armD < R * 0.075 && armLen < R * 0.5) put(x, y, BONE_D, aa(armD, R * 0.075));
    }
  }

  // olhos (brilho ácido)
  for (const sx of [-1, 1]) {
    const ex = c + sx * headR * 0.36, ey = headY + headR * 0.1;
    const er = Math.max(1.4, headR * 0.17);
    for (let y = Math.floor(ey - er - 2); y <= ey + er + 2; y++) {
      for (let x = Math.floor(ex - er - 2); x <= ex + er + 2; x++) {
        const d = Math.hypot(x - ex, y - ey);
        if (d < er + 1) put(x, y, ACID, aa(d, er));
      }
    }
  }

  // respingo de sangue
  const bx = c - R * 0.18, by = c + R * 0.42;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const rr = R * (0.04 + 0.05 * Math.abs(Math.sin(i * 2.7)));
    for (let y = Math.floor(by - rr - 2); y <= by + rr + 2; y++) {
      for (let x = Math.floor(bx - rr - 2); x <= bx + rr + 2; x++) {
        const d = Math.hypot(x - bx, y - by);
        if (d < rr) put(x, y, BLOOD, aa(d, rr) * 0.9);
      }
    }
  }
  return px;
}

/* ---------- encoder PNG mínimo (RGBA, sem filtro) ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(px, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* maskable: o Android corta em círculo/squircle. Renderizo o desenho no
   diametro de seguranca (80%) e preencho o resto com a cor de fundo. */
function maskable(size) {
  const inner = Math.round(size * 0.78);
  const art = draw(inner, 0.04);
  const out = new Uint8Array(size * size * 4);
  const off = Math.floor((size - inner) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      out[i] = BG[0]; out[i + 1] = BG[1]; out[i + 2] = BG[2]; out[i + 3] = 255;
    }
  }
  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      const si = (y * inner + x) * 4;
      const di = ((y + off) * size + (x + off)) * 4;
      out[di] = art[si]; out[di + 1] = art[si + 1]; out[di + 2] = art[si + 2]; out[di + 3] = 255;
    }
  }
  return out;
}

for (const [size, pad, name, mask] of [
  [192, 0.06, 'icon-192.png', false],
  [512, 0.06, 'icon-512.png', false],
  [512, 0, 'icon-maskable-512.png', true],
  [180, 0.06, 'apple-touch-icon.png', false],
]) {
  const buf = png(mask ? maskable(size) : draw(size, pad), size);
  writeFileSync(resolve(OUT, name), buf);
  console.log(`${name}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)} KB`);
}
