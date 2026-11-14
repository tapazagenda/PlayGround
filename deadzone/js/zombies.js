/* DEADZONE — IA, animação e combate dos infectados */
import * as THREE from '../assets/vendor/three.module.js';
import { buildZombieMesh } from './models.js';
import { clamp, damp, dampAngle, dist2, rand, randInt, pick, TAU, angDiff, circleRect } from './util.js';

const TYPES = {
  walker: { hp: 100, speed: 1.25, scale: 1, dmg: 9, reach: 1.5, attackTime: 0.5, score: 100, blood: 1 },
  runner: { hp: 70, speed: 2.85, scale: 0.94, dmg: 6, reach: 1.45, attackTime: 0.36, score: 150, blood: 0.9 },
  brute: { hp: 480, speed: 0.95, scale: 1.45, dmg: 22, reach: 2.0, attackTime: 0.75, score: 500, blood: 1.6 }
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Zombie {
  constructor(mgr, type, seed, pos) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.type = type;
    this.conf = TYPES[type];
    this.seed = seed;
    this.meshData = buildZombieMesh(type, seed);
    this.root = this.meshData.root;
    this.body = this.meshData.body;
    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    this.root.position.copy(this.pos);
    this.hp = this.conf.hp;
    this.maxHp = this.conf.hp;
    this.dead = false;
    this.state = 'wander';
    this.heading = rand(0, TAU);
    this.targetHeading = this.heading;
    this.vel = new THREE.Vector3();
    this.speed = this.conf.speed * rand(0.85, 1.15);
    this.attackCd = rand(0.2, 1.6);
    this.attackT = 0;
    this.stagger = 0;
    this.hitFlash = 0;
    this.walkPhase = rand(0, TAU);
    this.alert = 0;
    this.wanderT = 0;
    this.wanderTarget = new THREE.Vector3(pos.x, 0, pos.z);
    this.groanT = rand(2, 9);
    this.deadT = 0;
    this.fallDir = 1;
    this.headless = false;
    this.removeMe = false;
    this.limp = Math.random() > 0.5 ? rand(0.55, 0.9) : 1;
    this.armRaise = rand(0.6, 1);
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3().copy(this.pos);
    this.aggressive = false;
    this.bodyAngle = 0;
    this.spawnT = 0.55;
    this.root.scale.setScalar(0.001);
    this.mgr.scene.add(this.root);
    this.materials = [];
    this.root.traverse(o => { if (o.isMesh && o.material && o.material.emissive) this.materials.push(o.material); });
    this.hitboxes = []; // preenchido pelo manager
  }

  get headPos() {
    // analítico: funciona mesmo antes do primeiro render
    return new THREE.Vector3(this.pos.x, 1.82 * this.conf.scale, this.pos.z);
  }
  get torsoPos() {
    return new THREE.Vector3(this.pos.x, 1.35 * this.conf.scale, this.pos.z);
  }

  alertTo(pos) {
    this.alert = 1;
    this.aggressive = true;
    this.lastKnown = this.lastKnown || new THREE.Vector3();
    this.lastKnown.copy(pos);
    if (this.state === 'wander') this.state = 'chase';
  }

  damage(amount, headshot, dir, weaponId) {
    if (this.dead) return 0;
    const dmg = amount * (headshot ? this.conf.headMult || 2 : 1);
    this.hp -= dmg;
    this.hitFlash = 1;
    this.alert = 1;
    this.aggressive = true;
    this.state = this.state === 'wander' ? 'chase' : this.state;
    this.mgr.game.fx.bloodBurst(this.headPos.clone().add(new THREE.Vector3(0, 0.1, 0)), dir, headshot ? 22 : 12);
    this.mgr.game.audio.hit(headshot, this.mgr.panFor(this.pos));
    const kb = headshot ? 1.6 : 2.6;
    this.pos.x += dir.x * kb * 0.22;
    this.pos.z += dir.z * kb * 0.22;
    if (this.hp <= 0) {
      this.die(headshot, dir, weaponId);
      return dmg;
    }
    if (headshot && this.type !== 'brute') { this.stagger = Math.max(this.stagger, 0.32); }
    else if (this.type !== 'brute' || Math.random() < 0.35) this.stagger = Math.min(0.22, this.stagger + 0.14);
    return dmg;
  }

  die(headshot, dir, weaponId) {
    this.dead = true;
    this.hp = 0;
    this.state = 'dead';
    this.deadT = 0;
    this.fallDir = dir ? (new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).y > 0 ? 1 : -1) : 1;
    this.deathDir = dir ? dir.clone() : new THREE.Vector3(0, 0, 1);
    this.headless = !!headshot;
    if (this.headless) {
      // sangue no pescoço + cabeça some
      this.meshData.head.visible = false;
      this.mgr.game.fx.bloodBurst(this.headPos.clone(), new THREE.Vector3(0, 1, 0), 40);
    }
    this.mgr.game.fx.bloodPool(this.pos, this.conf.scale);
    this.mgr.game.player.stats.kills++;
    this.mgr.game.player.stats.killsBy[this.type] = (this.mgr.game.player.stats.killsBy[this.type] || 0) + 1;
    this.mgr.game.player.addScore(this.conf.score + (headshot ? 50 : 0));
    if (this.mgr.game.zombies.kills % 5 === 0) this.mgr.game.hud.flashMessage(headshot ? 'ABATE PERFEITO — TIRO NA CABEÇA' : 'INFECTADO NEUTRALIZADO', 900);
    this.mgr.kills++;
    if (this.mgr.game.quest) this.mgr.game.quest.onKill(this.type);
    // queda de itens ocasional
    const r = Math.random();
    if (r < 0.16) this.mgr.game.pickups.spawn('ammo', this.pos, rand(10, 20));
    else if (r < 0.24) this.mgr.game.pickups.spawn('health', this.pos);
    else if (r < 0.28) this.mgr.game.pickups.spawn('armor', this.pos);
  }

  update(dt) {
    if (this.removeMe) return;
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      const t = 1 - clamp(this.spawnT / 0.55, 0, 1);
      const s = t * t * (3 - 2 * t);
      this.root.scale.setScalar(0.001 + s * 1);
      if (this.spawnT <= 0) { this.root.scale.setScalar(1); this.grown = true; }
    } else if (!this.grown) {
      this.grown = true;
      this.root.scale.setScalar(1);
    }

    if (this.state === 'dead') {
      this.deadT += dt;
      const t = clamp(this.deadT / 0.72, 0, 1);
      const e = t * t;
      this.body.rotation.x = this.fallDir * e * (Math.PI / 2) * 0.96;
      this.body.position.y = -0.05 * e;
      this.body.position.z = 0.25 * e;
      if (this.deathDir) {
        const a = Math.atan2(this.deathDir.x, this.deathDir.z);
        this.root.rotation.y = dampAngle(this.root.rotation.y, a, 6, dt);
      }
      if (this.deadT > 26) {
        this.root.position.y -= dt * 0.25; // afunda no chão
        if (this.deadT > 30) this.removeMe = true;
      }
      return;
    }

    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    const f = this.hitFlash;
    this.materials.forEach(m => { m.emissive.setRGB(f * 0.55, f * 0.06, f * 0.04); });

    const player = this.game.player;
    const d = this.pos.distanceTo(player.pos);
    const playerAlive = !player.dead;

    // ---------- percepção ----------
    if (this.groanT > 0) {
      this.groanT -= dt;
      if (this.groanT <= 0 && d < 30 && !this.game.settings.muted) {
        this.mgr.game.audio.growl(this.mgr.panFor(this.pos), this.type === 'brute' ? 0.62 : this.type === 'runner' ? 1.2 : 1, d < 12 ? 0.16 : 0.06);
        this.groanT = rand(4, 11);
      }
    }

    if (playerAlive && !this.aggressive) {
      const fwdDot = player.camDir.x * (this.pos.x - player.pos.x) + player.camDir.z * (this.pos.z - player.pos.z);
      // sentem o jogador de longe; ficam mais agressivos quanto mais perto
      if (d < 9 || (d < 34 && fwdDot > 0) || (d < 62 && player.noise > 0.35) || (this.smelled = this.smelled || Math.random() < 0.004 * dt * 60)) {
        this.alertTo(player.pos);
      }
    }
    if (this.aggressive && playerAlive) {
      this.lastKnown = this.lastKnown || new THREE.Vector3();
      if (d < 18) this.lastKnown.copy(player.pos);
    }

    // ---------- estado ----------
    if (this.stagger > 0) {
      this.stagger -= dt;
      this.state = 'stagger';
    }

    let moveSpeed = this.speed;
    let targetPos = null;
    if (this.state === 'wander') {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        const a = rand(0, TAU), r = rand(4, 18);
        this.wanderTarget.set(this.pos.x + Math.cos(a) * r, 0, this.pos.z + Math.sin(a) * r);
        this.wanderT = rand(4, 9);
      }
      targetPos = this.wanderTarget;
      moveSpeed *= 0.42;
      if (dist2(this.pos.x, this.pos.z, this.wanderTarget.x, this.wanderTarget.z) < 1.6) this.wanderT = 0;
    } else if (this.state === 'chase') {
      targetPos = this.lastKnown || player.pos;
      if (playerAlive && d < 22) targetPos = player.pos;
      moveSpeed *= 1;
      if (this.type === 'runner' && d < 14) moveSpeed *= 1.18;
    } else if (this.state === 'stagger') {
      moveSpeed = 0;
    } else if (this.state === 'attack') {
      moveSpeed = 0;
    }
    if (this.attackT > 0) this.attackT -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;

    // ataque
    if (playerAlive && d < this.conf.reach + 0.35 && this.stagger <= 0) {
      this.state = 'attack';
      if (this.attackCd <= 0) {
        this.attackCd = this.conf.attackTime + 1.05;
        this.attackT = this.conf.attackTime;
        this.attackHitDone = false;
        this.attackLunge = 1;
      }
    } else if (this.state === 'attack') {
      this.state = this.aggressive ? 'chase' : 'wander';
    }

    if (this.attackT > 0) {
      const t = 1 - this.attackT / this.conf.attackTime;
      if (t > 0.45 && !this.attackHitDone) {
        this.attackHitDone = true;
        const dd = this.pos.distanceTo(player.pos);
        if (dd < this.conf.reach + 0.5 && playerAlive) {
          player.takeDamage(this.conf.dmg * (this.type === 'brute' ? 1 : rand(0.85, 1.15)), this.pos);
          this.game.haptics.heavy();
          this.game.fx.damageFlash(0.5);
        }
      }
    }

    // ---------- movimento ----------
    if (targetPos && moveSpeed > 0 && this.spawnT <= 0) {
      let dx = targetPos.x - this.pos.x, dz = targetPos.z - this.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      // separação entre zumbis
      const sep = this.mgr.separation(this);
      dx += sep.x * 1.4; dz += sep.z * 1.4;
      const l2 = Math.hypot(dx, dz) || 1;
      dx /= l2; dz /= l2;
      this.targetHeading = Math.atan2(dx, dz);
      // desvio de obstáculos (look-ahead)
      const avoid = this.mgr.avoidObstacles(this.pos, dx, dz);
      if (avoid) { this.targetHeading = Math.atan2(avoid.x, avoid.z); dx = avoid.x; dz = avoid.z; }
      const spd = moveSpeed * (this.state === 'attack' ? 0.2 : 1);
      this.vel.x = dx * spd; this.vel.z = dz * spd;
      const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
      const moved = this.game.world.moveEntity(this, nx, nz, 0.36 * this.conf.scale);
      if (!moved) { this.stuckT += dt; } else this.stuckT = Math.max(0, this.stuckT - dt);
      if (this.stuckT > 1.2) {
        // procura rota alternativa
        this.targetHeading += rand(-1.6, 1.6);
        const ax = Math.sin(this.targetHeading), az = Math.cos(this.targetHeading);
        this.game.world.moveEntity(this, this.pos.x + ax * 0.8, this.pos.z + az * 0.8, 0.36 * this.conf.scale);
        this.stuckT = 0;
      }
    } else {
      this.vel.x = 0; this.vel.z = 0;
    }

    // colisão com o jogador (não atravessar)
    if (playerAlive) {
      const pr = 0.42, zr = 0.4 * this.conf.scale;
      const ddx = this.pos.x - player.pos.x, ddz = this.pos.z - player.pos.z;
      const dd = Math.hypot(ddx, ddz);
      if (dd < pr + zr && dd > 0.0001) {
        const push = (pr + zr - dd);
        const nx = this.pos.x + (ddx / dd) * push * 0.8;
        const nz = this.pos.z + (ddz / dd) * push * 0.8;
        if (!this.game.world.collisionAt(nx, this.pos.z, 0.3)) this.pos.x = nx;
        if (!this.game.world.collisionAt(this.pos.x, nz, 0.3)) this.pos.z = nz;
      }
    }

    // ---------- orientação / animação ----------
    const headTarget = this.state === 'chase' || this.state === 'attack' ? Math.atan2(this.pos.x - player.pos.x, this.pos.z - player.pos.z) : this.targetHeading;
    this.heading = dampAngle(this.heading, headTarget, this.type === 'brute' ? 3.2 : 5.5, dt);
    this.root.rotation.y = this.heading;
    this.root.position.set(this.pos.x, 0, this.pos.z);

    this.animate(dt, d);

    // remoção de zumbis muito distantes
    if (d > 130) this.removeMe = true;
  }

  animate(dt, dToPlayer) {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const moving = speed > 0.05 && this.state !== 'stagger';
    const md = this.meshData;
    if (moving) this.walkPhase += dt * (2.4 + speed * 2.4) * this.limp;
    const p = this.walkPhase;
    const amp = moving ? 0.5 + clamp(speed * 0.22, 0, 0.5) : 0;
    const S = md.S;

    // pernas
    md.legs.forEach((leg, i) => {
      const ph = p + (i === 0 ? 0 : Math.PI);
      const sw = Math.sin(ph) * amp;
      leg.hip.rotation.x = sw * 0.85 + 0.06;
      leg.knee.rotation.x = -Math.max(0, -Math.cos(ph)) * 0.9 * (moving ? 1 : 0) - 0.09;
      if (this.limp < 1 && i === 1) leg.hip.rotation.x *= 0.45;
    });

    // torso (inclinação e bob)
    const chase = this.state === 'chase' || this.state === 'attack';
    const lean = chase ? (this.type === 'runner' ? 0.38 : 0.16) : 0.24;
    md.torso.rotation.x = damp(md.torso.rotation.x, lean + (moving ? Math.sin(p * 2) * 0.03 : 0), 6, dt);
    md.torso.rotation.z = Math.sin(p) * 0.07 * (moving ? 1 : 0) + (this.limp < 1 ? 0.12 : 0);
    md.torso.position.y = (1.18 + Math.sin(p * 2) * 0.02 * (moving ? 1 : 0)) * S;

    // braços: erguidos à frente quando perseguindo
    md.arms.forEach((arm, i) => {
      const ph = p + (i === 0 ? Math.PI : 0);
      const raise = this.state === 'attack' ? 1.15 : chase ? this.armRaise * 0.85 : 0.2;
      let swing = Math.sin(ph * 0.9) * 0.18 * (moving ? 1 : 0);
      let atk = 0;
      if (this.attackT > 0) {
        const t = 1 - this.attackT / this.conf.attackTime;
        atk = Math.sin(t * Math.PI) * 1.5;
      }
      arm.shoulder.rotation.x = -raise - swing - atk * 0.9;
      arm.shoulder.rotation.z = (i === 0 ? -1 : 1) * (chase ? 0.2 : 0.1) + (this.type === 'brute' ? (i === 0 ? -0.2 : 0.2) : 0);
      arm.elbow.rotation.x = chase ? -0.55 - atk * 0.4 : -0.18;
      if (this.attackLunge !== undefined && this.attackLunge > 0) {
        this.attackLunge = Math.max(0, this.attackLunge - dt * 2.4);
      }
    });

    // cabeça: olhar para o jogador
    if (dToPlayer < 20 && this.state !== 'attack') {
      const local = angDiff(this.heading, Math.atan2(this.game.player.pos.x - this.pos.x, this.game.player.pos.z - this.pos.z));
      md.head.rotation.y = damp(md.head.rotation.y, clamp(local, -0.8, 0.8), 4, dt);
      md.head.rotation.x = damp(md.head.rotation.x, -0.08, 3, dt);
    } else {
      md.head.rotation.y = damp(md.head.rotation.y, Math.sin(p * 0.4) * 0.3, 2, dt);
    }
    if (md.jaw) md.jaw.rotation.x = 0.15 + Math.abs(Math.sin(p * 3)) * 0.18;

    // cambaleio lateral
    this.body.position.x = moving ? Math.sin(p) * 0.04 : 0;
  }
}

export class ZombieManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.list = [];
    this.kills = 0;
    this.spawnTimer = 0;
    this.spawnPoints = [];
    this.maxAlive = 12;
    this.seedCounter = 1;
  }

  panFor(pos) {
    const cam = this.game.camera;
    _v1.copy(pos).sub(cam.position);
    const right = _v2.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const dot = _v1.x * right.x + _v1.z * right.z;
    const len = Math.hypot(_v1.x, _v1.z) || 1;
    return clamp((dot / len) * 0.85, -1, 1);
  }

  reset() {
    this.list.forEach(z => this.scene.remove(z.root));
    this.list = [];
    this.kills = 0;
  }

  spawn(type, pos) {
    this.seedCounter++;
    const z = new Zombie(this, type, this.seedCounter, pos);
    this.list.push(z);
    return z;
  }

  aliveCount() { return this.list.filter(z => !z.dead).length; }

  separation(z) {
    let sx = 0, sz = 0;
    for (const o of this.list) {
      if (o === z || o.dead || o.spawnT > 0) continue;
      const dx = z.pos.x - o.pos.x, dz = z.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      const rr = (0.55 * (z.conf.scale + o.conf.scale));
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        sx += (dx / d) * (1 - d / rr);
        sz += (dz / d) * (1 - d / rr);
      }
    }
    return { x: sx, z: sz };
  }

  avoidObstacles(pos, dx, dz) {
    const look = 1.4;
    const px = pos.x + dx * look, pz = pos.z + dz * look;
    const blockers = this.game.world.blockers;
    for (const b of blockers) {
      if (px > b.x0 - 0.6 && px < b.x1 + 0.6 && pz > b.z0 - 0.6 && pz < b.z1 + 0.6) {
        // desvia para o lado mais próximo do centro do bloco
        const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        const ox = pos.x - cx, oz = pos.z - cz;
        const l = Math.hypot(ox, oz) || 1;
        const nx = ox / l, nz = oz / l;
        // tangente
        const tx = -nz, tz = nx;
        const dot = tx * dx + tz * dz;
        const s = dot >= 0 ? 1 : -1;
        const bx = (nx + tx * s) * 0.5, bz = (nz + tz * s) * 0.5;
        const bl = Math.hypot(bx, bz) || 1;
        return { x: bx / bl, z: bz / bl };
      }
    }
    return null;
  }

  damageZombie(z, amount, headshot, weaponId, dir) {
    if (!z || z.dead) return;
    const d = dir ? dir.clone() : new THREE.Vector3(this.game.player.forward.x, 0, this.game.player.forward.z);
    d.y = 0;
    if (d.lengthSq() < 0.0001) d.set(0, 0, -1);
    d.normalize();
    z.damage(amount, headshot, d, weaponId);
  }

  nearestInCone(origin, dir, maxDist, minDot) {
    let best = null, bestScore = -1;
    const p = this.game.player;
    for (const z of this.list) {
      if (z.dead) continue;
      const dx = z.pos.x - origin.x, dz = z.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > maxDist || d < 0.5) continue;
      const dot = (dx / d) * dir.x + (dz / d) * dir.z;
      if (dot < Math.cos(minDot + 0.12)) continue;
      // prioriza o mais próximo com boa alça
      const score = dot * 1.2 - d / maxDist * 0.5;
      if (score > bestScore) { bestScore = score; best = z; }
    }
    return best;
  }

  meleeHitTarget(pos, dir, range, cone) {
    let best = null, bestD = range;
    for (const z of this.list) {
      if (z.dead) continue;
      const dx = z.pos.x - pos.x, dz = z.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range + z.conf.scale * 0.5) continue;
      const dot = (dx / (d || 1)) * dir.x + (dz / (d || 1)) * dir.z;
      if (dot < Math.cos(cone)) continue;
      if (d < bestD) { bestD = d; best = z; }
    }
    return best;
  }

  /* raio analítico: retorna {zombie, point, dist, headshot} */
  raycast(origin, dir, maxDist) {
    let best = null;
    for (const z of this.list) {
      if (z.dead || z.spawnT > 0.25) continue;
      const S = z.conf.scale;
      // esfera da cabeça (posição analítica — imune a matriz desatualizada)
      const hp = new THREE.Vector3(z.pos.x, 1.78 * S, z.pos.z);
      const hres = raySphere(origin, dir, hp, 0.23 * S);
      // cápsula do torso: de cintura a pescoço
      const a = new THREE.Vector3(z.pos.x, 0.95 * S, z.pos.z);
      const b2 = new THREE.Vector3(z.pos.x, 1.62 * S, z.pos.z);
      const tres = rayCapsule(origin, dir, a, b2, 0.33 * S);
      // pernas
      const lres = rayCapsule(origin, dir, new THREE.Vector3(z.pos.x, 0.2 * S, z.pos.z), new THREE.Vector3(z.pos.x, 0.9 * S, z.pos.z), 0.26 * S);
      const cands = [];
      if (hres !== null) cands.push({ t: hres, head: true });
      if (tres !== null) cands.push({ t: tres, head: false });
      if (lres !== null) cands.push({ t: lres, head: false, leg: true });
      for (const c of cands) {
        if (c.t > 0 && c.t < maxDist && (!best || c.t < best.dist)) {
          best = { zombie: z, dist: c.t, headshot: c.head, leg: !!c.leg };
        }
      }
    }
    if (best) best.point = origin.clone().addScaledVector(dir, best.dist);
    return best;
  }

  /* dano em área (granadas, explosões) */
  explode(pos, radius, damage) {
    for (const z of this.list) {
      if (z.dead) continue;
      const d = z.pos.distanceTo(pos);
      if (d < radius) {
        const fall = 1 - d / radius;
        z.damage(damage * fall, false, new THREE.Vector3(z.pos.x - pos.x, 0, z.pos.z - pos.z).normalize(), 'explosion');
        if (!z.dead) {
          const kx = (z.pos.x - pos.x) / (d || 1), kz = (z.pos.z - pos.z) / (d || 1);
          z.pos.x += kx * fall * 1.5; z.pos.z += kz * fall * 1.5;
        }
      }
    }
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i];
      z.update(dt);
      if (z.removeMe) {
        this.scene.remove(z.root);
        z.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } });
        this.list.splice(i, 1);
      }
    }
  }

  findSpawnPos(minDist = 24, maxDist = 44) {
    const player = this.game.player.pos;
    for (let tries = 0; tries < 40; tries++) {
      const a = rand(0, TAU);
      const r = rand(minDist, maxDist);
      const x = clamp(player.x + Math.cos(a) * r, -92, 92);
      const z = clamp(player.z + Math.sin(a) * r, -92, 92);
      if (this.game.world.isBlocked({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.6, z1: z + 0.6 })) continue;
      const d = Math.hypot(x - player.x, z - player.z);
      if (d < minDist * 0.85) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(clamp(player.x + 60, -90, 90), 0, clamp(player.z + 60, -90, 90));
  }

  spawnWave(wave, count) {
    const brutes = Math.floor(wave / 3);
    const runners = Math.floor(wave / 2);
    for (let i = 0; i < count; i++) {
      let type = 'walker';
      if (i < brutes && wave >= 3) type = 'brute';
      else if (Math.random() < clamp(0.18 + wave * 0.045, 0, 0.6) && i >= brutes) type = 'runner';
      const pos = this.findSpawnPos(24, 44);
      const z = this.spawn(type, pos);
      if (Math.random() < 0.55) z.alertTo(this.game.player.pos);
    }
    // limite de simultâneos
    const maxAlive = this.game.settings.lowSpec ? 10 : 16;
    if (this.aliveCount() > maxAlive) {
      const alive = this.list.filter(z => !z.dead);
      const sorted = alive.sort((a, b) => b.pos.distanceTo(this.game.player.pos) - a.pos.distanceTo(this.game.player.pos));
      for (let i = 0; i < alive.length - maxAlive; i++) sorted[i].removeMe = true;
    }
  }

  noise(pos, radius, strength = 1) {
    for (const z of this.list) {
      if (z.dead) continue;
      const d = z.pos.distanceTo(pos);
      if (d < radius * strength) z.alertTo(pos.clone());
    }
  }

  nearestAlerted(maxDist = 60) {
    let best = null, bd = maxDist;
    for (const z of this.list) {
      if (z.dead) continue;
      const d = z.pos.distanceTo(this.game.player.pos);
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  }
}

function raySphere(origin, dir, center, radius) {
  const ox = origin.x - center.x, oy = origin.y - center.y, oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const h = b * b - c;
  if (h < 0) return null;
  const sq = Math.sqrt(h);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  return t >= 0 ? t : null;
}

function rayCapsule(origin, dir, a, b, radius) {
  // aproximação: amostra de esferas ao longo da cápsula (suficiente para hitbox de torso/pernas)
  let best = null;
  const n = 3;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const cx = a.x + (b.x - a.x) * t, cy = a.y + (b.y - a.y) * t, cz = a.z + (b.z - a.z) * t;
    const ox = origin.x - cx, oy = origin.y - cy, oz = origin.z - cz;
    const bb = ox * dir.x + oy * dir.y + oz * dir.z;
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const h = bb * bb - c;
    if (h < 0) continue;
    const sq = Math.sqrt(h);
    let tt = -bb - sq;
    if (tt < 0) tt = -bb + sq;
    if (tt >= 0 && (best === null || tt < best)) best = tt;
  }
  return best;
}
