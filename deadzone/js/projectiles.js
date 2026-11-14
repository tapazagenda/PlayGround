/* DEADZONE — granadas, flashbangs e explosões */
import * as THREE from '../assets/vendor/three.module.js';
import { rand, clamp } from './util.js';

export class ProjectileManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.list = [];
    const geo = new THREE.SphereGeometry(0.11, 10, 8);
    this.geo = geo;
    this.fragMat = new THREE.MeshStandardMaterial({ color: 0x36402c, roughness: 0.8, metalness: 0.3 });
    this.flashMat = new THREE.MeshStandardMaterial({ color: 0x8a8f95, roughness: 0.4, metalness: 0.8, emissive: 0x333333 });
  }

  clear() {
    this.list.forEach(p => this.scene.remove(p.mesh));
    this.list = [];
  }

  throwGrenade(origin, dir, vel, mode = 'frag') {
    const mesh = new THREE.Mesh(this.geo, mode === 'frag' ? this.fragMat : this.flashMat);
    mesh.scale.setScalar(1);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const p = {
      mesh, mode,
      vel: dir.clone().multiplyScalar(mode === 'frag' ? 13 : 15).add(new THREE.Vector3(vel.x * 0.4, 2.6, vel.z * 0.4)),
      fuse: mode === 'frag' ? 2.4 : 1.6,
      bounces: 0,
      armed: false
    };
    this.list.push(p);
    return p;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.fuse -= dt;
      p.vel.y -= 18 * dt;
      const nx = p.mesh.position.x + p.vel.x * dt;
      const nz = p.mesh.position.z + p.vel.z * dt;
      let ny = p.mesh.position.y + p.vel.y * dt;
      // colisão com o chão
      if (ny < 0.11) {
        ny = 0.11;
        if (Math.abs(p.vel.y) > 1.2) this.game.audio.step('metal', 0.12);
        p.vel.y *= -0.42;
        p.vel.x *= 0.7; p.vel.z *= 0.7;
        p.bounces++;
      }
      // colisão com paredes
      const test = { pos: { x: nx, z: nz } };
      let blockedX = false, blockedZ = false;
      for (const b of this.game.world.blockers) {
        if (b.h < 0.9) continue;
        if (nx + 0.12 > b.x0 && nx - 0.12 < b.x1 && p.mesh.position.z > b.z0 && p.mesh.position.z < b.z1 && ny < b.h) blockedX = true;
        if (p.mesh.position.x > b.x0 && p.mesh.position.x < b.x1 && nz + 0.12 > b.z0 && nz - 0.12 < b.z1 && ny < b.h) blockedZ = true;
      }
      if (!blockedX) p.mesh.position.x = nx; else p.vel.x *= -0.5;
      if (!blockedZ) p.mesh.position.z = nz; else p.vel.z *= -0.5;
      p.mesh.position.y = ny;
      p.mesh.rotation.x += p.vel.z * dt * 2;
      p.mesh.rotation.z -= p.vel.x * dt * 2;
      if (p.fuse < 0.6 && p.mode === 'frag') {
        p.mesh.material = p.mesh.material.clone();
        p.mesh.material.emissive = new THREE.Color(0xff3010);
        p.mesh.material.emissiveIntensity = (Math.sin(p.fuse * 40) * 0.5 + 0.5) * 2;
      }
      if (p.fuse <= 0) {
        this.detonate(p);
        this.scene.remove(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }

  detonate(p) {
    const pos = p.mesh.position.clone();
    const g = this.game;
    if (p.mode === 'frag') {
      g.fx.explosion(pos, 7);
      g.audio.explode(0);
      g.haptics.heavy();
      g.zombies.explode(pos, 8, 220);
      g.zombies.noise(pos, 55, 1);
      const d = pos.distanceTo(g.player.pos);
      if (d < 6.5) {
        g.player.takeDamage((1 - d / 6.5) * 42, pos);
      }
      g.player.addScore(0);
      g.stats.explosions = (g.stats.explosions || 0) + 1;
      if (g.quest) g.quest.onGrenadeKill();
    } else {
      // flashbang: cega zumbis próximos e causa dano leve
      g.audio.blip(1800, 0.5, 'sine', 0.18);
      g.fx.explosion(pos, 4);
      g.fx.flashLight.position.copy(pos);
      g.fx.flashLight.intensity = 90;
      for (const z of g.zombies.list) {
        if (z.dead) continue;
        const d = z.pos.distanceTo(pos);
        if (d < 14) {
          z.stagger = Math.max(z.stagger, 1.6);
          z.damage(18 * (1 - d / 14), false, new THREE.Vector3(0, 0, 1), 'flash');
          if (z.dead) z.die(false, new THREE.Vector3(0, 0, 1), 'flash');
        }
      }
      g.hud.screenFlash(0.75);
    }
  }
}
