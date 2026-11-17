/* Studio Tz — motor de animação 3D (three.js, roda inteiro no celular) */
(function (global) {
  'use strict';

  const CHAR_HEIGHT = 2.0; // altura do personagem

  /* ---------- texturas procedimentais ---------- */
  function makeTileTexture(THREE, base, speck, size) {
    const c = document.createElement('canvas');
    c.width = c.height = size || 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = speck;
    for (let i = 0; i < 180; i++) {
      const x = Math.floor(Math.random() * c.width);
      const y = Math.floor(Math.random() * c.height);
      const r = 1 + Math.floor(Math.random() * 2);
      ctx.fillRect(x, y, r, r);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    else tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function makeSolidTexture(THREE, color, size) {
    return makeTileTexture(THREE, color, color, size || 8);
  }

  /* ---------- personagem ---------- */
  function createCharacter(THREE, skin) {
    const R = StudioSkins.regionsFor(skin);
    const mat = (key) => new THREE.MeshLambertMaterial({
      map: StudioSkins.regionTexture(THREE, skin, key)
    });

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat('head'));
    head.position.y = 1.52;

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.65, 0.32), mat('body'));
    body.position.y = 1.02;

    const armGeo = new THREE.BoxGeometry(0.16, 0.62, 0.16);
    const armL = new THREE.Mesh(armGeo, mat('armL'));
    armL.position.set(-0.38, 1.06, 0);
    const armR = new THREE.Mesh(armGeo, mat('armR'));
    armR.position.set(0.38, 1.06, 0);

    const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const legL = new THREE.Mesh(legGeo, mat('legL'));
    legL.position.set(-0.15, 0.35, 0);
    const legR = new THREE.Mesh(legGeo, mat('legR'));
    legR.position.set(0.15, 0.35, 0);

    // olhos (piscar)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eyeGeo = new THREE.PlaneGeometry(0.12, 0.12);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.11, 1.57, 0.255);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.11, 1.57, 0.255);

    // boca (sincronia labial)
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x5a1020 });
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.08), mouthMat);
    mouth.position.set(0, 1.44, 0.255);
    mouth.scale.set(0.3, 0.05, 1);

    const group = new THREE.Group();
    group.add(head, body, armL, armR, legL, legR, eyeL, eyeR, mouth);

    return {
      name: skin.name,
      skin,
      group,
      parts: { head, body, armL, armR, legL, legR, eyeL, eyeR, mouth },
      mats: [head.material, body.material, armL.material, armR.material, legL.material, legR.material],
      state: 'idle',
      t: 0,
      talk: null,        // {text, dur, t}
      blinkTimer: 1 + Math.random() * 3,
      blinkPhase: 0,
      hurtFlash: 0,
      lookDir: 0
    };
  }

  function updateCharacter(THREE, ch, dt, time) {
    const p = ch.parts;
    const t = ch.t;

    // piscar
    ch.blinkTimer -= dt;
    if (ch.blinkTimer <= 0) {
      ch.blinkPhase = 0.15;
      ch.blinkTimer = 2.2 + Math.random() * 4.5;
    }
    if (ch.blinkPhase > 0) {
      ch.blinkPhase -= dt;
      const k = Math.sin((1 - ch.blinkPhase / 0.15) * Math.PI);
      const s = 0.06 + 0.94 * k;
      p.eyeL.scale.y = s;
      p.eyeR.scale.y = s;
    } else {
      p.eyeL.scale.y = 1;
      p.eyeR.scale.y = 1;
    }

    // falando (sincronia labial)
    if (ch.talk) {
      ch.talk.t += dt;
      const ph = ch.talk.t / ch.talk.dur;
      const shape = 0.5 + 0.5 * Math.sin(ch.talk.t * 13 + ch.group.position.x);
      p.mouth.scale.set(0.28 + 0.2 * (ph % 0.5 > 0.25 ? 1 : 0.5), 0.12 + 0.3 * shape, 1);
      p.mouth.visible = true;
    } else {
      p.mouth.visible = false;
    }

    // animações
    p.armL.rotation.x = 0;
    p.armR.rotation.x = 0;
    p.armL.rotation.z = 0;
    p.armR.rotation.z = 0;
    p.legL.rotation.x = 0;
    p.legR.rotation.x = 0;
    p.head.rotation.y = 0;
    p.head.rotation.x = 0;
    p.body.rotation.z = 0;
    p.body.rotation.x = 0;
    ch.group.position.y = 0;
    ch.group.rotation.y = 0;

    if (ch.state === 'idle' || ch.state === 'look') {
      ch.group.position.y = Math.sin(t * 2.2) * 0.02;
      p.armL.rotation.z = Math.sin(t * 1.6) * 0.06;
      p.armR.rotation.z = -Math.sin(t * 1.6) * 0.06;
      const look = ch.state === 'look' ? ch.lookDir : Math.sin(t * 0.4) * 0.25;
      p.head.rotation.y = look;
    } else if (ch.state === 'walk') {
      const s = Math.sin(t * 7);
      p.legL.rotation.x = s * 0.7;
      p.legR.rotation.x = -s * 0.7;
      p.armL.rotation.x = -s * 0.55;
      p.armR.rotation.x = s * 0.55;
      ch.group.position.y = Math.abs(Math.sin(t * 7)) * 0.05;
      ch.group.position.x = Math.sin(t * 7) * 0.02;
    } else if (ch.state === 'attack') {
      p.armR.rotation.x = -1.3 + (t < 0.35 ? (t / 0.35) * 1.6 : Math.max(0, 1 - (t - 0.35) / 0.4) * 1.6);
      p.body.rotation.x = Math.max(0, 0.35 - t * 0.8);
      p.armL.rotation.x = -0.4;
    } else if (ch.state === 'hit') {
      ch.hurtFlash = Math.max(0, ch.hurtFlash - dt);
      const flash = ch.hurtFlash > 0 ? 0.8 : 0;
      for (let m of ch.mats) {
        if (m.emissive) {
          m.emissive.setRGB(flash * 0.6, 0, 0);
        }
      }
      p.body.rotation.z = -0.22 * Math.max(0, 1 - t * 2.5);
      p.body.rotation.x = 0.15 * Math.max(0, 1 - t * 2.5);
      ch.group.position.y = Math.max(0, 1 - t * 3) * -0.08;
    } else if (ch.state === 'wave') {
      p.armR.rotation.z = -2.3 + Math.sin(t * 8) * 0.3;
      p.armR.rotation.x = 0.3;
      ch.group.position.y = Math.sin(t * 2.5) * 0.02;
    }
  }

  /* ---------- motor ---------- */
  function StudioEngine(canvas, audio) {
    this.canvas = canvas;
    this.audio = audio;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.envGroup = null;
    this.characters = [];
    this.subtitle = null;
    this.subtitleText = '';
    this.effects = [];
    this.running = false;
    this.raf = null;
    this.clock = new THREE.Clock();
    this.outW = 1280;
    this.outH = 720;
    this.aspect = 16 / 9;

    // playback
    this.timeline = null;
    this.playing = false;
    this.paused = false;
    this.sceneIdx = 0;
    this.sceneTime = 0;
    this.sceneDur = 0;
    this.beatIdx = 0;
    this.beatStarts = [];
    this.totalDur = 0;
    this.elapsed = 0;
    this.recorder = null;
    this.chunks = [];
    this.onProgress = null;
    this.onDone = null;

    // camera
    this.camPos = new THREE.Vector3(0, 3, 8);
    this.camLook = new THREE.Vector3(0, 1.2, 0);
    this.camTargetPos = new THREE.Vector3(0, 3, 8);
    this.camTargetLook = new THREE.Vector3(0, 1.2, 0);
    this.shot = 'medium';
  }

  StudioEngine.prototype.init = function () {
    if (this.renderer) return true;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    } catch (e) {
      return false;
    }
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    if ('outputEncoding' in this.renderer && THREE.sRGBEncoding !== undefined) {
      this.renderer.outputEncoding = THREE.sRGBEncoding;
    }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 200);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // luzes
    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a5a3a, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
    sun.position.set(8, 14, 6);
    this.scene.add(sun);
    this.sun = sun;

    // subtítulo sprite
    this.subtitle = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._blankCanvasTexture(),
      transparent: true,
      depthTest: false
    }));
    this.subtitle.renderOrder = 10;
    this.subtitle.visible = false;
    this.scene.add(this.subtitle);

    this.setEnvironment('plains');
    this.running = true;
    const self = this;
    this.raf = requestAnimationFrame(function loop() {
      if (self.running) {
        const dt = Math.min(0.1, self.clock.getDelta());
        self.update(dt);
        self.renderer.render(self.scene, self.camera);
      }
      self.raf = requestAnimationFrame(loop);
    });
    return true;
  };

  StudioEngine.prototype._blankCanvasTexture = function () {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const tex = new THREE.CanvasTexture(c);
    return tex;
  };

  /* ---------- ambientes ---------- */
  StudioEngine.prototype.setEnvironment = function (preset) {
    if (this.envGroup) {
      this.scene.remove(this.envGroup);
      this.envGroup.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map && o.material.map !== this._sharedTex) o.material.map.dispose();
          o.material.dispose();
        }
      });
    }
    this.envGroup = new THREE.Group();
    const T = THREE;

    const env = preset || 'plains';
    let sky = 0x8fc6ff, fogColor = 0xcfe4ff, groundBase = '#6ab04c', groundSpeck = '#5aa03c', fogNear = 18, fogFar = 60;
    let sunInt = 1.1, sunColor = 0xfff2d8;

    if (env === 'forest') {
      sky = 0x5a8f4e; fogColor = 0x8fb88a; groundBase = '#4d8a3f'; groundSpeck = '#3f7a32';
    } else if (env === 'desert') {
      sky = 0xf2c98a; fogColor = 0xf0d3a0; groundBase = '#d9b26a'; groundSpeck = '#c9a35b'; fogNear = 24; fogFar = 80;
    } else if (env === 'village') {
      sky = 0x9fd0ff; fogColor = 0xcfe4ff; groundBase = '#7d9b4a'; groundSpeck = '#6d8b3c';
    } else if (env === 'nether') {
      sky = 0x2a0f10; fogColor = 0x3a1214; groundBase = '#5a2a22'; groundSpeck = '#4a221c';
      sunInt = 0.5; sunColor = 0xff9a66; fogNear = 8; fogFar = 36;
    } else if (env === 'ocean') {
      sky = 0x8fd0ff; fogColor = 0xbfe6ff; groundBase = '#3f93c8'; groundSpeck = '#3586b8'; fogNear = 20; fogFar = 70;
    }

    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
    this.sun.intensity = sunInt;
    this.sun.color.set(sunColor);

    // chão
    const groundTex = makeTileTexture(T, groundBase, groundSpeck, 64);
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.envGroup.add(ground);

    const block = (w, h, d, color, x, y, z, emissive) => {
      const mat = new THREE.MeshLambertMaterial({
        map: makeSolidTexture(T, color, 8),
        emissive: emissive ? new THREE.Color(emissive) : new THREE.Color(0x000000)
      });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      this.envGroup.add(m);
      return m;
    };

    if (env === 'forest') {
      for (let i = 0; i < 14; i++) {
        const x = (Math.random() - 0.5) * 60, z = (Math.random() - 0.5) * 60;
        block(0.6, 3, 0.6, '#6b4a2b', x, 1.5, z);
        block(2.6, 2.4, 2.6, '#2f6b34', x, 3.8, z);
        block(2.0, 1.8, 2.0, '#3a7d3c', x, 5.0, z);
      }
    } else if (env === 'desert') {
      for (let i = 0; i < 8; i++) {
        const x = (Math.random() - 0.5) * 50, z = (Math.random() - 0.5) * 50;
        block(4 + Math.random() * 5, 1.2 + Math.random() * 2, 4 + Math.random() * 5, '#e0bd7a', x, 0.8, z);
      }
      block(0.8, 3, 0.8, '#8a6a3a', 6, 1.5, -5);
      block(1.6, 1.4, 1.6, '#b88a52', 6, 3.2, -5);
    } else if (env === 'village') {
      // casas
      for (let i = 0; i < 4; i++) {
        const x = (i % 2 === 0 ? -7 : 7) + (Math.random() - 0.5) * 4;
        const z = (Math.random() - 0.5) * 26;
        block(3.2, 2.4, 3.2, '#d8c9a0', x, 1.2, z);
        block(3.6, 0.8, 3.6, '#a04030', x, 2.9, z);
        block(0.9, 1.6, 0.4, '#6b4a2b', x + 0.7, 0.8, z + 1.8);
        block(1, 1, 1, '#5a5a5a', x + 1.6, 2.6, z - 1.4);
      }
      // muretas
      for (let i = -2; i <= 2; i++) {
        block(2, 0.8, 0.6, '#9a8a6a', i * 5, 0.4, -14);
      }
    } else if (env === 'nether') {
      // portal
      const portalMat = new THREE.MeshBasicMaterial({ color: 0x7a2bff, transparent: true, opacity: 0.9 });
      const pfr = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.25, 8, 24), portalMat);
      pfr.position.set(0, 1.3, -6);
      this.envGroup.add(pfr);
      this._portal = pfr;
      block(0.8, 2.6, 0.8, '#1c1c22', -1.5, 1.3, -6);
      block(0.8, 2.6, 0.8, '#1c1c22', 1.5, 1.3, -6);
      block(0.8, 2.6, 0.8, '#1c1c22', 0, 1.3, -7.5);
      block(0.8, 2.6, 0.8, '#1c1c22', 0, 1.3, -4.5);
      // lava
      const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a1e });
      const lava = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), lavaMat);
      lava.rotation.x = -Math.PI / 2;
      lava.position.y = 0.05;
      this.envGroup.add(lava);
      for (let i = 0; i < 8; i++) {
        const x = (Math.random() - 0.5) * 46, z = (Math.random() - 0.5) * 46;
        block(1.5, 3 + Math.random() * 5, 1.5, '#2a2a30', x, 1.5, z);
      }
    } else if (env === 'ocean') {
      const waterMat = new THREE.MeshLambertMaterial({
        color: 0x2f7fb8, transparent: true, opacity: 0.75
      });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.15;
      this.envGroup.add(water);
      this._water = water;
      block(3, 0.5, 3, '#e8dcc0', 6, 0.25, -4);
    } else {
      // plains: árvores espalhadas + flores
      for (let i = 0; i < 10; i++) {
        const x = (Math.random() - 0.5) * 55, z = (Math.random() - 0.5) * 55;
        block(0.6, 3, 0.6, '#6b4a2b', x, 1.5, z);
        block(2.6, 2.4, 2.6, '#3f8f43', x, 3.8, z);
      }
      for (let i = 0; i < 12; i++) {
        const x = (Math.random() - 0.5) * 40, z = (Math.random() - 0.5) * 40;
        block(0.5, 0.5, 0.5, '#e0556a', x, 0.25, z);
      }
    }

    this.scene.add(this.envGroup);
  };

  /* ---------- elenco de personagens ---------- */
  StudioEngine.prototype.setCast = function (list) {
    for (const ch of this.characters) {
      this.scene.remove(ch.group);
    }
    this.characters = [];
    (list || []).forEach((c, i) => {
      const ch = createCharacter(THREE, c.skin);
      ch.name = c.name;
      ch.group.position.set((i - (list.length - 1) / 2) * 1.6, 0, 0);
      this.scene.add(ch.group);
      this.characters.push(ch);
    });
  };

  StudioEngine.prototype.findChar = function (name) {
    if (!name || name === 'narrador' || name === 'Narrador') return null;
    const n = name.toLowerCase();
    return this.characters.find(c => c.name.toLowerCase() === n) || this.characters[0] || null;
  };

  /* ---------- câmera ---------- */
  StudioEngine.prototype.setShot = function (shot, cut) {
    this.shot = shot;
    const focus = this.characters.length ? this.characters[0].group.position.clone() : new THREE.Vector3(0, 1, 0);
    let pos, look;
    if (shot === 'close') {
      pos = new THREE.Vector3(focus.x, focus.y + 1.35, focus.z + 2.0);
      look = new THREE.Vector3(focus.x, focus.y + 1.5, focus.z);
    } else if (shot === 'medium') {
      pos = new THREE.Vector3(focus.x, focus.y + 1.35, focus.z + 4.0);
      look = new THREE.Vector3(focus.x, focus.y + 1.1, focus.z);
    } else if (shot === 'wide') {
      pos = new THREE.Vector3(focus.x, focus.y + 2.6, focus.z + 8.5);
      look = new THREE.Vector3(focus.x, focus.y + 1.0, focus.z);
    } else if (shot === 'orbit') {
      const a = this.clock.elapsedTime * 0.25;
      pos = new THREE.Vector3(focus.x + Math.sin(a) * 4.5, focus.y + 1.8, focus.z + Math.cos(a) * 4.5);
      look = new THREE.Vector3(focus.x, focus.y + 1.2, focus.z);
    } else { // follow
      pos = new THREE.Vector3(focus.x, focus.y + 1.5, focus.z - 3.6);
      look = new THREE.Vector3(focus.x, focus.y + 1.1, focus.z);
    }
    this.camTargetPos.copy(pos);
    this.camTargetLook.copy(look);
    if (cut) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
      this.camera.position.copy(pos);
      this.camera.lookAt(look);
    }
  };

  /* ---------- subtítulos ---------- */
  StudioEngine.prototype.showSubtitle = function (text) {
    if (text === this.subtitleText) return;
    this.subtitleText = text || '';
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (text) {
      const lines = wrapText(ctx, text, 40);
      ctx.font = 'bold 30px sans-serif';
      const lh = 42;
      const total = lines.length * lh;
      ctx.fillStyle = 'rgba(0,0,0,.62)';
      const pad = 16;
      ctx.beginPath();
      roundRect(ctx, 10, 10, c.width - 20, total + pad * 2, 18);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach((ln, i) => ctx.fillText(ln, c.width / 2, 10 + pad + lh / 2 + i * lh));
      this.subtitle.visible = true;
    } else {
      this.subtitle.visible = false;
    }
    this.subtitle.material.map.dispose();
    this.subtitle.material.map = new THREE.CanvasTexture(c);
    this.subtitle.material.needsUpdate = true;
  };

  function wrapText(ctx, text, maxChars) {
    const words = text.split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > maxChars) {
        if (cur) lines.push(cur);
        cur = w;
        while (cur.length > maxChars) {
          lines.push(cur.slice(0, maxChars));
          cur = cur.slice(maxChars);
        }
      } else {
        cur = (cur + ' ' + w).trim();
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- efeitos ---------- */
  StudioEngine.prototype.triggerFx = function (fx, at) {
    const T = THREE;
    const pos = at || new THREE.Vector3(0, 1, 0);
    if (fx === 'hit') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.35, 0.05, 8, 20),
        new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true })
      );
      ring.position.set(pos.x, 0.3, pos.z);
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
      this.effects.push({ obj: ring, life: 0.5, max: 0.5, kind: 'ring' });
      const ch = this.characters.find(c => Math.abs(c.group.position.x - pos.x) < 2);
      if (ch) {
        ch.state = 'hit'; ch.t = 0; ch.hurtFlash = 0.3;
      }
      this.audio.sfx('hit');
    } else if (fx === 'portal') {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.0 + i * 0.25, 0.06, 8, 28),
          new THREE.MeshBasicMaterial({ color: 0x9a4dff, transparent: true, opacity: 0.9 })
        );
        ring.position.set(pos.x, 1.4, pos.z);
        g.add(ring);
      }
      this.scene.add(g);
      this.effects.push({ obj: g, life: 1.6, max: 1.6, kind: 'portal' });
      this.audio.sfx('portal');
    } else if (fx === 'fogo') {
      for (let i = 0; i < 8; i++) {
        const f = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.35, 0.35),
          new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true })
        );
        f.position.set(pos.x + (Math.random() - 0.5) * 0.8, 0.2, pos.z + (Math.random() - 0.5) * 0.8);
        this.scene.add(f);
        this.effects.push({
          obj: f, life: 0.9 + Math.random() * 0.6, max: 1.2, kind: 'flame',
          vy: 1.2 + Math.random() * 0.8
        });
      }
      this.audio.sfx('fogo');
    }
  };

  StudioEngine.prototype.updateEffects = function (dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      const k = Math.max(0, e.life / e.max);
      if (e.kind === 'ring') {
        e.obj.scale.setScalar(1 + (1 - k) * 2.5);
        e.obj.material.opacity = k;
      } else if (e.kind === 'portal') {
        e.obj.rotation.z += dt * 2;
        e.obj.scale.setScalar(0.4 + (1 - k) * 0.8);
        e.obj.children.forEach(c => { c.material.opacity = 0.3 + k * 0.6; });
      } else if (e.kind === 'flame') {
        e.obj.position.y += e.vy * dt;
        e.obj.material.opacity = k;
        e.obj.scale.setScalar(0.5 + k * 0.8);
      }
      if (e.life <= 0) {
        this.scene.remove(e.obj);
        e.obj.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        this.effects.splice(i, 1);
      }
    }
    if (this._portal) this._portal.rotation.z += dt * 0.6;
    if (this._water) {
      this._water.material.opacity = 0.7 + Math.sin(this.clock.elapsedTime * 1.5) * 0.08;
    }
  };

  /* ---------- playback ---------- */
  StudioEngine.prototype.setOutputSize = function (w, h) {
    this.outW = w; this.outH = h;
    this.aspect = w / h;
    if (this.renderer) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = this.aspect;
      this.camera.updateProjectionMatrix();
    }
    if (this.subtitle) {
      const sx = this.aspect > 1 ? 3.0 : 2.2;
      this.subtitle.scale.set(sx, sx * 0.32, 1);
      this.subtitle.position.set(0, this.aspect > 1 ? -1.25 : -1.0, 0);
    }
  };

  StudioEngine.prototype.play = function (scriptObj, opts) {
    opts = opts || {};
    this.stop();
    if (!this.renderer) return;
    this.timeline = scriptObj;
    this.totalDur = 0;
    this.sceneIdx = 0;
    this.elapsed = 0;
    for (const s of scriptObj.scenes) {
      this.totalDur += StudioScript.sceneDuration(s);
    }
    this.onProgress = opts.onProgress || null;
    this.onDone = opts.onDone || null;
    this.playing = true;
    this.paused = false;

    // ambiente + elenco da primeira cena
    const first = scriptObj.scenes[0];
    this.setEnvironment(first.preset);
    this.setCast(this.castFor(scriptObj));

    // música padrão
    const defaultTrack = opts.music || 'epica';
    this.audio.setMusic(defaultTrack);

    this._enterScene(0, true);
    if (opts.render) this._startRecording();
  };

  StudioEngine.prototype.castFor = function (scriptObj) {
    // elenco: personagens definidos no roteiro; skins trazidas pelo app
    return this._castSkins.map(c => c);
  };

  StudioEngine.prototype._enterScene = function (idx, first) {
    const scene = this.timeline.scenes[idx];
    this.sceneIdx = idx;
    this.sceneTime = 0;
    this.sceneDur = StudioScript.sceneDuration(scene);
    this.beatIdx = 0;
    this.beatStarts = [];
    let acc = 0;
    for (const b of scene.beats) {
      this.beatStarts.push(acc);
      acc += StudioScript.beatDuration(b);
    }
    this.setEnvironment(scene.preset);
    this.setShot(scene.camera, scene.cut || first);
    if (scene.music) this.audio.setMusic(scene.music);
    // personagens voltam ao idle no início de cada cena
    for (const ch of this.characters) {
      ch.state = 'idle'; ch.t = 0; ch.talk = null;
    }
    this.showSubtitle('');
  };

  StudioEngine.prototype._updatePlayback = function (dt) {
    if (!this.playing || this.paused) return;
    const scene = this.timeline.scenes[this.sceneIdx];
    this.sceneTime += dt;

    // beats
    while (this.beatIdx < scene.beats.length && this.sceneTime >= this.beatStarts[this.beatIdx]) {
      const beat = scene.beats[this.beatIdx];
      this._runBeat(beat);
      this.beatIdx++;
    }

    if (this.sceneTime >= this.sceneDur) {
      if (this.sceneIdx < this.timeline.scenes.length - 1) {
        this._enterScene(this.sceneIdx + 1, false);
      } else {
        this.elapsed = this.totalDur;
        this.playing = false;
        this.audio.stopMusic();
        this.showSubtitle('');
        const url = this._stopRecording();
        if (this.onDone) this.onDone(url);
        return;
      }
    }
    this.elapsed = this.totalDur - (this.sceneDur - this.sceneTime) - sumRest(this.timeline, this.sceneIdx);
    if (this.onProgress) {
      this.onProgress(Math.max(0, Math.min(1, this.elapsed / this.totalDur)), this.elapsed, this.totalDur);
    }
  };

  function sumRest(tl, idx) {
    let s = 0;
    for (let i = idx + 1; i < tl.scenes.length; i++) s += StudioScript.sceneDuration(tl.scenes[i]);
    return s;
  }

  StudioEngine.prototype._runBeat = function (beat) {
    if (beat.type === 'falar') {
      this.showSubtitle(beat.text);
      const ch = this.findChar(beat.name);
      if (ch) {
        const dur = StudioScript.beatDuration(beat);
        ch.talk = { text: beat.text, dur: dur, t: 0 };
        ch.state = 'look';
        ch.lookDir = 0;
      }
    } else if (beat.type === 'anima') {
      const targets = beat.name
        ? [this.findChar(beat.name)].filter(Boolean)
        : this.characters;
      const dur = StudioScript.beatDuration(beat);
      for (const ch of targets) {
        ch.state = beat.anim;
        ch.t = 0;
        ch._animDur = dur;
      }
    } else if (beat.type === 'efeito') {
      const ch = this.characters[0];
      const at = ch ? ch.group.position.clone() : new THREE.Vector3(0, 0, 0);
      this.triggerFx(beat.fx, at);
    }
  };

  StudioEngine.prototype._setIdleAfter = function (ch) {
    if (ch && ch._animDur !== undefined) {
      if (ch.t >= ch._animDur) {
        ch.state = 'idle';
        ch._animDur = undefined;
      }
    }
  };

  /* ---------- gravação ---------- */
  StudioEngine.prototype._startRecording = function () {
    const canvas = this.renderer.domElement;
    const fps = 30;
    const videoStream = canvas.captureStream(fps);
    let tracks = videoStream.getVideoTracks();
    let audioStream = null;
    try {
      audioStream = this.audio.stream();
      if (audioStream) tracks = tracks.concat(audioStream.getAudioTracks());
    } catch (e) { /* sem áudio */ }
    const stream = new MediaStream(tracks);
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    let mime = candidates.find(c => window.MediaRecorder && MediaRecorder.isTypeSupported(c)) || '';
    try {
      this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      this.recorder = null;
      return;
    }
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: 'video/webm' });
      this._lastBlob = blob;
      this._lastUrl = URL.createObjectURL(blob);
    };
    this.recorder.start(100);
  };

  StudioEngine.prototype._stopRecording = function () {
    let url = null;
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    if (this._lastUrl) {
      url = this._lastUrl;
      this._lastUrl = null;
    }
    this.recorder = null;
    return url;
  };

  StudioEngine.prototype.pause = function () {
    this.paused = true;
    try { this.audio.ctx.suspend(); } catch (e) {}
  };

  StudioEngine.prototype.resume = function () {
    this.paused = false;
    try { this.audio.ctx.resume(); } catch (e) {}
  };

  StudioEngine.prototype.stop = function () {
    if (this.playing) {
      this.playing = false;
      this._stopRecording();
      this.audio.stopMusic();
    }
    this.showSubtitle('');
    for (const ch of this.characters) {
      ch.state = 'idle'; ch.t = 0; ch.talk = null; ch.hurtFlash = 0;
      ch.mats.forEach(m => m.emissive && m.emissive.setRGB(0, 0, 0));
    }
  };

  /* ---------- loop principal ---------- */
  StudioEngine.prototype.update = function (dt) {
    const time = this.clock.elapsedTime;
    for (const ch of this.characters) {
      ch.t += dt;
      this._setIdleAfter(ch);
      updateCharacter(THREE, ch, dt, time);
    }
    this.updateEffects(dt);

    // câmera suave (transição cinematográfica)
    const k = 1 - Math.exp(-dt * 4.5);
    this.camPos.lerp(this.camTargetPos, k);
    this.camLook.lerp(this.camTargetLook, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // subtítulo acentuado quando falando
    if (this.subtitle.visible && this.subtitle.material) {
      this.subtitle.material.opacity = 0.95;
    }

    this._updatePlayback(dt);
  };

  /* ---------- modo estúdio (fundo da tela) ---------- */
  StudioEngine.prototype.setStudioIdle = function (list, shot) {
    this.stop();
    if (!this.renderer) return;
    this.setEnvironment('plains');
    this.setCast(list || []);
    this.setShot(shot || 'orbit', true);
  };

  StudioEngine.prototype.dispose = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.stop();
    if (this.renderer) {
      this.renderer.dispose();
    }
  };

  global.StudioEngine = StudioEngine;
})(window);
