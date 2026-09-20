// ---------------------------------------------------------------
// audio.js : 効果音とBGM
//
//   **音源ファイルは持たない。** その場で波形を作って鳴らす。
//   ビルドの無いプロジェクトなので、バイナリを増やさずに済ませる。
//
//   守っていること
//     ・最初のタップまで音は作らない（ブラウザが自動再生を止めるため）
//     ・同じ音を連射しない。敵を毎秒10体倒すので、間引かないと壁になる
//     ・BGMは小さく、同じ和音をゆっくり回すだけ。盤面の邪魔をしない
// ---------------------------------------------------------------
'use strict';

const Snd = {
  ctx: null,
  master: null,
  sfxGain: null,
  bgmGain: null,
  started: false,
  _last: {},          // 種類ごとの最後に鳴らした時刻。連射を間引く
  _bgmTimer: 0,
  _step: 0,

  // 音量。**既定はかなり控えめ**。あとから設定で触れるようにする
  VOL: { master: 0.5, sfx: 0.55, bgm: 0.22 },

  // 最短の間隔（秒）。これより短い間に来た同じ音は捨てる
  GAP: { shot: 0.055, kill: 0.05, coin: 0.09, hit: 0.07 },

  on() { return !(Game.perm && Game.perm.mute); },

  // 最初のタップで作る。ここより前に作ると、ブラウザに止められて無音になる
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.VOL.master;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.VOL.sfx;
    this.sfxGain.connect(this.master);
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0;                 // 戦闘に入ってから上げる
    this.bgmGain.connect(this.master);
    return this.ctx;
  },

  resume() {
    const c = this.ensure();
    if (c && c.state === 'suspended') c.resume();
    this.started = true;
  },

  // ---- 部品 ----
  tone(o) {
    if (!this.on()) return;
    const c = this.ensure();
    if (!c || c.state === 'suspended') return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(o.bus || this.sfxGain);
    osc.start(t); osc.stop(t + o.dur + 0.02);
  },

  noise(o) {
    if (!this.on()) return;
    const c = this.ensure();
    if (!c || c.state === 'suspended') return;
    const t = c.currentTime;
    const n = Math.floor(c.sampleRate * o.dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = o.f || 900; bp.Q.value = o.q || 1.2;
    const g = c.createGain(); g.gain.value = o.vol;
    src.connect(bp); bp.connect(g); g.connect(this.sfxGain);
    src.start(t);
  },

  // 間引き。**同じ音が重なると耳に痛いだけで、情報も増えない**
  gate(kind) {
    const c = this.ctx;
    if (!c) return false;
    const gap = this.GAP[kind] || 0.04;
    const now = c.currentTime;
    if ((this._last[kind] || -9) + gap > now) return false;
    this._last[kind] = now;
    return true;
  },

  // ---- 鳴らすもの ----
  // 武器ごとに少しだけ音を変える。**どれが撃っているかが耳で分かる程度**
  shot(weaponId) {
    if (!this.on() || !this.gate('shot')) return;
    const m = {
      gatling:  { type: 'square',   f0: 320, f1: 210, dur: 0.045, vol: 0.055 },
      sniper:   { type: 'sawtooth', f0: 780, f1: 150, dur: 0.11,  vol: 0.085 },
      missile:  { type: 'triangle', f0: 180, f1: 90,  dur: 0.13,  vol: 0.075 },
      tesla:    { type: 'square',   f0: 1150, f1: 640, dur: 0.06, vol: 0.06 },
      flame:    { type: 'sawtooth', f0: 130, f1: 100, dur: 0.07,  vol: 0.04 },
      mortar:   { type: 'triangle', f0: 120, f1: 60,  dur: 0.16,  vol: 0.09 },
      katana:   { type: 'sawtooth', f0: 900, f1: 380, dur: 0.07,  vol: 0.07 },
      shuriken: { type: 'square',   f0: 620, f1: 480, dur: 0.05,  vol: 0.05 },
    };
    this.tone(m[weaponId] || { type: 'square', f0: 420, f1: 280, dur: 0.05, vol: 0.05 });
  },

  kill() {
    if (!this.on()) return;
    if (!this.gate('kill')) return;
    this.noise({ dur: 0.09, f: 1500, q: 1.6, vol: 0.13 });
  },

  coin() { if (this.gate('coin')) { this.tone({ type: 'sine', f0: 1050, f1: 1550, dur: 0.07, vol: 0.05 }); } },
  leak() { this.tone({ type: 'sawtooth', f0: 220, f1: 110, dur: 0.16, vol: 0.09 }); },

  ui()    { this.tone({ type: 'sine', f0: 620, f1: 820, dur: 0.045, vol: 0.05 }); },
  place() { this.tone({ type: 'triangle', f0: 380, f1: 620, dur: 0.09, vol: 0.08 }); },
  deny()  { this.tone({ type: 'square', f0: 200, f1: 140, dur: 0.1, vol: 0.06 }); },

  waveStart() {
    this.tone({ type: 'triangle', f0: 330, f1: 440, dur: 0.14, vol: 0.09 });
    setTimeout(() => this.tone({ type: 'triangle', f0: 440, f1: 660, dur: 0.18, vol: 0.09 }), 110);
  },
  waveClear() {
    [523, 659, 784].forEach((f, i) =>
      setTimeout(() => this.tone({ type: 'triangle', f0: f, f1: f, dur: 0.16, vol: 0.08 }), i * 85));
  },
  stageClear() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.tone({ type: 'triangle', f0: f, f1: f, dur: 0.26, vol: 0.1 }), i * 130));
  },
  dead() {
    [392, 330, 262, 196].forEach((f, i) =>
      setTimeout(() => this.tone({ type: 'sawtooth', f0: f, f1: f * 0.98, dur: 0.3, vol: 0.09 }), i * 150));
  },
  pack() {
    [784, 988, 1175].forEach((f, i) =>
      setTimeout(() => this.tone({ type: 'sine', f0: f, f1: f, dur: 0.2, vol: 0.08 }), i * 70));
  },

  // ---- BGM ----
  // 8つの音をゆっくり回すだけ。**曲というより、部屋の空気**
  BASS: [55, 55, 73.42, 73.42, 65.41, 65.41, 49, 49],
  LEAD: [220, 261.63, 329.63, 261.63, 293.66, 349.23, 246.94, 196],

  bgmStart() {
    this.ensure();
    if (!this.ctx || this._bgmTimer) return;
    this.bgmGain.gain.setTargetAtTime(this.on() ? this.VOL.bgm : 0, this.ctx.currentTime, 1.2);
    const stepMs = 480;
    this._bgmTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state === 'suspended') return;
      const i = this._step++ % 8;
      this.tone({ type: 'triangle', f0: this.BASS[i], f1: this.BASS[i], dur: 0.42, vol: 0.5, bus: this.bgmGain });
      if (i % 2 === 0) {
        this.tone({ type: 'sine', f0: this.LEAD[i], f1: this.LEAD[i], dur: 0.7, vol: 0.18, bus: this.bgmGain });
      }
    }, stepMs);
  },

  bgmStop() {
    if (this._bgmTimer) { clearInterval(this._bgmTimer); this._bgmTimer = 0; }
    if (this.ctx && this.bgmGain) this.bgmGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
  },

  setMute(m) {
    Game.perm.mute = !!m;
    if (this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : this.VOL.master, this.ctx.currentTime, 0.05);
    }
    Game.save();
  },
};
