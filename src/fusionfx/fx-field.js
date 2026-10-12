// ---------------------------------------------------------------
// fusionfx/fx-field.js : 合成武器の演出（場・落ちる弾・爆発）・2026-10-12 段1で分けた（設計 docs/FUSION-ART-DIRECTION-2026-10-12.md）
//
//   このファイルの受け持ち（8種）：
//     voidblade    異界の剣（済・手本）
//     abyssnet     狂気の海底
//     napalm       ヴォルケイノブラスト
//     icefoam      永久凍土
//     carpet       滅尽嵐
//     acidfoam     王水
//     toxmortar    破滅の雨
//     icebomb      スノーグレイブ
//
//   書き方：合成武器ごとに1つの物を作り、FusionFX.register(合成の id, 物) で登録する。物に書けるもの（どれも省ける）：
//     turret(c)                 砲台の絵（作り置き。+x が砲身の向き・およそ ±20。FusionFX.turretSprite が 1.2 倍して描く）
//     bullets: { 形: fn(ctx, b, t, run) }   弾の形（fusion.js が spawnBullet に渡す fx の名前）
//     lobs:    { 形: fn(ctx, b, by, br, run) }   落ちてくる弾（spawnLob の fx）
//     fx:      { 名前: fn(ctx, f, k, R) }  一度きりの演出（Fusion.fx(run, { k: 名前, … }) の k。k は 0〜1）
//     zones:   { 種類: fn(ctx, z, run) }   居座る場（Fusion.zone の kind）。敵の下に描く
//     over:    { 種類: fn(ctx, z, run) }   同じ場の、敵の上に描く部分
//   fn の this は登録した物（物の中に道具を置ける）。描く前後の ctx.save/restore は FusionFX がやる。
//   **名前（形・k・kind）は全体で1つ。**同じ名前を2回登録すると、読み込みのときに警告が出る。
//   部品は src/fxkit.js（光・粒・六角の衝撃波・閃光・3層の線・帯・角の丸い星）。shadowBlur は毎フレーム使わない。乱数（Math.random）を使わない
//   （確認室の見本の部屋で時刻を止めて見るため。時間は f.t・z.t・run.time だけで決める）。
//   当たり・ダメージ・挙動は fusion.js。ここは絵だけ。作ったら確認室の「見本の部屋」で4つの時刻を見る。
// ---------------------------------------------------------------
'use strict';

// 異界の剣（刀＋触手）：斬撃の軌跡そのものが黒紫の裂け目になり、裂け目から太い触手が突き出す
const FX_VOIDBLADE = {
  // 異界の剣：紫の巻きの柄と、裂け目の印の鍔、反った刃に桃色の触手が巻きつく
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.rect(-17, -2.6, 12, 5.2); c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke(); c.fillStyle = '#1c1424'; c.fill();
    c.strokeStyle = '#9a4ae0'; c.lineWidth = 1.2; c.beginPath();
    for (let x = -16; x < -6; x += 3) { c.moveTo(x, -2.4); c.lineTo(x + 2, 2.4); }
    c.stroke();
    const yc = x => -5.2 * Math.sin(((x + 4) / 32) * Math.PI * 0.5) + 0.2;
    c.beginPath(); c.moveTo(-4, -2.8); c.quadraticCurveTo(11, -8.6, 28, -5.6); c.quadraticCurveTo(12, -0.4, -4, 3); c.closePath();
    c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    const g = c.createLinearGradient(0, -6, 0, 2); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#a898cc'); c.fillStyle = g; c.fill();
    c.strokeStyle = '#ff4ad8'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-3, -3); c.quadraticCurveTo(11, -8.4, 27.4, -5.7); c.stroke();
    // 触手：刃の根元に、なめらかに1回半巻きつく（先は刃の上で細る）。刃の先は空けて、刀の形を読ませる
    const pts = [];
    for (let x = -2; x <= 14; x += 0.5) pts.push({ x, y: yc(x) + Math.sin((x + 2) * 0.55) * 3.8 });
    FxKit.ribbon(c, pts, q => 3.4 * (1 - q * 0.75) + 1.6); c.fillStyle = '#16031a'; c.fill();
    FxKit.ribbon(c, pts, q => 3.4 * (1 - q * 0.75)); c.fillStyle = '#d05aa8'; c.fill();
    c.fillStyle = '#ffd6ea';
    for (const i of [4, 12, 20, 28]) { const p = pts[i]; c.beginPath(); c.arc(p.x, p.y, 0.7, 0, 7); c.fill(); }
    // 鍔：暗い紫のレンズに赤紫の縁（裂け目の印）
    c.beginPath(); c.ellipse(-4.5, 0, 2.6, 6.4, 0, 0, 7); c.fillStyle = '#0a0214'; c.fill();
    c.lineWidth = 1.6; c.strokeStyle = '#ff3dbb'; c.stroke();
    c.fillStyle = '#d8b8ff'; c.fillRect(-5, -2, 1, 1); c.fillRect(-4.4, 1.6, 0.9, 0.9);
  },
  // ---------- 異界の剣 ----------
  //   斬撃と裂け目は同じ曲線（場の向き z.a の横に長い・少し傾けて弓なり）。s は -1〜1（裂け目の端から端）
  riftGeo(z) { return { L: z.hh * 0.9, x0: z.hw * 0.24, bow: z.hw * 0.2, Wm: Math.min(z.hw * 0.46, 28) }; },
  riftPt(g, s) { return { x: g.x0 * s + g.bow * (1 - s * s), y: g.L * s }; },
  riftSeed(z) { return z.seed !== undefined ? z.seed : Math.abs(Math.round(z.x * 0.13 + z.y * 0.07)) % 97; },
  // 斬撃：白い太い斬撃が端から端へ走る（0.07秒）→ 細って消える。中心に閃光と六角の衝撃波・前へ飛ぶ破片
  voidSlash(ctx, f, k) {
    const T = k * f.life, g = this.riftGeo(f), seed = f.seed || 0;
    ctx.translate(f.x, f.y); ctx.rotate(f.a);
    const sh = -1 + 2 * Math.min(1, T / 0.07), st = -1 + 2 * FxKit.clamp01((T - 0.05) / 0.14);
    if (sh - st > 0.02) {
      const pts = [], N = 18;
      for (let i = 0; i <= N; i++) pts.push(this.riftPt(g, st + (sh - st) * i / N));
      const W = 16 * (1 - FxKit.clamp01((T - 0.08) / 0.12) * 0.5);
      const wd = (m) => q => m * Math.pow(Math.sin(Math.PI * Math.min(1, q * 0.9 + 0.05)), 0.55) * (0.55 + 0.45 * q);   // 頭（進む先）が太い
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#b25cff'; FxKit.ribbon(ctx, pts, wd(W * 2.6)); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.95; ctx.fillStyle = '#efe2ff'; FxKit.ribbon(ctx, pts, wd(W)); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; FxKit.ribbon(ctx, pts, wd(W * 0.36)); ctx.fill();
    }
    FxKit.flash(ctx, 0, 0, g.L * 0.55, T - 0.03, '#d070ff', 0.1);
    FxKit.hexWave(ctx, 0, 0, g.L * 0.75, (T - 0.02) / 0.4, '#d070ff', 4);
    for (let j = 0; j < 3; j++) {
      const p = this.riftPt(g, -0.6 + j * 0.6);
      FxKit.sparks(ctx, { x: p.x, y: p.y, t: T - 0.03, seed: seed + j * 11, n: 5, life: 0.35, a: 0, spread: 1.8, v: 260, drag: 6, size: 3.4, shape: 'shard', c0: '#ffffff', c1: '#d070ff' });
    }
  },
  // 裂け目の開き具合（0〜1）と、閉じかけ（1→0）
  riftOpen(z) {
    const T = z.t, close = FxKit.clamp01((z.dur - T) / 0.4);
    return { o: FxKit.ease((T - 0.05) / 0.17) * FxKit.ease(close), close };
  },
  // 裂け目（盤の上・敵の下）：黒紫の奥行き・中に星の粒・赤紫に光る縁。閉じるとき縁が光って消える
  riftZone(ctx, z) {
    const g = this.riftGeo(z), seed = this.riftSeed(z), T = z.t, R = this.riftOpen(z), o = R.o;
    if (o <= 0.01) return;
    ctx.translate(z.x, z.y); ctx.rotate(z.a);
    const N = 22, Lp = [], Rp = [];
    for (let i = 0; i <= N; i++) {
      const s = -1 + 2 * i / N, c = this.riftPt(g, s);
      const dx = g.x0 - 2 * g.bow * s, dy = g.L, nl = Math.hypot(dx, dy), nx = dy / nl, ny = -dx / nl;
      const w = g.Wm * o * Math.pow(1 - s * s, 0.65) * (0.78 + 0.44 * FxKit.h(i, seed)) + Math.sin(T * 3 + i) * 0.6 * o;
      const j1 = (FxKit.h(i + 40, seed) - 0.5) * 4 * o, j2 = (FxKit.h(i + 70, seed) - 0.5) * 4 * o;
      Lp.push({ x: c.x - nx * (w / 2 + j1), y: c.y - ny * (w / 2 + j1) }); Rp.push({ x: c.x + nx * (w / 2 + j2), y: c.y + ny * (w / 2 + j2) });
    }
    const path = () => { ctx.beginPath(); ctx.moveTo(Lp[0].x, Lp[0].y); for (let i = 1; i <= N; i++) ctx.lineTo(Lp[i].x, Lp[i].y); for (let i = N; i >= 0; i--) ctx.lineTo(Rp[i].x, Rp[i].y); ctx.closePath(); };
    ctx.lineJoin = 'miter'; ctx.miterLimit = 3;                                                   // 丸い継ぎ目は重い。裂けた縁は角が立っていてよい
    path();
    ctx.globalAlpha = 0.3; ctx.strokeStyle = '#ff2a8a'; ctx.lineWidth = 8; ctx.stroke();            // 外の光（加算は重いので重ねるだけ・2026-10-12）
    ctx.globalAlpha = 0.95; ctx.fillStyle = '#07010f'; ctx.fill();                                   // 裂け目の奥
    // 中は切り抜き（clip）を使わない（clip は重い）。光と粒を、裂け目の幅の内側に収まる大きさ・位置で置く
    ctx.save();
    for (const s of [-0.45, 0, 0.45]) { const p = this.riftPt(g, s); FxKit.glow(ctx, p.x, p.y, g.Wm * o * Math.pow(1 - s * s, 0.65) * 0.9, '#7a24c8', 0.7); }   // 奥行き：深い紫
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < 16; j++) {                                                                   // 星のような粒
      const s = FxKit.h(j, seed + 3) * 1.8 - 0.9, p = this.riftPt(g, s), across = (FxKit.h(j + 9, seed) - 0.5) * g.Wm * o * 0.7 * Math.pow(1 - s * s, 0.65);
      const tw = 0.5 + 0.5 * Math.sin(T * 7 + j * 1.9), sz = 1.2 + 1.6 * FxKit.h(j + 20, seed);
      ctx.globalAlpha = tw * o; ctx.fillStyle = j % 3 ? '#d8b8ff' : '#ffffff';
      ctx.fillRect(p.x + across - sz / 2, p.y + Math.sin(T * 0.8 + j) * 2 - sz / 2, sz, sz);
    }
    ctx.restore();
    ctx.globalAlpha = 1; path();
    ctx.strokeStyle = '#ff3dbb'; ctx.lineWidth = 3.4; ctx.stroke();                                  // 縁（赤紫）
    ctx.strokeStyle = '#ffd6f2'; ctx.lineWidth = 1.3; ctx.stroke();                                  // 縁の芯
    if (R.close < 1) {                                                                               // 閉じるとき縁が光る
      const b = 1 - R.close;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = b * 0.85;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 + 5 * b; ctx.stroke();
      FxKit.glow(ctx, g.bow, 0, g.L * 0.5 * b + 10, '#ff5ad0', b * 0.5);
    }
  },
  // 裂け目から突き出す太い触手（敵の上に描く）：根元は裂け目の奥の色・太さ17px から先へ細く・吸盤・ぬめりのハイライト
  riftTentacles(ctx, z) {
    const g = this.riftGeo(z), seed = this.riftSeed(z), T = z.t, R = this.riftOpen(z);
    ctx.translate(z.x, z.y); ctx.rotate(z.a);
    const base = [-0.5, 0.06, 0.55], th = [-0.6, 0.08, 0.62];
    for (let k = 0; k < 3; k++) {
      const e = FxKit.ease((T - 0.14 - k * 0.06) / 0.32) * FxKit.ease(R.close / 0.9);
      if (e <= 0.01) continue;
      const s0 = base[k] + (FxKit.h(k, seed) - 0.5) * 0.16, p0 = this.riftPt(g, s0);
      const Lt = (70 + 20 * FxKit.h(k + 3, seed)) * e, N = 16, curl = (k % 2 ? 1 : -1) * 1.5 * (0.75 + 0.25 * Math.sin(T * 2 + k));
      const pts = [];
      let x = p0.x, y = p0.y;
      for (let j = 0; j <= N; j++) {
        const q = j / N;
        pts.push({ x, y });
        // うねり（S字）は根元から先へ大きく、先だけ丸まる（三日月の角に見えないように）
        const tq = Math.max(0, (q - 0.62) / 0.38);
        const ang = th[k] + (FxKit.h(k + 7, seed) - 0.5) * 0.3 + Math.sin(q * 5.5 - T * 4 + k * 2) * 0.55 * q + curl * tq * tq;
        x += Math.cos(ang) * Lt / N; y += Math.sin(ang) * Lt / N;
      }
      const wd = q => 1.6 + 15.5 * (1 - Math.pow(q, 1.7)) * (0.6 + 0.4 * e);
      FxKit.ribbon(ctx, pts, q => wd(q) + 2.2); ctx.globalAlpha = 0.95; ctx.fillStyle = '#16031a'; ctx.fill();   // 縁取り
      const tip = pts[N], gr = ctx.createLinearGradient(p0.x, p0.y, tip.x, tip.y);
      gr.addColorStop(0, '#3a0c40'); gr.addColorStop(0.1, '#9a2c7c'); gr.addColorStop(0.6, '#e2559e'); gr.addColorStop(1, '#ffb0d8');
      FxKit.ribbon(ctx, pts, wd); ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fill();
      // 吸盤（下の側）とぬめり（上の側）
      const nrm = (j) => { const a = pts[Math.max(0, j - 1)], b = pts[Math.min(N, j + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }; };
      const SQ = [0.14, 0.28, 0.42, 0.56, 0.7, 0.82];
      for (const [col, kr] of [['#ffd6ea', 1], ['#a8336e', 0.45]]) {
        ctx.beginPath();
        for (const q of SQ) {
          const j = Math.round(q * N), p = pts[j], n = nrm(j), w = wd(q), rr = Math.max(1, w * 0.2) * kr;
          const sx = p.x - n.x * w * 0.24, sy = p.y - n.y * w * 0.24;
          ctx.moveTo(sx + rr, sy); ctx.arc(sx, sy, rr, 0, 7);
        }
        ctx.fillStyle = col; ctx.fill();
      }
      ctx.globalAlpha = 0.6; ctx.strokeStyle = '#ffe8f4'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let j = 2; j <= Math.round(N * 0.8); j++) { const p = pts[j], n = nrm(j), w = wd(j / N) * 0.24; ctx[j > 2 ? 'lineTo' : 'moveTo'](p.x + n.x * w, p.y + n.y * w); }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  },

  fx: { voidslash(ctx, f, k) { this.voidSlash(ctx, f, k); } },
  zones: { rift(ctx, z) { this.riftZone(ctx, z); } },
  over: { rift(ctx, z) { this.riftTentacles(ctx, z); } },
};
FusionFX.register('voidblade', FX_VOIDBLADE);

