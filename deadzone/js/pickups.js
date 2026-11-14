/* DEADZONE — itens coletáveis no mundo */
import * as THREE from '../assets/vendor/three.module.js';
import { buildPickupMesh } from './models.js';
import { rand, TAU } from './util.js';

const LABEL = {
  ammo: 'MUNIÇÃO', health: 'KIT MÉDICO', armor: 'COLETE', weapon: 'ARMA', grenade: 'GRANADA', intel: 'INTELIGÊNCIA'
};

export class PickupManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.items = [];
    this.maxItems = 22;
    this.spawnTimer = 4;
  }

  clear() {
    this.items.forEach(i => this.scene.remove(i.mesh));
    this.items = [];
  }

  spawn(kind, pos, amount = 0, weaponId = null) {
    if (this.items.length >= this.maxItems) {
      const old = this.items.shift();
      this.scene.remove(old.mesh);
    }
    const mesh = buildPickupMesh(kind === 'weapon' ? 'weapon' : kind);
    const y = kind === 'weapon' ? 0.45 : 0.35;
    mesh.position.set(pos.x + rand(-0.3, 0.3), 0, pos.z + rand(-0.3, 0.3));
    mesh.userData.baseY = 0;
    this.scene.add(mesh);
    const item = { kind, mesh, amount, weaponId, t: rand(0, TAU), life: kind === 'intel' ? Infinity : 999, label: LABEL[kind] || 'ITEM' };
    this.items.push(item);
    return item;
  }

  update(dt, player) {
    const t = performance.now() * 0.001;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const m = it.mesh;
      m.position.y = Math.sin(t * 2 + it.t) * 0.06 + 0.02;
      m.rotation.y += dt * 1.1;
      const halo = m.userData.halo;
      if (halo) { halo.scale.setScalar(1 + Math.sin(t * 3 + it.t) * 0.12); halo.material.opacity = 0.25 + Math.sin(t * 3) * 0.08; }
      const dx = m.position.x - player.pos.x, dz = m.position.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.7 && !player.dead) {
        if (this.collect(it)) { this.scene.remove(m); this.items.splice(i, 1); continue; }
      }
      it.life -= dt;
      if (it.life <= 0) { this.scene.remove(m); this.items.splice(i, 1); }
    }
    // geração passiva de munição ao redor do jogador
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.game.state === 'playing') {
      this.spawnTimer = rand(14, 24);
      const spots = this.game.world.lootSpots;
      if (spots.length) {
        const spot = spots[(Math.random() * spots.length) | 0];
        const d = Math.hypot(spot.x - player.pos.x, spot.z - player.pos.z);
        if (d > 12 && d < 90 && !this.game.world.collisionAt(spot.x, spot.z, 0.45)) {
          this.spawn(Math.random() < 0.25 ? 'health' : 'ammo', spot, Math.random() < 0.3 ? 30 : 15);
        }
      }
    }
  }

  collect(it) {
    const g = this.game;
    const p = g.player;
    if (it.kind === 'ammo') {
      const ws = g.weapons;
      const ids = ws.owned.filter(id => id !== 'knife');
      if (!ids.length) return false;
      const target = ws.current !== 'knife' ? ws.current : ids[0];
      const ammo = ws.ammo[target];
      const maxReserve = (g.weaponDefs[target] && g.weaponDefs[target].reserveMax) || 120;
      const add = it.amount || 15;
      if (ammo.reserve >= maxReserve) {
        g.hud.flashMessage('MUNIÇÃO CHEIA', 700);
        return false;
      }
      ammo.reserve = Math.min(maxReserve, ammo.reserve + add);
      g.audio.pickup('ammo');
      g.hud.updateAmmo();
      g.hud.flashMessage('+' + add + ' ' + (g.weaponDefs[target] ? g.weaponDefs[target].short : ''), 800);
      g.zombies.noise(p.pos, 8, 0.4);
      return true;
    }
    if (it.kind === 'health') {
      if (p.health >= p.maxHealth) { g.hud.flashMessage('SAÚDE CHEIA', 700); return false; }
      p.heal(35);
      g.audio.pickup('health');
      g.hud.flashMessage('+35 SAÚDE', 900);
      return true;
    }
    if (it.kind === 'armor') {
      if (p.armor >= p.maxArmor) { g.hud.flashMessage('COLETE NO MÁXIMO', 700); return false; }
      p.armor = Math.min(p.maxArmor, p.armor + 40);
      g.audio.pickup('armor');
      g.hud.updateHealth();
      g.hud.flashMessage('+40 COLETE', 900);
      return true;
    }
    if (it.kind === 'grenade') {
      p.grenades = Math.min(6, p.grenades + 1);
      g.hud.updateGadgets();
      g.audio.pickup('ammo');
      g.hud.flashMessage('+1 GRANADA', 900);
      return true;
    }
    if (it.kind === 'weapon') {
      const isNew = g.weapons.give(it.weaponId, 30);
      g.audio.pickup('ammo');
      g.hud.flashMessage((isNew ? 'NOVA ARMA: ' : '+MUNIÇÃO: ') + g.weaponDefs[it.weaponId].name, 1500);
      g.hud.updateAmmo();
      g.weapons.equip(it.weaponId);
      return true;
    }
    if (it.kind === 'intel') {
      g.quest.collectIntel();
      g.audio.pickup('health');
      return true;
    }
    return false;
  }
}
