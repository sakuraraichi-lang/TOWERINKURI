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
//   motif の形：{ notes: [[度数, 開始(16分), 長さ(16分)], …]（2小節＝32）, h: [1小節目の和音の根の度数, 2小節目] }
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
    // ---- 打楽器（m は使わない）----
    kick(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0, 0);
      const os = c.createOscillator(), g = c.createGain();
      os.frequency.setValueAtTime(o.kickHz || 140, t); os.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      os.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9 * v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + (o.kickLen || 0.32));
      os.start(t); os.stop(t + 0.4);
    },
    snare(B, t, m, d, v, o) {
      const c = B.c, out = Music._bus(B, o.dest, 0.18, 0);
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
      for (const [d, s, l] of notes) if (!filter || filter(s)) out.push({ d: d + dDeg, s: s + offStep, l });
    };
    add(motif.notes, 0, 0);
    add(motif.notes, 2, 32);
    add(motif.notes, 0, 64);
    add(motif.notes, 0, 96, s => s < 16);
    out.push({ d: 0, s: 96 + 16, l: 14 });
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

  STYLES: {
    // ホーム：喫茶店のリラックス（エレピ・ブラシ・丸いベース・揺れる16分）
    home: { label: 'ホーム', bpm: 84, swing: 0.18, tonic: 62, mode: 'major', delayBeats: 0.75, gain: 0.6 },
    // 戦闘：PC-88 の FM（速い・短調・オクターブで跳ねるベース・16分のハイハット）
    battle: { label: '戦闘', bpm: 152, swing: 0, tonic: 57, mode: 'minor', delayBeats: 0.75, gain: 1 },
    // コミカル：跳ねる長調・スタッカート・ズンチャ
    comic: { label: 'コミカル', bpm: 128, swing: 0.12, tonic: 60, mode: 'major', delayBeats: 0.5, gain: 0.9 },
    // シリアス：遅い・フリジア・低い弦と太鼓
    serious: { label: 'シリアス', bpm: 66, swing: 0, tonic: 50, mode: 'phrygian', delayBeats: 1, gain: 0.8 },
    // モチーフだけ
    plain: { label: 'モチーフだけ', bpm: 100, swing: 0, tonic: 57, mode: 'minor', delayBeats: 0.5, gain: 1 },
  },

  // 1ループぶんの音符の一覧：{ s（16分の位置）, l（長さ16分）, m（MIDI）, v, inst, o }
  arrange(motif, style) {
    const S = this.STYLES[style], T = S.tonic, M = S.mode, ev = [];
    const mel = this._melody(motif), roots = this._roots(motif);
    const note = (s, l, m, v, inst, o) => ev.push({ s, l, m, v, inst, o: o || {} });
    if (style === 'plain') {
      for (const n of motif.notes) note(n[1], n[2], this.deg(n[0], T, M) + 12, 0.9, 'plain');
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
        // ベース：8分でオクターブを跳ねる（FM）
        const root = this.deg(r, T, M) - 12;
        for (let q = 0; q < 16; q += 2) note(b0 + q, 2, root + (q % 4 === 2 ? 12 : 0), 0.85, 'fmbass');
        // アルペジオ（チップ・16分）
        const ch = this._chord(r, 3, T, M, 69);
        for (let q = 0; q < 16; q++) note(b0 + q, 1, ch[q % 3] + (q % 6 >= 3 ? 12 : 0), 0.45, 'chip');
        // ドラム
        note(b0, 1, 0, 1, 'kick'); note(b0 + 6, 1, 0, 0.8, 'kick'); note(b0 + 8, 1, 0, 1, 'kick'); note(b0 + 11, 1, 0, 0.7, 'kick');
        note(b0 + 4, 1, 0, 1, 'snare'); note(b0 + 12, 1, 0, 1, 'snare');
        for (let q = 0; q < 16; q++) note(b0 + q, 1, 0, q % 2 ? 0.45 : 0.8, 'hat');
        if (bar === 0 || bar === 4) note(b0, 1, 0, 0.9, 'crash');
        note(b0, 16, this._chord(r, 1, T, M, 64)[0], 0.6, 'pad', { padCut: 1800 });
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
      }
    }
    // 旋律
    for (const n of mel) {
      const m = this.deg(n.d, T, M);
      if (style === 'home') note(n.s, n.l, m + 12, 0.85, 'epiano');
      else if (style === 'battle') { note(n.s, n.l, m + 12, 0.95, 'fmlead'); }
      else if (style === 'comic') { note(n.s, Math.min(n.l, 1.5), m + 12, 0.95, 'chip'); note(n.s, Math.min(n.l, 2), m + 24, 0.5, 'bell'); }
      else if (style === 'serious') note(n.s, n.l, m + 12, 0.85, 'strings');
    }
    return { style, bpm: S.bpm, swing: S.swing, steps: 128, ev, delayBeats: S.delayBeats, gain: S.gain };
  },

  // ---------- 鳴らす ----------
  _stepSec(song) { return 60 / song.bpm / 4; },
  _time(song, s, t0) {
    const st = this._stepSec(song);
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
