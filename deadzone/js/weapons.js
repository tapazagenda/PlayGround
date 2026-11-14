/* DEADZONE — armas: modelos 3D procedurais, viewmodel animado, balística */
import * as THREE from '../assets/vendor/three.module.js';
import { clamp, lerp, rand, TAU } from './util.js';

export const WEAPONS = {
  knife: {
    id: 'knife', name: 'FACA DE COMBATE', short: 'FACA', type: 'melee', icon: '🔪',
    damage: 34, headMult: 2, rpm: 130, magSize: 0, reserveMax: 0,
    spread: 0, recoil: 0.4, range: 2.4, auto: true, reloadTime: 0,
    zoom: 1.15, mobility: 1.12, sound: 'pistol', slot: 5,
    desc: 'Silenciosa. Não precisa de munição. Eficaz contra infectados lentos.'
  },
  pistol: {
    id: 'pistol', name: 'PISTOLA M9', short: 'M9', type: 'gun', icon: '🔫',
    damage: 26, headMult: 2.2, rpm: 320, magSize: 15, reserveMax: 90,
    spread: 0.012, recoil: 1.4, range: 60, auto: false, reloadTime: 1.55,
    zoom: 1.25, mobility: 1.08, sound: 'pistol', slot: 1, tracer: 0xffd8a0,
    falloff: 0.72, desc: 'Confiável, munição leve. Nunca fica sem lugar na mochila.'
  },
  smg: {
    id: 'smg', name: 'SUBMETRALHADORA MP5', short: 'MP5', type: 'gun', icon: '🔫',
    damage: 18, headMult: 1.9, rpm: 780, magSize: 32, reserveMax: 240,
    spread: 0.026, recoil: 1.0, range: 45, auto: true, reloadTime: 2.0,
    zoom: 1.3, mobility: 1.02, sound: 'smg', slot: 2, tracer: 0xffe0b0,
    falloff: 0.6, desc: 'Cadência alta, controle médio. Boa para hordas próximas.'
  },
  rifle: {
    id: 'rifle', name: 'FUZIL AK-74', short: 'AK', type: 'gun', icon: '🔫',
    damage: 34, headMult: 2.1, rpm: 600, magSize: 30, reserveMax: 210,
    spread: 0.017, recoil: 1.9, range: 90, auto: true, reloadTime: 2.25,
    zoom: 1.35, mobility: 0.96, sound: 'rifle', slot: 3, tracer: 0xffc870,
    falloff: 0.78, desc: 'O padrão do apocalipse. Dano e alcance equilibrados.'
  },
  shotgun: {
    id: 'shotgun', name: 'ESPINGARDA M870', short: 'M870', type: 'gun', icon: '🔫',
    damage: 16, pellets: 9, headMult: 1.5, rpm: 78, magSize: 6, reserveMax: 48,
    spread: 0.085, recoil: 4.2, range: 26, auto: false, reloadTime: 2.9,
    zoom: 1.15, mobility: 0.9, sound: 'shotgun', slot: 4, tracer: 0xffb060,
    falloff: 0.42, desc: 'Devastadora de perto. Cada bombeada recarrega o cano.'
  },
  sniper: {
    id: 'sniper', name: 'SNIPER SVD', short: 'SVD', type: 'gun', icon: '🎯',
    damage: 145, headMult: 2.6, rpm: 45, magSize: 10, reserveMax: 50,
    spread: 0.0015, recoil: 5.5, range: 240, auto: false, reloadTime: 3.1,
    zoom: 4.2, mobility: 0.82, sound: 'sniper', slot: 6, tracer: 0xfff0c0,
    falloff: 0.95, desc: 'Um tiro, um silêncio. Ideal para o brutamontes à distância.'
  }
};

/* ------------------------------------------------------------------ */
/*  Construtores de modelos procedurais                                */
/* ------------------------------------------------------------------ */
const MAT = {};
function mat(key, color, rough, metal) {
  if (!MAT[key]) MAT[key] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  return MAT[key];
}

function box(w, h, d, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
}
function cyl(r1, r2, h, m, seg = 12) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
}
/* cilindro deitado no eixo Z, com posição */
function barrel(r, h, m, x, y, z, seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return new THREE.Mesh(g, m);
}

const GLOVE = new THREE.MeshStandardMaterial({ color: 0x2b2e30, roughness: 0.85, metalness: 0.05 });
const SLEEVE = new THREE.MeshStandardMaterial({ color: 0x2f3a2e, roughness: 0.95 });
const SKIN = new THREE.MeshStandardMaterial({ color: 0x6e4f39, roughness: 0.8 });

/* mão enluvada + antebraço apontando para trás/baixo (para fora da tela) */
function addHand(root, pos, mirror = false, scale = 1) {
  const g = new THREE.Group();
  g.position.copy(pos);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.065, 0.09), GLOVE);
  g.add(hand);
  const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.2), SLEEVE);
  wrist.position.set(mirror ? 0.03 : -0.03, -0.05, 0.13);
  wrist.rotation.set(0.5, mirror ? -0.2 : 0.2, mirror ? -0.25 : 0.25);
  g.add(wrist);
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.052, 0.045), SKIN);
  cuff.position.set(mirror ? 0.018 : -0.018, -0.032, 0.035);
  g.add(cuff);
  g.scale.setScalar(scale);
  root.add(g);
  return g;
}

function muzzleTip(obj, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  obj.add(o);
  return o;
}

export function buildWeaponModel(id) {
  const root = new THREE.Group();
  const dark = mat('gunDark', 0x4a5056, 0.48, 0.75);
  const black = mat('gunBlack', 0x2c3034, 0.45, 0.55);
  const wood = mat('gunWood', 0x5d3c22, 0.72, 0.04);
  const steel = mat('gunSteel', 0xbcc4cc, 0.26, 0.9);
  const blink = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, emissive: 0xff9a30, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.6 });
  let muzzle;

  if (id === 'pistol') {
    root.add(box(0.06, 0.075, 0.30, dark, 0, 0.045, -0.06));
    root.add(box(0.055, 0.045, 0.26, steel, 0, 0.1, -0.1));
    const grip = box(0.052, 0.16, 0.085, black, 0, -0.055, 0.03, 0.28, 0, 0);
    root.add(grip);
    root.add(box(0.02, 0.03, 0.05, steel, 0, 0.055, 0.09, -0.3, 0, 0));
    root.add(box(0.012, 0.012, 0.09, steel, 0, 0.128, -0.2));
    muzzle = muzzleTip(root, 0, 0.1, -0.24);
    root.userData.mag = box(0.045, 0.12, 0.06, black, 0, -0.07, 0.02, 0.2, 0, 0);
    root.add(root.userData.mag);
    addHand(root, new THREE.Vector3(0.005, -0.055, 0.035), false, 1.0);
    addHand(root, new THREE.Vector3(-0.045, -0.03, 0.02), true, 0.95);
  } else if (id === 'smg') {
    root.add(box(0.075, 0.09, 0.34, dark, 0, 0.04, -0.04));
    root.add(box(0.05, 0.05, 0.18, black, 0, 0.02, -0.28));
    root.add(box(0.048, 0.14, 0.07, black, 0, -0.07, -0.08, -0.12, 0, 0));
    root.add(box(0.05, 0.15, 0.08, black, 0, -0.06, 0.09, 0.2, 0, 0));
    root.add(box(0.045, 0.045, 0.16, steel, 0, 0.09, 0.16));
    root.add(box(0.03, 0.06, 0.05, steel, 0, 0.11, -0.02));
    root.add(box(0.012, 0.012, 0.1, steel, 0, 0.13, -0.2));
    muzzle = muzzleTip(root, 0, 0.02, -0.38);
    root.userData.mag = box(0.04, 0.16, 0.05, black, 0, -0.08, -0.04, 0.1, 0, 0);
    root.add(root.userData.mag);
    addHand(root, new THREE.Vector3(0.0, -0.06, 0.09), false, 1.0);
    addHand(root, new THREE.Vector3(-0.01, -0.045, -0.24), true, 0.95);
  } else if (id === 'rifle') {
    root.add(box(0.075, 0.1, 0.42, dark, 0, 0.04, -0.04));
    root.add(box(0.065, 0.08, 0.22, wood, 0, 0.035, 0.28));
    root.add(box(0.05, 0.06, 0.2, wood, 0, 0.02, -0.3));
    root.add(box(0.05, 0.14, 0.075, black, 0, -0.07, 0.13, 0.3, 0, 0));
    root.add(box(0.045, 0.16, 0.08, black, 0, -0.08, -0.05, 0.12, 0, 0));
    root.add(barrel(0.018, 0.3, steel, 0, 0.045, -0.36));
    root.add(box(0.014, 0.03, 0.24, steel, 0, 0.095, -0.12));
    root.add(box(0.024, 0.05, 0.06, black, 0, 0.12, -0.02));
    root.add(box(0.012, 0.012, 0.02, blink, 0, 0.105, 0.245));
    muzzle = muzzleTip(root, 0, 0.045, -0.52);
    root.userData.mag = box(0.04, 0.17, 0.05, black, 0, -0.1, -0.06, -0.15, 0, 0);
    root.add(root.userData.mag);
    addHand(root, new THREE.Vector3(0.0, -0.075, 0.135), false, 1.0);
    addHand(root, new THREE.Vector3(-0.005, -0.02, -0.28), true, 0.95);
  } else if (id === 'shotgun') {
    root.add(box(0.08, 0.1, 0.4, dark, 0, 0.03, 0));
    root.add(box(0.07, 0.085, 0.26, wood, 0, 0.02, 0.3));
    root.add(barrel(0.022, 0.5, steel, 0, 0.06, -0.36, 10));
    root.add(barrel(0.019, 0.42, black, 0, 0.015, -0.34, 10));
    root.add(box(0.06, 0.055, 0.2, wood, 0, 0.01, -0.22));
    root.add(box(0.05, 0.13, 0.075, black, 0, -0.07, 0.15, 0.25, 0, 0));
    muzzle = muzzleTip(root, 0, 0.06, -0.62);
    root.userData.pump = root.children[3];
    addHand(root, new THREE.Vector3(0.0, -0.075, 0.15), false, 1.0);
    addHand(root, new THREE.Vector3(0.0, -0.02, -0.24), true, 0.95);
  } else if (id === 'sniper') {
    root.add(box(0.07, 0.09, 0.5, dark, 0, 0.03, 0));
    root.add(box(0.065, 0.09, 0.3, wood, 0, 0.03, 0.4));
    root.add(barrel(0.016, 0.5, black, 0, 0.055, -0.48, 10));
    root.add(barrel(0.045, 0.3, black, 0, 0.125, -0.02, 12));
    root.add(barrel(0.05, 0.06, steel, 0, 0.125, -0.19, 12));
    root.add(barrel(0.05, 0.06, steel, 0, 0.125, 0.15, 12));
    root.add(box(0.05, 0.14, 0.075, black, 0, -0.07, 0.16, 0.3, 0, 0));
    root.add(box(0.04, 0.16, 0.06, black, 0, -0.09, 0.02, 0.1, 0, 0));
    root.add(box(0.012, 0.06, 0.06, steel, 0.04, 0.07, 0.06));
    muzzle = muzzleTip(root, 0, 0.055, -0.75);
    root.userData.mag = root.children[6];
    addHand(root, new THREE.Vector3(0.0, -0.08, 0.165), false, 1.0);
    addHand(root, new THREE.Vector3(0.0, -0.02, -0.3), true, 0.95);
  } else { // knife
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.28), steel);
    blade.position.set(0, 0.03, -0.2);
    root.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.09, 4), steel);
    tip.rotation.x = -Math.PI / 2; tip.position.set(0, 0.03, -0.37); root.add(tip);
    root.add(box(0.02, 0.06, 0.03, black, 0, 0.01, -0.06));
    root.add(box(0.03, 0.04, 0.13, black, 0, 0, 0.02));
    muzzle = muzzleTip(root, 0, 0.03, -0.4);
    addHand(root, new THREE.Vector3(0, -0.012, 0.03), false, 1.0);
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  root.userData.muzzle = muzzle;
  return root;
}

export function buildFlash() {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m);
  g.add(core);
  const star = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 5), m);
  star.rotation.x = -Math.PI / 2;
  star.position.z = -0.14;
  g.add(star);
  const star2 = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.16), m);
  star2.position.z = -0.08;
  g.add(star2);
  g.visible = false;
  return g;
}

/* ------------------------------------------------------------------ */
/*  Sistema de armas do jogador                                        */
/* ------------------------------------------------------------------ */
export class WeaponSystem {
  constructor(scene, camera, game) {
    this.scene = scene;
    this.camera = camera;
    this.game = game;
    this.viewRoot = new THREE.Group();  // preso à câmera
    this.camera.add(this.viewRoot);
    this.viewRoot.position.set(0.19, -0.21, -0.47);
    // luz dedicada ao viewmodel (garante leitura da arma)
    this.vmLight = new THREE.PointLight(0xffe6c8, 1.8, 3.0, 2);
    this.vmLight.position.set(0.1, 0.25, 0.35);
    this.camera.add(this.vmLight);
    this.viewRoot.scale.setScalar(1);

    this.models = {};
    this.current = 'pistol';
    this.flash = buildFlash();
    this.scene.add(this.flash);
    this.light = new THREE.PointLight(0xffb060, 0, 9, 2);
    this.scene.add(this.light);

    this.ammo = {};
    this.reloading = false; this.reloadT = 0; this.reloadTotal = 0;
    this.cooldown = 0; this.shotTimer = 0;
    this.kick = 0; this.kickRot = 0; this.swayX = 0; this.swayY = 0;
    this.bobT = 0; this.swayVel = new THREE.Vector2();
    this.aimAmount = 0;
    this.meleeT = 0;
    this.recoilPitch = 0; this.recoilYaw = 0;
    this.owned = ['knife', 'pistol'];
    this._buildAll();
    this.equip('pistol', true);
  }

  _buildAll() {
    // deslocamento traseiro: evita que a coronha encoste na câmera
    const REAR = { knife: -0.02, pistol: -0.05, smg: -0.08, rifle: -0.17, shotgun: -0.15, sniper: -0.17 };
    for (const id of Object.keys(WEAPONS)) {
      const m = buildWeaponModel(id);
      m.visible = false;
      m.position.set(0, 0, REAR[id] || 0);
      m.rotation.set(0.015, 0.055, 0.02);
      m.userData.rear = REAR[id] || 0;
      this.viewRoot.add(m);
      this.models[id] = m;
    }
  }

  reset() {
    this.owned = ['knife', 'pistol'];
    this.ammo = {
      pistol: { mag: WEAPONS.pistol.magSize, reserve: 30 },
      knife: { mag: 0, reserve: 0 },
      smg: { mag: 0, reserve: 0 }, rifle: { mag: 0, reserve: 0 },
      shotgun: { mag: 0, reserve: 0 }, sniper: { mag: 0, reserve: 0 }
    };
    this.reloading = false;
    this.cooldown = 0;
    for (const k in this.models) this.models[k].visible = false;
    this.equip('pistol', true);
  }

  get def() { return WEAPONS[this.current]; }
  get state() { return this.ammo[this.current]; }
  get isGun() { return this.def.type === 'gun'; }

  give(id, rounds = 0, mags = 0) {
    if (!WEAPONS[id]) return false;
    const isNew = !this.owned.includes(id);
    if (isNew) this.owned.push(id);
    if (rounds) this.ammo[id].reserve = Math.min(WEAPONS[id].reserveMax, this.ammo[id].reserve + rounds);
    if (isNew) this.ammo[id].mag = WEAPONS[id].magSize;
    if (mags) this.ammo[id].reserve = Math.min(WEAPONS[id].reserveMax, this.ammo[id].reserve + mags * WEAPONS[id].magSize);
    if (this.game.hud) this.game.hud.showWeapon(true);
    return isNew;
  }

  hasAmmo(id = this.current) {
    const w = WEAPONS[id]; const s = this.ammo[id];
    if (w.type !== 'gun') return true;
    return s.mag > 0 || s.reserve > 0;
  }

  equip(id, silent = false) {
    if (!this.owned.includes(id) || !WEAPONS[id]) return;
    if (this.current === id && !silent) return;
    this.current = id;
    this.reloading = false;
    for (const k in this.models) this.models[k].visible = (k === id);
    if (!silent) this.game.audio.blip(320, 0.05, 'sine', 0.06);
    if (this.game.hud && this.game.weapons === this) { this.game.hud.updateAmmo(); this.game.hud.updateWeaponSlots(id); }
  }

  cycle(dir = 1) {
    if (this.owned.length < 2) return;
    const idx = this.owned.indexOf(this.current);
    const next = this.owned[(idx + dir + this.owned.length) % this.owned.length];
    this.equip(next);
  }

  startReload() {
    const w = this.def; const s = this.state;
    if (w.type !== 'gun' || this.reloading) return;
    if (s.mag >= w.magSize || s.reserve <= 0) return;
    this.reloading = true;
    this.reloadTotal = w.reloadTime * (this.current === 'shotgun' ? 1 : 1);
    this.reloadT = this.reloadTotal;
    this.game.audio.reload(1);
    this.game.hud.showReload(true, this.reloadTotal);
    if (this.current === 'shotgun') this._shellReload();
  }

  _shellReload() {
    // recarga shell-by-shell animada
    this._shellTimer = setInterval(() => {
      if (!this.reloading || this.current !== 'shotgun') { clearInterval(this._shellTimer); return; }
      const s = this.state;
      s.mag = Math.min(WEAPONS.shotgun.magSize, s.mag + 1); s.reserve--;
      this.game.audio.reload(2);
      this.game.hud.updateAmmo();
      if (s.mag >= WEAPONS.shotgun.magSize || s.reserve <= 0) {
        clearInterval(this._shellTimer); this.reloading = false; this.game.hud.showReload(false);
      }
    }, WEAPONS.shotgun.reloadTime * 1000 / WEAPONS.shotgun.magSize);
  }

  finishReload() {
    const w = this.def, s = this.state;
    if (w.type !== 'gun') return;
    const need = w.magSize - s.mag;
    const take = Math.min(need, s.reserve);
    s.mag += take; s.reserve -= take;
    this.reloading = false;
    this.game.hud.updateAmmo();
    this.game.hud.showReload(false);
  }

  canFire() {
    return this.cooldown <= 0 && !this.reloading && this.hasAmmo() && !this.game.player.sprinting && !this.game.player.dead;
  }

  tryFire() {
    if (!this.canFire()) {
      if (this.cooldown <= 0 && !this.reloading && this.isGun && !this.hasAmmo()) {
        this.game.audio.dryFire();
        this.game.hud.flashMessage('SEM MUNIÇÃO — TOQUE EM RECARREGAR', 1200);
        this.game.hud.pulseAmmo();
        this.cooldown = 0.4;
      }
      return;
    }
    const w = this.def;
    if (w.type === 'gun' && this.state.mag <= 0) {
      this.startReload();
      this.game.audio.dryFire();
      return;
    }
    this.cooldown = 60 / w.rpm;
    this.shotTimer = 0.07;

    if (w.type === 'melee') { this._melee(); return; }

    const s = this.state;
    s.mag--;
    this.game.hud.updateAmmo();

    this.kick = 1;
    this.kickRot = 1;
    const spreadMul = this.aimAmount > 0.5 ? 0.45 : 1;
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      this.game.player.shootBullet(w, spreadMul, i === 0);
    }

    // recuo visual da câmera
    this.recoilPitch += w.recoil * 0.0042 * (this.aimAmount > 0.5 ? 0.6 : 1);
    this.recoilYaw += rand(-0.4, 0.4) * w.recoil * 0.0018;
    this.game.player.addShake(w.recoil * 0.03);

    this._showFlash();
    this.game.audio.shot(w.sound, 0, 1);
    this.game.haptics.shot(this.current);
    if (this.current === 'shotgun') setTimeout(() => this._pump(), 220);
    // recarga automática quando o pente esvazia
    if (s.mag <= 0 && s.reserve > 0) setTimeout(() => { if (!this.reloading && this.state.mag <= 0) this.startReload(); }, 260);
  }

  _pump() {
    const m = this.models.shotgun;
    if (m && m.userData.pump) {
      const p = m.userData.pump;
      p.position.z += 0.06;
      setTimeout(() => { p.position.z -= 0.06; }, 120);
    }
  }

  _melee() {
    this.meleeT = 0.42;
    this.game.audio.blip(220, 0.08, 'sawtooth', 0.08);
    const p = this.game.player;
    const fwd = p.forward;
    const hit = this.game.zombies.meleeHitTarget(p.pos, fwd, WEAPONS.knife.range, 1.1);
    if (hit) {
      this.game.zombies.damageZombie(hit, WEAPONS.knife.damage, true, 'knife');
      this.game.haptics.medium();
    }
  }

  _showFlash() {
    const w = this.def;
    const model = this.models[this.current];
    if (!model) return;
    const tip = model.userData.muzzle;
    const world = new THREE.Vector3();
    tip.getWorldPosition(world);
    this.flash.position.copy(world);
    this.flash.visible = true;
    this.flash.rotation.z = rand(0, TAU);
    const sc = this.current === 'shotgun' ? 0.75 : this.current === 'sniper' ? 0.7 : 0.45;
    this.flash.scale.setScalar(sc * rand(0.85, 1.15));
    this.light.position.copy(world);
    this.light.color.setHex(w.tracer || 0xffb060);
    this.light.intensity = 9;
    this._flashT = 0.055;
    // ejeção de cápsula
    this.game.fx.ejectShell(world, this.game.player.camDir);
  }

  update(dt, player) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.shotTimer = Math.max(0, this.shotTimer - dt);
    this.kick *= Math.exp(-14 * dt);
    this.kickRot *= Math.exp(-12 * dt);
    this.meleeT = Math.max(0, this.meleeT - dt);
    if (this._flashT > 0) {
      this._flashT -= dt;
      this.light.intensity *= Math.exp(-22 * dt);
      if (this._flashT <= 0) { this.flash.visible = false; this.light.intensity = 0; }
    }

    if (this.reloading && this.current !== 'shotgun') {
      this.reloadT -= dt;
      this.game.hud.updateReload(1 - this.reloadT / this.reloadTotal);
      if (this.reloadT <= 0) this.finishReload();
    }

    // mira
    const wantAim = this.game.controls.held.aim && !player.sprinting;
    this.aimAmount += ((wantAim ? 1 : 0) - this.aimAmount) * Math.min(1, dt * 12);

    const m = this.models[this.current];
    if (!m) return;

    const aiming = this.aimAmount;
    const basePos = {
      x: lerp(0.19, 0.0, aiming) + (this.current === 'knife' ? 0.02 : 0),
      y: lerp(-0.21, -0.072, aiming) + (this.current === 'knife' ? -0.02 : 0),
      z: lerp(-0.47, -0.36, aiming)
    };
    if (this.current === 'sniper' && aiming > 0.75) basePos.z = -0.3;

    // sway / bob
    const speed = Math.hypot(player.vel.x, player.vel.z);
    const bobAmt = clamp(speed / 5, 0, 1) * (1 - aiming * 0.8);
    this.bobT += dt * (6.5 + speed * 0.55);
    const bobX = Math.sin(this.bobT) * 0.006 * bobAmt;
    const bobY = Math.abs(Math.cos(this.bobT)) * 0.007 * bobAmt;

    this.swayX += (-this.game.controls.lookAccumX * 0.0009 - this.swayX) * Math.min(1, dt * 9);
    this.swayY += (-this.game.controls.lookAccumY * 0.0009 - this.swayY) * Math.min(1, dt * 9);

    const recoilBack = this.kick * 0.05;
    const recoilRot = this.kickRot * 0.16;

    this.viewRoot.position.set(
      basePos.x + bobX + this.swayX * (1 - aiming * 0.6),
      basePos.y + bobY + this.swayY * (1 - aiming * 0.6),
      basePos.z + recoilBack
    );
    this.viewRoot.rotation.set(
      recoilRot + this.swayY * 0.5,
      this.swayX * 0.8,
      this.kick * 0.06 + (this.current === 'knife' ? Math.sin(this.meleeT * 22) * this.meleeT * 1.4 : 0)
    );
    if (this.meleeT > 0) {
      this.viewRoot.position.z += -0.22 * Math.sin((1 - this.meleeT / 0.42) * Math.PI);
      this.viewRoot.rotation.y += -0.5 * Math.sin((1 - this.meleeT / 0.42) * Math.PI);
    }

    // animação da recarga (arma desce e gira)
    if (this.reloading) {
      const t = this.current === 'shotgun' ? 0.4 : Math.sin((1 - this.reloadT / this.reloadTotal) * Math.PI);
      this.viewRoot.position.y -= 0.12 * t;
      this.viewRoot.rotation.z += 0.5 * t;
      this.viewRoot.rotation.x += 0.25 * t;
      if (m.userData.mag && this.current !== 'shotgun') {
        const mt = Math.sin((1 - this.reloadT / this.reloadTotal) * Math.PI);
        m.userData.mag.position.y = -0.07 - 0.16 * mt;
      }
    } else if (m.userData.mag) {
      if (this.current === 'pistol') m.userData.mag.position.y = -0.07;
      else if (this.current === 'smg') m.userData.mag.position.y = -0.08;
      else if (this.current === 'rifle') m.userData.mag.position.y = -0.1;
      else if (this.current === 'sniper') m.userData.mag.position.y = -0.09;
    }
  }
}
