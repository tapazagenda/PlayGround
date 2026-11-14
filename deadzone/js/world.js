/* DEADZONE — mundo: cenário procedural, colisão, objetivos */
import * as THREE from '../assets/vendor/three.module.js';
import { makeRng, rand, pick, clamp, TAU } from './util.js';
import { mergeGeometries } from '../assets/vendor/addons/utils/BufferGeometryUtils.js';
import { buildCarModel, buildBarrel, buildCrate, buildSandbag, buildLampPost, buildTrafficCone, buildTyre, buildDumpster, buildRoadSign } from './models.js';

const WORLD_HALF = 108;
const ROAD_W = 15;
const ROAD_LINES = [-63, 0, 63];

export class World {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.blockers = [];
    this.visualBlockers = [];
    this.roads = [];
    this.buildings = [];
    this.lootSpots = [];
    this.interiorSpots = [];
    this.lamps = [];
    this.lampLights = [];
    this.rng = makeRng(20240501);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.obstacleMeshes = [];
    this.dust = null;
    this.fencePosts = [];
    this.objectivePositions = {};
  }

  build(tex) {
    this.tex = tex;
    this._materials(tex);
    this._ground(tex);
    this._sky();
    this._lights();
    this._blocks();
    this._safeZone();
    this._props();
    this._hazards();
    this._skyline();
    this._dust();
  }

  _materials(T) {
    const std = (opts) => new THREE.MeshStandardMaterial(opts);
    this.M = {
      asphalt: std({ map: T.asphalt, color: 0xc4c2ba, roughness: 0.9, metalness: 0.02 }),
      sidewalk: std({ map: T.concrete, color: 0xb2b4ac, roughness: 0.95 }),
      concrete: std({ map: T.concrete2, color: 0xc2c4bd, roughness: 0.93 }),
      brickA: std({ map: T.brick, color: 0xffffff, roughness: 0.95 }),
      brickB: std({ map: T.brick2, color: 0xd8cec2, roughness: 0.95 }),
      plasterA: std({ map: T.concrete, color: 0xdcd8cc, roughness: 0.9 }),
      plasterB: std({ map: T.concrete2, color: 0xb8b8ae, roughness: 0.9 }),
      rust: std({ map: T.rust, color: 0xd8c8b4, roughness: 0.8, metalness: 0.45 }),
      wood: std({ map: T.wood, color: 0xd8c8ae, roughness: 0.92 }),
      grass: std({ map: T.grass, color: 0xa8a894, roughness: 1 }),
      glass: std({ color: 0x0a1216, roughness: 0.18, metalness: 0.85 }),
      wall: std({ map: T.concrete, color: 0xcfcec4, roughness: 0.95 }),
      dark: std({ color: 0x22262a, roughness: 0.85 }),
      metal: std({ color: 0x53575b, roughness: 0.6, metalness: 0.7 })
    };
    this.matVariants = {
      brickA: [this.M.brickA, this.M.brickB],
      plaster: [this.M.plasterA, this.M.plasterB],
      concrete: [this.M.concrete, this.M.wall]
    };
  }

  _sky() {
    const skyGeo = new THREE.SphereGeometry(320, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x101c26) },
        mid: { value: new THREE.Color(0x33424d) },
        bot: { value: new THREE.Color(0x37434c) },
        glow: { value: new THREE.Color(0xc08a4a) }
      },
      vertexShader: `varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top, mid, bot, glow; varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          vec3 d = normalize(vW);
          float h = clamp(d.y*0.5+0.5, 0.0, 1.0);
          vec3 c = mix(bot, mid, smoothstep(0.46,0.66,h));
          c = mix(c, top, smoothstep(0.6,0.95,h));
          // brilho do horizonte (incêndios distantes)
          float horiz = exp(-abs(d.y)*9.0);
          float ang = atan(d.z, d.x);
          c += glow * horiz * (0.12 + 0.3*smoothstep(0.5,1.0, sin(ang*2.0)*0.5+0.5)) * 0.5;
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.sky);

    this.scene.fog = new THREE.FogExp2(0x3a464f, 0.0135);
    this.scene.background = new THREE.Color(0x2a353d);
  }

  _lights() {
    const hemi = new THREE.HemisphereLight(0x9cc0d8, 0x4a4238, 1.9);
    this.scene.add(hemi);

    const moon = new THREE.DirectionalLight(0xcfe4f8, 2.9);
    moon.position.set(-40, 60, 30);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const d = 48;
    moon.shadow.camera.left = -d; moon.shadow.camera.right = d;
    moon.shadow.camera.top = d; moon.shadow.camera.bottom = -d;
    moon.shadow.camera.near = 1; moon.shadow.camera.far = 160;
    moon.shadow.bias = -0.0012;
    moon.shadow.normalBias = 0.03;
    this.scene.add(moon);
    this.scene.add(moon.target);
    this.moon = moon;

    const amb = new THREE.AmbientLight(0x6a7a86, 1.15);
    this.scene.add(amb);
    this.hemi = hemi; this.amb = amb;
  }

  _ground(T) {
    // base: terra/grama
    const g = new THREE.PlaneGeometry(1400, 1400);
    g.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(g, this.M.grass);
    const grassTex = this.M.grass.map.clone();
    grassTex.needsUpdate = true;
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(46, 46);
    grassTex.anisotropy = 8;
    this.M.grass.map = grassTex;
    ground.receiveShadow = true;
    ground.position.y = -0.06;
    this.group.add(ground);

    // asfalto nas ruas (textura repetida proporcionalmente ao tamanho)
    const roadGeo = new THREE.PlaneGeometry(ROAD_W, 460);
    roadGeo.rotateX(-Math.PI / 2);
    const asphaltTex = this.M.asphalt.map.clone();
    asphaltTex.needsUpdate = true;
    asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;
    asphaltTex.repeat.set(1.6, 48);
    asphaltTex.anisotropy = 8;
    const roadMat = this.M.asphalt.clone();
    roadMat.map = asphaltTex;
    for (const line of ROAD_LINES) {
      for (const axis of ['x', 'z']) {
        const m = new THREE.Mesh(roadGeo, roadMat);
        m.rotation.y = axis === 'x' ? 0 : Math.PI / 2;
        m.position.set(axis === 'x' ? line : 0, 0, axis === 'x' ? 0 : line);
        m.receiveShadow = true;
        this.group.add(m);
        this.roads.push({ axis, line, width: ROAD_W });
      }
    }
    // faixas centrais tracejadas
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xb9b3a0, roughness: 0.85, emissive: 0x0d0c08 });
    const dashGeo = new THREE.PlaneGeometry(0.28, 2.6);
    dashGeo.rotateX(-Math.PI / 2);
    const dashCount = ROAD_LINES.length * 2 * (Math.floor((WORLD_HALF * 2) / 6.5) + 1);
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
    const m4 = new THREE.Matrix4();
    let di = 0;
    for (const line of ROAD_LINES) {
      for (const axis of ['x', 'z']) {
        for (let p = -WORLD_HALF; p <= WORLD_HALF; p += 6.5) {
          if (di >= dashCount) break;
          m4.makeTranslation(axis === 'x' ? p : line, 0.012, axis === 'x' ? line : p);
          dashes.setMatrixAt(di++, m4);
        }
      }
    }
    dashes.count = di;
    dashes.instanceMatrix.needsUpdate = true;
    dashes.frustumCulled = false;
    this.group.add(dashes);
    // linhas contínuas de bordo (asfalto real)
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xa8a695, roughness: 0.92, emissive: 0x0a0a08 });
    const edgeGeo = new THREE.PlaneGeometry(0.16, 460);
    edgeGeo.rotateX(-Math.PI / 2);
    for (const line of ROAD_LINES) {
      for (const side of [-1, 1]) {
        for (const axis of ['x', 'z']) {
          const m = new THREE.Mesh(edgeGeo, edgeMat);
          m.rotation.y = axis === 'x' ? 0 : Math.PI / 2;
          const off = side * (ROAD_W / 2 - 1.0);
          m.position.set(axis === 'x' ? line + off : 0, 0.014, axis === 'x' ? 0 : line + off);
          this.group.add(m);
        }
      }
    }

    // calçadas e meio-fio em volta dos quarteirões
    const sw = 2.4;
    const swGeo = new THREE.BoxGeometry(1, 0.14, 1);
    this._target = new THREE.Group(); this.group.add(this._target);
    for (const cx of [-31.5, 31.5]) {
      for (const cz of [-31.5, 31.5]) {
        const size = 60;
        const add = (x, z, w, d) => {
          const m = new THREE.Mesh(swGeo, this.M.sidewalk);
          m.scale.set(w, 1, d); m.position.set(x, 0.06, z);
          m.receiveShadow = true; m.castShadow = false;
          this.group.add(m);
        };
        const half = 26;
        add(cx, cz - half, 56, sw);
        add(cx, cz + half, 56, sw);
        add(cx - half, cz, sw, 56);
        add(cx + half, cz, sw, 56);
      }
    }
    this._bake(this._target);
    this._target = null;
    // praça central de concreto (spawn / checkpoint) — textura proporcional
    const plazaTex = this.M.concrete.map.clone();
    plazaTex.needsUpdate = true;
    plazaTex.wrapS = plazaTex.wrapT = THREE.RepeatWrapping;
    plazaTex.repeat.set(9, 9);
    plazaTex.anisotropy = 8;
    const plazaMat = this.M.concrete.clone();
    plazaMat.map = plazaTex;
    plazaMat.color = new THREE.Color(0x9a9e97);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(16, 40), plazaMat);
    plaza.rotateX(-Math.PI / 2); plaza.position.set(0, 0.015, 0);
    plaza.receiveShadow = true;
    this.group.add(plaza);
    // borda de concreto mais escura
    const curb = new THREE.Mesh(new THREE.RingGeometry(15.6, 16.5, 44), this.M.wall);
    curb.rotateX(-Math.PI / 2); curb.position.set(0, 0.02, 0);
    curb.receiveShadow = true;
    this.group.add(curb);
    // faixas de pintura desbotadas na praça (guia de evacuação)
    const paint = new THREE.MeshStandardMaterial({ color: 0xd8d2b4, roughness: 0.9, transparent: true, opacity: 0.32 });
    const paintG = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 7), paint);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(-6 + i * 3, 0.03, -2 - i * 0.4);
      paintG.add(bar);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 4.4), paint);
      bar.rotation.x = -Math.PI / 2;
      bar.rotation.z = -a;
      bar.position.set(Math.cos(a) * 12.5, 0.03, Math.sin(a) * 12.5);
      paintG.add(bar);
    }
    this._bake(paintG);
    this.group.add(paintG);

    // bagunça de terreno: manchas de terra e entulho (baked)
    const debris = new THREE.Group();
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x6a6455, roughness: 1, map: this.M.grass.map, polygonOffset: true, polygonOffsetFactor: -1 });
    const rng2 = this.rng;
    for (let i = 0; i < 26; i++) {
      const a = rng2() * TAU, r = 12 + rng2() * 90;
      const patch = new THREE.Mesh(new THREE.CircleGeometry(2 + rng2() * 6, 10), dirtMat);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = rng2() * TAU;
      patch.position.set(Math.cos(a) * r, 0.008, Math.sin(a) * r);
      patch.receiveShadow = true;
      debris.add(patch);
    }
    this._bake(debris);
    this.group.add(debris);
  }

  /* detalhes de rua: fogo em barris, carros destruídos, faixas de isolamento */
  _hazards() {
    const rng = this.rng;

    /* ---- textura procedural de chama (para billboards aditivos) ---- */
    const fc = document.createElement('canvas'); fc.width = 64; fc.height = 128;
    const fx = fc.getContext('2d');
    const grad = fx.createRadialGradient(32, 92, 2, 32, 78, 62);
    grad.addColorStop(0, 'rgba(255,246,214,1)');
    grad.addColorStop(0.22, 'rgba(255,196,96,0.96)');
    grad.addColorStop(0.5, 'rgba(255,120,40,0.65)');
    grad.addColorStop(0.78, 'rgba(180,50,16,0.26)');
    grad.addColorStop(1, 'rgba(120,30,10,0)');
    fx.fillStyle = grad;
    fx.beginPath();
    fx.moveTo(32, 4); fx.bezierCurveTo(58, 52, 60, 110, 32, 124);
    fx.bezierCurveTo(4, 110, 6, 52, 32, 4);
    fx.fill();
    const flameTex = new THREE.CanvasTexture(fc);
    flameTex.colorSpace = THREE.SRGBColorSpace;

    const smc = document.createElement('canvas'); smc.width = smc.height = 64;
    const sx = smc.getContext('2d');
    const sg = sx.createRadialGradient(32, 32, 2, 32, 32, 32);
    sg.addColorStop(0, 'rgba(150,150,150,0.55)');
    sg.addColorStop(1, 'rgba(90,90,90,0)');
    sx.fillStyle = sg; sx.fillRect(0, 0, 64, 64);
    const smokeTex = new THREE.CanvasTexture(smc);
    this._flameTex = flameTex;
    this._smokeTex = smokeTex;

    const pickSpots = (n, minR, maxR) => {
      const out = [];
      let guard = 0;
      while (out.length < n && guard++ < 220) {
        const a = rng() * TAU, r = minR + rng() * (maxR - minR);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.abs(x) < 7 && Math.abs(z) < 7) continue;
        if (Math.abs(x) > WORLD_HALF - 12 || Math.abs(z) > WORLD_HALF - 12) continue;
        if (this.buildings.some(b => x > b.x0 - 2.5 && x < b.x1 + 2.5 && z > b.z0 - 2.5 && z < b.z1 + 2.5)) continue;
        if (out.some(o => Math.hypot(o.x - x, o.z - z) < 16)) continue;
        if (this.fireSpots && this.fireSpots.some(o => Math.hypot(o.x - x, o.z - z) < 16)) continue;
        out.push({ x, z });
      }
      return out;
    };

    this.fireSpots = [];
    pickSpots(6, 16, 82).forEach(({ x, z }) => {
      const g = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12), this.M.rust);
      barrel.position.y = 0.5;
      barrel.castShadow = true;
      g.add(barrel);
      // brasas no topo
      const coal = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), new THREE.MeshBasicMaterial({ color: 0xff5a1e }));
      coal.rotation.x = -Math.PI / 2;
      coal.position.y = 1.01;
      g.add(coal);
      g.position.set(x, 0, z);
      this.group.add(g);

      // chamas: planos cruzados (corpo + núcleo aditivo), animados
      const flames = [];
      for (let i = 0; i < 3; i++) {
        const mat = new THREE.MeshBasicMaterial({
          map: flameTex, transparent: true, depthWrite: false,
          opacity: 0.82, color: 0xff9a4a, side: THREE.DoubleSide, toneMapped: false
        });
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.25), mat);
        p.position.set(x, 1.52, z);
        p.rotation.y = (i / 3) * Math.PI;
        this.scene.add(p);
        flames.push(p);
        if (i === 0) {
          const core = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.7), new THREE.MeshBasicMaterial({
            map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            opacity: 0.55, color: 0xffd08a, side: THREE.DoubleSide, toneMapped: false
          }));
          core.position.set(x, 1.42, z);
          this.scene.add(core);
          flames.push(core);
        }
      }
      // fumaça subindo
      const smokes = [];
      for (let i = 0; i < 2; i++) {
        const mat = new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.22, depthWrite: false, color: 0x2a2622 });
        const sp = new THREE.Sprite(mat);
        sp.position.set(x, 2.4 + i * 1.5, z);
        sp.scale.setScalar(1.6 + i * 0.7);
        this.scene.add(sp);
        smokes.push(sp);
      }
      let light = null;
      if (this.fireSpots.length < 3) {
        light = new THREE.PointLight(0xff7a30, 2.4, 15, 2);
        light.position.set(x, 1.9, z);
        this.group.add(light);
      }
      this._addBlocker(x - 0.5, x + 0.5, z - 0.5, z + 0.5, 1.1, 'barrel');
      this.fireSpots.push({ x, z, light, flames, smokes, t: rng() * 10 });
    });

    // carros destruídos
    this.wrecks = [];
    pickSpots(4, 20, 88).forEach(({ x, z }) => {
      const car = buildCarModel(2, 0x2b2723, rng);
      car.position.set(x, 0, z);
      car.rotation.y = rng() * TAU;
      this.scene.add(car);
      this._bake(car);
      this.group.add(car);
      this._addBlocker(x - 1.15, x + 1.15, z - 1.15, z + 1.15, 1.3, 'car');
      this.wrecks.push({ x, z });
    });

    // faixas de isolamento (postes + fita amarela) longe das ruas principais
    const tape = new THREE.MeshBasicMaterial({ color: 0xc9a83a, side: THREE.DoubleSide });
    const tapeGeo = new THREE.PlaneGeometry(3.4, 0.1);
    pickSpots(5, 24, 84).forEach(({ x, z }) => {
      const g = new THREE.Group();
      const postGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.5, 5);
      for (const ox of [-1.7, 1.7]) {
        const post = new THREE.Mesh(postGeo, this.M.metal);
        post.position.set(ox, 0.75, 0);
        g.add(post);
      }
      for (let k = 0; k < 2; k++) {
        const m = new THREE.Mesh(tapeGeo, tape);
        m.position.set(0, 0.85 + k * 0.45, 0);
        m.rotation.z = (rng() - 0.5) * 0.1;
        g.add(m);
      }
      g.position.set(x, 0, z);
      g.rotation.y = rng() * TAU;
      this.scene.add(g);
      this._bake(g);
      this.group.add(g);
    });
  }

  /* silhueta de cidade ao fundo: dá profundidade e esconde o fim do mundo */
  _skyline() {
    const rng = this.rng;
    const grp = new THREE.Group();
    this.group.add(grp);
    const mats = [
      new THREE.MeshStandardMaterial({ color: 0x1b242a, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x232b2e, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x171f24, roughness: 0.95 })
    ];
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x6f7c62 });
    const lit = [];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * TAU + rng() * 0.06;
      const r = 128 + rng() * 55;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const w = 10 + rng() * 16, d = 10 + rng() * 16;
      const tall = rng();
      const h = tall < 0.55 ? 8 + rng() * 10 : tall < 0.85 ? 20 + rng() * 14 : 38 + rng() * 22;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[i % 3]);
      b.position.set(x, h / 2 - 1, z);
      b.rotation.y = rng() * TAU;
      grp.add(b);
      // janelas acesas esparsas (brilho distante)
      if (rng() < 0.7) {
        const cols = Math.max(1, Math.floor(w / 3));
        for (let c = 0; c < cols; c++) {
          if (rng() > 0.3) continue;
          const wy = 4 + rng() * (h - 8);
          if (wy > h - 2) continue;
          lit.push({ x: x + Math.cos(b.rotation.y) * (w / 2 + 0.06) * (rng() > 0.5 ? 1 : -1),
                     y: wy, z: z - Math.sin(b.rotation.y) * (w / 2 + 0.06) * (rng() > 0.5 ? 1 : -1),
                     ry: b.rotation.y + (rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2) });
        }
      }
    }
    // luzes das janelas em um único mesh instanciado
    if (lit.length) {
      const g = new THREE.PlaneGeometry(1.1, 0.9);
      const inst = new THREE.InstancedMesh(g, lightMat, lit.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
      lit.forEach((l, i) => {
        pos.set(l.x, l.y, l.z);
        q.setFromEuler(new THREE.Euler(0, l.ry, 0));
        m.compose(pos, q, sc);
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      grp.add(inst);
    }
    grp.traverse(o => { if (o.isMesh) o.castShadow = false; });
    this._bakeSkyline = () => {
      const keep = [];
      grp.children.forEach((c) => { if (c.isInstancedMesh) keep.push(c); });
      keep.forEach((c) => grp.remove(c));
      this._bake(grp);
      keep.forEach((c) => grp.add(c));
    };
    this._bakeSkyline();
  }

  _addBlocker(x0, x1, z0, z1, h = 3, kind = 'wall') {
    this.blockers.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), h, kind });
  }

  _add(mesh) {
    (this._target || this.group).add(mesh);
    return mesh;
  }

  _boxMesh(w, h, d, mat, x, y, z, ry = 0, castShadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = castShadow; m.receiveShadow = true;
    this._add(m);
    return m;
  }

  /* funde todos os meshes estáticos de um grupo por material (reduz draw calls) */
  _bake(group) {
    group.updateMatrixWorld(true);
    const buckets = new Map();
    const remove = [];
    group.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material) || o.userData.noMerge) return;
      o.updateWorldMatrix(true, false);
      const key = o.material.uuid;
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [], cast: o.castShadow, recv: o.receiveShadow });
      const geo = o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      for (const name of Object.keys(geo.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
      }
      if (!geo.attributes.normal) geo.computeVertexNormals();
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      geo.morphAttributes = {};
      buckets.get(key).geos.push(geo);
      remove.push(o);
    });
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    remove.forEach(o => o.parent && o.parent.remove(o));
    buckets.forEach(({ mat, geos, cast, recv }) => {
      let merged = null;
      try { merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false); } catch (e) { merged = null; }
      if (!merged) return;
      merged.applyMatrix4(inv);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast; mesh.receiveShadow = recv;
      group.add(mesh);
    });
    return group;
  }

  /* parede com vão de porta */
  _wallWithDoor(cx, cz, len, ry, height, thick, mat, doorPos = 0.5, doorW = 2.0, doorH = 2.3) {
    // parede ao longo do eixo local X
    const half = len / 2;
    const dx = Math.cos(ry), dz = -Math.sin(ry);
    const px = -Math.sin(ry), pz = -Math.cos(ry);
    const segs = [];
    const doorCenter = -half + len * doorPos;
    const a0 = -half, a1 = doorCenter - doorW / 2;
    const b0 = doorCenter + doorW / 2, b1 = half;
    const mkSeg = (s0, s1) => {
      const L = s1 - s0;
      if (L <= 0.05) return;
      const mid = (s0 + s1) / 2;
      const x = cx + dx * mid, z = cz + dz * mid;
      const m = this._boxMesh(L, height, thick, mat, x, height / 2, z, ry);
      // blocker alinhado ao eixo
      if (Math.abs(dx) > Math.abs(dz)) {
        this._addBlocker(x - L / 2, x + L / 2, z - thick / 2, z + thick / 2, height);
      } else {
        this._addBlocker(x - thick / 2, x + thick / 2, z - L / 2, z + L / 2, height);
      }
      segs.push(m);
    };
    mkSeg(a0, a1); mkSeg(b0, b1);
    // lintel acima da porta
    const lintelH = height - doorH;
    if (lintelH > 0.1) {
      const x = cx + dx * doorCenter, z = cz + dz * doorCenter;
      this._boxMesh(doorW, lintelH, thick, mat, x, doorH + lintelH / 2, z, ry);
    }
    return segs;
  }

  _buildBuilding(cx, cz, w, d, h, rng, opts = {}) {
    const local = new THREE.Group();
    this.group.add(local);
    const prevTarget = this._target;
    this._target = local;
    const mats = this.matVariants;
    const wallMat = pick(mats[pick(['brickA', 'plaster', 'concrete'])]);
    const isRuin = rng() < 0.22;
    const ry = opts.ry ?? 0;
    const hw = w / 2, hd = d / 2, th = 0.4;
    // piso
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, d - 0.6), this.M.sidewalk);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.02, cz);
    floor.receiveShadow = true;
    local.add(floor);
    // paredes (4) com porta voltada para a rua
    const doorSides = opts.doors || ['s'];
    this._wallWithDoor(cx, cz + hd, w, Math.PI, h, th, wallMat, 0.38 + rng() * 0.24);
    this._wallWithDoor(cx, cz - hd, w, 0, h, th, wallMat, 0.38 + rng() * 0.24);
    this._wallWithDoor(cx - hw, cz, d, -Math.PI / 2, h, th, wallMat, 0.38 + rng() * 0.24);
    this._wallWithDoor(cx + hw, cz, d, Math.PI / 2, h, th, wallMat, 0.38 + rng() * 0.24);

    // telhado
    if (!isRuin) {
      const roof = this._boxMesh(w + 0.5, 0.3, d + 0.5, this.M.concrete, cx, h + 0.15, cz);
      roof.receiveShadow = true;
      // parapeito
      const pr = 0.5;
      this._boxMesh(w + 0.5, pr, 0.35, this.M.wall, cx, h + 0.3 + pr / 2, cz + hd + 0.1);
      this._boxMesh(w + 0.5, pr, 0.35, this.M.wall, cx, h + 0.3 + pr / 2, cz - hd - 0.1);
    } else {
      // ruínas: metade do telhado desabou
      const roof = this._boxMesh(w * 0.5, 0.28, d * 0.6, this.M.concrete, cx - w * 0.22, h + 0.14, cz - d * 0.15);
    }

    // janelas decorativas / quebradas
    const winMat = new THREE.MeshStandardMaterial({ color: 0x0a1216, roughness: 0.2, metalness: 0.8 });
    const floors = Math.max(1, Math.floor((h - 1.2) / 3.1));
    for (let fl = 0; fl < floors; fl++) {
      const wy = 1.9 + fl * 3.1;
      for (const side of ['n', 's', 'e', 'w']) {
        const count = 2 + ((rng() * 2) | 0);
        for (let i = 0; i < count; i++) {
          if (rng() < 0.32) continue;
          const t = (i + 0.5) / count;
          let wx, wz, wr;
          if (side === 'n') { wx = cx - hw + w * t; wz = cz - hd - 0.02; wr = 0; }
          else if (side === 's') { wx = cx - hw + w * t; wz = cz + hd + 0.02; wr = Math.PI; }
          else if (side === 'w') { wx = cx - hw - 0.02; wz = cz - hd + d * t; wr = -Math.PI / 2; }
          else { wx = cx + hw + 0.02; wz = cz - hd + d * t; wr = Math.PI / 2; }
          const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), winMat);
          win.position.set(wx, wy, wz);
          win.rotation.y = wr;
          local.add(win);
          // moldura
          if (rng() < 0.5) {
            const frame = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.14, 0.12), this.M.concrete);
            frame.position.set(wx, wy + 0.82, wz); frame.rotation.y = wr;
            local.add(frame);
          }
        }
      }
    }

    // grades / detalhes internos
    if (!isRuin) {
      // calha/estrutura no teto
      const ac = this._boxMesh(1.2, 0.8, 1.2, this.M.rust, cx + w * 0.2, h + 0.7, cz + d * 0.15, rng() * 0.5);
      ac.castShadow = true;
      // caixa d'água em prédios altos
      if (h > 6) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.5, 10), this.M.metal);
        tank.position.set(cx - w * 0.22, h + 1.05, cz - d * 0.18);
        tank.castShadow = true;
        local.add(tank);
        const legGeo = new THREE.BoxGeometry(0.1, 0.6, 0.1);
        for (const [ox, oz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
          const leg = new THREE.Mesh(legGeo, this.M.metal);
          leg.position.set(cx - w * 0.22 + ox * 0.9, h + 0.3, cz - d * 0.18 + oz * 0.9);
          local.add(leg);
        }
      }
    }

    this._target = prevTarget;
    this._bake(local);
    this.buildings.push({ x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd, h, ruin: isRuin });
    // pontos de saque no interior
    for (let i = 0; i < 2; i++) {
      this.interiorSpots.push(new THREE.Vector3(cx + (rng() - 0.5) * (w - 3), 0, cz + (rng() - 0.5) * (d - 3)));
    }
    // pilha de caixas dentro
    if (rng() < 0.6) {
      const cr = buildCrate(0.7 + rng() * 0.3);
      cr.position.set(cx + (rng() - 0.5) * (w - 2.5), 0, cz + (rng() - 0.5) * (d - 2.5));
      cr.rotation.y = rng() * TAU;
      local.add(cr);
    }
    return { cx, cz, w, d, h, ruin: isRuin };
  }

  _blocks() {
    const rng = this.rng;
    const roadHalf = ROAD_W / 2;
    const blockSize = 63 - ROAD_W; // ~48
    const centers = [
      [-31.5, -31.5], [0, 0], [31.5, -31.5], [-31.5, 31.5], [31.5, 31.5],
      [-63 - 15.75 - 7.5, 0]
    ];
    // 4 quarteirões principais
    const quads = [
      { cx: -31.5, cz: -31.5 }, { cx: 31.5, cz: -31.5 },
      { cx: -31.5, cz: 31.5 }, { cx: 31.5, cz: 31.5 },
      { cx: -63 - 26, cz: -31.5 }, { cx: -63 - 26, cz: 31.5 },
      { cx: 63 + 26, cz: -31.5 }, { cx: 63 + 26, cz: 31.5 }
    ];
    quads.forEach((q, qi) => {
      const count = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < count; i++) {
        const w = 9 + rng() * 8, d = 9 + rng() * 8;
        const offX = (rng() - 0.5) * (30 - w), offZ = (rng() - 0.5) * (30 - d);
        const cx = q.cx + offX, cz = q.cz + offZ;
        // evita sobreposição com prédios já criados
        const overlap = this.buildings.some(b => Math.abs(b.cx - cx) < (b.w + w) / 2 + 2 && Math.abs(b.cz - cz) < (b.d + d) / 2 + 2);
        if (overlap) continue;
        const roll = rng();
        const h = roll < 0.5 ? 3.4 + rng() * 1.2 : roll < 0.82 ? 6.6 + rng() * 1.4 : 9.8 + rng() * 2.2;
        this._buildBuilding(cx, cz, w, d, h, rng);
      }
      // muro baixo cercando parte do quarteirão
      if (rng() < 0.5) {
        const sz = 20 + rng() * 8;
        const mx = q.cx + (rng() - 0.5) * 14;
        const mz = q.cz + (rng() > 0.5 ? 1 : -1) * (sz / 2);
        this._boxMesh(sz, 1.8, 0.35, this.M.wall, mx, 0.9, mz);
        this._addBlocker(mx - sz / 2, mx + sz / 2, mz - 0.2, mz + 0.2, 1.8);
      }
    });

    // muro de contenção no perímetro
    const perimeter = WORLD_HALF - 6;
    const wallH = 4.2;
    const sides = [
      { x: 0, z: -perimeter, w: perimeter * 2, d: 0.8 },
      { x: 0, z: perimeter, w: perimeter * 2, d: 0.8 },
      { x: -perimeter, z: 0, w: 0.8, d: perimeter * 2 },
      { x: perimeter, z: 0, w: 0.8, d: perimeter * 2 }
    ];
    const perim = new THREE.Group();
    this.group.add(perim);
    sides.forEach(s => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, wallH, s.d), this.M.concrete);
      m.position.set(s.x, wallH / 2, s.z); m.receiveShadow = true;
      perim.add(m);
      // arame farpado
      const barb = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.5, s.d + 0.3), this.M.rust);
      barb.position.set(s.x, wallH + 0.25, s.z);
      perim.add(barb);
      this._addBlocker(s.x - s.w / 2, s.x + s.w / 2, s.z - s.d / 2, s.z + s.d / 2, wallH, 'perimeter');
      // postes de iluminação no muro
      for (let i = -3; i <= 3; i++) {
        const px = s.x + (s.w > s.d ? (i * s.w) / 7 : 0);
        const pz = s.z + (s.w > s.d ? 0 : (i * s.d) / 7);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.5, 0.35), this.M.metal);
        post.position.set(px, wallH + 2.75, pz);
        perim.add(post);
        const lightM = new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xff9a40, emissiveIntensity: 2.2 });
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), lightM);
        lamp.position.set(px, wallH + 5.5, pz);
        perim.add(lamp);
      }
    });
    this._bake(perim);
  }

  _safeZone() {
    // posto de controle no centro (spawn) — barricadas e caixas
    const rng = this.rng;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const sb = buildSandbag();
      sb.position.set(Math.cos(a) * 6.5, 0, Math.sin(a) * 6.5);
      sb.rotation.y = -a + Math.PI / 2;
      this.group.add(sb);
      this._addBlocker(Math.cos(a) * 6.5 - 1.1, Math.cos(a) * 6.5 + 1.1, Math.sin(a) * 6.5 - 0.5, Math.sin(a) * 6.5 + 0.5, 0.9, 'low');
    }
    // torre de rádio (objetivo)
    const radioX = -14, radioZ = -14;
    const towerG = new THREE.Group();
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x6a6f72, roughness: 0.6, metalness: 0.7 });
    for (const [ox, oz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 12, 5), towerMat);
      leg.position.set(ox, 6, oz);
      towerG.add(leg);
    }
    for (let y = 2.5; y < 12; y += 2.5) {
      const r = 1.05 - (y / 12) * 0.45;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 4, 8), towerMat);
      ring.rotation.x = Math.PI / 2; ring.position.y = y; towerG.add(ring);
    }
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 6, 0, TAU, 0, 1.1), new THREE.MeshStandardMaterial({ color: 0xb8b4a8, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
    dish.position.set(0, 11.4, 0); dish.rotation.x = Math.PI * 0.35; towerG.add(dish);
    const beaconM = new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 3 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), beaconM);
    beacon.position.set(0, 12.3, 0); towerG.add(beacon);
    this.radioBeacon = beacon;
    towerG.position.set(radioX, 0, radioZ);
    towerG.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this._bake(towerG);
    this.group.add(towerG);
    this._addBlocker(radioX - 0.8, radioX + 0.8, radioZ - 0.8, radioZ + 0.8, 12, 'tower');
    this.objectivePositions.radio = new THREE.Vector3(radioX, 0, radioZ);

    // tenda militar / armário de armas (objetivo)
    const tentX = 16, tentZ = -12;
    const tent = new THREE.Group();
    const canvasM = new THREE.MeshStandardMaterial({ color: 0x3d4a35, roughness: 0.95 });
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 7, 12, 1, false, 0, Math.PI), canvasM);
    roof.rotation.z = Math.PI / 2; roof.rotation.x = Math.PI / 2;
    roof.position.y = 1.9; roof.scale.set(1, 1, 0.75);
    tent.add(roof);
    tent.position.set(tentX, 0, tentZ);
    tent.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this._bake(tent);
    this.group.add(tent);
    this._addBlocker(tentX - 3, tentX + 3, tentZ - 2.4, tentZ + 2.4, 2.2, 'tent');
    // caixotes de armas na frente
    for (let i = 0; i < 3; i++) {
      const cr = buildCrate(0.75);
      cr.position.set(tentX - 2 + i * 1.4, 0, tentZ + 3.2);
      cr.rotation.y = rng() * 0.6;
      this.group.add(cr);
      this._addBlocker(cr.position.x - 0.38, cr.position.x + 0.38, cr.position.z - 0.38, cr.position.z + 0.38, 0.8, 'low');
    }
    this.objectivePositions.armory = new THREE.Vector3(tentX, 0, tentZ + 3.4);

    // veículo de evacuação (objetivo final)
    const truckX = 0, truckZ = 50;
    const truck = new THREE.Group();
    const bodyM = new THREE.MeshStandardMaterial({ color: 0x3a4433, roughness: 0.8, metalness: 0.3 });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.1, 2.4), bodyM);
    cab.position.set(0, 1.6, 2.6); truck.add(cab);
    const boxb = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.5, 5), bodyM);
    boxb.position.set(0, 1.9, -1); truck.add(boxb);
    const wheelM = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
    for (const x of [-1.2, 1.2]) for (const z of [-2.4, 0.4, 2.6]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.36, 12), wheelM);
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.55, z); truck.add(w);
    }
    const lightM = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 2.4 });
    for (const x of [-0.8, 0.8]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), lightM);
      l.position.set(x, 1.3, 3.82); truck.add(l);
    }
    truck.position.set(truckX, 0, truckZ);
    truck.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this._bake(truck);
    this.group.add(truck);
    this._addBlocker(truckX - 1.3, truckX + 1.3, truckZ - 3.6, truckZ + 3.8, 2.8, 'truck');
    this.objectivePositions.evacuation = new THREE.Vector3(truckX, 0, truckZ - 5.5);
    this.truck = truck;

    // holofotes do acampamento
    const spot = new THREE.SpotLight(0xffcf9a, 6, 30, Math.PI / 4, 0.5, 1.4);
    spot.position.set(-6, 8, -6);
    spot.target.position.set(0, 0, 0);
    this.scene.add(spot); this.scene.add(spot.target);
    this.safeSpot = spot;
  }

  _props() {
    const rng = this.rng;
    const roads = [];
    for (const line of ROAD_LINES) { roads.push({ axis: 'x', line }); roads.push({ axis: 'z', line }); }
    const isFree = (x, z, r) => {
      for (const b of this.blockers) if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return false;
      return true;
    };
    // carros nas ruas
    const carCount = this.game.settings.lowSpec ? 14 : 26;
    for (let i = 0; i < carCount; i++) {
      const road = pick(roads);
      const along = rand(-WORLD_HALF + 12, WORLD_HALF - 12);
      const off = rand(-3.3, 3.3);
      const x = road.axis === 'x' ? along : road.line + off;
      const z = road.axis === 'x' ? road.line + off : along;
      if (!isFree(x, z, 2.6)) continue;
      if (Math.hypot(x, z) < 12) continue;
      const car = buildCarModel(rng() > 0.75 ? 1 : 0, null, rng);
      car.position.set(x, 0, z);
      car.rotation.y = (road.axis === 'x' ? 0 : Math.PI / 2) + rand(-0.22, 0.22) + (rng() > 0.85 ? Math.PI / 2 : 0);
      this.scene.add(car);
      this._bake(car);
      this.group.add(car);
      this._addBlocker(x - 1.15, x + 1.15, z - 2.35, z + 2.35, 1.6, 'car');
      // barulho/porta aberta
      if (rng() < 0.3) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 1.0), new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.7 }));
        door.position.set(x + 1.25 * Math.cos(car.rotation.y), 0.8, z - 0.5 + Math.sin(car.rotation.y) * 0.3);
        door.rotation.y = car.rotation.y + 0.9;
        this.group.add(door);
      }
      this.lootSpots.push(new THREE.Vector3(x, 0, z + 2.9));
    }
    // barris, caixotes, cones, pneus, lixeiras, sacos
    const scatter = [
      { make: buildBarrel, r: 0.5, h: 1.0, n: 34, y: 0 },
      { make: () => buildCrate(rand(0.6, 0.95)), r: 0.5, h: 0.9, n: 26, y: 0 },
      { make: buildTrafficCone, r: 0.3, h: 0.6, n: 22, y: 0 },
      { make: buildTyre, r: 0.5, h: 0.4, n: 16, y: 0 },
      { make: buildDumpster, r: 1.1, h: 1.4, n: 10, y: 0 }
    ];
    for (const s of scatter) {
      const n = Math.floor(s.n * (this.game.settings.lowSpec ? 0.55 : 1));
      for (let i = 0; i < n; i++) {
        let x, z;
        const road = pick(roads);
        const along = rand(-WORLD_HALF + 10, WORLD_HALF - 10);
        const off = rand(-9, 9);
        if (rng() < 0.65) { x = road.axis === 'x' ? along : road.line + off; z = road.axis === 'x' ? road.line + off : along; }
        else { x = rand(-WORLD_HALF + 12, WORLD_HALF - 12); z = rand(-WORLD_HALF + 12, WORLD_HALF - 12); }
        if (!isFree(x, z, s.r + 1.2)) continue;
        if (Math.hypot(x, z) < 9) continue;
        const o = s.make(rng);
        o.position.set(x, 0, z);
        o.rotation.y = rng() * TAU;
        this.group.add(o);
        this._addBlocker(x - s.r, x + s.r, z - s.r, z + s.r, s.h, 'low');
        if (rng() < 0.25) this.lootSpots.push(new THREE.Vector3(x, 0, z + 1));
      }
    }
    // postes de luz
    const lampPositions = [];
    for (const line of ROAD_LINES) {
      for (let a = -WORLD_HALF + 16; a < WORLD_HALF - 10; a += 34) {
        lampPositions.push([a, line - 6.5]);
        lampPositions.push([line + 6.5, a + 12]);
      }
    }
    lampPositions.forEach(([x, z], i) => {
      if (!isFree(x, z, 0.6)) return;
      const p = buildLampPost();
      p.position.set(x, 0, z);
      p.rotation.y = (i % 4) * (Math.PI / 2);
      this.group.add(p);
      this._addBlocker(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 5.5, 'low');
      if (i % 2 === 0 && this.lamps.length < (this.game.settings.lowSpec ? 4 : 8)) {
        const l = new THREE.PointLight(0xffb060, 3.2, 16, 2);
        l.position.set(x, 5.4, z);
        this.scene.add(l);
        this.lamps.push(l);
      }
    });
    // placas de quarentena
    for (let i = 0; i < 7; i++) {
      const x = rand(-60, 60), z = rand(-60, 60);
      if (!isFree(x, z, 1)) continue;
      const s = buildRoadSign(pick(['STOP', 'SAÍDA', 'PERIGO', 'ÁREA 7']));
      s.position.set(x, 0, z);
      s.rotation.y = rand(0, TAU);
      this.group.add(s);
      this._addBlocker(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 2.4, 'low');
    }
    // entulho: caixas de concreto
    for (let i = 0; i < 30; i++) {
      const x = rand(-WORLD_HALF + 12, WORLD_HALF - 12), z = rand(-WORLD_HALF + 12, WORLD_HALF - 12);
      if (!isFree(x, z, 1.2) || Math.hypot(x, z) < 9) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(rand(0.6, 1.6), rand(0.2, 0.6), rand(0.6, 1.6)), this.M.concrete);
      m.position.set(x, 0.15, z);
      m.rotation.set(rand(-0.2, 0.2), rng() * TAU, rand(-0.2, 0.2));
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
    // ossadas e sangue no chão (decalques)
    const bloodMat = new THREE.MeshBasicMaterial({ map: this.tex.blood, transparent: true, opacity: 0.85, depthWrite: false });
    for (let i = 0; i < 26; i++) {
      const x = rand(-80, 80), z = rand(-80, 80);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(rand(1.4, 3.6), rand(1.4, 3.6)), bloodMat);
      b.rotation.x = -Math.PI / 2;
      b.rotation.z = rand(0, TAU);
      b.position.set(x, 0.02, z);
      this.group.add(b);
    }
  }

  _dust() {
    const count = this.game.settings.lowSpec ? 180 : 420;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rand(-40, 40);
      pos[i * 3 + 1] = rand(0.2, 6);
      pos[i * 3 + 2] = rand(-40, 40);
      spd[i] = rand(0.1, 0.5);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,235,200,0.9)'); g.addColorStop(1, 'rgba(255,235,200,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.PointsMaterial({ map: tex, size: 0.055, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe0b0 });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.dust = { pts, spd, count, geo };
  }

  /* ------------------- colisão ------------------- */
  isBlocked(rect) {
    for (const b of this.blockers) {
      if (rect.x1 > b.x0 && rect.x0 < b.x1 && rect.z1 > b.z0 && rect.z0 < b.z1) return true;
    }
    return false;
  }

  /* true se a posição colide com um obstáculo baixo ou parede */
  collisionAt(x, z, radius) {
    for (const b of this.blockers) {
      if (x + radius > b.x0 && x - radius < b.x1 && z + radius > b.z0 && z - radius < b.z1) return b;
    }
    return null;
  }

  moveEntity(ent, nx, nz, radius) {
    let moved = false;
    const limit = WORLD_HALF - 8;
    nx = clamp(nx, -limit, limit); nz = clamp(nz, -limit, limit);
    // eixo X
    let blockedX = false;
    for (const b of this.blockers) {
      if (b.h <= 0.9) continue;
      if (nx + radius > b.x0 && nx - radius < b.x1 && ent.pos.z + radius > b.z0 && ent.pos.z - radius < b.z1) { blockedX = true; break; }
    }
    if (!blockedX) { ent.pos.x = nx; moved = true; }
    // eixo Z
    let blockedZ = false;
    for (const b of this.blockers) {
      if (b.h <= 0.9) continue;
      if (ent.pos.x + radius > b.x0 && ent.pos.x - radius < b.x1 && nz + radius > b.z0 && nz - radius < b.z1) { blockedZ = true; break; }
    }
    if (!blockedZ) { ent.pos.z = nz; moved = true; }
    return moved;
  }

  /* raio contra paredes: retorna distância do impacto mais próximo (ou Infinity) */
  raycastWalls(origin, dir, maxDist) {
    let best = maxDist;
    for (const b of this.blockers) {
      if (b.h < 1.0) continue;
      const t = rayBox(origin, dir, b, best);
      if (t !== null && t < best) best = t;
    }
    return best;
  }

  update(dt, player) {
    // fogo dos barris
    if (this.fireSpots) {
      const cam = this.scene.userData.camera || null;
      for (const f of this.fireSpots) {
        f.t += dt;
        const t = f.t;
        f.flames.forEach((p, i) => {
          const k = 0.86 + Math.sin(t * (7 + i * 1.7) + i) * 0.12 + Math.sin(t * 23.1 + i * 2) * 0.06;
          p.scale.set(1 + Math.sin(t * 5 + i) * 0.08, k, 1);
          p.position.y = (i === 3 ? 1.38 : 1.52) + Math.sin(t * 3.3 + i) * 0.06;
          p.material.opacity = (i === 3 ? 0.48 : 0.7) + Math.sin(t * (9 + i * 2.3)) * 0.14;
          p.rotation.y += dt * (0.5 + i * 0.25);
        });
        f.smokes.forEach((sp, i) => {
          const cycle = (t * 0.22 + i * 0.5) % 1;
          sp.position.y = 2.1 + cycle * 4.2;
          sp.position.x = f.x + Math.sin(t * 0.5 + i * 2) * cycle * 1.4;
          sp.position.z = f.z + Math.cos(t * 0.42 + i * 2) * cycle * 1.2;
          sp.scale.setScalar(1.1 + cycle * 2.6);
          sp.material.opacity = 0.26 * (1 - cycle);
        });
        if (f.light) f.light.intensity = 2.1 + Math.sin(t * 13) * 0.7 + Math.sin(t * 31) * 0.3;
      }
    }
    // sombras seguem o jogador
    if (this.moon) {
      this.moon.position.set(player.pos.x - 40, 60, player.pos.z + 30);
      this.moon.target.position.set(player.pos.x, 0, player.pos.z);
      this.moon.target.updateMatrixWorld();
    }
    if (this.sky) this.sky.position.set(player.pos.x, 0, player.pos.z);
    if (this.dust) {
      const p = this.dust.geo.attributes.position.array;
      for (let i = 0; i < this.dust.count; i++) {
        p[i * 3 + 1] += this.dust.spd[i] * dt * 0.4;
        p[i * 3] += Math.sin(performance.now() * 0.0002 + i) * dt * 0.12;
        if (p[i * 3 + 1] > 6) p[i * 3 + 1] = 0.2;
      }
      this.dust.geo.attributes.position.needsUpdate = true;
    }
    if (this.radioBeacon) {
      const t = performance.now() * 0.004;
      this.radioBeacon.material.emissiveIntensity = 1.5 + Math.abs(Math.sin(t)) * 3;
    }
  }
}

function rayBox(origin, dir, b, maxDist) {
  // AABB 3D (y de 0 a h)
  const minX = b.x0, maxX = b.x1, minY = 0, maxY = b.h, minZ = b.z0, maxZ = b.z1;
  let tmin = 0, tmax = maxDist;
  const axes = [[origin.x, dir.x, minX, maxX], [origin.y, dir.y, minY, maxY], [origin.z, dir.z, minZ, maxZ]];
  for (const [o, d, mn, mx] of axes) {
    if (Math.abs(d) < 1e-8) {
      if (o < mn || o > mx) return null;
    } else {
      let t1 = (mn - o) / d, t2 = (mx - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0.01 ? tmin : null;
}
