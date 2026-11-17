/* Studio Tz — motor de som sintetizado (WebAudio). Sem voz, sem arquivos. */
(function (global) {
  'use strict';

  function StudioAudio() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuf = null;
    this.music = 'off';
    this.playing = false;
    this._step = 0;
    this._timer = null;
    this._bpm = 92;
  }

  StudioAudio.prototype.ensure = function () {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.8;
    this.sfxGain.connect(this.master);

    // buffer de ruído (para bumbo/pratos/efeitos)
    const len = this.ctx.sampleRate * 1.0;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  };

  StudioAudio.prototype.resume = function () {
    this.ensure();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  };

  /* ---------- instrumentos simples ---------- */
  StudioAudio.prototype.note = function (dest, freq, dur, type, vol, delay) {
    delay = delay || 0;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  };

  StudioAudio.prototype.noise = function (dest, dur, vol, filterFreq, delay) {
    delay = delay || 0;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0);
    src.stop(t0 + dur);
  };

  /* ---------- padrões de música ---------- */
  const PROGS = {
    epica: {
      bpm: 92,
      chords: [
        [220.0, 277.18, 329.63],  // Am
        [174.61, 220.0, 261.63],  // F
        [261.63, 329.63, 392.0],  // C
        [196.0, 246.94, 293.66]   // G
      ],
      bass: [110.0, 87.31, 130.81, 98.0]
    },
    triste: {
      bpm: 72,
      chords: [
        [196.0, 246.94, 293.66],
        [174.61, 220.0, 261.63],
        [146.83, 196.0, 233.08],
        [196.0, 246.94, 293.66]
      ],
      bass: [98.0, 87.31, 73.42, 98.0]
    },
    acao: {
      bpm: 128,
      chords: [
        [146.83, 185.0, 220.0],
        [146.83, 185.0, 220.0],
        [196.0, 246.94, 293.66],
        [174.61, 220.0, 261.63]
      ],
      bass: [73.42, 73.42, 98.0, 87.31]
    }
  };

  StudioAudio.prototype.setMusic = function (track) {
    this.music = track || 'off';
    if (this.music === 'off') this.stopMusic();
    else this.startMusic();
  };

  StudioAudio.prototype.startMusic = function () {
    if (this.music === 'off' || this.playing) return;
    this.ensure();
    this.resume();
    this.playing = true;
    this._step = 0;
    const prog = PROGS[this.music] || PROGS.epica;
    this._bpm = prog.bpm;
    const beat = 60 / this._bpm / 2; // semibreve por passo (2 passos por compasso)
    this._timer = setInterval(() => this._tickMusic(prog, beat), beat * 1000);
    this._tickMusic(prog, 0);
  };

  StudioAudio.prototype._tickMusic = function (prog, beat) {
    if (!this.playing) return;
    const s = this._step;
    const bar = Math.floor(s / 2) % prog.chords.length;
    const chord = prog.chords[bar];
    const t = beat * (s % 2 === 0 ? 0 : 1);

    if (s % 4 === 0) {
      // bumbo
      this.note(this.musicGain, 60, 0.18, 'sine', 0.5, t);
      this.noise(this.musicGain, 0.06, 0.2, 300, t);
    }
    if (s % 4 === 2) {
      // prato
      this.noise(this.musicGain, 0.08, this.music === 'acao' ? 0.18 : 0.08, 6000, t);
    }
    if (this.music === 'acao' && s % 2 === 1) {
      // caixinha acelerada
      this.noise(this.musicGain, 0.05, 0.14, 5000, t);
    }
    if (s % 2 === 0) {
      // baixo
      this.note(this.musicGain, prog.bass[bar], this.music === 'acao' ? 0.25 : 0.45, 'triangle', 0.35, t);
    }
    // cordas/pad a cada compasso
    if (s % 4 === 0) {
      for (let i = 0; i < chord.length; i++) {
        this.note(this.musicGain, chord[i], this.music === 'triste' ? 0.9 : 0.6, 'sawtooth', 0.08, t);
        this.note(this.musicGain, chord[i] * 2, this.music === 'triste' ? 0.7 : 0.5, 'sine', 0.05, t);
      }
    }
    if (this.music === 'triste' && s % 4 === 1) {
      // pluck melódico
      const scale = [523.25, 587.33, 659.25, 783.99, 880.0];
      this.note(this.musicGain, scale[(s * 3) % scale.length], 0.5, 'triangle', 0.12, t);
    }
    this._step++;
  };

  StudioAudio.prototype.stopMusic = function () {
    this.playing = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  };

  /* ---------- efeitos ---------- */
  StudioAudio.prototype.sfx = function (name) {
    this.ensure();
    this.resume();
    if (name === 'hit') {
      this.note(this.sfxGain, 70, 0.25, 'sine', 0.6);
      this.noise(this.sfxGain, 0.18, 0.4, 1800);
    } else if (name === 'portal') {
      for (let i = 0; i < 6; i++) {
        this.note(this.sfxGain, 120 + i * 60, 0.4, 'sawtooth', 0.12, i * 0.08);
      }
    } else if (name === 'fogo') {
      this.noise(this.sfxGain, 0.6, 0.25, 900);
    }
  };

  StudioAudio.prototype.stream = function () {
    // gera um MediaStream com o áudio da trilha (para gravar junto com o vídeo)
    if (!this.ctx) return null;
    const dest = this.ctx.createMediaStreamDestination();
    this.master.connect(dest);
    return dest.stream;
  };

  StudioAudio.prototype.dispose = function () {
    this.stopMusic();
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  };

  global.StudioAudio = StudioAudio;
})(window);
