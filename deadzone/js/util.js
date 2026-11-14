/* DEADZONE — utilitários, matemática, geração procedural */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const sign = (v) => (v < 0 ? -1 : 1);
export const rad = (deg) => (deg * Math.PI) / 180;
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
export const now = () => performance.now();
export const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60), r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
};
export const fmtNum = (n) => Math.round(n).toLocaleString('pt-BR');

export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export const dampAngle = (cur, target, lambda, dt) => cur + angDiff(cur, target) * (1 - Math.exp(-lambda * dt));

/* PRNG determinístico (mulberry32) */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ruído de valor 2D simples, para alturas de terreno e texturas */
export function makeNoise(seed = 1337) {
  const rng = makeRng(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grid = (h, x, y) => {
    const a = (perm[x & 255] + y) & 255;
    return (perm[a] / 255) * 2 - 1;
  };
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const n00 = grid(0, xi, yi), n10 = grid(0, xi + 1, yi);
    const n01 = grid(0, xi, yi + 1), n11 = grid(0, xi + 1, yi + 1);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
  }
  function fbm(x, y, oct = 4, lac = 2.03, gain = 0.5) {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += noise(x * f, y * f) * amp; norm += amp; amp *= gain; f *= lac; }
    return s / norm;
  }
  return { noise, fbm };
}

/* AABB colisão 2D */
export function circleRect(cx, cz, r, rect) {
  const nx = clamp(cx, rect.x0, rect.x1), nz = clamp(cz, rect.z0, rect.z1);
  const dx = cx - nx, dz = cz - nz;
  return dx * dx + dz * dz < r * r;
}
export function circleCircle(ax, az, ar, bx, bz, br) {
  const dx = ax - bx, dz = az - bz, rr = ar + br;
  return dx * dx + dz * dz < rr * rr;
}

/* pool de objetos leve */
export class Pool {
  constructor(factory, reset, size = 0) {
    this.factory = factory; this.reset = reset; this.free = []; this.live = [];
  }
  get(...args) {
    const o = this.free.pop() || this.factory();
    o._alive = true; this.live.push(o);
    this.reset(o, ...args);
    return o;
  }
  release(o) { o._alive = false; }
  sweep() {
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (!this.live[i]._alive) { this.free.push(this.live[i]); this.live.splice(i, 1); }
    }
  }
}

export function formatInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

export function hexToRgb(h) {
  const v = parseInt(h.replace('#', ''), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
