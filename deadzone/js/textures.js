/* DEADZONE — texturas procedurais (canvas) */
import * as THREE from '../assets/vendor/three.module.js';
import { makeNoise, makeRng, clamp } from './util.js';

let ANISO = 4;
export function setAniso(a) { ANISO = a; }

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function asphalt(size = 512) {
  const c = canvas(size), x = c.getContext('2d');
  const n = makeNoise(7);
  const img = x.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const px = i % size, py = (i / size) | 0;
    let v = 104 + n.fbm(px / 22, py / 22, 4) * 26 + (Math.random() - 0.5) * 30;
    // rachaduras
    const cr = Math.abs(n.noise(px / 38, py / 38));
    if (cr < 0.018) v *= 0.74;
    v = clamp(v, 46, 178);
    d[i * 4] = v * 1.0; d[i * 4 + 1] = v * 1.0; d[i * 4 + 2] = v * 1.01; d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const rng = makeRng(21);
  // manchas de óleo
  for (let i = 0; i < 26; i++) {
    const cx = rng() * size, cy = rng() * size, r = 10 + rng() * 60;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const dark = rng() > 0.5;
    g.addColorStop(0, dark ? 'rgba(12,13,14,0.32)' : 'rgba(130,122,104,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  // marcas de pneu
  x.strokeStyle = 'rgba(16,16,18,0.24)';
  for (let i = 0; i < 3; i++) {
    x.lineWidth = 5 + rng() * 4;
    x.beginPath();
    const sx = rng() * size; x.moveTo(sx, 0);
    for (let y = 0; y < size; y += 24) x.lineTo(sx + Math.sin(y * 0.02 + i) * 16, y);
    x.stroke();
  }
  return c;
}

export function concrete(size = 512, tint = 0) {
  const c = canvas(size), x = c.getContext('2d');
  const n = makeNoise(13 + tint);
  const img = x.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) {
    const px = i % size, py = (i / size) | 0;
    let v = 138 + n.fbm(px / 30, py / 30, 5) * 34 + (Math.random() - 0.5) * 22;
    if (Math.random() < 0.004) v *= 0.55;
    d[i * 4] = v * 1.0; d[i * 4 + 1] = v * 0.98; d[i * 4 + 2] = v * 0.93; d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const rng = makeRng(41 + tint);
  // juntas de pavimento (dão escala ao chão)
  if (tint === 0) {
    x.strokeStyle = 'rgba(26,26,24,0.34)';
    x.lineWidth = 2.4;
    const tiles = 4;
    for (let i = 1; i < tiles; i++) {
      x.beginPath(); x.moveTo((size / tiles) * i, 0); x.lineTo((size / tiles) * i, size); x.stroke();
      x.beginPath(); x.moveTo(0, (size / tiles) * i); x.lineTo(size, (size / tiles) * i); x.stroke();
    }
    x.strokeStyle = 'rgba(190,186,172,0.1)';
    x.lineWidth = 1;
    for (let i = 1; i < tiles; i++) {
      x.beginPath(); x.moveTo((size / tiles) * i + 2, 0); x.lineTo((size / tiles) * i + 2, size); x.stroke();
      x.beginPath(); x.moveTo(0, (size / tiles) * i + 2); x.lineTo(size, (size / tiles) * i + 2); x.stroke();
    }
  }
  // manchas de umidade/ferrugem
  for (let i = 0; i < 18; i++) {
    const cx = rng() * size, cy = rng() * size, r = 14 + rng() * 70;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const rust = rng() > 0.55;
    g.addColorStop(0, rust ? 'rgba(92,52,26,0.34)' : 'rgba(38,42,36,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  // escorridos verticais
  for (let i = 0; i < 22; i++) {
    const sx = rng() * size, sy = rng() * size, len = 40 + rng() * 160;
    const g = x.createLinearGradient(sx, sy, sx, sy + len);
    g.addColorStop(0, 'rgba(30,30,26,0.28)');
    g.addColorStop(1, 'rgba(30,30,26,0)');
    x.fillStyle = g; x.fillRect(sx, sy, 2 + rng() * 5, len);
  }
  return c;
}

export function brick(size = 512) {
  const c = canvas(size), x = c.getContext('2d');
  x.fillStyle = '#5b5249'; x.fillRect(0, 0, size, size);
  const rng = makeRng(77);
  const bh = size / 10, bw = size / 5;
  for (let row = 0; row < 10; row++) {
    for (let col = -1; col < 6; col++) {
      const off = row % 2 ? bw / 2 : 0;
      const bx = col * bw + off + 2, by = row * bh + 2;
      const r = 118 + rng() * 52, g = 82 + rng() * 34, b = 68 + rng() * 26;
      x.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      x.fillRect(bx, by, bw - 4, bh - 4);
      // variação interna
      x.fillStyle = `rgba(0,0,0,${0.05 + rng() * 0.13})`;
      x.fillRect(bx, by + bh * 0.6, bw - 4, bh * 0.4 - 4);
      for (let k = 0; k < 8; k++) {
        x.fillStyle = `rgba(${rng() > 0.5 ? '20,18,16' : '150,140,120'},${rng() * 0.12})`;
        x.fillRect(bx + rng() * (bw - 8), by + rng() * (bh - 8), 4 + rng() * 10, 2 + rng() * 6);
      }
    }
  }
  // fuligem
  for (let i = 0; i < 30; i++) {
    const cx = rng() * size, cy = rng() * size, r = 20 + rng() * 80;
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, 'rgba(10,10,10,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  return c;
}

export function rustMetal(size = 256) {
  const c = canvas(size), x = c.getContext('2d');
  const n = makeNoise(31);
  const img = x.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) {
    const px = i % size, py = (i / size) | 0;
    const f = n.fbm(px / 18, py / 18, 4);
    let v = 104 + f * 40;
    const rust = clamp(f * 1.6 + 0.25, 0, 1);
    d[i * 4] = v * (0.9 + rust * 0.75);
    d[i * 4 + 1] = v * (0.95 - rust * 0.28);
    d[i * 4 + 2] = v * (1.0 - rust * 0.5);
    d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const rng = makeRng(5);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(${rng() > 0.5 ? '120,58,24' : '30,26,22'},${rng() * 0.25})`;
    x.beginPath(); x.arc(rng() * size, rng() * size, 2 + rng() * 12, 0, Math.PI * 2); x.fill();
  }
  return c;
}

export function wood(size = 256) {
  const c = canvas(size), x = c.getContext('2d');
  const n = makeNoise(57);
  const img = x.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) {
    const px = i % size, py = (i / size) | 0;
    const grain = Math.sin((px * 0.09) + n.fbm(px / 40, py / 12, 3) * 7) * 0.5 + 0.5;
    const v = 62 + grain * 36 + n.noise(px / 6, py / 30) * 14;
    d[i * 4] = v * 1.45; d[i * 4 + 1] = v * 0.95; d[i * 4 + 2] = v * 0.6; d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

export function grass(size = 512) {
  const c = canvas(size), x = c.getContext('2d');
  const n = makeNoise(91);
  const img = x.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) {
    const px = i % size, py = (i / size) | 0;
    const f = n.fbm(px / 24, py / 24, 5);
    const v = 74 + f * 34 + (Math.random() - 0.5) * 26;
    d[i * 4] = v * 0.72; d[i * 4 + 1] = v * 0.74; d[i * 4 + 2] = v * 0.50; d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const rng = makeRng(9);
  for (let i = 0; i < 7000; i++) {
    const px = rng() * size, py = rng() * size;
    x.strokeStyle = `rgba(${70 + rng() * 60},${80 + rng() * 50},${40 + rng() * 30},${0.12 + rng() * 0.25})`;
    x.lineWidth = 1;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rng() - 0.5) * 3, py - 2 - rng() * 4); x.stroke();
  }
  for (let i = 0; i < 24; i++) {
    const cx = rng() * size, cy = rng() * size, r = 10 + rng() * 60;
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, 'rgba(40,32,18,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  return c;
}

export function bloodSplat(size = 256) {
  const c = canvas(size), x = c.getContext('2d');
  x.clearRect(0, 0, size, size);
  const rng = makeRng(3);
  const cx = size / 2, cy = size / 2;
  for (let i = 0; i < 90; i++) {
    const a = rng() * Math.PI * 2, r = Math.pow(rng(), 0.6) * size * 0.42;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    const s = 4 + rng() * 22 * (1 - r / (size * 0.5));
    x.fillStyle = `rgba(${60 + rng() * 40},${4 + rng() * 10},${6 + rng() * 8},${0.55 + rng() * 0.4})`;
    x.beginPath(); x.arc(px, py, s, 0, Math.PI * 2); x.fill();
  }
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2, r = size * 0.3 + rng() * size * 0.2;
    x.fillStyle = `rgba(70,6,8,${0.4 + rng() * 0.4})`;
    x.beginPath(); x.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.5 + rng() * 4, 0, Math.PI * 2); x.fill();
  }
  return c;
}

export function decalNoise(size = 128) {
  const c = canvas(size), x = c.getContext('2d');
  const n = makeNoise(63);
  const img = x.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) {
    const px = i % size, py = (i / size) | 0;
    const v = 150 + n.fbm(px / 10, py / 10, 4) * 90;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = clamp(v, 20, 255); d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

export function buildTextures() {
  const T = {};
  T.asphalt = toTex(asphalt(512), 18);
  T.asphaltBump = toTex(asphalt(256), 18, false);
  T.concrete = toTex(concrete(512, 0), 3);
  T.concrete2 = toTex(concrete(512, 5), 2.2);
  T.brick = toTex(brick(512), 2.4);
  T.brick2 = toTex(brick(512), 1.6);
  T.rust = toTex(rustMetal(256), 2);
  T.wood = toTex(wood(256), 2);
  T.grass = toTex(grass(512), 26);
  T.blood = new THREE.CanvasTexture(bloodSplat(256));
  T.blood.colorSpace = THREE.SRGBColorSpace;
  T.noise = toTex(decalNoise(128), 1, false);
  return T;
}
