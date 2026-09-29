// ---------------------------------------------------------------
// audio.js : 効果音とBGM
//
//   **音源ファイルは持たない。** その場で波形を作って鳴らす。
//   ビルドの無いプロジェクトなので、バイナリを増やさずに済ませる。
//
//   守っていること
//     ・最初のタップまで音は作らない（ブラウザが自動再生を止めるため）
//     ・同じ音を連射しない。敵を毎秒10体倒すので、間引かないと壁になる
//     ・BGMは企画書（WORLD-BIBLE §24）どおり2種類。'cafe'（ホーム・準備フェーズ＝
//       喫茶店にいるようなリラックス感）と 'battle'（戦闘中＝PC-8801-FM を
//       想わせる電子アーケードゲーム感）。切り替えは短いクロスフェードで、
//       「日常→ゲーム→電子世界」の切り替わりを耳でも作る（Snd.bgm(mode)）
//     ・BGMは「先読みのスケジューラ」で鳴らす。setInterval の発火そのものは
//       数msずれるので、鳴らす時刻はAudioContextの時計で少し先を予約する
//       （tone/noiseの`o.at`）。これでテンポが揺れない
// ---------------------------------------------------------------
'use strict';

const Snd = {
  ctx: null,
  master: null,
  sfxGain: null,
  bgmGain: null,
  started: false,
  _last: {},          // 種類ごとの最後に鳴らした時刻。連射を間引く

  // ---- BGMのスケジューラが持つ状態 ----
  _bgmMode: null,     // 'cafe' / 'battle' / null。いま鳴らしたい種類（鳴らせていなくても持つ）
  _bgmTimer: 0,       // setInterval（先読みのスケジューラ本体）
  _bgmSwap: 0,        // クロスフェードの「切り替え待ち」setTimeout
  _bgmNextTime: 0,    // 次の1ステップを置く予定時刻（AudioContextの時計）
  _bgmStepDur: 0,     // 1ステップの長さ（秒）
  _bgmStep: 0,        // 通しのステップ数
  _bgmTick: null,     // いま使っている「1ステップぶん鳴らす」関数

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
    this._wireWake();
    return this.ctx;
  },

  // **別のアプリ・別のタブから戻ったら起こし直す**（2026-09-30 ユーザー報告「iOSなどで…別のアプリに移動したり、別のタブへ移動した際、正しく音声が再生されなくなる」）。
  //   iOS の Safari は裏に回ると AudioContext を 'suspended' か 'interrupted' にし、戻っても自動では再開しない。
  //   前は resume() が 'suspended' しか見ていなかった。戻った瞬間（見えるようになった・pageshow・focus）と、
  //   次のタップ（iOS はタップの中でないと再開を許さないことがある）で起こし直す
  _wireWake() {
    if (this._wired) return;
    this._wired = true;
    const wake = () => { if (!document.hidden && this.ctx && this.ctx.state !== 'running') this.resume(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('focus', wake);
    document.addEventListener('pointerdown', wake, { capture: true, passive: true });
    document.addEventListener('touchend', wake, { capture: true, passive: true });
  },

  resume() {
    let c = this.ensure();
    // 閉じられていたら作り直す（部品ごと。BGM は下で鳴らし直す）
    if (c && c.state === 'closed') {
      clearInterval(this._bgmTimer); this._bgmTimer = 0;
      this.ctx = null;
      c = this.ensure();
    }
    if (c && c.state !== 'running') { try { c.resume(); } catch (e) {} }
    this.started = true;
    // **BGMは、起動直後の `bgm('cafe')` の時点ではまだ何も鳴らせない**
    //   （AudioContextを最初のタップより前に作らないため。下のensure()参照）。
    //   ここ＝最初のタップで拾って、いま欲しいはずのモードを鳴らし始める
    if (this._bgmMode && !this._bgmTimer) this._bgmSpinUp(this._bgmMode);
  },

  // ---- 部品 ----
  // `o.at` を渡すと「いま」ではなく指定した未来の時刻に鳴らす。
  //   BGMの先読みスケジューラ専用（効果音は渡さないので今までどおり）
  tone(o) {
    if (!this.on()) return;
    const c = this.ensure();
    if (!c || c.state !== 'running') return;   // 'interrupted'（iOS）でも鳴らさない。時計が止まっていて予約が溜まるだけなので
    const t = o.at != null ? o.at : c.currentTime;
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
    if (!c || c.state !== 'running') return;   // 'interrupted'（iOS）でも鳴らさない。時計が止まっていて予約が溜まるだけなので
    const t = o.at != null ? o.at : c.currentTime;
    const n = Math.floor(c.sampleRate * o.dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = o.f || 900; bp.Q.value = o.q || 1.2;
    const g = c.createGain(); g.gain.value = o.vol;
    src.connect(bp); bp.connect(g); g.connect(o.bus || this.sfxGain);
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
  //   昔のパソコン・アーケードの電子音に寄せる：sine/sawtoothの滑らかな波形をやめ、
  //   矩形波・三角波・短いFM・ノイズのビット感で統一する（音量は元の値以下に抑える）
  shot(weaponId) {
    if (!this.on() || !this.gate('shot')) return;
    const m = {
      // ガトリング：矩形波の短い連打に、粒立つノイズを重ねて「ダダダ」感を出す
      gatling:  { type: 'square',   f0: 300,  f1: 210, dur: 0.04,  vol: 0.026, noiseF: 2600, noiseVol: 0.018 },
      // スナイパー：高い矩形波が一気に落ちる、鋭い一撃
      sniper:   { type: 'square',   f0: 1600, f1: 160, dur: 0.09,  vol: 0.04 },
      missile:  { type: 'triangle', f0: 180,  f1: 90,  dur: 0.13,  vol: 0.0375 },
      // テスラ：FM変調で金属的な「ジジッ」
      tesla:    { fm: true, f0: 820, ratio: 3.4, index: 7, dur: 0.05, vol: 0.028 },
      // 火炎放射器：ノイズだけで「シュー」という噴射音
      flame:    { noiseOnly: true, noiseF: 1100, noiseQ: 0.6, dur: 0.09, noiseVol: 0.02 },
      mortar:   { type: 'triangle', f0: 120,  f1: 60,  dur: 0.16,  vol: 0.045 },
      // 刀：短い矩形波の斬撃に、高いノイズの「シャッ」を重ねる
      katana:   { type: 'square',   f0: 1200, f1: 420, dur: 0.06,  vol: 0.032, noiseF: 4200, noiseVol: 0.014 },
      shuriken: { type: 'square',   f0: 620,  f1: 480, dur: 0.05,  vol: 0.025 },
    };
    const cfg = m[weaponId] || { type: 'square', f0: 420, f1: 280, dur: 0.05, vol: 0.025 };
    if (cfg.fm) { this.fmTone({ f0: cfg.f0, ratio: cfg.ratio, index: cfg.index, dur: cfg.dur, vol: cfg.vol, bus: this.sfxGain }); return; }
    if (cfg.noiseOnly) { this.noise({ dur: cfg.dur, f: cfg.noiseF, q: cfg.noiseQ || 1, vol: cfg.noiseVol }); return; }
    this.tone(cfg);
    if (cfg.noiseF) this.noise({ dur: Math.min(cfg.dur, 0.03), f: cfg.noiseF, q: 1.5, vol: cfg.noiseVol });
  },

  // 大量撃破：上がっていく短い分散和音（多いほど高く・長く）。企画書 §16「音響との連動」
  chain(n) {
    if (!this.on()) return;
    const base = 520 + Math.min(8, Math.floor(n / 10)) * 40;
    const steps = Math.min(5, 2 + Math.floor(n / 15));
    for (let i = 0; i < steps; i++) setTimeout(() => this.tone({ type: 'square', f0: base * Math.pow(1.26, i), f1: base * Math.pow(1.26, i) * 1.02, dur: 0.06, vol: 0.05 }), i * 45);
  },

  kill() {
    if (!this.on()) return;
    if (!this.gate('kill')) return;
    // パンッと弾けるビット感。帯域を絞って短く切ることで「破裂」に近づける
    this.noise({ dur: 0.055, f: 2000, q: 2.2, vol: 0.12 });
  },

  coin() { if (this.gate('coin')) { this.tone({ type: 'square', f0: 900, f1: 1400, dur: 0.06, vol: 0.04 }); } },
  leak() { this.tone({ type: 'square', f0: 220, f1: 100, dur: 0.15, vol: 0.08 }); },

  ui()    { this.tone({ type: 'square', f0: 600, f1: 900, dur: 0.04, vol: 0.045 }); },
  place() { this.tone({ type: 'triangle', f0: 380, f1: 620, dur: 0.09, vol: 0.08 }); },
  deny()  { this.tone({ type: 'square', f0: 200, f1: 140, dur: 0.1, vol: 0.06 }); },

  waveStart() {
    this.tone({ type: 'square', f0: 330, f1: 440, dur: 0.13, vol: 0.08 });
    setTimeout(() => this.tone({ type: 'square', f0: 440, f1: 660, dur: 0.17, vol: 0.08 }), 110);
  },
  waveClear() {
    [523, 659, 784].forEach((f, i) =>
      setTimeout(() => this.tone({ type: 'triangle', f0: f, f1: f, dur: 0.16, vol: 0.08 }), i * 85));
  },
  stageClear() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.tone({ type: 'square', f0: f, f1: f, dur: 0.24, vol: 0.09 }), i * 130));
  },
  dead() {
    [392, 330, 262, 196].forEach((f, i) =>
      setTimeout(() => this.tone({ type: 'square', f0: f, f1: f * 0.98, dur: 0.28, vol: 0.08 }), i * 150));
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
  // 昇格（光やカードの枠のレア度が1段上がる）。段が上がるほど高く明るい
  promote(lv) {
    const f = [660, 880, 1175, 1568][Math.min(3, lv)];
    this.tone({ type: 'sine', f0: f, f1: f * 1.5, dur: 0.18, vol: 0.07 });
    this.tone({ type: 'triangle', f0: f * 0.5, f1: f * 0.75, dur: 0.22, vol: 0.05 });
  },
  // カードを配る音（伏せて置く）
  deal(i) {
    this.noise({ dur: 0.07, vol: 0.05, f: 3000 + (i || 0) * 400 });
    this.tone({ type: 'triangle', f0: 300 + (i || 0) * 40, f1: 200, dur: 0.06, vol: 0.04 });
  },
  // 捲る音。レアほど厚い
  flip(g) {
    this.noise({ dur: 0.12, vol: 0.06, f: 1800 });
    if (g >= 2) this.tone({ type: 'sine', f0: 400, f1: 1200, dur: 0.25, vol: 0.05 });
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

  // アセンションのレベルアップ。低い唸りのあと、青白い和音が駆け上がる
  ascend() {
    this.tone({ type: 'sawtooth', f0: 60, f1: 240, dur: 0.5, vol: 0.05 });
    [392, 523, 659, 784, 1047, 1568].forEach((f, i) =>
      setTimeout(() => this.tone({ type: 'sine', f0: f, f1: f * 1.005, dur: 0.7, vol: 0.06 }), 380 + i * 70));
  },

  // ---- BGM ----
  // 音階はMIDIノート番号で持つ（読みやすさのため）。440Hz=A4=69
  hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); },

  // 喫茶店：Cmaj9 → Am9 → Fmaj9 → G9。よくあるジャズの循環に、
  //   7th/9thを足して「ふわっと浮く」感じを出す（エレピのボイシング）
  CAFE_CHORDS: [
    [60, 64, 67, 71, 74],   // Cmaj9
    [57, 60, 64, 67, 71],   // Am9
    [53, 57, 60, 64, 67],   // Fmaj9
    [55, 59, 62, 65, 69],   // G9
  ],
  // 戦闘：Am7 → Fmaj7 → Cmaj7 → G7。アーケードらしいマイナー循環
  BATTLE_CHORDS: [
    [45, 48, 52, 55],   // Am7
    [41, 45, 48, 52],   // Fmaj7
    [48, 52, 55, 59],   // Cmaj7
    [43, 47, 50, 53],   // G7
  ],
  // FMのリードを打つ位置（16分音符・0〜15）。8小節ごとに入れ替えて単調にしない
  LEAD_A: [2, 6, 10, 14],
  LEAD_B: [2, 5, 8, 10, 13, 15],

  // FM合成の1音（オシレーター2つ。modがcarの周波数を揺らす）。
  //   PC-8801のFM音源を想わせる金属的なリード・ベルはこれで作る
  fmTone(o) {
    if (!this.on()) return;
    const c = this.ensure();
    if (!c || c.state !== 'running') return;   // 'interrupted'（iOS）でも鳴らさない。時計が止まっていて予約が溜まるだけなので
    const t = o.at != null ? o.at : c.currentTime;
    const car = c.createOscillator(), mod = c.createOscillator(), modG = c.createGain();
    car.type = o.type || 'sine';
    car.frequency.setValueAtTime(o.f0, t);
    mod.type = 'sine';
    mod.frequency.setValueAtTime(o.f0 * (o.ratio || 2), t);
    modG.gain.setValueAtTime(o.f0 * (o.index || 4), t);   // 変調の深さ＝金属っぽさ
    mod.connect(modG); modG.connect(car.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    car.connect(g); g.connect(o.bus || this.bgmGain);
    mod.start(t); car.start(t);
    mod.stop(t + o.dur + 0.03); car.stop(t + o.dur + 0.03);
  },

  // 1ステップ（4分音符）ぶん鳴らす：喫茶店。エレピ風の和音をゆっくり崩して弾き、
  //   控えめなベースと、裏拍だけブラシ風の刻み（ノイズを短く）
  _bgmTickCafe(step, at) {
    const chord = this.CAFE_CHORDS[Math.floor(step / 8) % this.CAFE_CHORDS.length];
    const inChord = step % 8;
    // 和音は5音・拍は8つなので、周回するたびに弾く位置がずれて表情が変わる
    const note = chord[inChord % chord.length];
    this.tone({ type: 'sine', f0: this.hz(note), f1: this.hz(note), dur: this._bgmStepDur * 1.8, vol: 0.4, bus: this.bgmGain, at });
    if (inChord % 2 === 0) {
      this.tone({ type: 'triangle', f0: this.hz(chord[0] - 12), f1: this.hz(chord[0] - 12), dur: this._bgmStepDur * 3.4, vol: 0.3, bus: this.bgmGain, at });
    } else {
      this.noise({ dur: 0.035, f: 5200, q: 0.7, vol: 0.045, bus: this.bgmGain, at });
    }
  },

  // 1ステップ（16分音符）ぶん鳴らす：戦闘。矩形波の速いアルペジオ＋
  //   FMのリード・ベル＋うねる低音のサブベース＋ノイズのハイハット/スネア
  _bgmTickBattle(step, at) {
    const bar = Math.floor(step / 16);
    const chord = this.BATTLE_CHORDS[bar % this.BATTLE_CHORDS.length];
    const inBar = step % 16;
    const part = Math.floor(bar / 8) % 2;   // 8小節ごとに入れ替え。ずっと同じ骨格にしない

    // 根音・5度・7度を1オクターブ下で駆けるアルペジオ
    const arpIdx = [0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3][inBar];
    this.tone({ type: 'square', f0: this.hz(chord[arpIdx] - 12), f1: this.hz(chord[arpIdx] - 12),
      dur: this._bgmStepDur * 0.85, vol: 0.22, bus: this.bgmGain, at });

    const hits = part === 0 ? this.LEAD_A : this.LEAD_B;
    if (hits.includes(inBar)) {
      this.fmTone({ f0: this.hz(chord[1] + 12), ratio: 2, index: part === 0 ? 4 : 7,
        dur: this._bgmStepDur * (part === 0 ? 2.4 : 1.6), vol: 0.2, bus: this.bgmGain, at });
    }
    if (inBar === 0) {
      // 小節の頭で低く長く。「うねるベース」＝サブベースが下から支える
      this.tone({ type: 'sawtooth', f0: this.hz(chord[0] - 24), f1: this.hz(chord[0] - 12),
        dur: this._bgmStepDur * 15, vol: 0.13, bus: this.bgmGain, at });
    }
    this.noise({ dur: 0.018, f: 8200, q: 1.0, vol: 0.03, bus: this.bgmGain, at });   // 閉じたハイハット
    if (inBar === 4 || inBar === 12) {
      this.noise({ dur: 0.09, f: 1700, q: 0.8, vol: 0.09, bus: this.bgmGain, at });  // 裏拍のスネア
    }
  },

  // 先読みのスケジューラ本体。**AudioContextの時計を基準に**次の一定時間ぶんを予約する。
  //   setIntervalの発火間隔そのものがテンポではないので、多少の呼び出しの遅れでは揺れない
  _bgmSchedule() {
    const c = this.ctx;
    if (!c || !this._bgmTick) return;
    const ahead = 0.12;
    // 裏に回っていた間に時計が先へ進んでいたら、その間の拍は飛ばして「いま」から続ける
    //   （前は、止まっていたぶんを最大64歩まとめて一度に鳴らしていた）
    if (this._bgmNextTime < c.currentTime - 0.05) {
      const skip = Math.ceil((c.currentTime - this._bgmNextTime) / this._bgmStepDur);
      this._bgmStep += skip;
      this._bgmNextTime += skip * this._bgmStepDur;
    }
    let guard = 0;
    while (this._bgmNextTime < c.currentTime + ahead && guard++ < 64) {
      this._bgmTick(this._bgmStep, this._bgmNextTime);
      this._bgmStep++;
      this._bgmNextTime += this._bgmStepDur;
    }
  },

  // 指定のモードで、いまから鳴らし始める（クロスフェードの「フェードイン」側）
  _bgmSpinUp(mode) {
    const c = this.ctx;
    if (!c) return;
    this._bgmStep = 0;
    this._bgmStepDur = mode === 'battle' ? (60 / 142 / 4) : (60 / 78);   // 戦闘=142BPMの16分／喫茶店=78BPMの4分
    this._bgmTick = mode === 'battle' ? this._bgmTickBattle : this._bgmTickCafe;
    this._bgmNextTime = c.currentTime + 0.05;
    clearInterval(this._bgmTimer);
    this._bgmTimer = setInterval(() => this._bgmSchedule(), 35);
    this.bgmGain.gain.cancelScheduledValues(c.currentTime);
    this.bgmGain.gain.setTargetAtTime(this.on() ? this.VOL.bgm : 0, c.currentTime, 0.16);
  },

  // 'cafe' ⇄ 'battle' の切り替え。**短くフェードアウトしてから入れ替える**
  //   （オシレーターを重ねる真のクロスフェードより軽く、スマホでも安い）
  _bgmSwitch(mode) {
    const c = this.ctx;
    const tc = 0.16;   // 時定数。実質のフェード幅は3倍＝約0.5秒
    this.bgmGain.gain.cancelScheduledValues(c.currentTime);
    this.bgmGain.gain.setTargetAtTime(0.0001, c.currentTime, tc);
    clearInterval(this._bgmTimer); this._bgmTimer = 0;
    clearTimeout(this._bgmSwap);
    if (!mode) return;   // 止めるだけ
    this._bgmSwap = setTimeout(() => {
      if (this._bgmMode === mode) this._bgmSpinUp(mode);
    }, tc * 1000 * 3);
  },

  // ---- 呼び出し口。mode は 'cafe' / 'battle' / null ----
  //   同じmodeなら何もしない。まだ最初のタップより前（AudioContext未生成）なら
  //   希望のmodeだけ覚えておいて、resume()（＝最初のタップ）が拾って鳴らし始める
  bgm(mode) {
    if (mode === this._bgmMode) return;
    this._bgmMode = mode;
    if (!this.ctx) return;
    this._bgmSwitch(mode);
  },

  setMute(m) {
    Game.perm.mute = !!m;
    if (this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : this.VOL.master, this.ctx.currentTime, 0.05);
    }
    Game.save();
  },
};
