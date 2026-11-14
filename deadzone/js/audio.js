/* DEADZONE — áudio 100% procedural (WebAudio), sem arquivos externos */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.amb = null;
    this.music = null;
    this.reverb = null;
    this.enabled = true;
    this.volume = 0.85;
    this.sfxVolume = 0.9;
    this.musicVolume = 0.5;
    this._noiseBuf = null;
    this._brownBuf = null;
    this._musicNodes = [];
    this._ambNodes = [];
    this._started = false;
    this._lastStep = 0;
    this._tension = 0;
    this._musicTimer = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    // reverb procedural curto (sala/rua)
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(1.9, 2.6);
    const revGain = this.ctx.createGain();
    revGain.gain.value = 0.5;
    this.reverb.connect(revGain).connect(this.master);

    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = this.sfxVolume;
    this.sfx.connect(this.master);
    const sfxSend = this.ctx.createGain();
    sfxSend.gain.value = 0.22;
    this.sfx.connect(sfxSend).connect(this.reverb);

    this.amb = this.ctx.createGain();
    this.amb.gain.value = 0.55;
    this.amb.connect(this.master);

    this.music = this.ctx.createGain();
    this.music.gain.value = this.musicVolume;
    this.music.connect(this.master);
    const mSend = this.ctx.createGain(); mSend.gain.value = 0.35;
    this.music.connect(mSend).connect(this.reverb);

    this._noiseBuf = this._makeNoise(2.0, false);
    this._brownBuf = this._makeNoise(4.0, true);
    this._started = true;
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setMusicVolume(v) { this.musicVolume = v; if (this.music) this.music.gain.value = v; }

  _makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - t * 0.2);
      }
    }
    return buf;
  }

  _makeNoise(seconds, brown) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
    return buf;
  }

  _noiseSource(brown = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this._brownBuf : this._noiseBuf;
    s.loop = true;
    return s;
  }

  /* ---------- ambiente (vento + zumbidos distantes) ---------- */
  startAmbience() {
    if (!this.ctx || this._ambNodes.length) return;
    const wind = this._noiseSource(true);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0.12;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.07;
    lfo.connect(lfoG).connect(g.gain);
    wind.connect(bp).connect(g).connect(this.amb);
    wind.start(); lfo.start();

    const air = this._noiseSource(false);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 3400;
    const ag = this.ctx.createGain(); ag.gain.value = 0.018;
    air.connect(hp).connect(ag).connect(this.amb);
    air.start();

    this._ambNodes.push(wind, lfo, air);
  }

  stopAmbience() {
    this._ambNodes.forEach(n => { try { n.stop(); } catch (e) { } });
    this._ambNodes = [];
  }

  /* ---------- música de tensão adaptativa (drone + batida) ---------- */
  startMusic() {
    if (!this.ctx || this._musicTimer) return;
    this._tension = 0.15;
    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 27.5;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 4;
    const g = this.ctx.createGain(); g.gain.value = 0.0;
    o1.connect(lp); o2.connect(lp); lp.connect(g).connect(this.music);
    o1.start(); o2.start();
    g.gain.setTargetAtTime(0.09, this.ctx.currentTime, 3);
    this._drone = { o1, o2, g, lp };

    const pad = this.ctx.createOscillator(); pad.type = 'triangle'; pad.frequency.value = 110;
    const padG = this.ctx.createGain(); padG.gain.value = 0.0;
    pad.connect(padG).connect(this.music); pad.start();
    padG.gain.setTargetAtTime(0.025, this.ctx.currentTime, 4);
    this._pad = { pad, padG };

    const tick = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const beat = 0.72 - this._tension * 0.18;
      this._heartbeat(t);
      if (this._tension > 0.35 && Math.random() < 0.6 + this._tension * 0.4) this._pulse(t);
      if (Math.random() < 0.06) this._distantMoan();
      this._musicTimer = setTimeout(tick, beat * 1000);
    };
    this._musicTimer = setTimeout(tick, 800);
  }

  setTension(v) {
    this._tension = Math.max(0, Math.min(1, v));
    if (this._drone) {
      this._drone.lp.frequency.setTargetAtTime(150 + this._tension * 380, this.ctx.currentTime, 1.2);
      this._drone.g.gain.setTargetAtTime(0.05 + this._tension * 0.09, this.ctx.currentTime, 1.5);
    }
  }

  _heartbeat(t) {
    const inten = 0.04 + this._tension * 0.22;
    const thump = (at, amp, freq) => {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(freq, at); o.frequency.exponentialRampToValueAtTime(28, at + 0.14);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(amp, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      o.connect(g).connect(this.music); o.start(at); o.stop(at + 0.3);
    };
    thump(t, inten, 72);
    thump(t + 0.17, inten * 0.65, 62);
  }

  _pulse(t) {
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 220;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012 + this._tension * 0.02, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(lp).connect(g).connect(this.music); o.start(t); o.stop(t + 0.32);
  }

  _distantMoan() {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    const base = 95 + Math.random() * 70;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 0.7, t + 1.6);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.6);
    g.gain.linearRampToValueAtTime(0, t + 1.9);
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.random() * 2 - 1; o.connect(bp).connect(g).connect(pan).connect(this.amb); }
    else o.connect(bp).connect(g).connect(this.amb);
    o.start(t); o.stop(t + 2.0);
  }

  stopMusic() {
    if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
    if (this._drone) { try { this._drone.o1.stop(); this._drone.o2.stop(); } catch (e) { } this._drone = null; }
    if (this._pad) { try { this._pad.pad.stop(); } catch (e) { } this._pad = null; }
  }

  /* ---------- efeitos ---------- */
  _out(pan = 0) {
    let node = this.sfx;
    if (this.ctx.createStereoPanner && Math.abs(pan) > 0.01) {
      const p = this.ctx.createStereoPanner(); p.pan.value = pan; p.connect(this.sfx); node = p;
    }
    return node;
  }

  shot(weapon = 'rifle', pan = 0, gain = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._out(pan);
    const conf = {
      rifle: { body: 120, dur: 0.22, crack: 0.5, vol: 0.5 },
      pistol: { body: 150, dur: 0.18, crack: 0.55, vol: 0.42 },
      shotgun: { body: 85, dur: 0.42, crack: 0.65, vol: 0.62 },
      sniper: { body: 70, dur: 0.55, crack: 0.75, vol: 0.6 },
      smg: { body: 165, dur: 0.13, crack: 0.45, vol: 0.32 },
      bow: { body: 240, dur: 0.16, crack: 0.2, vol: 0.22 }
    }[weapon] || { body: 130, dur: 0.2, crack: 0.5, vol: 0.45 };

    // estalo (corpo do disparo)
    const n = this._noiseSource(false);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2400, t); bp.frequency.exponentialRampToValueAtTime(500, t + conf.dur);
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(conf.vol * gain * conf.crack, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + conf.dur);
    n.connect(bp).connect(g).connect(out);
    n.start(t); n.stop(t + conf.dur + 0.05);

    // grave
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(conf.body, t); o.frequency.exponentialRampToValueAtTime(conf.body * 0.4, t + conf.dur * 0.9);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(conf.vol * gain * 0.9, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + conf.dur * 1.1);
    o.connect(og).connect(out); o.start(t); o.stop(t + conf.dur * 1.2);

    // cauda de eco
    const tail = this._noiseSource(true);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    const tg = this.ctx.createGain();
    tg.gain.setValueAtTime(0, t + 0.02); tg.gain.linearRampToValueAtTime(0.1 * gain, t + 0.06);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    tail.connect(lp).connect(tg).connect(this.reverb);
    tail.start(t); tail.stop(t + 1.0);

    if (weapon === 'shotgun') this._click(t + 0.42, out, 0.25);
    if (weapon === 'sniper') this._click(t + 0.7, out, 0.18);
  }

  _click(t, out, vol = 0.3) {
    const n = this._noiseSource(false);
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(hp).connect(g).connect(out); n.start(t); n.stop(t + 0.07);
  }

  reload(stage = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._out(0.05);
    this._click(t, out, 0.35);
    this._click(t + 0.16, out, 0.22);
    if (stage === 2) this._click(t + 0.3, out, 0.4);
  }

  dryFire() { if (this.ctx) this._click(this.ctx.currentTime, this._out(0), 0.3); }

  hit(head = false, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._out(pan);
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(head ? 1400 : 700, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(head ? 0.22 : 0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (head ? 0.25 : 0.12));
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.3);
    this._click(t, out, head ? 0.3 : 0.18);
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._out(0);
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.4);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + 0.5);
    const n = this._noiseSource(false);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 1.2;
    const ng = this.ctx.createGain(); ng.gain.setValueAtTime(0.18, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    n.connect(bp).connect(ng).connect(out); n.start(t); n.stop(t + 0.3);
  }

  step(surface = 'dirt', vol = 0.12) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._out(0);
    const n = this._noiseSource(true);
    const f = surface === 'metal' ? 2200 : surface === 'concrete' ? 1400 : 700;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 1.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(bp).connect(g).connect(out); n.start(t); n.stop(t + 0.12);
  }

  blip(freq = 880, dur = 0.05, type = 'square', vol = 0.12) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._out(0);
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
  }

  pickup(kind = 'ammo') {
    if (!this.ctx) return;
    const f = kind === 'health' ? 660 : kind === 'armor' ? 520 : 880;
    this.blip(f, 0.07, 'triangle', 0.14);
    setTimeout(() => this.blip(f * 1.5, 0.09, 'triangle', 0.12), 70);
  }

  explode(pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._out(pan);
    const n = this._noiseSource(true);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    n.connect(lp).connect(g).connect(out); n.start(t); n.stop(t + 1.4);
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(24, t + 0.9);
    const og = this.ctx.createGain(); og.gain.setValueAtTime(0.55, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(og).connect(out); o.start(t); o.stop(t + 1.1);
  }

  growl(pan = 0, pitch = 1, vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._out(pan);
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    const f0 = 88 * pitch * (0.9 + Math.random() * 0.25);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 0.72, t + 0.5);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 3;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 14 + Math.random() * 10;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.35;
    lfo.connect(lfoG).connect(lp.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.09);
    g.gain.linearRampToValueAtTime(0, t + 0.55);
    o.connect(lp).connect(g).connect(out);
    o.start(t); lfo.start(t); o.stop(t + 0.6); lfo.stop(t + 0.6);
    const n = this._noiseSource(false);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2;
    const ng = this.ctx.createGain(); ng.gain.setValueAtTime(vol * 0.4, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    n.connect(bp).connect(ng).connect(out); n.start(t); n.stop(t + 0.45);
  }

  ui(kind = 'tap') {
    if (!this.ctx) return;
    if (kind === 'tap') this.blip(1100, 0.035, 'sine', 0.08);
    else if (kind === 'confirm') { this.blip(760, 0.06, 'sine', 0.1); setTimeout(() => this.blip(1140, 0.09, 'sine', 0.09), 60); }
    else if (kind === 'back') this.blip(420, 0.06, 'sine', 0.08);
    else if (kind === 'error') this.blip(180, 0.14, 'square', 0.1);
  }

  waveHorn() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._out(0);
    [110, 165, 220].forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.94, t + 2.2);
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07 / (i + 1), t + 0.5);
      g.gain.linearRampToValueAtTime(0, t + 2.2);
      o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + 2.3);
    });
  }

  victory() {
    if (!this.ctx) return;
    const notes = [220, 277, 330, 440, 554];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.5, 'triangle', 0.12), i * 160));
  }

  death() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._out(0);
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(30, t + 2.2);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + 2.5);
  }

  radio() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this._out(0);
    const n = this._noiseSource(false);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, t); g.gain.setValueAtTime(0.08, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    this._click(t + 0.5, out, 0.25);
    n.connect(bp).connect(g).connect(out); n.start(t); n.stop(t + 0.6);
    this.blip(1500, 0.08, 'sine', 0.07);
  }
}
export const audio = new AudioEngine();
