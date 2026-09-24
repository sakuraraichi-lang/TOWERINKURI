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
  //   **撃つ音だけ長めに取る。**（2026-09-21・ユーザー報告「イヤホンだと射撃音がうるさすぎる」）
  //   0.055 は毎秒18回。ガトリングは素で毎秒5.5発、それを何基も置くので
  //   実際には常に上限で鳴り続けていた。0.10 なら毎秒10回まで
  GAP: { shot: 0.10, kill: 0.05, coin: 0.09, hit: 0.07 },

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
      gatling:  { type: 'square',   f0: 320, f1: 210, dur: 0.045, vol: 0.0275 },
      sniper:   { type: 'sawtooth', f0: 780, f1: 150, dur: 0.11,  vol: 0.0425 },
      missile:  { type: 'triangle', f0: 180, f1: 90,  dur: 0.13,  vol: 0.0375 },
      tesla:    { type: 'square',   f0: 1150, f1: 640, dur: 0.06, vol: 0.03 },
      flame:    { type: 'sawtooth', f0: 130, f1: 100, dur: 0.07,  vol: 0.02 },
      mortar:   { type: 'triangle', f0: 120, f1: 60,  dur: 0.16,  vol: 0.045 },
      katana:   { type: 'sawtooth', f0: 900, f1: 380, dur: 0.07,  vol: 0.035 },
      shuriken: { type: 'square',   f0: 620, f1: 480, dur: 0.05,  vol: 0.025 },
    };
    this.tone(m[weaponId] || { type: 'square', f0: 420, f1: 280, dur: 0.05, vol: 0.025 });
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
  // ---- パックの開封（cardfx.js）----
  // 揺れ。中身が良いほど長く、低い唸りがせり上がる
  packShake(best) {
    const dur = best >= 3 ? 1.25 : best >= 2 ? 0.95 : 0.65;
    this.noise({ dur, vol: 0.05, f: 700 });
    this.tone({ type: 'sawtooth', f0: 90, f1: best >= 3 ? 520 : 300, dur, vol: 0.05 });
  },
  // 裂ける。破裂音＋明るい和音（中身が良いほど高い）
  packTear(best) {
    this.noise({ dur: 0.18, vol: 0.09, f: 2400 });
    const root = [523, 587, 659, 784][best] || 523;
    [0, 4, 7, 12].forEach((st, i) => setTimeout(() =>
      this.tone({ type: 'triangle', f0: root * Math.pow(2, st / 12), f1: root * Math.pow(2, st / 12), dur: 0.35, vol: 0.07 }), i * 45));
  },
  // 開けているあいだの音楽。短いアルペジオを回し、1周ごとに少し高くする
  openLoop(on) {
    clearInterval(this._openLoop);
    if (!on) return;
    const seq = [0, 4, 7, 11, 12, 11, 7, 4];
    let i = 0, lift = 0;
    this._openLoop = setInterval(() => {
      const f = 392 * Math.pow(2, (seq[i % seq.length] + lift) / 12);
      this.tone({ type: 'square', f0: f, f1: f, dur: 0.09, vol: 0.025 });
      if (++i % seq.length === 0) lift = Math.min(12, lift + 2);
    }, 115);
  },
  // スロットが回る音。進むほど高くなる
  slotTick(p) {
    const f = 700 + 900 * Math.min(1, p);
    this.tone({ type: 'square', f0: f, f1: f, dur: 0.025, vol: 0.03 });
  },
  // 止まった瞬間。レア度で大きさが変わる。idx 枚目ほど高く
  land(g, idx) {
    const root = 440 * Math.pow(2, ((idx || 0) * 2) / 12);
    if (g <= 0) { this.tone({ type: 'triangle', f0: root, f1: root * 1.5, dur: 0.12, vol: 0.07 }); return; }
    const chord = g >= 3 ? [0, 4, 7, 12, 16, 19] : g >= 2 ? [0, 4, 7, 12] : [0, 7, 12];
    chord.forEach((st, i) => setTimeout(() =>
      this.tone({ type: g >= 3 ? 'sine' : 'triangle', f0: root * Math.pow(2, st / 12), f1: root * Math.pow(2, st / 12) * 1.005,
        dur: g >= 3 ? 0.8 : 0.35, vol: 0.06 }), i * (g >= 3 ? 70 : 40)));
    if (g >= 3) this.noise({ dur: 0.5, vol: 0.04, f: 5000 });
  },
  // 全部めくり終わった
  fanfare(best) {
    const seq = best >= 3 ? [0, 4, 7, 12, 7, 12, 16, 19, 24] : [0, 4, 7, 12];
    seq.forEach((st, i) => setTimeout(() =>
      this.tone({ type: 'triangle', f0: 523 * Math.pow(2, st / 12), f1: 523 * Math.pow(2, st / 12), dur: 0.16, vol: 0.06 }), i * 80));
  },

  // めくる前の溜め。レア度が高いほど長く、高くせり上がる（glow 2=エピック 3=レジェンド）
  charge(glow) {
    const dur = glow >= 3 ? 1.2 : 0.65;
    this.tone({ type: 'triangle', f0: glow >= 3 ? 220 : 330, f1: glow >= 3 ? 880 : 660, dur, vol: 0.07 });
    if (glow >= 3) this.tone({ type: 'sine', f0: 110, f1: 440, dur, vol: 0.05 });
  },
  // 凸が上がった。段が上がるほど音程も上がる
  totu(t) {
    const base = 523 * Math.pow(1.12, Math.min(8, t));
    [0, 4, 7].forEach((st, i) =>
      setTimeout(() => this.tone({ type: 'square', f0: base * Math.pow(2, st / 12), f1: base * Math.pow(2, st / 12),
        dur: 0.12, vol: 0.05 }), i * 60));
  },
  // 覚醒（4凸に届いた瞬間）。低い唸りから一気に開く和音
  awaken() {
    this.tone({ type: 'sawtooth', f0: 80, f1: 320, dur: 0.5, vol: 0.06 });
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      setTimeout(() => this.tone({ type: 'sine', f0: f, f1: f * 1.01, dur: 0.9, vol: 0.07 }), 420 + i * 55));
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
