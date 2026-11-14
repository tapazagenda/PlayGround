/* DEADZONE — HUD: ligação com o DOM, feedback e minimapa */
import { clamp, fmtTime, fmtNum, TAU } from './util.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.$ = (id) => document.getElementById(id);
    this.el = {
      root: this.$('hud'),
      health: this.$('hp-bar'), healthNum: this.$('hp-num'),
      armor: this.$('armor-bar'), armorNum: this.$('armor-num'),
      stamina: this.$('stamina-fill'),
      ammoMag: this.$('ammo-mag'), ammoRes: this.$('ammo-res'), ammoName: this.$('ammo-name'), ammoType: this.$('ammo-type'),
      weaponSlots: this.$('weapon-slots'),
      objective: this.$('obj-text'), objectiveBar: this.$('obj-progress'), objectiveHint: this.$('obj-hint'),
      chapter: this.$('chapter-code'), chapterName: this.$('chapter-name'),
      wave: this.$('wave-info'), alive: this.$('alive-count'),
      score: this.$('score-num'), kills: this.$('kills-num'),
      timer: this.$('timer'),
      crosshair: this.$('crosshair'),
      hitmarker: this.$('hitmarker'),
      messages: this.$('messages'),
      damage: this.$('damage-ind'),
      vignette: this.$('damage-vignette'),
      flash: this.$('screen-flash'),
      reloadWrap: this.$('reload-wrap'), reloadBar: this.$('reload-bar'),
      interact: this.$('interact-panel'), interactBar: this.$('interact-bar'), interactText: this.$('interact-text'),
      banner: this.$('banner'), bannerTitle: this.$('banner-title'), bannerText: this.$('banner-text'), bannerTag: this.$('banner-tag'),
      minimap: this.$('minimap'),
      compass: this.$('compass-tape'),
      weaponCard: this.$('weapon-card'),
      nextWave: this.$('wave-countdown'),
      grenades: this.$('gadget-grenades'),
      flashbangs: this.$('gadget-flash'),
      medkits: this.$('gadget-med'),
      adsIndicator: this.$('ads-indicator'),
      fps: this.$('fps'),
      lowhp: this.$('lowhp'),
      akRange: this.$('autoaim-range')
    };
    this.msgTimers = [];
    this._canvas = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.bannerTimer = null;
    this.lastHitMarker = 0;
    this.buildSlots();
    this.buildCompass();
    this.fpsAcc = 0; this.fpsCount = 0; this.fpsLast = 0;
  }

  reset() {
    this.el.messages.innerHTML = '';
    this.el.hitmarker.classList.remove('show');
    this.el.banner.classList.remove('show');
    this.el.damage.style.opacity = 0;
    this.el.vignette.style.opacity = 0;
    this.el.flash.style.opacity = 0;
    this.el.reloadWrap.classList.remove('show');
    this.el.interact.classList.remove('show');
    this.el.weaponCard.classList.remove('show');
    this.updateHealth();
    this.updateAmmo();
    this.updateGadgets();
    this.updateScore(0);
  }

  buildSlots() {
    const ws = this.game.weapons;
    if (!ws) return;
    this.el.weaponSlots.innerHTML = '';
    for (const id of ws.owned) {
      const def = this.game.weaponDefs[id];
      const d = document.createElement('div');
      d.className = 'wslot';
      d.dataset.w = id;
      d.innerHTML = `<span class="ws-key">${def.slot}</span><span class="ws-icon">${def.icon}</span><span class="ws-name">${def.short}</span>`;
      d.addEventListener('pointerdown', (e) => { e.preventDefault(); this.game.weapons.equip(id); this.game.audio.ui('tap'); });
      this.el.weaponSlots.appendChild(d);
    }
    this.updateWeaponSlots(this.game.weapons.current);
  }

  updateWeaponSlots(current) {
    if (!this.el.weaponSlots) return;
    const ws = this.game.weapons;
    const ids = ws.owned.join(',');
    if (this._lastOwned !== ids) {
      this._lastOwned = ids;
      this.buildSlots();
      return;
    }
    Array.from(this.el.weaponSlots.children).forEach((c) => c.classList.toggle('active', c.dataset.w === current));
    const def = this.game.weaponDefs[current];
    if (def && this.el.ammoName) {
      this.el.ammoName.textContent = def.name;
      this.el.ammoType.textContent = def.type === 'gun' ? 'CALIBRE ' + (def.id === 'shotgun' ? '12' : def.id === 'sniper' ? '7.62×54' : def.id === 'rifle' ? '5.45×39' : def.id === 'smg' ? '9×19' : '9×19') : 'CORPO A CORPO';
    }
  }

  buildCompass() {
    const tape = this.el.compass;
    if (!tape) return;
    tape.innerHTML = '';
    const marks = [];
    const dirs = { 0: 'N', 45: 'NE', 90: 'L', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    for (let deg = 0; deg < 360; deg += 15) {
      const d = document.createElement('div');
      d.className = 'compass-mark' + (dirs[deg] ? ' major' : '');
      d.style.left = (deg / 360) * 100 + '%';
      d.innerHTML = dirs[deg] ? `<b>${dirs[deg]}</b>` : '<i></i>';
      tape.appendChild(d);
      marks.push(d);
    }
    this.compassMarks = marks;
  }

  updateCompass(yaw) {
    if (!this.el.compass) return;
    // yaw: 0 => -Z (norte). Converte para ângulo de bússola
    let deg = ((-yaw * 180) / Math.PI) % 360;
    if (deg < 0) deg += 360;
    const offset = (deg / 360) * 100;
    this.el.compass.style.backgroundPosition = offset + '% center';
    this.compassMarks.forEach((m, i) => {
      let rel = (i * 15 - deg) % 360;
      if (rel < -180) rel += 360;
      if (rel > 180) rel -= 360;
      const x = 50 + (rel / 180) * 50;
      m.style.left = x + '%';
      m.style.opacity = Math.max(0, 1 - Math.abs(rel) / 95);
    });
    if (this._compassNeedle) this._compassNeedle = deg;
  }

  updateHealth() {
    const p = this.game.player;
    if (!p) return;
    const hp = clamp(p.health / p.maxHealth, 0, 1);
    this.el.health.style.width = hp * 100 + '%';
    this.el.health.style.background = hp > 0.6 ? 'linear-gradient(90deg,#7dbb4a,#b6d96b)' : hp > 0.3 ? 'linear-gradient(90deg,#d9a13a,#f0c264)' : 'linear-gradient(90deg,#c4362c,#e8594a)';
    this.el.healthNum.textContent = Math.ceil(p.health);
    this.el.armor.style.width = clamp(p.armor / p.maxArmor, 0, 1) * 100 + '%';
    this.el.armorNum.textContent = Math.ceil(p.armor);
    this.el.lowhp.style.opacity = hp < 0.35 ? clamp((0.35 - hp) / 0.35, 0, 1) * 0.55 : 0;
  }

  updateStamina(v) {
    if (this.el.stamina) this.el.stamina.style.width = clamp(v, 0, 1) * 100 + '%';
  }

  updateAmmo() {
    const ws = this.game.weapons;
    if (!ws) return;
    const s = ws.state;
    const def = ws.def;
    if (def.type === 'gun') {
      this.el.ammoMag.textContent = s.mag;
      this.el.ammoRes.textContent = s.reserve;
      this.el.ammoMag.className = s.mag === 0 ? 'empty' : s.mag <= def.magSize * 0.25 ? 'low' : '';
    } else {
      this.el.ammoMag.textContent = '∞';
      this.el.ammoRes.textContent = '—';
      this.el.ammoMag.className = '';
    }
    this.updateWeaponSlots(ws.current);
  }

  pulseAmmo() {
    this.el.ammoMag.classList.add('pulse');
    setTimeout(() => this.el.ammoMag.classList.remove('pulse'), 400);
  }

  updateScore(score) {
    if (!this.el.score || !this.game.player) return;
    this.el.score.textContent = fmtNum(score);
  }

  updateGadgets() {
    const p = this.game.player;
    if (!p) return;
    this.el.grenades.textContent = p.grenades;
    this.el.flashbangs.textContent = p.flashbangs;
    this.el.medkits.textContent = p.medkits;
  }

  flashMessage(text, ms = 1500) {
    const d = document.createElement('div');
    d.className = 'msg';
    d.textContent = text;
    this.el.messages.appendChild(d);
    requestAnimationFrame(() => d.classList.add('in'));
    setTimeout(() => {
      d.classList.remove('in');
      setTimeout(() => d.remove(), 400);
    }, ms);
    while (this.el.messages.children.length > 4) this.el.messages.firstChild.remove();
  }

  hitMarker(headshot = false) {
    const hm = this.el.hitmarker;
    hm.classList.remove('show', 'head');
    void hm.offsetWidth;
    hm.classList.add('show');
    if (headshot) hm.classList.add('head');
    this.lastHitMarker = performance.now();
    if (headshot) this.flashMessage('CABEÇA! +50', 600);
  }

  showDamageDirection(angle) {
    const d = this.el.damage;
    d.style.transform = `rotate(${angle}rad)`;
    d.style.opacity = 0.95;
    clearTimeout(this._dmgTimer);
    this._dmgTimer = setTimeout(() => { d.style.opacity = 0; }, 500);
  }

  screenFlash(v = 1) {
    this.el.flash.style.transition = 'opacity 0.06s ease';
    this.el.flash.style.opacity = v;
    setTimeout(() => { this.el.flash.style.transition = 'opacity 1.2s ease'; this.el.flash.style.opacity = 0; }, 90);
  }

  showReload(show, total = 1) {
    this.el.reloadWrap.classList.toggle('show', show);
    if (show) this.el.reloadBar.style.width = '0%';
  }

  updateReload(progress) {
    this.el.reloadBar.style.width = clamp(progress, 0, 1) * 100 + '%';
  }

  showInteract(show, progress, text = 'MANTENHA PARA INTERAGIR') {
    this.el.interact.classList.toggle('show', show);
    if (show) this.el.interactText.textContent = text;
  }

  setInteractProgress(p) { this.el.interactBar.style.width = clamp(p, 0, 1) * 100 + '%'; }

  banner(title, text, tag = '') {
    const b = this.el.banner;
    this.el.bannerTitle.textContent = title;
    this.el.bannerText.textContent = text;
    this.el.bannerTag.textContent = tag;
    b.classList.add('show');
    this.el.chapterName.style.opacity = 1;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('show'), 5200);
  }

  setChapter(code, name) {
    this.el.chapter.textContent = code;
    this.el.chapterName.textContent = name;
  }

  updateObjective(text, progress) {
    this.el.objective.textContent = text;
    this.el.objectiveBar.style.width = clamp(progress, 0, 1) * 100 + '%';
  }

  setObjectiveHint(hint) { this.el.objectiveHint.textContent = hint || ''; }

  updateWave(wave, alive, totalEnemies = 0) {
    this.el.wave.textContent = wave > 0 ? `ONDA ${wave}` : 'SEM AMEAÇAS';
    this.el.alive.textContent = alive;
  }

  updateTimer(seconds) { this.el.timer.textContent = fmtTime(seconds); }

  showWeapon(show) {
    this.el.weaponCard.classList.toggle('show', show);
    if (show) {
      clearTimeout(this._wcTimer);
      this._wcTimer = setTimeout(() => this.el.weaponCard.classList.remove('show'), 2400);
    }
  }

  updateGadgetCounts() { this.updateGadgets(); }

  setFPS(fps, calls) {
    if (!this.el.fps) return;
    this.el.fps.textContent = fps + ' FPS' + (calls ? ' · ' + calls + ' DC' : '');
  }

  setThirdPerson(v) {
    const el = document.getElementById('hud-view');
    if (el) { el.textContent = v ? '3ª' : '1ª'; el.classList.toggle('on', false); }
  }

  setFlashState(on) {
    const el = document.getElementById('hud-flash');
    if (el) el.classList.toggle('on', !!on);
  }

  setAutoAimRange(v) { if (this.el.akRange) this.el.akRange.textContent = Math.round(v * 100) + '%'; }

  /* ---------------- minimapa ---------------- */
  drawMinimap(player, zombies, world) {
    const c = this.el.minimap;
    if (!c) return;
    const ctx = this._canvas;
    const W = c.width, H = c.height;
    const scale = 1.55; // px por metro
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    const yawDeg = (player.yaw * 180) / Math.PI;
    // mapa gira em torno do jogador
    ctx.rotate(-yawDeg * Math.PI / 180);
    ctx.translate(-player.pos.x * scale, -player.pos.z * scale);
    // fundo
    ctx.fillStyle = 'rgba(22,32,30,0.82)';
    ctx.fillRect(0, 0, W, H);
    // quarteirões
    ctx.fillStyle = 'rgba(60,78,70,0.55)';
    for (const b of world.buildings) {
      ctx.fillRect(b.x0 * scale, b.z0 * scale, (b.x1 - b.x0) * scale, (b.z1 - b.z0) * scale);
    }
    // ruas
    ctx.strokeStyle = 'rgba(120,130,120,0.35)';
    ctx.lineWidth = 15 * scale;
    for (const r of world.roads) {
      ctx.beginPath();
      if (r.axis === 'x') { ctx.moveTo(-110 * scale, r.line * scale); ctx.lineTo(110 * scale, r.line * scale); }
      else { ctx.moveTo(r.line * scale, -110 * scale); ctx.lineTo(r.line * scale, 110 * scale); }
      ctx.stroke();
    }
    // obstáculos pequenos (carros) opcional
    // objetivos
    const q = this.game.quest;
    if (q && q.beacon && q.beacon.visible) {
      const bx = q.beacon.position.x * scale, bz = q.beacon.position.z * scale;
      ctx.fillStyle = '#5ad8ff';
      ctx.beginPath(); ctx.arc(bx, bz, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(90,216,255,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, bz, 10 + Math.sin(performance.now() / 300) * 3, 0, TAU); ctx.stroke();
    }
    // ninhos
    if (q && q.nestMesh) {
      q.nestMesh.forEach(n => {
        if (!n.alive) return;
        ctx.fillStyle = '#ff6a30';
        ctx.beginPath(); ctx.arc(n.pos.x * scale, n.pos.z * scale, 5, 0, TAU); ctx.fill();
      });
    }
    // itens
    if (this.game.pickups) {
      for (const it of this.game.pickups.items) {
        if (it.kind !== 'intel') continue;
        ctx.fillStyle = '#8affc0';
        ctx.beginPath(); ctx.arc(it.mesh.position.x * scale, it.mesh.position.z * scale, 5, 0, TAU); ctx.fill();
      }
    }
    // zumbis
    for (const z of zombies.list) {
      if (z.dead) continue;
      const d = Math.hypot(z.pos.x - player.pos.x, z.pos.z - player.pos.z);
      if (d > 42) continue;
      ctx.fillStyle = z.type === 'brute' ? '#ff3b30' : z.type === 'runner' ? '#ffb020' : 'rgba(230,80,60,0.85)';
      ctx.beginPath(); ctx.arc(z.pos.x * scale, z.pos.z * scale, z.type === 'brute' ? 4.5 : 3, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // jogador (seta fixa no centro)
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.fillStyle = '#eaf4e4';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // borda/scanlines
    ctx.strokeStyle = 'rgba(140,220,190,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }

  update(dt) {
    const p = this.game.player;
    if (!p) return;
    this.updateCompass(p.yaw);
    this.fpsCount++;
    const nowMs = performance.now();
    if (!this._fpsT0) this._fpsT0 = nowMs;
    if (nowMs - this._fpsT0 > 500) {
      const fps = Math.round((this.fpsCount * 1000) / (nowMs - this._fpsT0));
      this.setFPS(fps);
      this.game.onFpsSample && this.game.onFpsSample(fps);
      this.fpsCount = 0; this._fpsT0 = nowMs;
    }
    // vignette
    this.el.vignette.style.opacity = this.game.fx.damageVignette * 0.9;
    // crosshair dinâmico
    const ch = this.el.crosshair;
    if (ch) {
      const ws = this.game.weapons;
      const spread = ws.def.spread || 0;
      const move = p.moveSpeed * 0.6;
      const size = 6 + spread * 340 + move * 1.4 + (ws.reloading ? 14 : 0);
      ch.style.setProperty('--gap', size.toFixed(1) + 'px');
      ch.classList.toggle('ads', ws.aimAmount > 0.6);
      ch.classList.toggle('melee', ws.def.type === 'melee');
      ch.style.display = this.game.state === 'playing' ? 'flex' : 'none';
    }
    if (this.el.adsIndicator) this.el.adsIndicator.style.opacity = this.game.weapons.aimAmount > 0.5 ? 1 : 0;
    this.el.score.textContent = fmtNum(p.score);
    this.el.kills.textContent = p.stats.kills;
    this.updateWave(this.game.wave, this.game.zombies.list.filter(z => !z.dead).length);
  }
}
