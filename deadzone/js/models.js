/* DEADZONE — modelos de zumbis, humanos, veículos e objetos (procedurais) */
import * as THREE from '../assets/vendor/three.module.js';
import { mergeGeometries } from '../assets/vendor/addons/utils/BufferGeometryUtils.js';
import { makeRng, rand, clamp, pick } from './util.js';

const M = {};
function mat(key, color, rough = 0.85, metal = 0.0, extra = {}) {
  if (!M[key]) M[key] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  return M[key];
}
function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

/* ---------------- veículos abandonados (geometria fundida) ---------------- */
const CAR_COLORS = [0x5a2a22, 0x2b3a42, 0x3a3f36, 0x6b6154, 0x24262a, 0x4a4032, 0x7d7466, 0x33413a];

export function buildCarModel(variant = 0, colorHex = null, rng = Math.random) {
  const g = new THREE.Group();
  const color = colorHex ?? CAR_COLORS[(rng() * CAR_COLORS.length) | 0];
  const bodyM = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.45 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.15, metalness: 0.8, transparent: true, opacity: 0.55 });
  const tyreM = mat('tyre', 0x131314, 0.95, 0);
  const darkM = mat('carDark', 0x1a1b1d, 0.7, 0.4);
  const lightM = new THREE.MeshStandardMaterial({ color: 0xd9cfae, roughness: 0.25, metalness: 0.2, emissive: 0x100c04 });

  const long = 4.3 + rng() * 0.5, wide = 1.85, tall = 0.62;
  const isSuv = variant === 1;
  const bodyY = isSuv ? 0.78 : 0.62;

  // chassi/corpo
  const body = box(wide, tall, long, bodyM, 0, bodyY, 0);
  g.add(body);
  const lower = box(wide - 0.06, 0.36, long - 0.2, darkM, 0, bodyY - 0.4, 0);
  g.add(lower);

  // cabine
  const cabH = isSuv ? 0.85 : 0.66;
  const cabL = isSuv ? long * 0.56 : long * 0.48;
  const cab = box(wide - 0.16, cabH, cabL, bodyM, 0, bodyY + tall / 2 + cabH / 2 - 0.04, isSuv ? -0.15 : -0.05);
  g.add(cab);
  const glass = box(wide - 0.1, cabH * 0.62, cabL - 0.06, glassM, 0, bodyY + tall / 2 + cabH * 0.5 - 0.03, isSuv ? -0.15 : -0.05);
  g.add(glass);

  // rodas
  const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 12);
  wg.rotateZ(Math.PI / 2);
  const wheelPos = [[-wide / 2 + 0.1, 0.36, long * 0.32], [wide / 2 - 0.1, 0.36, long * 0.32], [-wide / 2 + 0.1, 0.36, -long * 0.32], [wide / 2 - 0.1, 0.36, -long * 0.32]];
  const flat = rng() > 0.7;
  wheelPos.forEach((p, i) => {
    const w = new THREE.Mesh(wg, tyreM);
    w.position.set(...p);
    if (flat && i === 1) { w.scale.y = 0.7; w.position.y = 0.28; }
    g.add(w);
  });

  // faróis e grade
  g.add(box(wide - 0.3, 0.12, 0.06, lightM, 0, bodyY + 0.1, long / 2 + 0.02));
  g.add(box(wide - 0.3, 0.1, 0.05, lightM, 0, bodyY + 0.1, -long / 2 - 0.02));
  g.add(box(wide - 0.5, 0.2, 0.1, darkM, 0, bodyY - 0.18, long / 2 + 0.01));
  // para-choques
  g.add(box(wide, 0.16, 0.14, darkM, 0, bodyY - 0.32, long / 2 - 0.02));
  g.add(box(wide, 0.16, 0.14, darkM, 0, bodyY - 0.32, -long / 2 + 0.02));
  // retrovisores
  g.add(box(0.16, 0.1, 0.12, bodyM, -wide / 2 - 0.04, bodyY + tall / 2, long * 0.16));
  g.add(box(0.16, 0.1, 0.12, bodyM, wide / 2 + 0.04, bodyY + tall / 2, long * 0.16));

  mergeByMaterial(g);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/* funde meshes estáticos por material: reduz drasticamente o nº de draw calls */
export function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  const toRemove = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    if (o.userData.noMerge) return;
    if (Array.isArray(o.material)) return;
    o.updateWorldMatrix(true, false);
    const key = o.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [], parent: o.parent, cast: o.castShadow, recv: o.receiveShadow });
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    // normaliza atributos para permitir merge (só posição/normal/uv)
    for (const name of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) {
      const count = geo.attributes.position.count;
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    geo.morphAttributes = {};
    buckets.get(key).geos.push(geo);
    toRemove.push(o);
  });
  // remove todos os originais (que estavam no espaço local do grupo)
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  toRemove.forEach(o => { if (o.parent) o.parent.remove(o); });
  buckets.forEach(({ mat, geos, cast, recv }) => {
    let merged = null;
    try {
      merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    } catch (e) { merged = null; }
    if (!merged) return;
    merged.applyMatrix4(inv);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = cast; mesh.receiveShadow = recv;
    group.add(mesh);
  });
  // descarta grupos vazios
  const empties = [];
  group.traverse(o => { if (o !== group && !o.isMesh && o.children.length === 0) empties.push(o); });
  empties.forEach(o => o.parent && o.parent.remove(o));
  return group;
}

/* ---------------- postes, barris, caixas, sacos, muros ---------------- */
export function buildBarrel(rng = Math.random) {
  const g = new THREE.Group();
  const rust = mat('rustBarrel', 0x6a3b22, 0.85, 0.3);
  const top = mat('rustBarrelTop', 0x4a3020, 0.9, 0.2);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.95, 14), rust);
  b.position.y = 0.48; g.add(b);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.05, 14), top);
  lid.position.y = 0.96; g.add(lid);
  for (const y of [0.2, 0.5, 0.8]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.02, 5, 14), top);
    r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r);
  }
  mergeByMaterial(g);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildCrate(size = 0.8, rng = Math.random) {
  const m = mat('crate', 0x6b4f2e, 0.9, 0.05);
  const m2 = mat('crateDark', 0x4a3520, 0.95, 0.05);
  const g = new THREE.Group();
  g.add(box(size, size, size, m, 0, size / 2, 0));
  g.add(box(size * 1.02, size * 0.1, size * 1.02, m2, 0, size * 0.85, 0));
  g.add(box(size * 1.02, size * 0.1, size * 1.02, m2, 0, size * 0.15, 0));
  mergeByMaterial(g);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildSandbag(rng = Math.random) {
  const m = mat('sandbag', 0x7a6a4c, 0.98, 0);
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 4, 8), m);
    b.rotation.z = Math.PI / 2;
    b.rotation.y = rand(-0.1, 0.1);
    b.position.set(0, 0.19 + i * 0.28, (i % 2) * 0.06);
    b.scale.set(1, 1, 0.9);
    g.add(b);
  }
  mergeByMaterial(g);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildLampPost() {
  const g = new THREE.Group();
  const m = mat('lampMetal', 0x2b2e30, 0.7, 0.6);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.6, 8), m);
  pole.position.y = 2.8; g.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), m);
  arm.rotation.z = Math.PI / 2.3; arm.position.set(0.5, 5.5, 0); g.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.26), m);
  head.position.set(0.95, 5.68, 0); g.add(head);
  const bulbM = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb35c, emissiveIntensity: 1.6, roughness: 0.4 });
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.18), bulbM);
  bulb.position.set(0.95, 5.6, 0); g.add(bulb);
  mergeByMaterial(g);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildTrafficCone() {
  const g = new THREE.Group();
  const orange = mat('coneOrange', 0xa8451e, 0.9, 0);
  const white = mat('coneWhite', 0xc9c4b6, 0.9, 0);
  const base = box(0.42, 0.05, 0.42, orange, 0, 0.025, 0); g.add(base);
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 10), orange);
  c.position.y = 0.32; g.add(c);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.135, 0.09, 10), white);
  band.position.y = 0.38; g.add(band);
  mergeByMaterial(g);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildTyre() {
  const g = new THREE.Group();
  const m = mat('tyre', 0x131314, 0.95, 0);
  const t = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.13, 6, 14), m);
  t.rotation.x = Math.PI / 2; t.position.y = 0.13; g.add(t);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 12), mat('rim', 0x4a4c50, 0.5, 0.8));
  rim.position.y = 0.13; g.add(rim);
  mergeByMaterial(g);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildDumpster() {
  const g = new THREE.Group();
  const m = mat('dumpster', 0x2f4a38, 0.85, 0.35);
  const m2 = mat('dumpsterDark', 0x1f3226, 0.9, 0.3);
  g.add(box(1.8, 1.1, 1.1, m, 0, 0.72, 0));
  g.add(box(1.86, 0.1, 1.16, m2, 0, 1.3, 0));
  for (const x of [-0.7, 0.7]) for (const z of [-0.4, 0.4]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8), m2);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.1, z); g.add(w);
  }
  mergeByMaterial(g);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildRoadSign(text = 'STOP') {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.4, 6), mat('signPole', 0x5c5f63, 0.6, 0.7));
  pole.position.y = 1.2; g.add(pole);
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#0f3b2e'; x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#d8d4c2'; x.lineWidth = 6; x.strokeRect(8, 8, 240, 112);
  x.fillStyle = '#e7e3d2'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center';
  x.fillText(text, 128, 55); x.font = 'bold 22px sans-serif'; x.fillStyle = '#b9b5a4';
  x.fillText('ZONA DE QUARENTENA', 128, 92);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const signM = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.2 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.04), signM);
  sign.position.y = 2.0; g.add(sign);
  mergeByMaterial(g);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/* ---------------- tecido procedural (compartilhado) ---------------- */
let FABRIC_TEX = null;
function fabricTexture() {
  if (FABRIC_TEX) return FABRIC_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, 128, 128);
  const rng = makeRng(991);
  for (let i = 0; i < 128; i += 2) {
    x.fillStyle = `rgba(0,0,0,${0.06 + rng() * 0.05})`;
    x.fillRect(0, i, 128, 1);
    x.fillStyle = `rgba(255,255,255,${0.04 + rng() * 0.04})`;
    x.fillRect(i, 0, 1, 128);
  }
  for (let i = 0; i < 70; i++) {
    const cx = rng() * 128, cy = rng() * 128, r = 4 + rng() * 20;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(0,0,0,${0.04 + rng() * 0.1})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  // manchas de sujeira
  for (let i = 0; i < 22; i++) {
    const cx = rng() * 128, cy = rng() * 128, r = 3 + rng() * 12;
    x.fillStyle = `rgba(${40 + rng() * 30},${28 + rng() * 20},${20 + rng() * 16},${0.12 + rng() * 0.2})`;
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  FABRIC_TEX = new THREE.CanvasTexture(c);
  FABRIC_TEX.wrapS = FABRIC_TEX.wrapT = THREE.RepeatWrapping;
  FABRIC_TEX.repeat.set(2, 2);
  FABRIC_TEX.colorSpace = THREE.SRGBColorSpace;
  return FABRIC_TEX;
}

/* ---------------- zumbis ---------------- */
const Z_TYPES = {
  walker: { scale: 1.0, speed: 1.15, hp: 100, torso: 0x5c6052, skin: 0x8a9270, mass: 1 },
  runner: { scale: 0.94, speed: 2.6, hp: 72, torso: 0x4a3a34, skin: 0x9a8f6a, mass: 0.85 },
  brute: { scale: 1.42, speed: 0.85, hp: 460, torso: 0x3d3f3a, skin: 0x6f7a5c, mass: 3 }
};

function makeZombieTextures(rngSeed, type) {
  // pele: manchas, veias, palidez
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const rng = makeRng(rngSeed);
  x.fillStyle = type === 'brute' ? '#77836b' : type === 'runner' ? '#8e8a6c' : '#8a9578';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const cx = rng() * 256, cy = rng() * 256, r = 2 + rng() * 16;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const kind = rng();
    if (kind < 0.4) g.addColorStop(0, `rgba(${70 + rng() * 30},${20 + rng() * 20},${18 + rng() * 14},${0.2 + rng() * 0.4})`);
    else if (kind < 0.7) g.addColorStop(0, `rgba(40,44,32,${0.2 + rng() * 0.35})`);
    else g.addColorStop(0, `rgba(${130 + rng() * 50},${120 + rng() * 40},${90 + rng() * 30},${0.1 + rng() * 0.25})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  // veias
  x.strokeStyle = 'rgba(50,30,40,0.35)';
  for (let i = 0; i < 26; i++) {
    x.lineWidth = 0.6 + rng() * 1.4;
    x.beginPath();
    let px = rng() * 256, py = rng() * 256;
    x.moveTo(px, py);
    for (let k = 0; k < 7; k++) { px += (rng() - 0.5) * 26; py += (rng() - 0.5) * 26; x.lineTo(px, py); }
    x.stroke();
  }
  // feridas
  for (let i = 0; i < 7; i++) {
    const cx = rng() * 256, cy = rng() * 256, r = 4 + rng() * 11;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(96,14,16,0.7)'); g.addColorStop(0.6, 'rgba(62,14,12,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

export function buildZombieMesh(type = 'walker', seed = 1) {
  const conf = Z_TYPES[type] || Z_TYPES.walker;
  const rng = makeRng(seed * 7919 + 13);
  const skinTex = makeZombieTextures(seed * 31 + (type === 'brute' ? 500 : type === 'runner' ? 200 : 0), type);
  const skin = new THREE.MeshStandardMaterial({ map: skinTex, color: 0x8f967e, roughness: 0.98, metalness: 0.0 });
  const shirtColors = [0x4a4c4a, 0x5a4a3c, 0x3f4a52, 0x5c4640, 0x474f41, 0x645646, 0x3d4145];
  const fab = fabricTexture();
  const shirt = new THREE.MeshStandardMaterial({ color: pick(shirtColors), roughness: 0.96, map: fab });
  const pants = new THREE.MeshStandardMaterial({ color: pick([0x393d44, 0x443e34, 0x2f3b3b, 0x4a453c]), roughness: 0.97, map: fab });
  const hair = new THREE.MeshStandardMaterial({ color: pick([0x1a1512, 0x2c2119, 0x3d332a, 0x141312]), roughness: 1 });
  const eyeM = new THREE.MeshStandardMaterial({ color: 0xe8f0c8, emissive: 0xc8e860, emissiveIntensity: 1.5, roughness: 0.25 });
  const mouthM = new THREE.MeshStandardMaterial({ color: 0x2a0a0a, roughness: 0.8 });
  const bloodM = new THREE.MeshStandardMaterial({ color: 0x5c0a0c, roughness: 0.6 });

  const root = new THREE.Group();
  const body = new THREE.Group(); // pivô para tombos
  body.position.y = 0;
  root.add(body);

  const S = conf.scale;
  const bone = (w, h, d, m, px, py, pz) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m);
    mesh.position.set(px * S, py * S, pz * S);
    mesh.castShadow = true;
    return mesh;
  };

  // torso (2 segmentos para dobrar)
  const torso = new THREE.Group();
  torso.position.y = 1.18 * S;
  body.add(torso);
  const chest = bone(0.44, 0.48, 0.26, shirt, 0, 0.2, 0);
  torso.add(chest);
  const belly = bone(0.4, 0.26, 0.24, shirt, 0, -0.09, 0);
  torso.add(belly);
  // costelas expostas
  if (rng() > 0.4) {
    const rib = bone(0.2, 0.18, 0.05, bloodM, 0.12, 0.14, 0.14);
    torso.add(rib);
  }
  // pescoço + cabeça
  const head = new THREE.Group();
  head.position.set(0, 0.52, 0.01);
  torso.add(head);
  const neck = bone(0.14, 0.12, 0.14, skin, 0, -0.06, 0);
  head.add(neck);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.132 * S, 12, 10), skin);
  skull.scale.set(0.88, 1.02, 0.98);
  skull.position.y = 0.085 * S;
  skull.castShadow = true;
  head.add(skull);
  // testa/pescoço mais escuros
  const brow = box(0.2, 0.05, 0.06, new THREE.MeshStandardMaterial({ color: 0x4a5240, roughness: 1 }), 0, 0.15 * S, 0.1 * S);
  head.add(brow);
  const socketM = new THREE.MeshStandardMaterial({ color: 0x2a2f26, roughness: 1 });
  for (const sx of [-0.058, 0.058]) head.add(box(0.075, 0.055, 0.02, socketM, sx * S, 0.105 * S, 0.125 * S));
  const jaw = bone(0.16, 0.1, 0.14, skin, 0, -0.02, 0.045);
  jaw.rotation.x = 0.15;
  head.add(jaw);
  const mouth = bone(0.11, 0.055, 0.02, mouthM, 0, 0.01, 0.16);
  head.add(mouth);
  if (rng() > 0.32) head.add(bone(0.19, 0.085, 0.19, hair, 0, 0.185, -0.012));
  if (rng() > 0.7) head.add(bone(0.15, 0.16, 0.09, hair, 0, 0.09, -0.11));
  // olhos
  for (const sx of [-0.055, 0.055]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.026 * S, 7, 6), eyeM);
    e.position.set(sx * S, 0.102 * S, 0.132 * S);
    head.add(e);
  }

  // braços (ombro -> cotovelo -> mão)
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.27 * S, 0.3 * S, 0);
    torso.add(shoulder);
    const upper = bone(0.125, 0.42, 0.125, shirt, 0, -0.2, 0);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.4 * S, 0);
    shoulder.add(elbow);
    const fore = bone(0.105, 0.38, 0.105, skin, 0, -0.18, 0);
    elbow.add(fore);
    const hand = bone(0.14, 0.14, 0.1, skin, 0, -0.4, 0);
    elbow.add(hand);
    // unhas/dedo
    const fingers = bone(0.12, 0.1, 0.04, bloodM, 0, -0.47, -0.01);
    elbow.add(fingers);
    arms.push({ shoulder, elbow, side });
  }

  // pernas
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.13 * S, 1.02 * S, 0);
    body.add(hip);
    const thigh = bone(0.17, 0.48, 0.18, pants, 0, -0.24, 0);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.set(0, -0.48 * S, 0);
    hip.add(knee);
    const shin = bone(0.15, 0.46, 0.15, pants, 0, -0.23, 0);
    knee.add(shin);
    const foot = bone(0.19, 0.11, 0.3, mat('shoe', 0x1b1b1c, 0.9, 0), 0, -0.46, 0.05);
    knee.add(foot);
    legs.push({ hip, knee, side });
  }

  body.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // marcadores de dano
  const headMarker = new THREE.Object3D(); headMarker.position.y = 0.2 * S; head.add(headMarker);
  const torsoMarker = new THREE.Object3D(); torso.add(torsoMarker);

  return { root, body, torso, head, arms, legs, headMarker, torsoMarker, conf, S, jaw, mouth };
}

/* ---------------- humano (sobrevivente NPC) ---------------- */
export function buildHumanMesh(seed = 1, outfit = {}) {
  const rng = makeRng(seed);
  const fab = fabricTexture();
  const skin = new THREE.MeshStandardMaterial({ color: 0xb08060, roughness: 0.72 });
  const shirt = new THREE.MeshStandardMaterial({ color: outfit.shirt ?? 0x46603f, roughness: 0.88, map: fab });
  const pants = new THREE.MeshStandardMaterial({ color: outfit.pants ?? 0x2f3439, roughness: 0.92, map: fab });
  const vest = new THREE.MeshStandardMaterial({ color: 0x2e3a2c, roughness: 0.78, metalness: 0.12 });
  const boot = new THREE.MeshStandardMaterial({ color: 0x1c1c1d, roughness: 0.9 });
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  // cintura + quadril (dá silhueta de pessoa, não de boneco de blocos)
  const torso = new THREE.Group(); torso.position.y = 1.16; body.add(torso);
  torso.add(box(0.38, 0.24, 0.24, shirt, 0, -0.12, 0));
  const chest = box(0.46, 0.5, 0.27, shirt, 0, 0.14, 0); torso.add(chest);
  torso.add(box(0.49, 0.36, 0.3, vest, 0, 0.13, 0));           // colete
  torso.add(box(0.4, 0.12, 0.31, vest, 0, -0.05, 0));          // cinto tático
  const strap = box(0.1, 0.44, 0.31, vest, 0.12, 0.16, 0); strap.rotation.z = 0.22; torso.add(strap);
  // mochila
  torso.add(box(0.34, 0.4, 0.16, new THREE.MeshStandardMaterial({ color: 0x3a3a2e, roughness: 0.95 }), 0, 0.16, -0.2));
  const head = new THREE.Group(); head.position.y = 0.52; torso.add(head);
  const neck = box(0.13, 0.1, 0.13, skin, 0, 0.0, 0); head.add(neck);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.128, 14, 12), skin);
  skull.position.y = 0.11; skull.scale.set(0.92, 1.06, 1.02); head.add(skull);
  // maxilar e nariz
  head.add(box(0.13, 0.07, 0.06, skin, 0, 0.055, 0.1));
  head.add(box(0.035, 0.045, 0.04, skin, 0, 0.095, 0.125));
  // cabelo / boné
  const hairM = new THREE.MeshStandardMaterial({ color: pick([0x2b2118, 0x3d2f22, 0x1e1a16, 0x4a3a28]), roughness: 0.95 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
  cap.position.y = 0.135; cap.scale.set(0.98, 1.0, 1.02); head.add(cap);
  if (rng() > 0.5) head.add(box(0.2, 0.02, 0.13, hairM, 0, 0.132, 0.14)); // aba do boné
  // óculos de sol
  head.add(box(0.19, 0.045, 0.02, new THREE.MeshStandardMaterial({ color: 0x0b0d0e, roughness: 0.25, metalness: 0.6 }), 0, 0.112, 0.122));
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(side * 0.28, 0.3, 0); torso.add(shoulder);
    shoulder.add(box(0.125, 0.34, 0.125, shirt, 0, -0.16, 0));
    const elbow = new THREE.Group(); elbow.position.y = -0.32; shoulder.add(elbow);
    elbow.add(box(0.105, 0.3, 0.105, skin, 0, -0.14, 0));
    elbow.add(box(0.1, 0.09, 0.1, vest, 0, -0.28, 0));   // luva
    arms.push({ shoulder, elbow, side });
  }
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(side * 0.12, 1.02, 0); body.add(hip);
    hip.add(box(0.165, 0.46, 0.17, pants, 0, -0.23, 0));
    const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
    knee.add(box(0.15, 0.42, 0.155, pants, 0, -0.21, 0));
    knee.add(box(0.17, 0.11, 0.26, boot, 0, -0.42, 0.045));
    legs.push({ hip, knee, side });
  }
  body.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, body, torso, head, arms, legs };
}

/* ---------------- caixas de suprimentos / itens ---------------- */
export function buildPickupMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'ammo') {
    const m = new THREE.MeshStandardMaterial({ color: 0x3d4a2a, roughness: 0.7, metalness: 0.35 });
    g.add(box(0.38, 0.22, 0.24, m, 0, 0.12, 0));
    const yellow = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.5, metalness: 0.4 });
    g.add(box(0.12, 0.23, 0.25, yellow, 0, 0.12, 0));
    g.add(box(0.3, 0.03, 0.26, yellow, 0, 0.23, 0));
  } else if (kind === 'health') {
    const m = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.65 });
    g.add(box(0.32, 0.24, 0.22, m, 0, 0.13, 0));
    const red = new THREE.MeshStandardMaterial({ color: 0xb02020, roughness: 0.5 });
    g.add(box(0.18, 0.06, 0.235, red, 0, 0.13, 0));
    g.add(box(0.06, 0.18, 0.235, red, 0, 0.13, 0));
  } else if (kind === 'armor') {
    const m = new THREE.MeshStandardMaterial({ color: 0x2a3e44, roughness: 0.55, metalness: 0.5 });
    g.add(box(0.4, 0.36, 0.18, m, 0, 0.2, 0));
    g.add(box(0.2, 0.12, 0.2, m, 0, 0.4, 0));
  } else if (kind === 'weapon') {
    const m = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.8 });
    g.add(box(0.5, 0.16, 0.26, m, 0, 0.1, 0));
    const metal = new THREE.MeshStandardMaterial({ color: 0x50555a, metalness: 0.9, roughness: 0.35 });
    g.add(box(0.34, 0.06, 0.1, metal, 0, 0.2, 0));
  } else if (kind === 'grenade') {
    const m = new THREE.MeshStandardMaterial({ color: 0x2f3a2a, roughness: 0.8, metalness: 0.3 });
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), m); s.position.y = 0.12; s.scale.y = 1.2; g.add(s);
    g.add(box(0.05, 0.06, 0.05, mat('grenMetal', 0x777c66, 0.5, 0.7), 0, 0.25, 0));
  } else if (kind === 'intel') {
    const m = new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.5, metalness: 0.6, emissive: 0x0a2a3a, emissiveIntensity: 1.2 });
    g.add(box(0.34, 0.22, 0.05, m, 0, 0.14, 0));
    const glow = new THREE.MeshStandardMaterial({ color: 0x60e0ff, emissive: 0x40c0e0, emissiveIntensity: 2.5, roughness: 0.2 });
    g.add(box(0.2, 0.1, 0.06, glow, 0, 0.14, 0));
  }
  // halo de brilho no chão
  const haloM = new THREE.MeshBasicMaterial({ color: kind === 'health' ? 0xff5040 : kind === 'intel' ? 0x50d8ff : kind === 'armor' ? 0x50b0ff : 0xffc040, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.55, 16), haloM);
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.03;
  g.add(halo);
  g.userData.halo = halo;
  g.traverse(o => { if (o.isMesh && o !== halo) { o.castShadow = true; } });
  return g;
}
