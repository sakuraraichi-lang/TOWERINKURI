// ---------------------------------------------------------------
// music.js : 曲を「コードで作曲して」鳴らす（2026-10-07）
//
//   ユーザー：「コーディングによる作曲をしてほしい」「音源は A（ファイルを持たず合成）」。
//   **音源ファイルは持たない。**音色はすべて Web Audio の発振器・FM・ノイズ・フィルタで作る（audio.js と同じ方針）。
//
//   **楽譜は「度数」で持つ。**ライトモチーフ（このゲームの耳に残るフレーズ）を1つ決めて、
//   長調・短調・ドリアン…と旋法を替え、テンポ・音色・伴奏の型を替えるだけで、
//   ホーム・戦闘・ボス・結果画面などどの曲調にも同じフレーズが乗るようにする（ユーザー「どんな曲調にも合うフレーズ」）。
//
//   使い方
//     Music.play(Music.arrange(motif, 'home'))   … 鳴らす（ループ）
//     Music.stop()
//     Music.renderOffline(song, 秒)               … OfflineAudioContext で書き出して、音割れ・無音・NaN を数値で確かめる
//
//   motif の形：{ notes: [[度数, 開始(16分), 長さ(16分), 半音のずらし(省略可)], …]（2小節＝32）, h: [1小節目の和音の根の度数, 2小節目] }
//     半音のずらし：-1 で半音下げる（ブルーノートの ♭5 など、旋法の外の音）
// ---------------------------------------------------------------
'use strict';

const Music = {
  ctx: null, out: null, _rev: null, _dly: null, _timer: null, _song: null, _noise: null,

  MODES: {
    major:    [0, 2, 4, 5, 7, 9, 11],
    minor:    [0, 2, 3, 5, 7, 8, 10],
    dorian:   [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    mixo:     [0, 2, 4, 5, 7, 9, 10],
  },

  // 度数 → MIDI の音の高さ（度数は 0 が主音。負や 7 以上はオクターブをまたぐ）
  deg(d, tonic, mode) {
    const sc = this.MODES[mode] || this.MODES.minor;
    const o = Math.floor(d / 7), i = ((d % 7) + 7) % 7;
    return tonic + o * 12 + sc[i];
  },
  hz(m) { return 440 * Math.pow(2, (m - 69) / 12); },

  // ---------- 音の出口（マスター・リバーブ・ディレイ・圧縮） ----------
  //   ctx を渡せば、その文脈（OfflineAudioContext でもよい）に組む
  build(ctx) {
    const c = ctx;
    const master = c.createGain(); master.gain.value = 0.55;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    master.connect(comp); comp.connect(lim); lim.connect(c.destination);
    // リバーブ（作った残響を畳み込む・2.2秒）
    const rev = c.createConvolver();
    const len = Math.floor(c.sampleRate * 2.2), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let seed = 1234 + ch * 77;
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        d[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
    }
    rev.buffer = ir;
    const revGain = c.createGain(); revGain.gain.value = 0.32;
    rev.connect(revGain); revGain.connect(master);
    // ディレイ（付点8分ふうに曲ごとに時間を変える）
    const dly = c.createDelay(1.5), fb = c.createGain(), dlyOut = c.createGain(), dlf = c.createBiquadFilter();
    fb.gain.value = 0.32; dlyOut.gain.value = 0.22; dlf.type = 'lowpass'; dlf.frequency.value = 2600;
    dly.connect(dlf); dlf.connect(fb); fb.connect(dly); dlf.connect(dlyOut); dlyOut.connect(master);
    // ノイズの素（ドラム・針音）
    const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), nd = nb.getChannelData(0);
    let s = 99;
    for (let i = 0; i < nd.length; i++) { s = (s * 16807) % 2147483647; nd[i] = (s / 2147483647) * 2 - 1; }
    return { c, master, rev, dly, noise: nb, lofi: null };
  },

  // 歪みの曲線（出口ごとに1つ作って使い回す）
  _shaper(B) {
    if (!B._curve) {
      const n = 2048, k = 3, cv = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = Math.tanh(k * x) / Math.tanh(k); }
      B._curve = cv;
    }
    const sh = B.c.createWaveShaper(); sh.curve = B._curve; sh.oversample = '2x';
    return sh;
  },
  // 1音の行き先：乾いた音・リバーブ・ディレイへ送る量
  _bus(B, dest, wet, del) {
    const g = B.c.createGain();
    g.connect(dest || B.master);
    if (wet) { const w = B.c.createGain(); w.gain.value = wet; g.connect(w); w.connect(B.rev); }
    if (del) { const d = B.c.createGain(); d.gain.value = del; g.connect(d); d.connect(B.dly); }
    return g;
  },
  _env(g, t, a, peak, dec, sus, rel, end) {
    const p = g.gain;
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.setTargetAtTime(peak * sus, t + a, dec);
    p.setTargetAtTime(0.0001, end, rel);
  },

  // ---------- 音色（すべて合成） ----------
  //   引数：B（出口）・t（開始秒）・m（MIDI）・d（長さ秒）・v（強さ 0〜1）・o（曲ごとの設定）
  INST: {
    // エレピ（FM・ベルのような芯と柔らかい胴）。ホームの喫茶店
    epiano(B, t, m, d, v, o) {
      const c = B.c, f = Music.hz(m), out = Music._bus(B, o.dest, 0.35, 0.12);
      const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
      car.frequency.value = f; mod.frequency.value = f * 1; mg.gain.setValueAtTime(f * 1.6 * v, t); mg.gain.setTargetAtTime(f * 0.25, t, 0.25);
      mod.connect(mg); mg.connect(car.frequency);
      const tine = c.createOscillator(), tg = c.createGain();
      tine.frequency.value = f * 14; tg.gain.setValueAtTime(0.06 * v, t); tg.gain.setTargetAtTime(0.0001, t, 0.05);
      tine.connect(tg); tg.connect(out);
      car.connect(g); g.connect(out);
      Music._env(g, t, 0.004, 0.32 * v, 0.6, 0.35, 0.25, t + d);
      const end = t + d + 1.6;
      [car, mod, tine].forEach(x => { x.start(t); x.stop(end); });
    },
    // FM のリード（PC-88 の電子アーケード）。少し遅れてビブラート
    fmlead(B, t, m, d, v, o) {
      const c = B.c, f = Music.hz(m), out = Music._bus(B, o.dest, 0.22, 0.25);
      for (const det of [-6, 6]) {
        const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
        car.frequency.value = f; car.detune.value = det;
        mod.frequency.value = f * 2; mg.gain.setValueAtTime(f * 3.2, t); mg.gain.setTargetAtTime(f * 1.1, t, 0.08);
        mod.connect(mg); mg.connect(car.frequency);
        const vib = c.createOscillator(), vg = c.createGain();
        vib.frequency.value = 5.6; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(18, t + Math.min(0.35, d));
        vib.connect(vg); vg.connect(car.detune);
        car.connect(g); g.connect(out);
        Music._env(g, t, 0.006, 0.14 * v, 0.15, 0.7, 0.06, t + d);
        const end = t + d + 0.5;
        [car, mod, vib].forEach(x => { x.start(t); x.stop(end); });
      }
    },
    // FM のベース（はじく芯）
    fmbass(B, t, m, d, v, o) {
      const c = B.c, f = Music.hz(m), out = Music._bus(B, o.dest, 0.04, 0);
      const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
      car.frequency.value = f; mod.frequency.value = f;
      mg.gain.setValueAtTime(f * 4.5, t); mg.gain.setTargetAtTime(f * 0.6, t, 0.05);
      mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(out);
      Music._env(g, t, 0.003, 0.42 * v, 0.12, 0.55, 0.04, t + d);
      const end = t + d + 0.3;
      [car, mod].forEach(x => { x.start(t); x.stop(end); });
    },
    // 丸いベース（ホーム・シリアス）
    subbass(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0.05, 0);
      const os = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
      os.type = 'triangle'; os.frequency.value = Music.hz(m);
      lp.type = 'lowpass'; lp.frequency.value = 700;
      os.connect(lp); lp.connect(g); g.connect(out);
      Music._env(g, t, 0.01, 0.5 * v, 0.3, 0.6, 0.08, t + d);
      os.start(t); os.stop(t + d + 0.5);
    },
    // チップ音（25% の矩形）。コミカル・アルペジオ
    chip(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0.12, 0.18);
      if (!B._pulse) {
        const n = 32, re = new Float32Array(n), im = new Float32Array(n), duty = 0.25;
        for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * 1;
        for (let k = 1; k < n; k++) { re[k] = (2 / (k * Math.PI)) * Math.sin(2 * k * Math.PI * duty) * 0.5; }
        B._pulse = c.createPeriodicWave(re, im);
      }
      const os = c.createOscillator(), g = c.createGain();
      os.setPeriodicWave(B._pulse); os.frequency.value = Music.hz(m);
      os.connect(g); g.connect(out);
      Music._env(g, t, 0.002, 0.11 * v, 0.08, 0.5, 0.02, t + d);
      os.start(t); os.stop(t + d + 0.2);
    },
    // パッド（ずらしたノコギリ3本・ゆっくり立ち上がる）
    pad(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0.5, 0);
      const lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = 'lowpass'; lp.frequency.value = o.padCut || 1400; lp.Q.value = 0.4;
      lp.connect(g); g.connect(out);
      const oss = [-9, 0, 9].map(det => { const x = c.createOscillator(); x.type = 'sawtooth'; x.frequency.value = Music.hz(m); x.detune.value = det; x.connect(lp); return x; });
      Music._env(g, t, Math.min(0.5, d * 0.4), 0.05 * v, 0.6, 0.85, 0.4, t + d);
      oss.forEach(x => { x.start(t); x.stop(t + d + 1.6); });
    },
    // 弦（シリアス）。ゆっくりのビブラート
    strings(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0.6, 0);
      const lp = c.createBiquadFilter(), g = c.createGain(), vib = c.createOscillator(), vg = c.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 2200; lp.connect(g); g.connect(out);
      vib.frequency.value = 4.8; vg.gain.value = 9; vib.connect(vg);
      const oss = [-7, 7].map(det => { const x = c.createOscillator(); x.type = 'sawtooth'; x.frequency.value = Music.hz(m); x.detune.value = det; vg.connect(x.detune); x.connect(lp); return x; });
      Music._env(g, t, Math.min(0.35, d * 0.3), 0.07 * v, 0.5, 0.9, 0.35, t + d);
      [...oss, vib].forEach(x => { x.start(t); x.stop(t + d + 1.4); });
    },
    // 鉄琴（FM・コミカルの上物とシリアスの合図）
    bell(B, t, m, d, v, o) {
      const c = B.c, f = Music.hz(m), out = Music._bus(B, o.dest, 0.45, 0.2);
      const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
      car.frequency.value = f; mod.frequency.value = f * 3.5;
      mg.gain.setValueAtTime(f * 2.2, t); mg.gain.setTargetAtTime(f * 0.1, t, 0.3);
      mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(out);
      Music._env(g, t, 0.002, 0.2 * v, 0.5, 0.2, 0.4, t + Math.min(d, 0.3));
      const end = t + 2;
      [car, mod].forEach(x => { x.start(t); x.stop(end); });
    },
    // モチーフを素で聴く（三角波）
    plain(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0.2, 0);
      const os = c.createOscillator(), g = c.createGain();
      os.type = 'triangle'; os.frequency.value = Music.hz(m);
      os.connect(g); g.connect(out);
      Music._env(g, t, 0.01, 0.35 * v, 0.3, 0.75, 0.05, t + d * 0.92);
      os.start(t); os.stop(t + d + 0.4);
    },
    // ミュートのトランペット（ジャズ）：ノコギリ2本を細い帯域に通し、吹き始めに少し「ワ」と開く
    mute(B, t, m, d, v, o) {
      const c = B.c, f = Music.hz(m), out = Music._bus(B, o.dest, 0.3, 0.12);
      const bp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain();
      bp.type = 'bandpass'; bp.Q.value = 2.2;
      bp.frequency.setValueAtTime(f * 1.5, t); bp.frequency.linearRampToValueAtTime(Math.min(4200, f * 3.2), t + 0.07);
      bp.frequency.setTargetAtTime(Math.min(3400, f * 2.4), t + 0.07, 0.2);
      lp.type = 'lowpass'; lp.frequency.value = 5200;
      bp.connect(lp); lp.connect(g); g.connect(out);
      const vib = c.createOscillator(), vg = c.createGain();
      vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(d > 0.35 ? 14 : 0, t + Math.min(0.5, d));
      vib.connect(vg);
      const oss = [-5, 5].map(det => { const x = c.createOscillator(); x.type = 'sawtooth'; x.frequency.value = f; x.detune.value = det; vg.connect(x.detune); x.connect(bp); return x; });
      // 吹き込みのすくい上げ（少し下から当てる）
      oss.forEach(x => { x.frequency.setValueAtTime(f * 0.97, t); x.frequency.exponentialRampToValueAtTime(f, t + 0.05); });
      Music._env(g, t, 0.025, 0.6 * v, 0.25, 0.7, 0.06, t + d);
      [...oss, vib].forEach(x => { x.start(t); x.stop(t + d + 0.5); });
    },
    // ウッドベース（はじいてすぐ減衰する丸い低音）
    upright(B, t, m, d, v, o) {
      const c = B.c, f = Music.hz(m), out = Music._bus(B, o.dest, 0.08, 0);
      const os = c.createOscillator(), os2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
      os.type = 'triangle'; os.frequency.value = f; os2.type = 'sine'; os2.frequency.value = f * 2;
      const g2 = c.createGain(); g2.gain.value = 0.25;
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(1400, t); lp.frequency.setTargetAtTime(500, t, 0.06);
      os.connect(lp); os2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.42 * v, t + 0.008);
      g.gain.setTargetAtTime(0.2 * v, t + 0.008, 0.12); g.gain.setTargetAtTime(0.0001, t + d, 0.05);
      [os, os2].forEach(x => { x.start(t); x.stop(t + d + 0.4); });
    },
    // ライドシンバル（金属の FM ＋ 高いノイズ）
    ride(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0.2, 0);
      const n = c.createBufferSource(); n.buffer = B.noise;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
      const g = c.createGain(); n.connect(hp); hp.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11 * v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), pg = c.createGain(), php = c.createBiquadFilter();
      car.frequency.value = 3150; mod.frequency.value = 4410; mg.gain.value = 2600;
      mod.connect(mg); mg.connect(car.frequency); php.type = 'highpass'; php.frequency.value = 2500;
      car.connect(php); php.connect(pg); pg.connect(out);
      pg.gain.setValueAtTime(0.0001, t); pg.gain.linearRampToValueAtTime(0.055 * v, t + 0.002); pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      n.start(t, Math.random() * 0.4); n.stop(t + 0.55); [car, mod].forEach(x => { x.start(t); x.stop(t + 0.75); });
    },
    // エレキギターのリード（RPG の戦闘曲の主旋律）
    //   ノコギリ2本 → 歪み（tanh）→ キャビネットの帯域。長い音は下からチョーキングで当て、遅れてビブラート
    //   o.pan で左右、o.bend で「下から何半音すくうか」（0 で無し）
    guitar(B, t, m, d, v, o) {
      const c = B.c, f = Music.hz(m), out = Music._bus(B, o.dest, 0.16, o.harm ? 0.08 : 0.2);
      const pan = c.createStereoPanner(); pan.pan.value = o.pan || 0; pan.connect(out);
      const hp = c.createBiquadFilter(), drive = c.createGain(), sh = Music._shaper(B), pk = c.createBiquadFilter(), cab = c.createBiquadFilter(), g = c.createGain();
      hp.type = 'highpass'; hp.frequency.value = 180; drive.gain.value = 5;
      pk.type = 'peaking'; pk.frequency.value = 1800; pk.Q.value = 1; pk.gain.value = 5;
      cab.type = 'lowpass'; cab.frequency.value = 4200; cab.Q.value = 0.9;
      hp.connect(drive); drive.connect(sh); sh.connect(pk); pk.connect(cab); cab.connect(g); g.connect(pan);
      const bend = o.bend == null ? (d > 0.3 ? 2 : 0) : o.bend;
      const vib = c.createOscillator(), vg = c.createGain();
      vib.frequency.value = 6.2; vg.gain.setValueAtTime(0, t);
      if (d > 0.35) { vg.gain.setValueAtTime(0, t + 0.22); vg.gain.linearRampToValueAtTime(32, t + Math.min(d, 0.6)); }
      vib.connect(vg);
      const oss = [-7, 7].map(det => {
        const x = c.createOscillator(); x.type = 'sawtooth'; x.detune.value = det;
        if (bend) { x.frequency.setValueAtTime(f * Math.pow(2, -bend / 12), t); x.frequency.setTargetAtTime(f, t + 0.02, 0.045); }
        else x.frequency.value = f;
        vg.connect(x.detune); x.connect(hp); return x;
      });
      Music._env(g, t, 0.004, 0.16 * v, 0.4, 0.75, 0.05, t + d);
      [...oss, vib].forEach(x => { x.start(t); x.stop(t + d + 0.4); });
    },
    // エレキギターの刻み（パワーコード＝根・5度・オクターブ）。o.mute で手のひらで消した短い刻み
    gtrchug(B, t, m, d, v, o) {
      const c = B.c, f = Music.hz(m), out = Music._bus(B, o.dest, 0.06, 0);
      const pan = c.createStereoPanner(); pan.pan.value = o.pan || 0; pan.connect(out);
      const drive = c.createGain(), sh = Music._shaper(B), cab = c.createBiquadFilter(), g = c.createGain();
      drive.gain.value = 4; cab.type = 'lowpass'; cab.Q.value = 0.8;
      cab.frequency.setValueAtTime(o.mute ? 1500 : 3400, t); if (o.mute) cab.frequency.setTargetAtTime(500, t, 0.04);
      drive.connect(sh); sh.connect(cab); cab.connect(g); g.connect(pan);
      const oss = [1, 1.4983, 2].map((k, i) => { const x = c.createOscillator(); x.type = 'sawtooth'; x.frequency.value = f * k; x.detune.value = (i - 1) * 4; x.connect(drive); return x; });
      const len = o.mute ? Math.min(d, 0.11) : d;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14 * v, t + 0.003);
      g.gain.setTargetAtTime(0.09 * v, t + 0.003, o.mute ? 0.03 : 0.3); g.gain.setTargetAtTime(0.0001, t + len, 0.03);
      oss.forEach(x => { x.start(t); x.stop(t + len + 0.25); });
    },
    // スーパーソウ（ずらしたノコギリ7本）。o.cut で明るさ、o.pluck で短くはじく
    supersaw(B, t, m, d, v, o) {
      const c = B.c, f = Music.hz(m), out = Music._bus(B, o.dest, o.wet != null ? o.wet : 0.3, o.del != null ? o.del : 0.18);
      const lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = 'lowpass'; lp.Q.value = 0.7;
      const cut = o.cut || 5000;
      if (o.pluck) { lp.frequency.setValueAtTime(cut, t); lp.frequency.setTargetAtTime(cut * 0.15, t, 0.06); }
      else lp.frequency.value = cut;
      lp.connect(g); g.connect(out);
      const oss = [-24, -14, -6, 0, 6, 14, 24].map((det, i) => { const x = c.createOscillator(); x.type = 'sawtooth'; x.frequency.value = f; x.detune.value = det; x.connect(lp); return x; });
      if (o.pluck) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * v, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.004, Math.min(0.12, d * 0.5)); }
      else Music._env(g, t, 0.012, 0.045 * v * (o.lvl || 1), 0.3, 0.8, 0.08, t + d);
      const end = t + (o.pluck ? Math.min(d, 0.5) + 0.2 : d + 0.6);
      oss.forEach(x => { x.start(t); x.stop(end); });
    },
    // シンセのリード（ノコギリ＋矩形・下からすくう・遅れてビブラート）。サイバー・ZZZ
    synlead(B, t, m, d, v, o) {
      const c = B.c, f = Music.hz(m), out = Music._bus(B, o.dest, 0.22, 0.22);
      const lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = 'lowpass'; lp.Q.value = o.q || 3;
      const cut = o.cut || 3200;
      lp.frequency.setValueAtTime(cut * 1.8, t); lp.frequency.setTargetAtTime(cut, t, 0.08);
      lp.connect(g); g.connect(out);
      const vib = c.createOscillator(), vg = c.createGain();
      vib.frequency.value = 5.5; vg.gain.setValueAtTime(0, t);
      if (d > 0.35) { vg.gain.setValueAtTime(0, t + 0.2); vg.gain.linearRampToValueAtTime(20, t + Math.min(d, 0.55)); }
      vib.connect(vg);
      const oss = [['sawtooth', -5], ['square', 5]].map(([ty, det]) => {
        const x = c.createOscillator(); x.type = ty; x.detune.value = det;
        const gl = o.glide == null ? 1 : o.glide;
        if (gl) { x.frequency.setValueAtTime(f * Math.pow(2, -gl / 12), t); x.frequency.setTargetAtTime(f, t, 0.025); } else x.frequency.value = f;
        vg.connect(x.detune); x.connect(lp); return x;
      });
      Music._env(g, t, 0.006, 0.1 * v, 0.2, 0.75, 0.05, t + d);
      [...oss, vib].forEach(x => { x.start(t); x.stop(t + d + 0.4); });
    },
    // リースベース（ずらした2本のノコギリが唸る・ゆっくり開閉するフィルタ）。サイバー
    reese(B, t, m, d, v, o) {
      const c = B.c, f = Music.hz(m), out = Music._bus(B, o.dest, 0.03, 0);
      const lp = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 2;
      lfo.frequency.value = 0.45; lg.gain.value = 300; lfo.connect(lg); lg.connect(lp.frequency);
      const sh = Music._shaper(B), dr = c.createGain(); dr.gain.value = 1.6;
      lp.connect(dr); dr.connect(sh); sh.connect(g); g.connect(out);
      const oss = [-16, 16].map(det => { const x = c.createOscillator(); x.type = 'sawtooth'; x.frequency.value = f; x.detune.value = det; x.connect(lp); return x; });
      const sub = c.createOscillator(), sg = c.createGain(); sub.frequency.value = f; sg.gain.value = 0.6; sub.connect(sg); sg.connect(g);
      Music._env(g, t, 0.01, 0.2 * v, 0.4, 0.85, 0.06, t + d);
      [...oss, sub, lfo].forEach(x => { x.start(t); x.stop(t + d + 0.4); });
    },
    // スラップベース（FM・親指の芯と、o.pop で指で引っかけた明るい音）。ZZZ
    slap(B, t, m, d, v, o) {
      const c = B.c, f = Music.hz(m), out = Music._bus(B, o.dest, 0.05, 0);
      const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
      car.frequency.value = f; mod.frequency.value = f * (o.pop ? 3 : 1);
      mg.gain.setValueAtTime(f * (o.pop ? 6 : 7), t); mg.gain.setTargetAtTime(f * 0.4, t, o.pop ? 0.05 : 0.03);
      mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime((o.pop ? 0.32 : 0.48) * v, t + 0.002);
      g.gain.setTargetAtTime(0.22 * v, t + 0.002, 0.08); g.gain.setTargetAtTime(0.0001, t + d, 0.03);
      [car, mod].forEach(x => { x.start(t); x.stop(t + d + 0.3); });
    },
    // ブラス（ノコギリ3本・フィルタが開いて吹き上がる）。アーケード・ZZZ の合いの手
    brass(B, t, m, d, v, o) {
      const c = B.c, f = Music.hz(m), out = Music._bus(B, o.dest, 0.25, 0.08);
      const lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = 'lowpass'; lp.Q.value = 1.2;
      lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(Math.min(6000, f * 7), t + 0.04); lp.frequency.setTargetAtTime(Math.min(3200, f * 3.5), t + 0.04, 0.15);
      lp.connect(g); g.connect(out);
      const oss = [-8, 0, 8].map(det => { const x = c.createOscillator(); x.type = 'sawtooth'; x.frequency.value = f; x.detune.value = det; x.connect(lp); return x; });
      Music._env(g, t, 0.015, 0.09 * v, 0.2, 0.7, 0.05, t + d);
      oss.forEach(x => { x.start(t); x.stop(t + d + 0.3); });
    },
    // クリーンのギターのカッティング（チャカ）。ZZZ のファンク
    cut(B, t, m, d, v, o) {
      const c = B.c, f = Music.hz(m), out = Music._bus(B, o.dest, 0.12, 0);
      const pan = c.createStereoPanner(); pan.pan.value = o.pan || 0.35; pan.connect(out);
      const bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.1;
      bp.connect(g); g.connect(pan);
      const x = c.createOscillator(); x.type = 'sawtooth'; x.frequency.value = f; x.connect(bp);
      const len = o.mute ? 0.035 : Math.min(d, 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3 * v, t + 0.002); g.gain.setTargetAtTime(0.0001, t + len, 0.02);
      x.start(t); x.stop(t + len + 0.15);
    },
    // ---- 打楽器（m は使わない）----
    clap(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0.3, 0);
      const n = c.createBufferSource(); n.buffer = B.noise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 1.2;
      const g = c.createGain(); n.connect(bp); bp.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t);
      [0, 0.011, 0.022].forEach(dt => { g.gain.setValueAtTime(0.35 * v, t + dt); g.gain.setTargetAtTime(0.02, t + dt + 0.001, 0.004); });
      g.gain.setValueAtTime(0.3 * v, t + 0.033); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      n.start(t, Math.random() * 0.5); n.stop(t + 0.22);
    },
    kick(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0, 0);
      const os = c.createOscillator(), g = c.createGain();
      os.frequency.setValueAtTime(o.kickHz || 140, t); os.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      os.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9 * v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + (o.kickLen || 0.32));
      os.start(t); os.stop(t + 0.4);
    },
    snare(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, o.wet != null ? o.wet : 0.18, 0);
      const n = c.createBufferSource(); n.buffer = B.noise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
      const g = c.createGain(); n.connect(bp); bp.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.42 * v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      const os = c.createOscillator(), og = c.createGain(); os.frequency.value = 190; os.connect(og); og.connect(out);
      og.gain.setValueAtTime(0.25 * v, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      n.start(t, Math.random() * 0.5); n.stop(t + 0.2); os.start(t); os.stop(t + 0.1);
    },
    // ブラシ（ホーム）：やわらかいノイズのこすり
    brush(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0.25, 0);
      const n = c.createBufferSource(); n.buffer = B.noise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.5;
      const g = c.createGain(); n.connect(bp); bp.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16 * v, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      n.start(t, Math.random() * 0.5); n.stop(t + 0.3);
    },
    hat(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0.05, 0);
      const n = c.createBufferSource(); n.buffer = B.noise;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
      const g = c.createGain(); n.connect(hp); hp.connect(g); g.connect(out);
      const len = o.open ? 0.22 : 0.045;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16 * v, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      n.start(t, Math.random() * 0.5); n.stop(t + len + 0.02);
    },
    wood(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0.15, 0);
      const os = c.createOscillator(), g = c.createGain(); os.type = 'sine'; os.frequency.value = (m && m > 60) ? Music.hz(m) : 880;
      os.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3 * v, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      os.start(t); os.stop(t + 0.1);
    },
    // 低い太鼓（シリアス）
    timp(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0.5, 0);
      const os = c.createOscillator(), g = c.createGain(); os.frequency.setValueAtTime(Music.hz(m || 38) * 1.06, t); os.frequency.exponentialRampToValueAtTime(Music.hz(m || 38), t + 0.25);
      os.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.6 * v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      os.start(t); os.stop(t + 1.5);
    },
    crash(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0.3, 0);
      const n = c.createBufferSource(); n.buffer = B.noise; n.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
      const g = c.createGain(); n.connect(hp); hp.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      n.start(t); n.stop(t + 1.7);
    },
  },

  // ---------- 編曲：モチーフ1つを、曲調ごとの8小節に ----------
  //   8小節 ＝ 提示（1〜2）→ 2度上で繰り返す（3〜4）→ 提示（5〜6）→ 1小節目だけ＋主音で終わる（7〜8）
  //   和音の根：[h1, h2, h1+2, h2+2, h1, h2, 3, 4]（最後は属和音でループの頭へ戻る）
  _melody(motif) {
    const out = [];
    const add = (notes, dDeg, offStep, filter) => {
      for (const [d, s, l, a] of notes) if (!filter || filter(s)) out.push({ d: d + dDeg, s: s + offStep, l, a: a || 0 });
    };
    add(motif.notes, 0, 0);
    add(motif.notes, 2, 32);
    add(motif.notes, 0, 64);
    add(motif.notes, 0, 96, s => s < 16);
    out.push({ d: 0, s: 96 + 16, l: 14, a: 0 });
    return out;
  },
  _roots(motif) {
    const [a, b] = motif.h;
    return [a, b, a + 2, b + 2, a, b, 3, 4];
  },
  // 和音の構成音（度数）を、lo〜lo+12 の範囲に畳んだ MIDI で返す
  _chord(root, n, tonic, mode, lo) {
    const out = [];
    for (let k = 0; k < n; k++) {
      let m = this.deg(root + k * 2, tonic, mode);
      while (m < lo) m += 12;
      while (m >= lo + 12) m -= 12;
      out.push(m);
    }
    return out.sort((x, y) => x - y);
  },

  // 低音の音域（33〜45）に畳む
  _low(m) { while (m > 45) m -= 12; while (m < 33) m += 12; return m; },

  STYLES: {
    // ホーム：喫茶店のリラックス（エレピ・ブラシ・丸いベース・揺れる16分）
    home: { label: 'ホーム', bpm: 84, swing: 0.18, tonic: 62, mode: 'major', delayBeats: 0.75, gain: 0.6 },
    // 戦闘：PC-88 の FM（速い・短調・オクターブで跳ねるベース・16分のハイハット）
    //   10-07 ユーザー「戦闘曲のメインの音をギターの様にしてRPGの戦闘曲っぽく」→ 歪んだギターの主旋律・刻み・ツインのハモり
    //   和音は RPG の定番の進行（i → ♭VI → ♭VII → V…）で、モチーフの和音の根を上書きする
    battle: { label: '戦闘', bpm: 168, swing: 0, tonic: 57, mode: 'minor', delayBeats: 0.75, gain: 0.95, roots: [0, 5, 6, 4, 0, 5, 3, 4] },
    // コミカル：跳ねる長調・スタッカート・ズンチャ
    // 10-07 ユーザー「近未来的な曲調、サイバーパンク風、ゼンレスゾーンゼロ風、シューティングゲーム風、アーケードゲーム風」
    //   ※ 既存の曲の旋律・音色の固有の意匠は写さない。ジャンルと雰囲気だけ
    // 近未来：4つ打ち・裏のハイハット・ポンプする（サイドチェインふうの）スーパーソウの和音
    future: { label: '近未来', bpm: 124, swing: 0, tonic: 54, mode: 'minor', delayBeats: 0.75, gain: 0.8, roots: [0, 5, 2, 6, 0, 5, 3, 4] },
    // サイバーパンク：半分の速さに感じるビート・唸るリースベース・歪んだ空気・16分の酸っぱいアルペジオ
    cyber: { label: 'サイバーパンク', bpm: 96, swing: 0, tonic: 52, mode: 'minor', delayBeats: 0.75, gain: 0.85, roots: [0, 5, 0, 6, 0, 5, 3, 4] },
    // ZZZ 風：街のファンク（スラップベース・クリーンのカッティング・ブラスの合いの手・跳ねる16分のブレイクビーツ）
    zzz: { label: 'ストリート・ファンク', bpm: 114, swing: 0.1, tonic: 59, mode: 'dorian', delayBeats: 0.75, gain: 0.85 },
    // シューティング：速い・16分のアルペジオ・オクターブで走るベース・スーパーソウのリード
    shmup: { label: 'シューティング', bpm: 176, swing: 0, tonic: 57, mode: 'minor', delayBeats: 0.75, gain: 0.85, roots: [0, 5, 6, 4, 0, 5, 3, 4] },
    // アーケード：80年代の FM（はじくベース・ブラスの合いの手・残響の大きいスネア）
    arcade: { label: 'アーケード', bpm: 144, swing: 0, tonic: 60, mode: 'dorian', delayBeats: 0.5, gain: 0.85 },
    comic: { label: 'コミカル', bpm: 128, swing: 0.12, tonic: 60, mode: 'major', delayBeats: 0.5, gain: 0.9 },
    // シリアス：遅い・フリジア・低い弦と太鼓
    serious: { label: 'シリアス', bpm: 66, swing: 0, tonic: 50, mode: 'phrygian', delayBeats: 1, gain: 0.8 },
    // ジャズ：跳ねる8分（3連の揺れ）・ドリア・歩くベース・ライド・根音を抜いた9thの和音
    jazz: { label: 'ジャズ', bpm: 138, swing8: 0.64, tonic: 62, mode: 'dorian', delayBeats: 0.75, gain: 0.85 },
    // モチーフだけ
    plain: { label: 'モチーフだけ', bpm: 100, swing: 0, tonic: 57, mode: 'minor', delayBeats: 0.5, gain: 1 },
  },

  // 1ループぶんの音符の一覧：{ s（16分の位置）, l（長さ16分）, m（MIDI）, v, inst, o }
  arrange(motif, style) {
    const S = this.STYLES[style], T = S.tonic, M = S.mode, ev = [];
    const mel = this._melody(motif), roots = S.roots || this._roots(motif);
    const note = (s, l, m, v, inst, o) => ev.push({ s, l, m, v, inst, o: o || {} });
    if (style === 'plain') {
      for (const n of motif.notes) note(n[1], n[2], this.deg(n[0], T, M) + 12 + (n[3] || 0), 0.9, 'plain');
      return { style, bpm: S.bpm, swing: 0, steps: 32 + 8, ev, delayBeats: S.delayBeats, gain: S.gain };
    }
    for (let bar = 0; bar < 8; bar++) {
      const r = roots[bar], b0 = bar * 16;
      if (style === 'home') {
        // 和音：7th を2拍目の裏と4拍目にずらして置く（喫茶店のジャズ）
        const ch = this._chord(r, 4, T, M, 55);
        ch.forEach((m, i) => { note(b0 + 0, 6, m, 0.5, 'epiano'); note(b0 + 10, 5, m, 0.38, 'epiano'); });
        note(b0, 8, this.deg(r, T, M) - 12 >= 36 ? this.deg(r, T, M) - 12 : this.deg(r, T, M), 0.8, 'subbass');
        note(b0 + 8, 4, this.deg(r + 4, T, M) - 12, 0.6, 'subbass');
        note(b0 + 14, 2, this.deg(r + 1, T, M) - 12, 0.4, 'subbass');
        // ブラシと軽いキック
        for (let q = 0; q < 16; q += 2) note(b0 + q, 1, 0, q % 4 === 2 ? 0.9 : 0.5, 'brush');
        note(b0, 1, 0, 0.55, 'kick', { kickHz: 110, kickLen: 0.25 });
        note(b0 + 10, 1, 0, 0.35, 'kick', { kickHz: 110, kickLen: 0.25 });
        note(b0 + 4, 1, 0, 0.35, 'wood', {}); note(b0 + 12, 1, 0, 0.35, 'wood', {});
        note(b0, 16, this._chord(r, 1, T, M, 67)[0], 0.5, 'pad', { padCut: 900 });
      } else if (style === 'battle') {
        let root = this.deg(r, T, M) - 12;
        while (root > 45) root -= 12; while (root < 33) root += 12;
        // ベース：8分で根を刻む（FM）。小節の最後だけオクターブで跳ねる
        for (let q = 0; q < 16; q += 2) note(b0 + q, 2, root + (q === 14 ? 12 : 0), 0.62, 'fmbass');
        // リズムギター（左右に2本）：3・3・2 で鳴らし切ってから、8分の刻み
        const pc = root + 12;
        [[-0.65, 0], [0.65, 0.04]].forEach(([pan, lag]) => {
          [[0, 3], [3, 3], [6, 2]].forEach(([q, l]) => note(b0 + q + lag, l, pc, 0.9, 'gtrchug', { pan }));
          [8, 10, 12, 14].forEach(q => note(b0 + q + lag, 2, pc, 0.75, 'gtrchug', { pan, mute: true }));
        });
        // ドラム：3・3・2 に合わせたキック・2拍4拍のスネア・8分のハイハット
        [0, 3, 6, 8, 10].forEach(q => note(b0 + q, 1, 0, q === 0 ? 1 : 0.8, 'kick'));
        note(b0 + 4, 1, 0, 1, 'snare'); note(b0 + 12, 1, 0, 1, 'snare');
        for (let q = 0; q < 16; q += 2) note(b0 + q, 1, 0, q % 4 ? 0.5 : 0.75, 'hat');
        if (bar === 3 || bar === 7) [12, 13, 14, 15].forEach(q => note(b0 + q, 1, 0, 0.55 + (q - 12) * 0.12, 'snare'));
        if (bar === 0 || bar === 4) note(b0, 1, 0, 1, 'crash');
        // 後ろで薄く弦（RPG の厚み）と、PC-88 のアルペジオを奥に
        this._chord(r, 3, T, M, 60).forEach(m => note(b0, 16, m, 0.45, 'strings'));
        if (bar % 4 >= 2) { const ch = this._chord(r, 3, T, M, 72); for (let q = 0; q < 16; q++) note(b0 + q, 1, ch[q % 3], 0.22, 'chip'); }
      } else if (style === 'comic') {
        // ズンチャ：根音と5度を交互に・裏で和音を短く
        const root = this.deg(r, T, M) - 12, fifth = this.deg(r + 4, T, M) - 24;
        [0, 8].forEach(q => note(b0 + q, 2, root, 0.8, 'fmbass'));
        [4, 12].forEach(q => note(b0 + q, 2, fifth + 12, 0.7, 'fmbass'));
        const ch = this._chord(r, 3, T, M, 64);
        [2, 6, 10, 14].forEach(q => ch.forEach(m => note(b0 + q, 1, m, 0.5, 'chip')));
        [0, 8].forEach(q => note(b0 + q, 1, 0, 0.6, 'kick', { kickHz: 160, kickLen: 0.18 }));
        [4, 12].forEach(q => note(b0 + q, 1, 0, 0.6, 'snare'));
        [3, 7, 11, 15].forEach(q => note(b0 + q, 1, 84, 0.5, 'wood'));
      } else if (style === 'serious') {
        const ch = this._chord(r, 3, T, M, 50);
        ch.forEach(m => note(b0, 16, m, 0.8, 'strings'));
        note(b0, 16, this.deg(r, T, M) - 12, 0.7, 'subbass');
        note(b0, 1, this.deg(r, T, M) - 24 + 12, 0.9, 'timp');
        if (bar % 2 === 1) note(b0 + 12, 1, this.deg(r, T, M) - 24 + 12, 0.6, 'timp');
        if (bar === 0 || bar === 4) note(b0, 1, this.deg(0, T, M) + 24, 0.6, 'bell');
      } else if (style === 'future') {
        const root = this._low(this.deg(r, T, M));
        [2, 6, 10, 14].forEach(q => note(b0 + q, 2, root, 0.55, 'subbass'));
        [0, 4, 8, 12].forEach(q => note(b0 + q, 1, 0, 0.95, 'kick', { kickHz: 150, kickLen: 0.35 }));
        [4, 12].forEach(q => note(b0 + q, 1, 0, 0.8, 'clap'));
        [2, 6, 10, 14].forEach(q => note(b0 + q, 1, 0, 0.5, 'hat', { open: true }));
        for (let q = 0; q < 16; q++) if (q % 2) note(b0 + q, 1, 0, 0.22, 'hat');
        // 和音：8分で鳴らし、拍の頭は小さく・裏は大きく（キックに押されて息をするように）
        const ch = this._chord(r, 4, T, M, 60);
        for (let q = 0; q < 16; q += 2) ch.forEach(m => note(b0 + q, 2, m, q % 4 ? 0.85 : 0.3, 'supersaw', { pluck: true, cut: 3800, wet: 0.2, del: 0.1 }));
        if (bar >= 4) { const a = this._chord(r, 3, T, M, 78); for (let q = 0; q < 16; q += 2) note(b0 + q, 1, a[(q / 2) % 3], 0.3, 'bell'); }
        if (bar === 0 || bar === 4) note(b0, 1, 0, 0.8, 'crash');
      } else if (style === 'cyber') {
        const root = this._low(this.deg(r, T, M));
        note(b0, 10, root, 0.9, 'reese'); note(b0 + 10, 6, root + (bar % 2 ? 12 : 0), 0.8, 'reese');
        [0, 6, 10].forEach(q => note(b0 + q, 1, 0, 1, 'kick', { kickHz: 120, kickLen: 0.45 }));
        note(b0 + 8, 1, 0, 1, 'snare', { wet: 0.35 }); note(b0 + 8, 1, 0, 0.6, 'clap');
        for (let q = 0; q < 16; q++) note(b0 + q, 1, 0, q % 4 === 2 ? 0.55 : 0.28, 'hat');
        if (bar % 2 === 1) [14.5, 15, 15.5].forEach(q => note(b0 + q, 0.5, 0, 0.35, 'hat'));
        // 16分のアルペジオ：低いところで、フィルタを少しずつ開く
        const ch = this._chord(r, 3, T, M, 64);
        for (let q = 0; q < 16; q++) note(b0 + q, 0.8, ch[(q * 2) % 3] + (q % 8 === 7 ? 12 : 0), 0.4, 'synlead', { glide: 0, cut: 700 + bar * 180, q: 6 });
        this._chord(r, 3, T, M, 55).forEach(m => note(b0, 16, m, 0.35, 'strings'));
        if (bar === 0 || bar === 4) note(b0, 1, 0, 0.7, 'crash');
      } else if (style === 'zzz') {
        const root = this._low(this.deg(r, T, M)), fifth = root + 7;
        [[0, root, 0], [3, root, 0], [6, root + 12, 1], [7, root, 0], [10, root, 0], [12, fifth, 0], [14, root + 12, 1]]
          .forEach(([q, m, pop]) => note(b0 + q, pop ? 1 : 1.6, m, 0.65, 'slap', { pop: !!pop }));
        [0, 7, 10].forEach(q => note(b0 + q, 1, 0, 0.9, 'kick', { kickHz: 130, kickLen: 0.3 }));
        [4, 12].forEach(q => note(b0 + q, 1, 0, 0.9, 'snare'));
        [9, 15].forEach(q => note(b0 + q, 1, 0, 0.18, 'snare'));
        for (let q = 0; q < 16; q++) note(b0 + q, 1, 0, q === 14 ? 0.5 : (q % 2 ? 0.25 : 0.45), 'hat', { open: q === 14 });
        // カッティング：9th の和音を、鳴らす（チャ）と消す（チャカ）で
        const vo = [2, 4, 6, 8].map(k => { let m = this.deg(r + k, T, M); while (m < 60) m += 12; while (m >= 73) m -= 12; return m; });
        [[2, 0], [3, 1], [6, 0], [10, 0], [11, 1], [14, 0]].forEach(([q, mute]) => vo.forEach(m => note(b0 + q, 1, m, mute ? 0.5 : 0.8, 'cut', { mute: !!mute })));
        vo.forEach(m => note(b0, 8, m - 12, 0.3, 'epiano'));
        if (bar % 2 === 1) this._chord(r, 3, T, M, 64).forEach(m => note(b0 + 14, 2, m, 0.85, 'brass'));
        if (bar === 0 || bar === 4) note(b0, 1, 0, 0.6, 'crash');
      } else if (style === 'shmup') {
        const root = this._low(this.deg(r, T, M));
        for (let q = 0; q < 16; q += 2) note(b0 + q, 2, root + ((q / 2) % 2 ? 12 : 0), 0.5, 'fmbass');
        [0, 6, 8, 10].forEach(q => note(b0 + q, 1, 0, 0.9, 'kick'));
        [4, 12].forEach(q => note(b0 + q, 1, 0, 0.95, 'snare'));
        for (let q = 0; q < 16; q += 2) note(b0 + q, 1, 0, 0.55, 'hat');
        if (bar === 3 || bar === 7) [12, 13, 14, 15].forEach(q => note(b0 + q, 1, 0, 0.5 + (q - 12) * 0.13, 'snare'));
        const ch = this._chord(r, 3, T, M, 69);
        for (let q = 0; q < 16; q++) note(b0 + q, 1, ch[q % 3] + (q % 6 >= 3 ? 12 : 0), 0.35, 'chip');
        this._chord(r, 3, T, M, 57).forEach(m => note(b0, 16, m, 0.4, 'supersaw', { cut: 1800, wet: 0.4, del: 0 }));
        if (bar === 0 || bar === 4) note(b0, 1, 0, 1, 'crash');
      } else if (style === 'arcade') {
        const root = this._low(this.deg(r, T, M));
        [[0, 0], [3, 0], [6, 12], [8, 0], [10, 0], [13, 12]].forEach(([q, o]) => note(b0 + q, 2, root + o, 0.6, 'fmbass'));
        [0, 8, 10].forEach(q => note(b0 + q, 1, 0, 0.9, 'kick', { kickHz: 150, kickLen: 0.25 }));
        [4, 12].forEach(q => note(b0 + q, 1, 0, 1, 'snare', { wet: 0.55 }));
        for (let q = 0; q < 16; q += 2) note(b0 + q, 1, 0, 0.5, 'hat');
        const ch = this._chord(r, 3, T, M, 62);
        [[0, 2], [6, 2]].forEach(([q, l]) => ch.forEach(m => note(b0 + q, l, m, 0.75, 'brass')));
        if (bar % 2 === 1) ch.forEach(m => note(b0 + 14, 2, m + 12, 0.6, 'brass'));
        const a = this._chord(r, 3, T, M, 74);
        for (let q = 0; q < 16; q++) note(b0 + q, 1, a[q % 3], 0.2, 'chip');
        if (bar === 0 || bar === 4) note(b0, 1, 0, 0.8, 'crash');
      } else if (style === 'jazz') {
        // 歩くベース：4分で 根 → 3度 → 5度 → 次の根へ半音で寄る
        const fold = m => { while (m > 50) m -= 12; while (m < 38) m += 12; return m; };
        const root = fold(this.deg(r, T, M)), next = fold(this.deg(roots[(bar + 1) % 8], T, M));
        const walk = bar % 2 === 0
          ? [root, fold(this.deg(r + 2, T, M)), fold(this.deg(r + 4, T, M)), next + (next > root ? -1 : 1)]
          : [root, fold(this.deg(r + 4, T, M)), fold(this.deg(r + 5, T, M)), next + 1];
        walk.forEach((m, i) => note(b0 + i * 4, 3.6, m, i === 0 ? 0.95 : 0.8, 'upright'));
        // 根を抜いた和音（3・5・7・9度）。チャールストン（1拍目と2拍目の裏）と、次の小節への食い込み
        const voice = [2, 4, 6, 8].map(k => { let m = this.deg(r + k, T, M); while (m < 57) m += 12; while (m >= 70) m -= 12; return m; }).sort((x, y) => x - y);
        const hits = bar % 2 === 0 ? [[0, 3, 0.36], [6, 2, 0.3]] : [[4, 2, 0.28], [14, 2, 0.33]];
        hits.forEach(([q, l, v]) => voice.forEach(m => note(b0 + q, l, m, v, 'epiano')));
        // ライド：チン・チキ・チン・チキ（チキの「キ」は跳ねた8分の裏）
        [0, 4, 6, 8, 12, 14].forEach(q => note(b0 + q, 1, 0, q % 4 === 0 ? 0.85 : 0.55, 'ride'));
        // ハイハットを足で（2拍目と4拍目）・ブラシのスネアの合いの手・羽のように軽いキック
        [4, 12].forEach(q => note(b0 + q, 1, 0, 0.5, 'hat'));
        if (bar % 2 === 1) note(b0 + 14, 1, 0, 0.45, 'brush');
        if (bar % 4 === 3) note(b0 + 10, 1, 0, 0.35, 'snare');
        [0, 8].forEach(q => note(b0 + q, 1, 0, 0.3, 'kick', { kickHz: 90, kickLen: 0.2 }));
        if (bar === 0) note(b0, 1, 0, 0.5, 'crash');
      }
    }
    // 旋律
    for (const n of mel) {
      const m = this.deg(n.d, T, M) + n.a;
      if (style === 'home') note(n.s, n.l, m + 12, 0.85, 'epiano');
      else if (style === 'battle') {
        note(n.s, n.l, m + 12, 1, 'guitar', { pan: -0.15 });
        // 5〜6小節目（2回目の提示）はツインギター：3度下でハモる
        if (n.s >= 64 && n.s < 96) note(n.s, n.l, this.deg(n.d - 2, T, M) + n.a + 12, 0.7, 'guitar', { pan: 0.45, harm: true });
      }
      else if (style === 'comic') { note(n.s, Math.min(n.l, 1.5), m + 12, 0.95, 'chip'); note(n.s, Math.min(n.l, 2), m + 24, 0.5, 'bell'); }
      else if (style === 'serious') note(n.s, n.l, m + 12, 0.85, 'strings');
      else if (style === 'future') { note(n.s, n.l, m + 12, 0.9, 'supersaw', { cut: 4200, lvl: 2.6 }); note(n.s, Math.min(n.l, 2), m + 24, 0.3, 'bell'); }
      else if (style === 'cyber') { note(n.s, n.l, m + 12, 1, 'guitar', { pan: 0 }); note(n.s, n.l, m, 0.5, 'synlead', { cut: 1600 }); }
      else if (style === 'zzz') { note(n.s, n.l, m + 12, 1.3, 'synlead', { cut: 3600 }); if (n.l >= 4) note(n.s, Math.min(n.l, 4), m, 0.6, 'brass'); }
      else if (style === 'shmup') { note(n.s, n.l, m + 12, 1, 'supersaw', { cut: 6500, lvl: 3 }); note(n.s, Math.min(n.l, 1.5), m + 24, 0.4, 'chip'); }
      else if (style === 'arcade') { note(n.s, n.l, m + 12, 0.95, 'fmlead'); note(n.s, Math.min(n.l, 1.5), m + 24, 0.45, 'chip'); }
      else if (style === 'jazz') { note(n.s, n.l, m + 12, 0.9, 'mute'); if (n.l >= 4) note(n.s, 1, m, 0.25, 'bell'); }
    }
    return { style, bpm: S.bpm, swing: S.swing || 0, swing8: S.swing8 || 0, steps: 128, ev, delayBeats: S.delayBeats, gain: S.gain };
  },

  // ---------- 鳴らす ----------
  _stepSec(song) { return 60 / song.bpm / 4; },
  _time(song, s, t0) {
    const st = this._stepSec(song);
    if (song.swing8) {
      // 8分の跳ね：1拍（16分4つ）の前半を r、後半を 1-r に引き伸ばす（r=2/3 で3連）
      const beat = Math.floor(s / 4), f = (s - beat * 4) / 4, r = song.swing8;
      const g = f < 0.5 ? f * 2 * r : r + (f - 0.5) * 2 * (1 - r);
      return t0 + (beat + g) * 4 * st;
    }
    const sw = (Math.floor(s) % 2 === 1) ? song.swing * st : 0;
    return t0 + s * st + sw;
  },
  _schedule(B, song, t0, from, to) {
    const st = this._stepSec(song);
    for (const e of song.ev) {
      if (e.s < from || e.s >= to) continue;
      const t = this._time(song, e.s, t0);
      this.INST[e.inst](B, t, e.m, Math.max(0.03, e.l * st), e.v, e.o);
    }
  },
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  // ループで鳴らす。onStep(16分の位置) は画面の再生位置の表示に使う
  play(song, onStep) {
    this.stop();
    const c = this.ensure();
    const B = this._B = this.build(c);
    B.master.gain.value *= (song.gain || 1);
    B.songGain = song.gain || 1;
    B.dly.delayTime.value = Math.min(1.4, song.delayBeats * 60 / song.bpm);
    const st = this._stepSec(song), t0 = c.currentTime + 0.08;
    let k = 0;                                   // 次に予約する16分（通しの番号）
    this._song = song;
    const tick = () => {
      const ahead = c.currentTime + 0.25;
      while (t0 + k * st < ahead) {
        const s = k % song.steps, loopT0 = t0 + (k - s) * st;
        this._schedule(B, song, loopT0, s, s + 1);
        k++;
      }
      if (onStep) onStep(Math.max(0, (c.currentTime - t0) / st) % song.steps);
    };
    tick();
    this._timer = setInterval(tick, 30);
  },
  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (this._B) {
      const g = this._B.master.gain, c = this._B.c;
      g.setTargetAtTime(0.0001, c.currentTime, 0.05);
      const old = this._B;
      setTimeout(() => { try { old.master.disconnect(); } catch (e) {} }, 400);
      this._B = null;
    }
  },

  // 書き出して確かめる（ループ1回ぶん＋残響）。{ peak, rms, nan, sec } を返す
  async renderOffline(song, extraSec) {
    const st = this._stepSec(song), sec = song.steps * st + (extraSec || 2);
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const c = new OAC(2, Math.ceil(44100 * sec), 44100);
    const B = this.build(c);
    B.master.gain.value *= (song.gain || 1);
    B.dly.delayTime.value = Math.min(1.4, song.delayBeats * 60 / song.bpm);
    this._schedule(B, song, 0.05, 0, song.steps);
    const buf = await c.startRendering();
    let peak = 0, sum = 0, nan = 0, n = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) { const x = d[i]; if (x !== x) { nan++; continue; } const a = Math.abs(x); if (a > peak) peak = a; sum += x * x; n++; }
    }
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4), nan, sec: +sec.toFixed(1) };
  },
};
