/* DEADZONE — campanha: objetivos, ondas e progressão */
import * as THREE from '../assets/vendor/three.module.js';
import { rand, clamp, pick } from './util.js';

export const CHAPTERS = [
  {
    id: 1, code: 'CAP. 01', name: 'ACORDAR EM CINZAS', time: 'DIA 17 — 04:12',
    brief: 'O gerador do abrigo morreu. Você tem uma pistola, 30 balas e um rádio mudo. Reative a antena de emergência no centro do acampamento e descubra se alguém ainda responde.',
    objectives: [
      { id: 'clear', text: 'Limpe o perímetro do abrigo', type: 'kill', target: 8 },
      { id: 'radio', text: 'Reative a antena de rádio', type: 'interact', pos: 'radio', radius: 3.4, hold: 2.5, hint: 'A antena fica a noroeste do acampamento' },
      { id: 'armory', text: 'Arrombe o cofre de armas do acampamento', type: 'interact', pos: 'armory', radius: 2.6, hold: 2.0, hint: 'Tenda militar ao nordeste' }
    ],
    reward: { weapon: 'smg', rounds: 45 }
  },
  {
    id: 2, code: 'CAP. 02', name: 'A MARÉ DE CARNE', time: 'DIA 17 — 05:40',
    brief: 'A antena atraiu atenção. A horda veio de todos os lados e o cofre guardava mais que armas: um mapa de evacuação. Sobreviva até o caminhão, mas antes recolha os dados do laboratório móvel.',
    objectives: [
      { id: 'survive', text: 'Resista à horda (3 ondas)', type: 'waves', target: 3 },
      { id: 'intel', text: 'Recupere 2 discos de dados', type: 'collect', target: 2, pos: ['lootA', 'lootB'], hint: 'Marque os pontos de dados no mapa (M)' },
      { id: 'evac', text: 'Chegue ao caminhão de evacuação', type: 'reach', pos: 'evacuation', radius: 4.2, hint: 'Sul do acampamento' }
    ],
    reward: { weapon: 'rifle', rounds: 90 }
  },
  {
    id: 3, code: 'CAP. 03', name: 'ZONA MORTA', time: 'DIA 19 — 03:05',
    brief: 'O caminhão não chegou. Algo grande está entre você e a saída — e ele não corre, porque não precisa. Abra caminho pela zona de contenção, destrua os ninhos e alcance o comboio.',
    objectives: [
      { id: 'nests', text: 'Destrua 3 ninhos de infectados', type: 'destroy', target: 3, hint: 'Barris de biomassa marcados em laranja' },
      { id: 'brute', text: 'Elimine o BRUTAMONTES da zona', type: 'brute', target: 1 },
      { id: 'final', text: 'Alcance a extração final', type: 'reach', pos: 'evacuation', radius: 4.2, hint: 'Sul do acampamento' }
    ],
    reward: { weapon: 'shotgun', rounds: 24 }
  }
];

const DISTRACTIONS = [
  'Chuva de cinzas — visibilidade reduzida',
  'Névoa densa sobre a zona sul',
  'Avião de reconhecimento: risco de atração',
  'Chuva ácida — abrigo recomendado',
  'Horda em migração pelo setor leste'
];

export class QuestManager {
  constructor(game) {
    this.game = game;
    this.chapterIndex = 0;
    this.objectiveIndex = 0;
    this.killCount = 0;
    this.waveIndex = 0;
    this.wavesActive = false;
    this.interactHold = 0;
    this.interacting = false;
    this.nestMesh = [];
    this.intelSpawned = false;
    this.started = false;
    this.lastObjectiveId = null;
    this.beacon = null;
    this._buildBeacon();
  }

  _buildBeacon() {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0x5ad8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 32), m);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    g.add(ring);
    const m2 = new THREE.MeshBasicMaterial({ color: 0x5ad8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 7, 10, 1, true), m2);
    beam.position.y = 3.5;
    g.add(beam);
    g.visible = false;
    this.game.scene.add(g);
    this.beacon = g;
    this.beaconRing = ring;
    this.beaconBeam = beam;
  }

  get chapter() { return CHAPTERS[this.chapterIndex]; }
  get objective() {
    const ch = this.chapter;
    return ch ? ch.objectives[this.objectiveIndex] : null;
  }

  reset() {
    this.chapterIndex = 0;
    this.objectiveIndex = 0;
    this.killCount = 0;
    this.waveIndex = 0;
    this.wavesActive = false;
    this.interactHold = 0;
    this.started = false;
    this.intelSpawned = false;
    this.nestMesh.forEach(n => this.game.scene.remove(n));
    this.nestMesh = [];
  }

  start() {
    this.started = true;
    this.chapterIndex = 0;
    this.objectiveIndex = 0;
    this.killCount = 0;
    const g = this.game;
    g.hud.setChapter(this.chapter.code, this.chapter.name);
    this.announceChapter();
    this.updateObjectiveUI();
  }

  announceChapter() {
    const ch = this.chapter;
    const g = this.game;
    g.hud.banner(ch.code + ' — ' + ch.name, ch.brief, 'BRIEFING · ' + ch.time);
  }

  updateObjectiveUI() {
    const o = this.objective;
    const g = this.game;
    if (!o) { g.hud.updateObjective('Campanha concluída', 1); return; }
    let prog = 0;
    if (o.type === 'kill') prog = this.killCount / o.target;
    else if (o.type === 'waves') prog = this.waveIndex / o.target;
    else if (o.type === 'collect') prog = (this.collected = this.collected || 0) / o.target;
    else if (o.type === 'destroy') prog = (this.destroyed = this.destroyed || 0) / o.target;
    else if (o.type === 'brute') prog = (this.bruteKilled || 0) / o.target;
    else prog = 0;
    const extra = o.type === 'waves' ? ` (${Math.min(this.waveIndex, o.target)}/${o.target})` :
      ['kill', 'collect', 'destroy', 'brute'].includes(o.type) ? ` (${o.type === 'kill' ? this.killCount : o.type === 'collect' ? (this.collected || 0) : o.type === 'destroy' ? (this.destroyed || 0) : (this.bruteKilled || 0)}/${o.target})` : '';
    g.hud.updateObjective(o.text + extra, clamp(prog, 0, 1));
    // marcador no mundo
    if (o.pos) {
      const p = typeof o.pos === 'string' ? g.world.objectivePositions[o.pos] : null;
      if (p) this.setBeacon(p);
      else this.setBeacon(null);
    } else if (o.type === 'destroy') this.setBeacon(null);
    else if (o.type === 'brute') this.setBeacon(null);
    else this.setBeacon(null);
    g.hud.setObjectiveHint(o.hint || '');
  }

  setBeacon(pos) {
    if (!pos) { this.beacon.visible = false; return; }
    this.beacon.visible = true;
    this.beacon.position.set(pos.x, 0, pos.z);
  }

  update(dt) {
    if (!this.started) return;
    const g = this.game;
    const o = this.objective;
    if (!o) return;
    const player = g.player;

    // animação do marcador
    if (this.beacon.visible) {
      const t = performance.now() * 0.001;
      this.beaconRing.scale.setScalar(1 + Math.sin(t * 2) * 0.08);
      this.beaconBeam.material.opacity = 0.25 + Math.sin(t * 2.4) * 0.1;
    }

    // objetivos de interação
    g.quest.interactingWithObjective = false;
    if (o.type === 'interact' || o.type === 'reach') {
      const p = g.world.objectivePositions[o.pos];
      if (p) {
        const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
        if (d < (o.radius || 3)) {
          if (o.type === 'reach') { this.completeObjective(); return; }
          g.quest.interactingWithObjective = true;
          g.hud.showInteract(true, o.hold ? Math.min(1, this.interactHold / o.hold) : 1, 'MANTENHA PARA INTERAGIR');
          const holding = g.controls.held.interact || g.controls.keys.has('interact');
          if (holding) {
            this.interactHold += dt;
            g.hud.setInteractProgress(Math.min(1, this.interactHold / o.hold));
            if (this.interactHold >= o.hold) {
              this.interactHold = 0;
              g.hud.showInteract(false);
              g.controls.held.fire = false;
              this.completeObjective();
            }
          } else {
            this.interactHold = Math.max(0, this.interactHold - dt * 2);
            g.hud.setInteractProgress(0);
          }
        } else {
          this.interactHold = 0;
          if (!this.interactingWithProp) g.hud.showInteract(false);
        }
      }
    } else if (!this.interactingWithProp) {
      g.hud.showInteract(false);
    }

    // waves
    if (this.wavesActive) {
      const alive = g.zombies.list.filter(z => !z.dead).length;
      this.waveAlive = alive;
      if (alive === 0) {
        this.waveIndex++;
        g.hud.updateObjective(this.objective ? this.objective.text + ` (${Math.min(this.waveIndex, this.objective.target)}/${this.objective.target})` : '', clamp(this.waveIndex / (this.objective ? this.objective.target : 1), 0, 1));
        if (this.objective && this.waveIndex >= this.objective.target) {
          this.wavesActive = false;
          g.hud.banner('SETOR LIMPO', 'O silêncio volta por alguns segundos. Não baixe a guarda.', 'ONDA ' + this.waveIndex);
          this.completeObjective();
        } else if (this.waveIndex < this.objective.target) {
          g.hud.banner('ONDA ' + (this.waveIndex + 1) + ' DE ' + this.objective.target, 'Novos infectados se aproximam pelo perímetro.', 'ALERTA DE HORDA');
          g.audio.waveHorn();
          g.spawnWave(this.chapterIndex * 3 + 3 + this.waveIndex * 2, this.chapterIndex * 3 + 2 + this.waveIndex * 2);
        }
      }
    }
  }

  onShot() { }

  onKill(type) {
    this.killCount++;
    const o = this.objective;
    if (!o) return;
    if (o.type === 'kill') {
      this.updateObjectiveUI();
      if (this.killCount >= o.target) this.completeObjective();
    }
    if (o.type === 'brute' && type === 'brute') {
      this.bruteKilled = (this.bruteKilled || 0) + 1;
      this.updateObjectiveUI();
      if (this.bruteKilled >= o.target) this.completeObjective();
    }
  }

  onGrenadeKill() { }

  collectIntel() {
    const o = this.objective;
    if (o && o.type === 'collect') {
      this.collected = (this.collected || 0) + 1;
      this.game.hud.flashMessage(`DADOS RECUPERADOS (${this.collected}/${o.target})`, 1400);
      this.updateObjectiveUI();
      if (this.collected >= o.target) this.completeObjective();
    }
  }

  completeObjective() {
    const g = this.game;
    const o = this.objective;
    if (!o || g.state !== 'playing') return;
    g.audio.ui('confirm');
    g.player.addScore(500);
    g.hud.flashMessage('OBJETIVO CONCLUÍDO: ' + (o ? o.text : ''), 1800);
    this.objectiveIndex++;
    this.interactHold = 0;
    if (this.objectiveIndex >= this.chapter.objectives.length) {
      this.completeChapter();
    } else {
      this.enterObjective();
    }
  }

  enterObjective() {
    const g = this.game;
    const o = this.objective;
    if (!o) return;
    g.hud.setObjectiveHint(o.hint || '');
    if (o.type === 'waves') {
      this.waveIndex = 0;
      this.wavesActive = true;
      g.audio.waveHorn();
      g.hud.banner('ONDA 1 DE ' + o.target, 'Segure o perímetro. Recarregue nos intervalos.', 'ALERTA DE HORDA');
      g.spawnWave(this.chapterIndex * 3 + 3, this.chapterIndex * 3 + 2);
    }
    if (o.type === 'destroy') {
      this.spawnNests(o.target);
    }
    if (o.type === 'brute') {
      const p = g.zombies.findSpawnPos(26, 40);
      const z = g.zombies.spawn('brute', p);
      this.hud?.flashMessage('MOVIMENTO PESADO DETECTADO', 1600);
      g.hud.banner('BRUTAMONTES', 'Algo grande está se aproximando. Mire na cabeça.', 'AMEAÇA PRIORITÁRIA');
      g.audio.waveHorn();
    }
    if (o.type === 'collect') {
      this.spawnIntel(o.target);
    }
    this.updateObjectiveUI();
  }

  freeSpotNearSpawn(minD = 25, maxD = 60) {
    const g = this.game;
    const pl = g.player.pos;
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = minD + Math.random() * (maxD - minD);
      const x = pl.x + Math.cos(a) * r, z = pl.z + Math.sin(a) * r;
      if (Math.abs(x) > 88 || Math.abs(z) > 88) continue;
      if (g.world.collisionAt(x, z, 1.4)) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(pl.x + minD, 0, pl.z);
  }

  spawnIntel(count) {
    const g = this.game;
    const spots = [];
    const chosen = [];
    for (let i = 0; i < count; i++) {
      const p = this.freeSpotNearSpawn(30, 70);
      chosen.push(p);
      g.pickups.spawn('intel', p);
    }
  }

  spawnNests(count) {
    const g = this.game;
    for (let i = 0; i < count; i++) {
      const p = this.freeSpotNearSpawn(26, 55);
      const nest = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: 0x5a1f16, roughness: 0.9, emissive: 0x2a0805, emissiveIntensity: 1.2 });
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), m);
      s.scale.set(1.2, 0.8, 1.2); s.position.y = 0.7; nest.add(s);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.08, 5, 14), new THREE.MeshStandardMaterial({ color: 0xff5a20, emissive: 0xff4000, emissiveIntensity: 2 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; nest.add(ring);
      const light = new THREE.PointLight(0xff3a10, 3, 9, 2);
      light.position.y = 1.2; nest.add(light);
      nest.position.copy(p);
      nest.traverse(o => { if (o.isMesh) o.castShadow = true; });
      g.scene.add(nest);
      const nestObj = { mesh: nest, pos: p, hp: 220, alive: true, light, hitT: 0 };
      this.nestMesh.push(nestObj);
      nest.userData.nestObj = nestObj;
    }
  }

  damageNest(nestObj, dmg) {
    if (!nestObj.alive) return;
    nestObj.hp -= dmg;
    nestObj.hitT = 0.15;
    this.game.fx.bloodBurst(nestObj.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), new THREE.Vector3(0, 1, 0), 8);
    if (nestObj.hp <= 0) {
      nestObj.alive = false;
      this.game.scene.remove(nestObj.mesh);
      this.game.fx.explosion(nestObj.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 4);
      this.game.audio.explode(0);
      this.destroyed = (this.destroyed || 0) + 1;
      this.game.zombies.noise(nestObj.pos, 40, 1);
      this.game.hud.flashMessage(`NINHO DESTRUÍDO (${this.destroyed}/${this.objective ? this.objective.target : 3})`, 1300);
      this.updateObjectiveUI();
      if (this.objective && this.destroyed >= this.objective.target) this.completeObjective();
    }
  }

  completeChapter() {
    const g = this.game;
    const ch = this.chapter;
    if (!ch) { g.onVictory(); return; }
    g.audio.victory();
    g.player.addScore(2500);
    // recompensa
    if (ch.reward && ch.reward.weapon) {
      g.weapons.give(ch.reward.weapon, ch.reward.rounds);
      g.hud.showWeapon(true);
    }
    this.chapterIndex++;
    this.objectiveIndex = 0;
    this.killCount = 0;
    this.wavesActive = false;
    this.collected = 0; this.destroyed = 0; this.bruteKilled = 0;
    this.nestMesh.forEach(n => { if (n.alive) g.scene.remove(n.mesh); });
    this.nestMesh = [];
    g.pickups.items.filter(i => i.kind === 'intel').forEach(i => g.scene.remove(i.mesh));
    g.pickups.items = g.pickups.items.filter(i => i.kind !== 'intel');
    if (this.chapterIndex >= CHAPTERS.length) {
      g.onVictory();
      return;
    }
    const nextIndex = this.chapterIndex;
    setTimeout(() => {
      const next = CHAPTERS[nextIndex];
      if (!next || g.state === 'victory' || g.state === 'menu' || this.chapterIndex !== nextIndex) return;
      g.hud.setChapter(next.code, next.name);
      this.announceChapter();
      this.enterObjective();
      g.hud.updateGadgets();
    }, 1200);
  }
}
