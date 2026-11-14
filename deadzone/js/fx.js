/* DEADZONE — efeitos visuais: partículas, sangue, traçantes, impactos */
import * as THREE from '../assets/vendor/three.module.js';
import { rand, TAU, clamp } from './util.js';

const MAX_PARTICLES = 900;

export class FX {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this._initParticles();
    this._initTracers();
    this._initShells();
    this._initPools();
    this._initImpacts();
    this.shake = 0;
    this.shakeT = 0;
    this.damageVignette = 0;
    this.flashLight = new THREE.PointLight(0xffa040, 0, 22, 2);
    this.scene.add(this.flashLight);
    this.explosions = [];
  }

  _initParticles() {
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pSize = new Float32Array(MAX_PARTICLES);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pMaxLife = new Float32Array(MAX_PARTICLES);
    this.pGrav = new Float32Array(MAX_PARTICLES);
    this.pDrag = new Float32Array(MAX_PARTICLES);
    this.pS0 = new Float32Array(MAX_PARTICLES);
    this.pIndex = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) this.pPos[i * 3 + 1] = -1000;
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      vertexShader: `
        attribute float size; attribute vec3 color; varying vec3 vColor;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * (300.0 / max(0.001,-mv.z)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); if(t.a < 0.02) discard; gl_FragColor = vec4(vColor, t.a); }`,
      transparent: true, depthWrite: false
    });
    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  _emit(pos, vel, color, size, life, gravity = -9.8, drag = 1.5) {
    const i = this.pIndex;
    this.pIndex = (this.pIndex + 1) % MAX_PARTICLES;
    this.pPos[i * 3] = pos.x; this.pPos[i * 3 + 1] = pos.y; this.pPos[i * 3 + 2] = pos.z;
    this.pVel[i * 3] = vel.x; this.pVel[i * 3 + 1] = vel.y; this.pVel[i * 3 + 2] = vel.z;
    this.pCol[i * 3] = color.r; this.pCol[i * 3 + 1] = color.g; this.pCol[i * 3 + 2] = color.b;
    this.pS0[i] = size;
    this.pSize[i] = size;
    this.pLife[i] = life;
    this.pMaxLife[i] = life;
    this.pGrav[i] = gravity;
    this.pDrag[i] = drag;
  }

  _initTracers() {
    this.tracers = [];
    const geo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd090, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerMat = mat.clone();
    this.tracerGeo = geo;
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(geo, this.tracerMat.clone());
      m.visible = false;
      m.frustumCulled = false;
      this.scene.add(m);
      this.tracers.push({ mesh: m, life: 0, max: 0.06 });
    }
    this.tracerIdx = 0;
  }

  _initShells() {
    this.shells = [];
    const geo = new THREE.CylinderGeometry(0.012, 0.014, 0.045, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9a247, metalness: 0.9, roughness: 0.35 });
    this.shellGeo = geo; this.shellMat = mat;
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.scene.add(m);
      this.shells.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
    this.shellIdx = 0;
  }

  _initPools() {
    this.pools = [];
    const mat = new THREE.MeshBasicMaterial({ map: this.game.tex.blood, transparent: true, opacity: 0.9, depthWrite: false });
    this.poolMat = mat;
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat.clone());
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 2;
      this.scene.add(m);
      this.pools.push({ mesh: m, life: 0, grow: 0 });
    }
    this.poolIdx = 0;
  }

  _initImpacts() {
    this.impacts = [];
    const geo = new THREE.SphereGeometry(0.06, 5, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffcc80, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.impactGeo = geo; this.impactMat = mat;
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      m.visible = false;
      this.scene.add(m);
      this.impacts.push({ mesh: m, life: 0 });
    }
    this.impactIdx = 0;
    // decalques de bala
    this.holes = [];
    const hgeo = new THREE.CircleGeometry(0.055, 6);
    const hmat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(hgeo, hmat);
      m.visible = false;
      this.scene.add(m);
      this.holes.push({ mesh: m, life: 0 });
    }
    this.holeIdx = 0;
  }

  bloodBurst(pos, dir, count = 14) {
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(
        dir.x * rand(1, 5) + rand(-2, 2),
        rand(0.4, 4),
        dir.z * rand(1, 5) + rand(-2, 2)
      );
      const dark = rand(0.16, 0.4);
      c.setRGB(dark * 1.6, dark * 0.18, dark * 0.18);
      this._emit(pos, v, c, rand(0.04, 0.12), rand(0.5, 1.2), -12, 0.8);
    }
    // névoa de sangue
    for (let i = 0; i < Math.floor(count / 3); i++) {
      const v = new THREE.Vector3(dir.x * 2 + rand(-1, 1), rand(0, 1.5), dir.z * 2 + rand(-1, 1));
      c.setRGB(0.24, 0.03, 0.03);
      this._emit(pos, v, c, rand(0.15, 0.3), rand(0.3, 0.6), -1.5, 3);
    }
  }

  bloodPool(pos, scale = 1) {
    const p = this.pools[this.poolIdx];
    this.poolIdx = (this.poolIdx + 1) % this.pools.length;
    p.mesh.position.set(pos.x + rand(-0.2, 0.2), 0.025, pos.z + rand(-0.2, 0.2));
    p.mesh.rotation.z = rand(0, TAU);
    p.mesh.scale.setScalar(0.4 * scale);
    p.mesh.visible = true;
    p.mesh.material.opacity = 0.9;
    p.max = 2.2 * scale;
    p.life = 60;
    p.grow = 1;
  }

  impact(pos, normal, metal = false) {
    const c = new THREE.Color();
    for (let i = 0; i < 7; i++) {
      const v = new THREE.Vector3(normal.x * rand(1, 4) + rand(-1.5, 1.5), normal.y * rand(1, 4) + rand(0, 2), normal.z * rand(1, 4) + rand(-1.5, 1.5));
      if (metal) c.setRGB(1.0, rand(0.55, 0.9), rand(0.1, 0.3));
      else c.setRGB(0.55, 0.52, 0.46);
      this._emit(pos, v, c, rand(0.02, 0.05), rand(0.15, 0.4), -8, 2);
    }
    const imp = this.impacts[this.impactIdx];
    this.impactIdx = (this.impactIdx + 1) % this.impacts.length;
    imp.mesh.position.copy(pos);
    imp.mesh.scale.setScalar(rand(0.6, 1.2));
    imp.mesh.visible = true;
    imp.life = 0.09;

    const h = this.holes[this.holeIdx];
    this.holeIdx = (this.holeIdx + 1) % this.holes.length;
    h.mesh.position.copy(pos).addScaledVector(normal, 0.012);
    h.mesh.lookAt(pos.clone().add(normal));
    h.mesh.visible = true;
    h.mesh.scale.setScalar(rand(0.7, 1.4));
    h.life = 25;
  }

  tracer(from, to, color = 0xffd090) {
    const t = this.tracers[this.tracerIdx];
    this.tracerIdx = (this.tracerIdx + 1) % this.tracers.length;
    const dist = from.distanceTo(to);
    if (dist < 0.5) return;
    t.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, dist);
    t.mesh.material.color.setHex(color);
    t.mesh.material.opacity = 0.9;
    t.mesh.visible = true;
    t.life = 0.055;
    t.max = 0.055;
  }

  ejectShell(pos, dir) {
    const s = this.shells[this.shellIdx];
    this.shellIdx = (this.shellIdx + 1) % this.shells.length;
    s.mesh.position.copy(pos);
    s.mesh.visible = true;
    s.vel.set(-dir.z * rand(1.5, 3) + rand(-0.5, 0.5), rand(1.5, 3.2), dir.x * rand(1.5, 3) + rand(-0.5, 0.5));
    s.spin.set(rand(-12, 12), rand(-12, 12), rand(-12, 12));
    s.life = 2.5;
  }

  explosion(pos, radius = 6) {
    const light = new THREE.PointLight(0xffa040, 30, radius * 3, 2);
    light.position.copy(pos).add(new THREE.Vector3(0, 1.2, 0));
    this.scene.add(light);
    const c = new THREE.Color();
    for (let i = 0; i < 70; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(3, 14));
      const k = rand(0, 1);
      if (k < 0.55) c.setRGB(1.0, rand(0.4, 0.8), rand(0.05, 0.2));
      else c.setRGB(rand(0.12, 0.3), rand(0.1, 0.22), rand(0.08, 0.18));
      this._emit(pos, v, c, rand(0.15, 0.5), rand(0.5, 1.6), -3, 1.2);
    }
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    sphere.position.copy(pos);
    this.scene.add(sphere);
    this.explosions.push({ mesh: sphere, light, t: 0, max: 0.45, radius });
    this.addShake(0.9);
    this.flashLight.position.copy(pos).add(new THREE.Vector3(0, 1, 0));
    this.flashLight.intensity = 40;
  }

  addShake(v) { this.shake = Math.min(1.6, this.shake + v); }

  damageFlash(v) { this.damageVignette = Math.min(1, this.damageVignette + v); }

  update(dt, camera) {
    // partículas
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) { this.pPos[i * 3 + 1] = -1000; this.pSize[i] = 0; continue; }
      const d = Math.exp(-this.pDrag[i] * dt);
      this.pVel[i * 3] *= d;
      this.pVel[i * 3 + 1] = this.pVel[i * 3 + 1] * d + this.pGrav[i] * dt;
      this.pVel[i * 3 + 2] *= d;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (this.pPos[i * 3 + 1] < 0.02) {
        this.pPos[i * 3 + 1] = 0.02;
        this.pVel[i * 3 + 1] *= -0.25;
        this.pVel[i * 3] *= 0.5; this.pVel[i * 3 + 2] *= 0.5;
      }
      const t = this.pLife[i] / this.pMaxLife[i];
      this.pSize[i] = this.pS0[i] * (0.35 + t * 0.75);
    }
    const pGeo = this.particles.geometry;
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
    pGeo.attributes.size.needsUpdate = true;

    // traçantes
    for (const t of this.tracers) {
      if (!t.mesh.visible) continue;
      t.life -= dt;
      t.mesh.material.opacity = clamp(t.life / t.max, 0, 1) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
    // cápsulas
    for (const s of this.shells) {
      if (!s.mesh.visible) continue;
      s.life -= dt;
      s.vel.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.mesh.position.y < 0.03) { s.mesh.position.y = 0.03; s.vel.y *= -0.3; s.vel.multiplyScalar(0.7); }
      s.mesh.rotation.x += s.spin.x * dt; s.mesh.rotation.y += s.spin.y * dt; s.mesh.rotation.z += s.spin.z * dt;
      if (s.life <= 0) s.mesh.visible = false;
    }
    // poças
    for (const p of this.pools) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      if (p.grow > 0) {
        p.mesh.scale.setScalar(clamp(p.mesh.scale.x + dt * p.max * 0.55, 0, p.max));
      }
      if (p.life <= 0) p.mesh.visible = false;
      else if (p.life < 8) p.mesh.material.opacity = Math.max(0, p.life / 8) * 0.9;
    }
    // impactos
    for (const im of this.impacts) {
      if (!im.mesh.visible) continue;
      im.life -= dt;
      im.mesh.material.opacity = clamp(im.life / 0.09, 0, 1);
      im.mesh.scale.multiplyScalar(1 + dt * 8);
      if (im.life <= 0) im.mesh.visible = false;
    }
    for (const h of this.holes) {
      if (!h.mesh.visible) continue;
      h.life -= dt;
      if (h.life <= 0) h.mesh.visible = false;
    }
    // explosões
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.t += dt;
      const k = e.t / e.max;
      e.mesh.scale.setScalar(0.6 + k * e.radius * 0.9);
      e.mesh.material.opacity = Math.max(0, 0.85 * (1 - k));
      e.light.intensity = Math.max(0, 30 * (1 - k * 1.4));
      if (k >= 1) {
        this.scene.remove(e.mesh);
        this.scene.remove(e.light);
        e.mesh.geometry.dispose(); e.mesh.material.dispose();
        this.explosions.splice(i, 1);
      }
    }
    if (this.flashLight.intensity > 0) this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 140);

    // shake
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.damageVignette = Math.max(0, this.damageVignette - dt * 1.8);
    if (camera) {
      if (this.shake > 0.001) {
        const s = this.shake * this.shake * 0.06;
        camera.position.x += rand(-s, s) * 0.5;
        camera.position.y += rand(-s, s) * 0.5;
        camera.rotation.z += rand(-s, s) * 0.35;
      }
    }
  }

  reset() {
    this.pLife.fill(0);
    this.pPos.fill(-1000);
    for (const t of this.tracers) t.mesh.visible = false;
    for (const p of this.pools) p.mesh.visible = false;
    for (const s of this.shells) s.mesh.visible = false;
    this.damageVignette = 0;
    this.shake = 0;
  }
}
