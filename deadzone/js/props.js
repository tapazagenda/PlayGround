/* DEADZONE — objetos interativos do mundo (saque, cofres, geradores) */
import * as THREE from '../assets/vendor/three.module.js';
import { buildCrate } from './models.js';
import { rand, TAU } from './util.js';

const PROP_DEFS = [
  { kind: 'supply', label: 'ABRIR CAIXOTE DE SUPRIMENTOS', hold: 1.1, loot: ['ammo', 'health'] },
  { kind: 'armory', label: 'SAQUEAR ARMÁRIO TÁTICO', hold: 1.6, loot: ['weapon', 'ammo'] },
  { kind: 'medic', label: 'REVISTAR KIT MÉDICO', hold: 1.3, loot: ['health', 'armor'] },
  { kind: 'grenade', label: 'PEGAR GRANADAS', hold: 1.0, loot: ['grenade'] }
];

export class PropManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.props = [];
    this.near = null;
    this.hold = 0;
    this.build();
  }

  _makeMesh(kind) {
    const g = new THREE.Group();
    if (kind === 'armory') {
      const m = new THREE.MeshStandardMaterial({ color: 0x3b4a3a, roughness: 0.7, metalness: 0.45, map: this._tex('metal') });
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 0.6), m);
      cab.position.y = 0.85; cab.castShadow = true; cab.receiveShadow = true; g.add(cab);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.45, 0.06), new THREE.MeshStandardMaterial({ color: 0x2a362a, roughness: 0.6, metalness: 0.6 }));
      door.position.set(0, 0.9, 0.31); g.add(door);
      for (const y of [0.45, 1.35]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.08), new THREE.MeshStandardMaterial({ color: 0x9aa0a0, metalness: 0.9, roughness: 0.3 }));
        h.position.set(0, y, 0.36); g.add(h);
      }
      const stripe = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.5, metalness: 0.4, emissive: 0x2a1f00, emissiveIntensity: 0.4 });
      g.add(this._band(1.34, 0.12, 0.05, 0, 1.55, 0.33, stripe));
      const label = this._label('ARMAS', 1.2, 0.5);
      label.position.set(0, 1.0, 0.35);
      g.add(label);
    } else if (kind === 'medic') {
      const m = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.7 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), m);
      box.position.y = 0.6; box.castShadow = true; g.add(box);
      const cross = new THREE.MeshStandardMaterial({ color: 0xb02020, roughness: 0.5 });
      g.add(this._band(0.18, 0.34, 0.52, 0, 0.6, 0, cross));
      g.add(this._band(0.42, 0.14, 0.52, 0, 0.6, 0, cross));
      const table = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.7), new THREE.MeshStandardMaterial({ color: 0x5a5248, roughness: 0.9 }));
      table.position.y = 0.35; table.castShadow = true; g.add(table);
      for (const [x, z] of [[-0.4, -0.28], [0.4, -0.28], [-0.4, 0.28], [0.4, 0.28]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), new THREE.MeshStandardMaterial({ color: 0x3a3a3a }));
        leg.position.set(x, 0.18, z); g.add(leg);
      }
    } else if (kind === 'grenade') {
      const crate = buildCrate(0.55);
      crate.position.y = 0.02; g.add(crate);
      const m = new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 0.8 });
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), m);
        s.position.set(-0.16 + (i % 2) * 0.3, 0.62, -0.1 + Math.floor(i / 2) * 0.22);
        g.add(s);
      }
    } else {
      const crate = buildCrate(0.8);
      g.add(crate);
      const a = buildCrate(0.55);
      a.position.set(0.35, 0, 0.3);
      a.rotation.y = 0.5;
      g.add(a);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  _band(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  }

  _tex(kind) {
    return null;
  }

  _label(text, w, h) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#1d2620'; x.fillRect(0, 0, 256, 128);
    x.strokeStyle = '#c9a227'; x.lineWidth = 5; x.strokeRect(6, 6, 244, 116);
    x.fillStyle = '#e6e2d2'; x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 128, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: false });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  }

  addProp(kind, pos, rot = 0) {
    const def = PROP_DEFS.find(d => d.kind === kind) || PROP_DEFS[0];
    const mesh = this._makeMesh(kind);
    mesh.position.set(pos.x, 0, pos.z);
    mesh.rotation.y = rot;
    this.scene.add(mesh);
    const prop = { kind, def, mesh, pos: new THREE.Vector3(pos.x, 0, pos.z), used: false, radius: 2.2 };
    this.props.push(prop);
    return prop;
  }

  build() {
    const g = this.game;
    // caixotes de suprimento pelo mapa (posições livres)
    const spots = [];
    const trySpot = (x, z) => {
      if (g.world.collisionAt(x, z, 1.0)) return false;
      spots.push([x, z]);
      return true;
    };
    trySpot(2.2, 4.5);
    trySpot(-3.4, 3.2);
    for (let i = 0; i < 8; i++) {
      const a = rand(0, TAU), r = rand(14, 70);
      trySpot(g.player.pos.x + Math.cos(a) * r, g.player.pos.z + Math.sin(a) * r + 8);
    }
    spots.forEach(([x, z], i) => {
      const kind = i === 0 ? 'armory' : i === 1 ? 'medic' : i === 2 ? 'grenade' : 'supply';
      this.addProp(kind, { x, z }, rand(0, TAU));
    });
  }

  nearest(player) {
    let best = null, bd = 2.4;
    for (const p of this.props) {
      if (p.used) continue;
      const d = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p || !this.props.length) return;
    this.near = this.nearest(p);
    if (this.near && !g.quest.interactingWithObjective) {
      const holding = g.controls.held.interact || g.controls.keys.has('interact');
      g.hud.showInteract(true, 1, this.near.def.label);
      if (holding) {
        this.hold += dt;
        g.hud.setInteractProgress(Math.min(1, this.hold / this.near.def.hold));
        if (this.hold >= this.near.def.hold) {
          this.use(this.near);
          this.hold = 0;
          g.hud.setInteractProgress(0);
        }
      } else {
        this.hold = Math.max(0, this.hold - dt * 2.5);
        g.hud.setInteractProgress(Math.min(1, this.hold / this.near.def.hold));
      }
      g.quest.interactingWithProp = true;
    } else {
      this.hold = 0;
      g.quest.interactingWithProp = false;
    }
  }

  use(prop) {
    prop.used = true;
    const g = this.game;
    const p = g.player;
    g.audio.ui('confirm');
    g.fx.impact(prop.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), new THREE.Vector3(0, 1, 0), true);
    g.hud.flashMessage('SAQUE: ' + prop.def.label.replace('ABRIR ', '').replace('SAQUEAR ', ''), 1200);
    // esconde o objeto e larga os itens
    prop.mesh.visible = false;
    // abertura: alguns itens ao redor
    const loot = prop.def.loot;
    for (const l of loot) {
      if (l === 'weapon') {
        const pool = ['smg', 'rifle', 'shotgun', 'sniper'].filter(w => !g.weapons.owned.includes(w));
        const w = pool.length ? pool[(Math.random() * pool.length) | 0] : 'rifle';
        g.pickups.spawn('weapon', prop.pos, 0, w);
      } else if (l === 'ammo') {
        g.pickups.spawn('ammo', prop.pos.clone().add(new THREE.Vector3(rand(-0.8, 0.8), 0, rand(-0.8, 0.8))), 30);
      } else if (l === 'health') {
        g.pickups.spawn('health', prop.pos.clone().add(new THREE.Vector3(rand(-0.8, 0.8), 0, rand(-0.8, 0.8))));
      } else if (l === 'armor') {
        g.pickups.spawn('armor', prop.pos.clone().add(new THREE.Vector3(rand(-0.8, 0.8), 0, rand(-0.8, 0.8))));
      } else if (l === 'grenade') {
        g.pickups.spawn('grenade', prop.pos.clone().add(new THREE.Vector3(rand(-0.6, 0.6), 0, rand(-0.6, 0.6))));
      }
    }
    p.addScore(150);
    // atrai infectados pelo barulho
    g.zombies.noise(prop.pos, 22, 0.6);
  }

  reset() {
    this.props.forEach(p => { this.scene.remove(p.mesh); });
    this.props = [];
    this.hold = 0;
    this.near = null;
  }
}
