/* DEADZONE — controles: toque (celular deitado) + teclado/mouse (desktop) */
import { clamp } from './util.js';

export class Controls {
  constructor(opts = {}) {
    this.root = opts.root;
    this.canvas = opts.canvas;
    this.surface = opts.surface; // elemento com os botões
    this.sensitivity = opts.sensitivity ?? 1.0;
    this.invertY = false;
    this.autoAim = opts.autoAim ?? 0.6;
    this.enabled = false;

    this.mx = 0; this.my = 0;          // eixo de movimento
    this.lookX = 0; this.lookY = 0;    // delta de olhar acumulado
    this.held = { fire: false, aim: false, sprint: false, crouch: false, interact: false };
    this._pressed = new Set();
    this.keys = new Set();

    this.moveId = null; this.lookId = null;
    this.moveOrigin = { x: 0, y: 0 };
    this.lookLast = { x: 0, y: 0 };
    this.joyRadius = 62;

    this._buildJoystick();
    this._bindTouch();
    this._bindKeys();
    this._bindButtons();
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) { this.reset(); this.root.classList.remove('active'); }
    else this.root.classList.add('active');
  }

  reset() {
    this.mx = 0; this.my = 0; this.lookX = 0; this.lookY = 0;
    this.held.fire = false; this.held.aim = false; this.held.sprint = false; this.held.crouch = false; this.held.interact = false;
    this.moveId = null; this.lookId = null;
    this._pressed.clear();
    this.keys.clear();
    if (this.joyBase) this.joyBase.style.opacity = 0;
    this._updateBtnState();
  }

  press(action) { this._pressed.add(action); }

  consume(action) {
    if (this._pressed.has(action)) { this._pressed.delete(action); return true; }
    return false;
  }

  consumeLook() {
    const l = { x: this.lookX, y: this.lookY };
    this.lookX = 0; this.lookY = 0;
    return l;
  }

  /* ---------------- joystick visual ---------------- */
  _buildJoystick() {
    const base = document.createElement('div');
    base.className = 'joy-base';
    const knob = document.createElement('div');
    knob.className = 'joy-knob';
    base.appendChild(knob);
    this.root.appendChild(base);
    this.joyBase = base; this.joyKnob = knob;
    base.style.opacity = 0;
  }

  _showJoy(x, y) {
    const r = this.joyRadius;
    this.joyBase.style.opacity = 1;
    this.joyBase.style.left = x + 'px';
    this.joyBase.style.top = y + 'px';
    this.joyBase.style.width = this.joyBase.style.height = r * 2 + 'px';
    this.joyKnob.style.left = r + 'px';
    this.joyKnob.style.top = r + 'px';
  }

  _moveKnob(dx, dy) {
    const r = this.joyRadius;
    const len = Math.hypot(dx, dy) || 1;
    const cl = Math.min(len, r * 0.78);
    this.joyKnob.style.transform = `translate(${(dx / len) * cl}px, ${(dy / len) * cl}px) translate(-50%, -50%)`;
  }

  /* ---------------- toque ---------------- */
  _bindTouch() {
    const surf = this.surface;
    const onDown = (e) => {
      if (!this.enabled) return;
      if (e.target.closest && e.target.closest('.btn, .hud-btn, button, .no-look')) return;
      const rect = surf.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const isLeft = x < rect.width * 0.42;
      if (isLeft && this.moveId === null) {
        this.moveId = e.pointerId;
        this.moveOrigin = { x, y };
        this._showJoy(x, y);
      } else if (this.lookId === null) {
        this.lookId = e.pointerId;
        this.lookLast = { x: e.clientX, y: e.clientY };
      }
      try { surf.setPointerCapture(e.pointerId); } catch (err) { }
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!this.enabled) return;
      if (e.pointerId === this.moveId) {
        const rect = surf.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        let dx = x - this.moveOrigin.x, dy = y - this.moveOrigin.y;
        this._moveKnob(dx, dy);
        const r = this.joyRadius * 0.9;
        this.mx = clamp(dx / r, -1, 1);
        this.my = clamp(dy / r, -1, 1);
        const m = Math.hypot(this.mx, this.my);
        if (m > 1) { this.mx /= m; this.my /= m; }
      } else if (e.pointerId === this.lookId) {
        const dx = e.clientX - this.lookLast.x, dy = e.clientY - this.lookLast.y;
        this.lookLast = { x: e.clientX, y: e.clientY };
        const s = 0.0042 * this.sensitivity;
        this.lookX += dx * s;
        this.lookY += dy * s * (this.invertY ? -1 : 1);
      }
    };
    const onUp = (e) => {
      if (e.pointerId === this.moveId) {
        this.moveId = null; this.mx = 0; this.my = 0;
        this.joyBase.style.opacity = 0;
      }
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    surf.addEventListener('pointerdown', onDown, { passive: false });
    surf.addEventListener('pointermove', onMove, { passive: false });
    surf.addEventListener('pointerup', onUp);
    surf.addEventListener('pointercancel', onUp);
    surf.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _bindButtons() {
    const els = document.querySelectorAll('[data-act]');
    this.btnEls = Array.from(els);
    els.forEach((el) => {
      const act = el.dataset.act;
      const down = (e) => {
        if (!this.enabled) return;
        e.preventDefault(); e.stopPropagation();
        el.classList.add('pressed');
        if (el.dataset.hold !== undefined || ['fire', 'aim', 'sprint', 'crouch', 'interact'].includes(act)) this.held[act] = true;
        this.press(act);
        this._updateBtnState();
      };
      const up = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        el.classList.remove('pressed');
        if (['fire', 'aim', 'sprint', 'crouch', 'interact'].includes(act)) this.held[act] = false;
        this._updateBtnState();
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', (e) => { if (e.buttons) up(e); });
    });
  }

  _updateBtnState() {
    if (!this.btnEls) return;
    this.btnEls.forEach((el) => {
      const a = el.dataset.act;
      if (a in this.held) el.classList.toggle('on', !!this.held[a]);
    });
  }

  /* ---------------- teclado / mouse (desktop) ---------------- */
  _bindKeys() {
    const map = {
      KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
      KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
      ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump', KeyC: 'crouch',
      KeyR: 'reload', KeyQ: 'swap', KeyE: 'interact', KeyF: 'flash', KeyG: 'grenade',
      KeyH: 'heal', KeyV: 'view', KeyM: 'map', Tab: 'pause', Escape: 'pause',
      KeyP: 'pause', Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', Digit4: 'w4', Digit5: 'w5',
      KeyT: 'autoaim', KeyL: 'flashlight'
    };
    window.addEventListener('keydown', (e) => {
      const a = map[e.code];
      if (!a) return;
      if (['Tab'].includes(e.code)) e.preventDefault();
      if (!this.enabled) return;
      if (!this.keys.has(a)) this.press(a);
      this.keys.add(a);
      if (a === 'up' || a === 'down' || a === 'left' || a === 'right' || a === 'sprint' || a === 'crouch') this._syncKeys();
      if (a === 'sprint') this.held.sprint = true;
      if (a === 'crouch') this.held.crouch = true;
    });
    window.addEventListener('keyup', (e) => {
      const a = map[e.code];
      if (!a) return;
      this.keys.delete(a);
      if (a === 'sprint') this.held.sprint = false;
      if (a === 'crouch') this.held.crouch = false;
      this._syncKeys();
    });
    this._syncKeys();

    // mouse look (pointer lock no canvas)
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (window.matchMedia('(pointer: coarse)').matches) return;
      if (document.pointerLockElement !== c) { try { const pr = c.requestPointerLock && c.requestPointerLock(); if (pr && pr.catch) pr.catch(() => {}); } catch (err) { } return; }
      if (e.button === 0) { this.held.fire = true; this.press('fire'); }
      if (e.button === 2) { this.held.aim = true; this.press('aim'); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.held.fire = false;
      if (e.button === 2) this.held.aim = false;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== c || !this.enabled) return;
      const s = 0.0022 * this.sensitivity;
      this.lookX += e.movementX * s;
      this.lookY += e.movementY * s * (this.invertY ? -1 : 1);
    });
    window.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.press(e.deltaY > 0 ? 'swap' : 'swapBack');
    }, { passive: true });
    window.addEventListener('blur', () => {
      this.keys.clear(); this._syncKeys();
      this.held.fire = false; this.held.aim = false; this.held.sprint = false; this.held.crouch = false;
    });
  }

  _syncKeys() {
    let x = 0, y = 0;
    if (this.keys.has('left')) x -= 1;
    if (this.keys.has('right')) x += 1;
    if (this.keys.has('up')) y -= 1;
    if (this.keys.has('down')) y += 1;
    // só sobrescreve se não houver joystick ativo
    if (this.moveId === null) {
      const m = Math.hypot(x, y) || 1;
      this.mx = x / m; this.my = y / m;
      if (!x && !y) { this.mx = 0; this.my = 0; }
    }
  }

  update(dt) {
    // nada por enquanto: deltas são acumulados nos eventos
  }
}

/* vibração háptica (quando disponível) */
export const haptics = {
  enabled: true,
  light() { if (this.enabled && navigator.vibrate) navigator.vibrate(8); },
  medium() { if (this.enabled && navigator.vibrate) navigator.vibrate(18); },
  heavy() { if (this.enabled && navigator.vibrate) navigator.vibrate([0, 30, 40, 25]); },
  shot(weapon) {
    if (!this.enabled || !navigator.vibrate) return;
    const v = { shotgun: 24, sniper: 30, rifle: 10, smg: 6, pistol: 12, bow: 5 }[weapon] || 10;
    navigator.vibrate(v);
  }
};
