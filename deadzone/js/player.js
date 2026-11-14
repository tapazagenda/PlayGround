/* DEADZONE — jogador: movimento, câmera 1ª/3ª pessoa, combate, inventário */
import * as THREE from '../assets/vendor/three.module.js';
import { clamp, damp, dampAngle, lerp, rand, TAU, angDiff } from './util.js';
import { buildHumanMesh } from './models.js';

const EYE_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.08;

export class Player {
  constructor(scene, camera, game) {
    this.scene = scene;
    this.camera = camera;
    this.game = game;
    this.pos = new THREE.Vector3(0, 0, 7.5);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.height = EYE_HEIGHT;
    this.eyeOffset = 0;
    this.bobT = 0;
    this.stepT = 0;
    this.moveSpeed = 0;

    this.health = 100; this.maxHealth = 100;
    this.armor = 0; this.maxArmor = 100;
    this.stamina = 100; this.maxStamina = 100;
    this.sprinting = false;
    this.crouching = false;
    this.noise = 0;
    this.dead = false;
    this.deathT = 0;
    this.thirdPerson = false;
    this.camDist = 3.4;
    this.ads = 0;
    this.regenT = 0;
    this.grenades = 2;
    this.flashbangs = 1;
    this.medkits = 1;
    this.invuln = 0;
    this.stats = { kills: 0, headshots: 0, shots: 0, hits: 0, damageDealt: 0, killsBy: {}, distance: 0 };
    this.score = 0;
    this.autoAim = true;
    this.autoAimTarget = null;
    this.autoAimT = 0;
    this.camDir = new THREE.Vector3(0, 0, -1);
    this.forward = new THREE.Vector3(0, 0, -1);
    this._buildAvatar();
    this._buildCameraRig();
    this._buildFlashlight();
    this._initListeners();
  }

  _buildAvatar() {
    const h = buildHumanMesh(7, { shirt: 0x4a5a3a, pants: 0x2b2f33 });
    this.avatar = h;
    this.avatarRoot = h.root;
    this.avatarRoot.visible = false;
    // rifle na mão
    const gunParts = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x2c3136, roughness: 0.55, metalness: 0.65 });
    const woodM = new THREE.MeshStandardMaterial({ color: 0x6d4526, roughness: 0.75 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.62), metal);
    body.position.z = -0.1; gunParts.add(body);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.28), woodM);
    stock.position.set(0, -0.01, 0.3); gunParts.add(stock);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.06), metal);
    mag.position.set(0, -0.12, 0.02); mag.rotation.x = 0.15; gunParts.add(mag);
    const barrelM = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.36, 6), metal);
    barrelM.rotation.x = Math.PI / 2; barrelM.position.set(0, 0.02, -0.55); gunParts.add(barrelM);
    gunParts.position.set(0.02, -0.34, -0.34);
    gunParts.rotation.x = 0.05;
    h.arms[1].elbow.add(gunParts);
    gunParts.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.avatarGun = gunParts;
    this.scene.add(this.avatarRoot);
    // sombra falsa (blob) para leitura no chão
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 1;
    this.scene.add(this.blob);
  }

  _buildFlashlight() {
    this.flashlightOn = true;
    const spot = new THREE.SpotLight(0xfff0d6, 0.62, 19, 0.34, 0.85, 2.0);
    spot.position.set(0.12, -0.12, 0.1);
    spot.target.position.set(0.02, -0.06, -1);
    this.camera.add(spot);
    this.camera.add(spot.target);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), new THREE.MeshBasicMaterial({ color: 0xfff4dc }));
    bulb.position.set(0.12, -0.12, 0.06);
    this.camera.add(bulb);
    this.flashSpot = spot;
    this.flashBulb = bulb;
  }

  toggleFlashlight(force) {
    this.flashlightOn = typeof force === 'boolean' ? force : !this.flashlightOn;
    if (this.flashSpot) {
      this.flashSpot.visible = this.flashlightOn;
      this.flashBulb.visible = this.flashlightOn;
      this.flashSpot.intensity = this.flashlightOn ? 0.62 : 0;
    }
    this.game.audio.ui('tap');
    this.game.hud.flashMessage(this.flashlightOn ? 'LANTERNA LIGADA' : 'LANTERNA DESLIGADA', 900);
    this.game.hud.setFlashState(this.flashlightOn);
    if (this.game.settings) { this.game.settings.flashlight = this.flashlightOn; this.game._saveSettings && this.game._saveSettings(); }
  }

  _buildCameraRig() {
    this.pitchObj = new THREE.Object3D();
    this.scene.add(this.pitchObj);
    this.camera.rotation.set(0, 0, 0);
    this.camera.position.set(0, EYE_HEIGHT, 0);
    this.scene.add(this.camera);
  }

  _initListeners() {
    this.game.controls && (this.game.controls.sensitivity = this.game.settings.sensitivity);
  }

  reset() {
    this.pos.set(0, 0, 7.5);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.health = 100; this.armor = 0; this.stamina = 100;
    this.dead = false; this.deathT = 0;
    this.grenades = 2; this.flashbangs = 1; this.medkits = 1;
    this.score = 0;
    this.invuln = 1.5;
    this.crouching = false; this.sprinting = false;
    this.stats = { kills: 0, headshots: 0, shots: 0, hits: 0, damageDealt: 0, killsBy: {}, distance: 0 };
    this.avatarRoot.visible = false;
    this.camera.fov = this.game.settings.fov;
    this.camera.updateProjectionMatrix();
  }

  get eyeHeight() {
    return this.crouching ? CROUCH_HEIGHT : EYE_HEIGHT;
  }

  addScore(n) {
    this.score += n;
    this.game.hud.updateScore(this.score);
  }

  addShake(v) { this.game.fx.addShake(v); }

  takeDamage(amount, fromPos) {
    if (this.dead || this.invuln > 0) return;
    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.62);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health -= dmg;
    this.regenT = 7;
    this.game.fx.damageFlash(clamp(dmg / 30, 0.25, 1));
    this.game.audio.hurt();
    this.game.haptics.heavy();
    this.addShake(clamp(dmg / 60, 0.15, 0.7));
    // direção do dano
    if (fromPos) {
      const dx = fromPos.x - this.pos.x, dz = fromPos.z - this.pos.z;
      const a = Math.atan2(dx, dz);
      this.game.hud.showDamageDirection(angDiff(this.yaw, a));
    }
    if (this.health <= 0) { this.health = 0; this.die(); }
    this.game.hud.updateHealth();
  }

  die() {
    this.dead = true;
    this.deathT = 0;
    this.game.audio.death();
    this.game.audio.setTension(0.1);
    this.game.onPlayerDeath();
  }

  heal(n) {
    this.health = Math.min(this.maxHealth, this.health + n);
    this.game.hud.updateHealth();
  }

  shootBullet(w, spreadMul = 1, primary = true) {
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const dir = this.camDir.clone();
    // espalhamento
    const spread = w.spread * spreadMul * (this.sprinting ? 1.8 : 1) * (this.crouching ? 0.7 : 1);
    dir.x += rand(-spread, spread) * 1.2;
    dir.y += rand(-spread, spread) * 1.2;
    dir.z += rand(-spread, spread) * 1.2;
    dir.normalize();

    // auto-aim magnético suave (ajuda no toque)
    if (this.autoAim && this.game.settings.autoAim > 0.01 && !this.game.settings.aimAssistOff) {
      const target = this.game.zombies.nearestInCone(origin, dir, 70, 0.13 * this.game.settings.autoAim);
      if (target) {
        const aim = target.headPos.clone();
        if (!target.dead) {
          const want = aim.sub(origin).normalize();
          dir.lerp(want, 0.65 * this.game.settings.autoAim).normalize();
        }
      }
    }

    const zombies = this.game.zombies;
    const world = this.game.world;
    const maxRange = w.range;
    const zHit = zombies.raycast(origin, dir, maxRange);
    // parede mais próxima em todo o alcance (nunca "empatar" com o alvo)
    const wallDist = world.raycastWalls(origin, dir, maxRange);

    let end;
    let hitZombie = null;
    if (zHit && zHit.dist <= wallDist) {
      hitZombie = zHit.zombie;
      end = zHit.point;
      const falloff = lerp(1, w.falloff, clamp(zHit.dist / w.range, 0, 1));
      const dmg = w.damage * falloff * (zHit.leg ? 0.72 : 1);
      zombies.damageZombie(hitZombie, dmg, zHit.headshot, w.id, dir);
      this.stats.hits++;
      if (zHit.headshot) this.stats.headshots++;
      this.stats.damageDealt += dmg;
      this.game.fx.impact(end, dir.clone().negate(), false);
      this.game.hud.hitMarker(zHit.headshot);
    } else if (wallDist < maxRange) {
      end = origin.clone().addScaledVector(dir, wallDist);
      this.game.fx.impact(end, dir.clone().negate(), Math.random() > 0.7);
      // ruído de impacto
      if (Math.random() < 0.4) this.game.audio.step('concrete', 0.05);
    } else {
      end = origin.clone().addScaledVector(dir, maxRange);
    }

    if (primary || Math.random() < 0.4) {
      this.game.fx.tracer(origin.clone().addScaledVector(dir, 0.6), end, w.tracer || 0xffd090);
    }
    this.stats.shots++;
    // barulho atrai infectados
    const noiseRadius = w.sound === 'sniper' ? 60 : w.sound === 'shotgun' ? 45 : 32;
    zombies.noise(this.pos, noiseRadius, 1);
    this.game.stats.shots++;
    if (this.game.quest) this.game.quest.onShot();
  }

  tryUseGrenade(mode = 'frag') {
    if (mode === 'frag') {
      if (this.grenades <= 0) { this.game.hud.flashMessage('SEM GRANADAS', 900); this.game.audio.ui('error'); return; }
      this.grenades--;
    } else {
      if (this.flashbangs <= 0) { this.game.hud.flashMessage('SEM FLASHBANGS', 900); this.game.audio.ui('error'); return; }
      this.flashbangs--;
    }
    this.game.projectiles.throwGrenade(this.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), this.camDir, this.vel, mode);
    this.game.audio.blip(180, 0.12, 'triangle', 0.1);
    this.game.hud.updateGadgets();
  }

  useMedkit() {
    if (this.medkits <= 0) { this.game.hud.flashMessage('SEM MEDKITS', 900); this.game.audio.ui('error'); return; }
    if (this.health >= this.maxHealth) { this.game.hud.flashMessage('SAÚDE NO MÁXIMO', 900); return; }
    this.medkits--;
    this.health = Math.min(this.maxHealth, this.health + 65);
    this.game.audio.pickup('health');
    this.game.hud.updateHealth();
    this.game.hud.updateGadgets();
    this.game.hud.flashMessage('MEDKIT USADO +65', 1000);
  }

  toggleView() {
    this.thirdPerson = !this.thirdPerson;
    this.game.hud.flashMessage(this.thirdPerson ? 'CÂMERA: 3ª PESSOA' : 'CÂMERA: 1ª PESSOA', 900);
    this.game.hud.setThirdPerson(this.thirdPerson);
    this.game.audio.ui('tap');
  }

  update(dt) {
    const ctl = this.game.controls;
    const settings = this.game.settings;
    if (this.dead) {
      this.deathT += dt;
      const t = clamp(this.deathT / 1.1, 0, 1);
      this.pitch = lerp(this.pitch, 0.35, 1 - Math.exp(-3 * dt));
      this.eyeOffset = lerp(this.eyeOffset, -1.1, 1 - Math.exp(-3 * dt));
      this._updateCamera(dt, true);
      return;
    }

    // ---------- olhar ----------
    const look = ctl.consumeLook();
    this.game.controls.lookAccumX = look.x * 600;
    this.game.controls.lookAccumY = look.y * 600;
    this.yaw -= look.x;
    this.pitch = clamp(this.pitch - look.y, -1.35, 1.25);
    // recuo
    if (this.game.weapons.recoilPitch) {
      this.pitch = clamp(this.pitch + this.game.weapons.recoilPitch, -1.35, 1.25);
      this.yaw += this.game.weapons.recoilYaw;
      this.game.weapons.recoilPitch = 0;
      this.game.weapons.recoilYaw = 0;
    }

    // ---------- movimento ----------
    const mx = ctl.mx, my = ctl.my;
    const mag = Math.hypot(mx, my);
    const wantSprint = ctl.held.sprint && mag > 0.4 && !ctl.held.aim && this.stamina > 6;
    this.crouching = ctl.held.crouch;
    this.sprinting = wantSprint && !this.crouching;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - dt * 17);
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + dt * (this.crouching ? 16 : 11));
    }
    this.game.hud.updateStamina(this.stamina / this.maxStamina);

    const baseSpeed = 4.5;
    let speed = baseSpeed;
    if (this.crouching) speed *= 0.48;
    else if (this.sprinting) speed *= 1.62;
    if (ctl.held.aim) speed *= 0.62;
    speed *= (this.game.weapons.def.mobility || 1) * 0.5 + 0.5;
    speed *= settings.lowSpec ? 1 : 1;

    const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    let dx = (fwdX * -my + rightX * mx);
    let dz = (fwdZ * -my + rightZ * mx);
    const dl = Math.hypot(dx, dz);
    if (dl > 0.001) { dx /= dl; dz /= dl; }
    const targetVx = dx * speed * Math.min(1, mag), targetVz = dz * speed * Math.min(1, mag);
    const accel = this.sprinting ? 7 : 12;
    this.vel.x = damp(this.vel.x, targetVx, accel, dt);
    this.vel.z = damp(this.vel.z, targetVz, accel, dt);

    const oldX = this.pos.x, oldZ = this.pos.z;
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    this.game.world.moveEntity(this, nx, nz, 0.38);
    // separação de zumbis para não atravessar corpos
    for (const z of this.game.zombies.list) {
      if (z.dead) continue;
      const ddx = this.pos.x - z.pos.x, ddz = this.pos.z - z.pos.z;
      const d = Math.hypot(ddx, ddz);
      const minD = 0.55 * z.conf.scale + 0.35;
      if (d < minD && d > 0.0001) {
        const px = this.pos.x + (ddx / d) * (minD - d) * 0.55;
        const pz = this.pos.z + (ddz / d) * (minD - d) * 0.55;
        if (!this.game.world.collisionAt(px, this.pos.z, 0.34)) this.pos.x = px;
        if (!this.game.world.collisionAt(this.pos.x, pz, 0.34)) this.pos.z = pz;
      }
    }

    const moved = Math.hypot(this.pos.x - oldX, this.pos.z - oldZ);
    this.stats.distance += moved;
    this.moveSpeed = moved / Math.max(dt, 0.0001);
    this.noise = this.sprinting ? 1 : this.crouching ? 0.15 : this.moveSpeed > 0.4 ? 0.45 : 0.1;

    // passos
    if (this.moveSpeed > 0.6) {
      this.stepT -= dt * (this.moveSpeed / 2.2);
      if (this.stepT <= 0) {
        this.stepT = this.sprinting ? 0.32 : 0.48;
        this.game.audio.step('dirt', this.crouching ? 0.04 : this.sprinting ? 0.13 : 0.08);
        this.game.zombies.noise(this.pos, this.sprinting ? 16 : 7, 0.5);
        this.game.haptics.light();
      }
      this.bobT += dt * (this.sprinting ? 13 : 8.5);
    } else {
      this.bobT += dt * 1.4;
    }

    // regeneração lenta
    this.regenT -= dt;
    if (this.regenT <= 0 && this.health > 0 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + dt * 1.6);
      this.game.hud.updateHealth();
    }
    if (this.invuln > 0) this.invuln -= dt;

    // ---------- arma ----------
    const ws = this.game.weapons;
    if (ws.isGun) {
      if (ctl.held.fire) {
        // armas semi-automáticas: dispara no toque e continua em cadência se segurar
        if (ws.def.auto || !this._triggerHeld || (this._holdFire > 0.16)) ws.tryFire();
        this._holdFire = (this._holdFire || 0) + dt;
      } else {
        this._holdFire = 0;
      }
      this._triggerHeld = ctl.held.fire;
    } else if (ctl.held.fire) {
      ws.tryFire();
    }
    if (ctl.consume('reload')) ws.startReload();
    if (ctl.consume('swap')) ws.cycle(1);
    if (ctl.consume('swapBack')) ws.cycle(-1);
    if (ctl.consume('view')) this.toggleView();
    if (ctl.consume('flashlight')) this.toggleFlashlight();
    if (ctl.consume('heal')) this.useMedkit();
    if (ctl.consume('grenade')) this.tryUseGrenade('frag');
    if (ctl.consume('flash')) this.tryUseGrenade('flash');
    if (ctl.consume('w1')) { if (ws.owned.includes('pistol')) ws.equip('pistol'); }
    if (ctl.consume('w2')) { if (ws.owned.includes('smg')) ws.equip('smg'); }
    if (ctl.consume('w3')) { if (ws.owned.includes('rifle')) ws.equip('rifle'); }
    if (ctl.consume('w4')) { if (ws.owned.includes('shotgun')) ws.equip('shotgun'); }
    if (ctl.consume('w5')) { if (ws.owned.includes('knife')) ws.equip('knife'); }

    // ---------- câmera ----------
    this._updateCamera(dt, false);

    // ---------- avatar 3ª pessoa ----------
    if (this.thirdPerson) {
      this.avatarRoot.visible = true;
      this.avatarRoot.position.set(this.pos.x, 0, this.pos.z);
      const targetRot = this.yaw;
      this.avatarRoot.rotation.y = dampAngle(this.avatarRoot.rotation.y, targetRot, 12, dt);
      const h = this.avatar;
      const moving = this.moveSpeed > 0.4;
      if (moving) h.walkPhase = (h.walkPhase || 0) + dt * (this.sprinting ? 12 : 7);
      const wp = h.walkPhase || 0;
      const amp = moving ? (this.sprinting ? 0.85 : 0.5) : 0;
      h.legs.forEach((leg, i) => {
        leg.hip.rotation.x = Math.sin(wp + (i ? Math.PI : 0)) * amp;
        leg.knee.rotation.x = -Math.max(0, -Math.cos(wp + (i ? Math.PI : 0))) * amp * 1.3 - 0.05;
      });
      const aimT = this.game.weapons.aimAmount;
      h.arms[0].shoulder.rotation.x = -1.1 - this.pitch * 0.9;
      h.arms[0].shoulder.rotation.z = 0.15 + aimT * 0.22;
      h.arms[0].shoulder.rotation.y = -0.15 - aimT * 0.25;
      h.arms[1].shoulder.rotation.x = -1.2 - this.pitch * 0.9;
      h.arms[1].shoulder.rotation.z = -0.1 - aimT * 0.3;
      h.arms[1].shoulder.rotation.y = 0.1 + aimT * 0.2;
      h.arms.forEach(a => { a.elbow.rotation.x = -0.5 + aimT * 0.2; });
      h.torso.rotation.x = this.crouching ? 0.28 : (this.sprinting ? 0.16 : 0.03);
      h.head.rotation.x = -this.pitch * 0.7;
      h.body.position.y = this.crouching ? -0.55 : (moving ? Math.abs(Math.sin(wp)) * 0.03 : 0);
      h.torso.position.y = 1.2;
      this.avatarGun.visible = ws.def.type === 'gun';
    } else {
      this.avatarRoot.visible = false;
    }
    this.blob.position.set(this.pos.x, 0.03, this.pos.z);
    this.blob.visible = true;
  }

  _updateCamera(dt, dying) {
    const cam = this.camera;
    const head = this.eyeHeight;
    // bob
    const bobbing = this.moveSpeed > 0.5 && !this.sprinting ? 1 : this.sprinting ? 1.6 : 0;
    const bobY = Math.sin(this.bobT * 2) * 0.028 * bobbing;
    const bobX = Math.cos(this.bobT) * 0.02 * bobbing;
    const aimK = this.game.weapons.aimAmount;
    const fovBase = this.game.settings.fov;
    const fovTarget = this.thirdPerson ? fovBase + 4 : (aimK > 0.5 ? fovBase / this.game.weapons.def.zoom : fovBase);
    cam.fov = damp(cam.fov, fovTarget, 10, dt);
    cam.updateProjectionMatrix();

    const eyeY = head + bobY + this.eyeOffset;
    if (!this.thirdPerson) {
      cam.position.set(this.pos.x + bobX * Math.cos(this.yaw), eyeY, this.pos.z - bobX * Math.sin(this.yaw));
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      // tilt lateral suave ao andar
      cam.rotation.z = -this.vel.x * Math.cos(this.yaw) * 0 + Math.sin(this.bobT) * 0.0035 * bobbing;
      this.game.weapons.viewRoot.visible = !dying;
    } else {
      // 3ª pessoa: câmera atrás por cima do ombro (aproxima ao mirar)
      const aiming = this.game.weapons.aimAmount;
      const shoulder = 0.42 + aiming * 0.3;
      const wantDist = 3.6 + this.pitch * 1.2 - aiming * 1.15;
      const targetY = this.pos.y + 1.55 + this.pitch * 1.2;
      const dirX = Math.sin(this.yaw) * Math.cos(this.pitch);
      const dirY = -Math.sin(this.pitch);
      const dirZ = Math.cos(this.yaw) * Math.cos(this.pitch);
      let dist = wantDist;
      // evita atravessar paredes
      const from = new THREE.Vector3(this.pos.x, targetY, this.pos.z);
      const dir = new THREE.Vector3(dirX, dirY, dirZ).normalize();
      const wall = this.game.world.raycastWalls(from, dir, wantDist + 0.5);
      dist = Math.min(dist, Math.max(0.8, wall - 0.3));
      cam.position.set(
        this.pos.x + dir.x * dist + Math.cos(this.yaw) * shoulder,
        targetY + dir.y * dist + 0.12,
        this.pos.z + dir.z * dist - Math.sin(this.yaw) * shoulder
      );
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      // na 3ª pessoa a arma aparece nas mãos do avatar (sem viewmodel)
      this.game.weapons.viewRoot.visible = false;
    }
    cam.updateMatrixWorld();
    this.camDir.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}
