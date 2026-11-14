/* DEADZONE — orquestrador: estados, loop, UI e persistência */
import * as THREE from '../assets/vendor/three.module.js';
import { Renderer } from './render.js';
import { buildTextures } from './textures.js';
import { World } from './world.js';
import { Player } from './player.js';
import { WeaponSystem, WEAPONS } from './weapons.js';
import { ZombieManager } from './zombies.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { PickupManager } from './pickups.js';
import { ProjectileManager } from './projectiles.js';
import { QuestManager, CHAPTERS } from './quest.js';
import { PropManager } from './props.js';
import { Controls, haptics } from './controls.js';
import { audio } from './audio.js';
import { clamp, rand, fmtTime, fmtNum, pick } from './util.js';

const SAVE_KEY = 'deadzone.save.v1';
const SETTINGS_KEY = 'deadzone.settings.v1';
const BEST_KEY = 'deadzone.best.v1';

const DEFAULT_SETTINGS = {
  sensitivity: 1.0,
  autoAim: 0.6,
  fov: 74,
  lowSpec: false,
  invertY: false,
  haptics: true,
  muted: false,
  musicVolume: 0.5,
  sfxVolume: 0.9,
  showFPS: true,
  thirdPerson: false,
  flashlight: true,
  aimAssistOff: false
};

class Game {
  constructor() {
    this.settings = this._loadSettings();
    this.weaponDefs = WEAPONS;
    this.state = 'boot';     // boot | menu | playing | paused | dead | victory
    this.wave = 0;
    this.waveTimer = 0;
    this.elapsed = 0;
    this.stats = { shots: 0, grenades: 0, explosions: 0, waves: 0 };
    this.haptics = haptics;
    this.audio = audio;
    this.controls = null;
    this._loop = this._loop.bind(this);
    this.boot();
  }

  _loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (e) { }
    return Object.assign({}, DEFAULT_SETTINGS);
  }

  _saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { }
  }

  readBest() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch (e) { return {}; }
  }

  writeBest(b) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) { }
  }

  async boot() {
    this.canvas = document.getElementById('gl');
    this.renderer = new Renderer(this.canvas, this);
    this.scene = this.renderer.scene;
    this.camera = this.renderer.camera;
    this.tex = buildTextures();
    this.world = new World(this.scene, this);
    this.world.build(this.tex);
    this.fx = new FX(this.scene, this);
    this.player = new Player(this.scene, this.camera, this);
    this.hud = new HUD(this);
    this.weapons = new WeaponSystem(this.scene, this.camera, this);
    this.weapons.reset();
    this.hud.buildSlots();
    this.zombies = new ZombieManager(this.scene, this);
    this.pickups = new PickupManager(this.scene, this);
    this.projectiles = new ProjectileManager(this.scene, this);
    this.quest = new QuestManager(this);
    this.props = new PropManager(this.scene, this);
    this.controls = new Controls({
      root: document.getElementById('touch-layer'),
      surface: document.getElementById('touch-layer'),
      canvas: this.canvas,
      sensitivity: this.settings.sensitivity,
      autoAim: this.settings.autoAim
    });
    haptics.enabled = this.settings.haptics;
    this._bindUI();
    this._showMenu();
    this.hud.updateGadgets();
    this.hud.buildSlots();
    this.clock = new THREE.Clock();
    this.ready = true;
    this.renderer.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }

  /* ------------------------------------------------ menus / UI */
  _bindUI() {
    const $ = (id) => document.getElementById(id);
    this.ui = {
      loading: $('loading'), loadingBar: $('loading-bar'), loadingText: $('loading-text'),
      menu: $('menu'), pause: $('pause'), death: $('death'), victory: $('victory'),
      settingsPanel: $('settings'), briefing: $('briefing'), help: $('help')
    };
    const tap = (el, fn) => el && el.addEventListener('click', (e) => { e.preventDefault(); audio.ui('tap'); fn(e); });

    tap($('btn-start'), () => this.startNew(true));
    tap($('btn-continue'), () => this.continueSave());
    tap($('btn-settings'), () => this.openSettings());
    tap($('btn-help'), () => this.togglePanel('help', true));
    tap($('btn-close-help'), () => this.togglePanel('help', false));
    tap($('btn-resume'), () => this.resume());
    tap($('btn-pause-settings'), () => this.openSettings());
    tap($('btn-pause-menu'), () => this.toMenu());
    tap($('btn-retry'), () => this.startNew(true));
    tap($('btn-death-menu'), () => this.toMenu());
    tap($('btn-again'), () => this.startNew(true));
    tap($('btn-victory-menu'), () => this.toMenu());
    tap($('btn-brief-ok'), () => { this.togglePanel('briefing', false); this.resume(); });
    tap($('btn-close-settings'), () => this.closeSettings());
    tap($('btn-pause-view'), () => { this.player.toggleView(); });
    tap($('btn-pause-full'), () => this.toggleFullscreen());

    // HUD buttons
    tap($('hud-pause'), () => this.pause());
    tap($('hud-view'), () => this.player.toggleView());
    tap($('hud-full'), () => this.toggleFullscreen());
    tap($('hud-flash'), () => { if (this.player) this.player.toggleFlashlight(); });
    tap($('hud-map'), () => this.toggleMinimap());
    tap($('hud-aimlock'), () => {
      this.settings.autoAim = this.settings.autoAim > 0.35 ? 0.2 : 0.75;
      this._saveSettings();
      this.hud.setAutoAimRange(this.settings.autoAim);
      this.hud.flashMessage('MIRA ASSISTIDA: ' + (this.settings.autoAim > 0.35 ? 'ALTA' : 'BAIXA'), 1100);
    });

    // settings inputs
    const bindRange = (id, key, fmt, apply) => {
      const el = $(id);
      if (!el) return;
      const label = $(id + '-val');
      el.value = this.settings[key];
      if (label) label.textContent = fmt(this.settings[key]);
      el.addEventListener('input', () => {
        this.settings[key] = parseFloat(el.value);
        if (label) label.textContent = fmt(this.settings[key]);
        if (apply) apply(this.settings[key]);
        this._saveSettings();
      });
    };
    bindRange('set-sens', 'sensitivity', v => v.toFixed(2) + '×', v => { this.controls.sensitivity = v; });
    bindRange('set-autoaim', 'autoAim', v => Math.round(v * 100) + '%', v => { this.hud.setAutoAimRange(v); });
    bindRange('set-fov', 'fov', v => Math.round(v) + '°', v => { this.camera.fov = v; this.camera.updateProjectionMatrix(); });
    bindRange('set-music', 'musicVolume', v => Math.round(v * 100) + '%', v => audio.setMusicVolume(v));
    bindRange('set-sfx', 'sfxVolume', v => Math.round(v * 100) + '%', v => { if (audio.sfx) audio.sfx.gain.value = v; });

    const bindToggle = (id, key, apply) => {
      const el = $(id);
      if (!el) return;
      el.classList.toggle('on', !!this.settings[key]);
      el.addEventListener('click', () => {
        this.settings[key] = !this.settings[key];
        el.classList.toggle('on', !!this.settings[key]);
        audio.ui('tap');
        this._saveSettings();
        if (apply) apply(this.settings[key]);
      });
    };
    bindToggle('set-hoc', 'lowSpec', (v) => { this.renderer.setQuality(v); this._rebuildWorld(); });
    bindToggle('set-haptics', 'haptics', (v) => { haptics.enabled = v; });
    bindToggle('set-invert', 'invertY', (v) => { this.controls.invertY = v; });
    bindToggle('set-fps', 'showFPS', (v) => { this.hud.el.fps.style.display = v ? 'block' : 'none'; });
    bindToggle('set-view3', 'thirdPerson', (v) => { this.player.thirdPerson = v; });

    // ações do HUD de toque com teclado/tap extra
    document.querySelectorAll('[data-act]').forEach(el => {
      if (['reload', 'heal', 'grenade', 'flash', 'view', 'sprint', 'crouch', 'aim', 'fire'].includes(el.dataset.act)) {
        el.addEventListener('pointerdown', () => audio.ui('tap') && 0);
      }
    });

    // botão "iniciar" grande da tela de carregamento
    tap($('btn-first'), () => this._enterFromLoading());
    tap($('btn-rotate-skip'), () => { document.getElementById('rotate').style.display = 'none'; });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Tab') {
        if (this.state === 'playing') { e.preventDefault(); this.pause(); }
        else if (this.state === 'paused' && !this.ui.settingsPanel.classList.contains('open')) { e.preventDefault(); this.resume(); }
      }
      if (e.code === 'KeyM' && this.state === 'playing') this.toggleMinimap();
      if (e.code === 'KeyV' && this.state === 'playing') this.player.toggleView();
      if (e.code === 'KeyL' && this.state === 'playing') this.player.toggleFlashlight();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.addEventListener('blur', () => { if (this.state === 'playing') this.pause(); });
  }

  _rebuildWorld() {
    // aplica a qualidade recriando o cenário (poucos objetos, rápido)
    this.scene.remove(this.world.group);
    this.world.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.world.blockers = []; this.world.buildings = []; this.world.lamps = [];
    this.world.objectivePositions = {};
    const w = new World(this.scene, this);
    w.build(this.tex);
    this.world = w;
    this.fx.game = this;
  }

  _enterFromLoading() {
    audio.init(); audio.resume(); audio.startAmbience(); audio.startMusic();
    this.ui.loading.classList.add('hidden');
    this.state = 'menu';
    this._showMenu();
  }

  _showMenu() {
    this.state = 'menu';
    this.ui.menu.classList.add('open');
    this.ui.pause.classList.remove('open');
    this.ui.death.classList.remove('open');
    this.ui.victory.classList.remove('open');
    document.body.classList.remove('in-game');
    const best = this.readBest();
    const bd = document.getElementById('best-data');
    if (bd) {
      bd.innerHTML = best.score
        ? `<div><span>MELHOR PONTUAÇÃO</span><b>${fmtNum(best.score)}</b></div>
           <div><span>ABATES TOTAIS</span><b>${fmtNum(best.kills || 0)}</b></div>
           <div><span>SOBREVIVÊNCIA</span><b>${fmtTime(best.time || 0)}</b></div>`
        : `<div><span>MELHOR PONTUAÇÃO</span><b>—</b></div>
           <div><span>ABATES TOTAIS</span><b>—</b></div>
           <div><span>SOBREVIVÊNCIA</span><b>—</b></div>`;
    }
    this.refreshMenuState();
    // câmera cinematográfica no menu
    this._menuCam = true;
    this.player.pos.set(0, 0, 7.5);
    this.player.yaw = Math.PI * 0.15;
  }

  refreshMenuState() {
    let hasSave = false;
    try { hasSave = !!localStorage.getItem(SAVE_KEY); } catch (e) { }
    const cont = document.getElementById('btn-continue');
    if (cont) cont.disabled = !hasSave;
    const best = this.readBest();
    const bd = document.getElementById('best-data');
    if (bd) {
      bd.innerHTML = best.score
        ? `<div><span>MELHOR PONTUAÇÃO</span><b>${fmtNum(best.score)}</b></div>
           <div><span>ABATES TOTAIS</span><b>${fmtNum(best.kills || 0)}</b></div>
           <div><span>SOBREVIVÊNCIA</span><b>${fmtTime(best.time || 0)}</b></div>`
        : `<div><span>MELHOR PONTUAÇÃO</span><b>—</b></div>
           <div><span>ABATES TOTAIS</span><b>—</b></div>
           <div><span>SOBREVIVÊNCIA</span><b>—</b></div>`;
    }
  }

  openSettings() {
    this.ui.settingsPanel.classList.add('open');
    audio.ui('confirm');
  }
  closeSettings() {
    this.ui.settingsPanel.classList.remove('open');
    audio.ui('back');
  }
  togglePanel(id, open) {
    this.ui[id].classList.toggle('open', open);
  }

  toggleMinimap() {
    const wrap = this.hud.el.minimap.parentElement;
    const open = !wrap.classList.contains('expanded');
    wrap.classList.toggle('expanded', open);
    const c = this.hud.el.minimap;
    // dobra a resolução do canvas para não ficar borrado no mapa grande
    const res = open ? 336 : 168;
    if (c.width !== res) { c.width = res; c.height = res; }
    c.style.width = '';
    c.style.height = '';
    document.getElementById('hud-map').classList.toggle('on', open);
    const rail = wrap.parentElement;
    if (rail) rail.classList.toggle('map-open', open);
    document.body.classList.toggle('map-open', open);
    this.audio && this.audio.ui('tap');
  }

  toggleFullscreen() {
    const d = document.documentElement;
    if (!document.fullscreenElement) {
      (d.requestFullscreen || d.webkitRequestFullscreen || (() => { })).call(d).catch(() => { });
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => { });
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || (() => { })).call(document).catch(() => { });
    }
  }

  /* ------------------------------------------------ fluxo de jogo */
  async startNew(showBriefing = true) {
    audio.resume();
    audio.startAmbience();
    audio.startMusic();
    this.ui.menu.classList.remove('open');
    this.ui.death.classList.remove('open');
    this.ui.victory.classList.remove('open');
    this.ui.pause.classList.remove('open');
    this.hud.reset();
    // limpa entidades
    this.zombies.reset();
    this.pickups.clear();
    this.projectiles.clear();
    this.fx.reset();
    this.quest.reset();
    this.player.reset();
    this.weapons.reset();
    this.wave = 0;
    this.waveTimer = 0;
    this.elapsed = 0;
    this.stats = { shots: 0, grenades: 0, explosions: 0, waves: 0 };
    this.hud.buildSlots();
    this.hud.updateHealth();
    this.hud.updateAmmo();
    this.hud.updateGadgets();
    this.hud.updateScore(0);
    this.hud.setChapter(CHAPTERS[0].code, CHAPTERS[0].name);
    document.body.classList.add('in-game');
    this.player.thirdPerson = !!this.settings.thirdPerson;
    this.player.toggleFlashlight(this.settings.flashlight !== false);
    this.state = 'playing';
    this.controls.setEnabled(true);
    this.controls.sensitivity = this.settings.sensitivity;
    this.controls.invertY = this.settings.invertY;
    this.ui.loading.classList.add('hidden');
    this.quest.start();
    // spawn inicial
    this.spawnWave(4, 4);
    if (showBriefing) {
      this.togglePanel('briefing', true);
      const b = this.ui.briefing;
      const ch = CHAPTERS[0];
      if (b) {
        b.querySelector('.brief-code').textContent = ch.code + ' · ' + ch.time;
        b.querySelector('.brief-title').textContent = ch.name;
        b.querySelector('.brief-text').textContent = ch.brief;
        b.querySelector('.brief-objs').innerHTML = ch.objectives.map((o, i) => `<li><b>${String(i + 1).padStart(2, '0')}</b> ${o.text}</li>`).join('');
      }
      this.state = 'briefing';
    }
    this.props.reset();
    this.props.build();
    this.hud.setAutoAimRange(this.settings.autoAim);
    this.hud.el.fps.style.display = this.settings.showFPS ? 'block' : 'none';
  }

  continueSave() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { s = null; }
    if (!s) { this.startNew(false); return; }
    this.startNew(false);
    const ch = clamp(s.chapter || 0, 0, CHAPTERS.length - 1);
    // restaura arsenal das capítulos anteriores
    for (let i = 0; i < ch; i++) {
      const r = CHAPTERS[i].reward;
      if (r && r.weapon) this.weapons.give(r.weapon, r.rounds);
    }
    this.player.score = s.score || 0;
    this.quest.chapterIndex = ch;
    this.quest.objectiveIndex = 0;
    this.quest.killCount = 0;
    this.quest.collected = 0; this.quest.destroyed = 0; this.quest.bruteKilled = 0;
    this.quest.wavesActive = false;
    this.hud.setChapter(this.quest.chapter.code, this.quest.chapter.name);
    this.hud.updateScore(this.player.score);
    this.quest.announceChapter();
    this.quest.enterObjective();
    this.hud.flashMessage('PROGRESSO RESTAURADO — ' + this.quest.chapter.code, 2200);
    this.hud.updateAmmo();
    this.hud.buildSlots();
  }

  saveProgress() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ chapter: this.quest.chapterIndex, score: this.player.score, time: this.elapsed }));
    } catch (e) { }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.pause.classList.add('open');
    this.controls.setEnabled(false);
    this.controls.reset();
    audio.setTension(0.1);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resume() {
    if (this.state !== 'paused' && this.state !== 'briefing') return;
    if (this.ui.settingsPanel.classList.contains('open')) { this.closeSettings(); return; }
    this.ui.pause.classList.remove('open');
    this.ui.briefing.classList.remove('open');
    this.state = 'playing';
    this.controls.setEnabled(true);
    this.clock.getDelta();
  }

  toMenu() {
    this.state = 'menu';
    this.controls.setEnabled(false);
    this.ui.pause.classList.remove('open');
    this.ui.death.classList.remove('open');
    this.ui.victory.classList.remove('open');
    this.ui.briefing.classList.remove('open');
    this.ui.settingsPanel.classList.remove('open');
    document.body.classList.remove('in-game');
    this.saveProgress();
    this._recordBest();
    this._showMenu();
  }

  onPlayerDeath() {
    this.state = 'dead';
    this.controls.setEnabled(false);
    setTimeout(() => {
      const d = this.ui.death;
      d.classList.add('open');
      d.querySelector('.death-sub').textContent = pick([
        'O silêncio volta ao acampamento. Desta vez, sem você.',
        'Você resistiu. Mas não o suficiente.',
        'A horda lembra do seu nome agora.'
      ]);
      d.querySelector('#death-kills').textContent = this.player.stats.kills;
      d.querySelector('#death-head').textContent = this.player.stats.headshots;
      d.querySelector('#death-time').textContent = fmtTime(this.elapsed);
      d.querySelector('#death-score').textContent = fmtNum(this.player.score);
      d.querySelector('#death-acc').textContent = this.player.stats.shots ? Math.round((this.player.stats.hits / this.player.stats.shots) * 100) + '%' : '0%';
      this._recordBest();
      this.saveProgress();
    }, 1400);
  }

  onVictory() {
    this.state = 'victory';
    this.controls.setEnabled(false);
    audio.stopMusic();
    audio.victory();
    this._recordBest();
    setTimeout(() => {
      const v = this.ui.victory;
      v.classList.add('open');
      v.querySelector('#vic-kills').textContent = this.player.stats.kills;
      v.querySelector('#vic-head').textContent = this.player.stats.headshots;
      v.querySelector('#vic-time').textContent = fmtTime(this.elapsed);
      v.querySelector('#vic-score').textContent = fmtNum(this.player.score);
      v.querySelector('#vic-acc').textContent = this.player.stats.shots ? Math.round((this.player.stats.hits / this.player.stats.shots) * 100) + '%' : '0%';
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
    }, 1200);
  }

  _recordBest() {
    const best = this.readBest();
    const updated = {
      score: Math.max(best.score || 0, this.player.score),
      kills: Math.max(best.kills || 0, this.player.stats.kills),
      time: Math.max(best.time || 0, this.elapsed)
    };
    this.writeBest(updated);
  }

  spawnWave(count, brutes = 0) {
    this.wave++;
    this.zombies.spawnWave(this.wave, count);
    for (let i = 0; i < brutes; i++) {
      if (this.wave >= 3 && Math.random() < 0.6) {
        const p = this.zombies.findSpawnPos(26, 40);
        const z = this.zombies.spawn('brute', p);
      }
    }
    this.hud.updateWave(this.wave, this.zombies.aliveCount());
    audio.setTension(clamp(0.25 + this.wave * 0.07, 0, 0.95));
    this.stats.waves++;
  }

  /* ------------------------------------------------ loop */
  _loop(now) {
    requestAnimationFrame(this._loop);
    const dtRaw = this.clock ? this.clock.getDelta() : 0.016;
    const dt = Math.min(dtRaw, 0.2);
    const t = now * 0.001;
    if (!this.ready) return;
    const playing = this.state === 'playing';
    const frozen = this.state === 'paused' || this.state === 'briefing';

    if (this._menuCam && (this.state === 'menu' || this.state === 'dead' || this.state === 'victory')) {
      // câmera lenta orbitando o acampamento
      const a = t * 0.06;
      const r = 15;
      const cx = Math.sin(a) * r, cz = Math.cos(a) * r;
      this.camera.position.set(cx, 4.2 + Math.sin(t * 0.25) * 1.2, cz);
      this.camera.lookAt(0, 1.6, 0);
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
    }

    if (this.state === 'playing' || this.state === 'dead') {
      if (!frozen) {
        const sdt = this.state === 'dead' ? dt * 0.4 : dt;
        this.elapsed += sdt;
        this.player.update(sdt);
        this.zombies.update(sdt);
        this.weapons.update(sdt, this.player);
        this.pickups.update(sdt, this.player);
        this.projectiles.update(sdt);
        this.quest.update(sdt);
        this.props.update(sdt);
        this.fx.update(sdt, this.camera);
        this.world.update(sdt, this.player);
        this.hud.update(sdt);
        this.hud.drawMinimap(this.player, this.zombies, this.world);
        this.hud.updateTimer(this.elapsed);
        if (this.state === 'playing') this._autoWaves(sdt);
        // tensão dinâmica pela proximidade
        if (this.state === 'playing') {
          const near = this.zombies.nearestAlerted(30);
          const dist = near ? near.pos.distanceTo(this.player.pos) : 40;
          const target = clamp(1 - dist / 32, 0, 1) * 0.8 + (this.player.health < 40 ? 0.3 : 0) + Math.min(0.3, this.zombies.aliveCount() * 0.02);
          audio.setTension(clamp(target, 0.1, 1));
        }
        // auto-save ocasional
        this._saveAcc = (this._saveAcc || 0) + sdt;
        if (this._saveAcc > 20) { this._saveAcc = 0; this.saveProgress(); }
      }
    }

    if (this.state !== 'menu') {
      this.renderer.render(dt, t);
    } else {
      this.renderer.render(dt, t);
    }
  }

  onFpsSample(fps) {
    if (window.innerHeight > window.innerWidth && this.renderer.renderer.getPixelRatio() > 1) {
      // em retrato, reduz resolução para manter jogável
      this.renderer.renderer.setPixelRatio(1);
      this.renderer.resize();
    }
    if (this.settings.lowSpec) return;
    if (fps < 26) this._slowFrames = (this._slowFrames || 0) + 1;
    else this._slowFrames = 0;
    if (this._slowFrames === 5 && !this._autoDowngraded) {
      this._autoDowngraded = true;
      this.renderer.setQuality(false);
      if (this.renderer.bloom) this.renderer.bloom.strength = 0.28;
      this.hud.flashMessage('QUALIDADE AJUSTADA AUTOMATICAMENTE', 2200);
      // reduz sombras
      this.renderer.renderer.shadowMap.enabled = false;
      this.scene.traverse(o => { if (o.isLight && o.shadow) o.castShadow = false; });
    }
  }

  _autoWaves(dt) {
    // ondas de pressão contínua quando não há objetivos de onda
    if (this.zombies.aliveCount() < 2) {
      this.waveTimer += dt;
      const wait = 7;
      this.hud.el.nextWave.textContent = Math.max(0, Math.ceil(wait - this.waveTimer)) + 's';
      if (this.waveTimer > wait) {
        this.waveTimer = 0;
        const q = this.quest.wavesActive;
        if (!q) {
          const count = 3 + Math.min(9, Math.floor(this.elapsed / 55));
          this.spawnWave(count, 1);
        }
      }
    } else {
      this.waveTimer = 0;
      this.hud.el.nextWave.textContent = '—';
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  window.__game = game;
  // esconde o carregamento após o boot
  const finish = () => {
    const l = document.getElementById('loading');
    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.width = '100%';
    const txt = document.getElementById('loading-text');
    if (txt) txt.textContent = 'SISTEMA PRONTO';
    setTimeout(() => {
      const btn = document.getElementById('btn-first');
      if (btn) btn.classList.add('show');
    }, 120);
  };
  const check = setInterval(() => {
    if (game.ready) { clearInterval(check); finish(); }
  }, 60);
  setTimeout(() => {
    if (!game.ready) {
      const txt = document.getElementById('loading-text');
      if (txt) txt.textContent = 'ERRO AO INICIALIZAR WEBGL';
    }
  }, 12000);
});
export { Game };
