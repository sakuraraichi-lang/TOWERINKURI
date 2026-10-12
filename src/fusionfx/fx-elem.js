// ---------------------------------------------------------------
// fusionfx/fx-elem.js : 合成武器の演出（雷・光線・炎の放射）・2026-10-12 段1で分けた（設計 docs/FUSION-ART-DIRECTION-2026-10-12.md）
//
//   このファイルの受け持ち（8種）：
//     resonator    プラズマボール（済・手本）
//     thunderwhip  航海の悪夢
//     hellmist     爆裂放射器
//     vortex       相反の渦
//     cryobeam     凍結光線
//     convergence  スーパーノヴァ
//     chainstrike  磁気嵐
//     stormcloud   雷雲
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

// プラズマボール（テスラ＋泡）：ガラスの球・中心の電極から放電の筋・球から敵へ太い電撃
const FX_RESONATOR = {
  // プラズマボール：テスラの胴から伸びた2本の電極が、小さなプラズマボールを抱える。後ろに泡の房
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const [x, y, r] of [[-12, -5, 3.6], [-14, 4, 4.4]]) {
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = 'rgba(138,216,255,0.4)'; c.fill();
      c.lineWidth = 1.4; c.strokeStyle = '#8ad8ff'; c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, 7); c.fill();
    }
    c.beginPath(); c.arc(-3, 0, 7.5, 0, 7); c.lineWidth = 2.2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    const mg = c.createRadialGradient(-5, -3, 0.5, -3, 0, 8); mg.addColorStop(0, '#c4cad6'); mg.addColorStop(1, '#4a5060'); c.fillStyle = mg; c.fill();
    c.lineWidth = 1.6; c.strokeStyle = '#b07aff'; c.beginPath(); c.arc(-3, 0, 5, 0, 7); c.stroke();
    for (const s of [-1, 1]) {                                     // 電極（球を左右から抱える）
      c.beginPath(); c.moveTo(1, s * 5); c.quadraticCurveTo(12, s * 13, 21, s * 5.5);
      c.lineWidth = 4.4; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
      c.lineWidth = 2.4; c.strokeStyle = '#a89ad8'; c.stroke();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(21, s * 5.5, 1.3, 0, 7); c.fill();
    }
    const bg = c.createRadialGradient(13, 0, 0, 13, 0, 8);
    bg.addColorStop(0, '#ffb0f4'); bg.addColorStop(0.3, '#8a2ad0'); bg.addColorStop(1, '#1a0630');
    c.beginPath(); c.arc(13, 0, 8, 0, 7); c.fillStyle = bg; c.fill();
    c.strokeStyle = '#ffc8f6'; c.lineWidth = 0.9; c.beginPath();
    for (const a of [0.4, 2.0, 3.5, 5.1]) { c.moveTo(13, 0); c.lineTo(13 + Math.cos(a + 0.4) * 4, Math.sin(a + 0.4) * 4); c.lineTo(13 + Math.cos(a) * 7.6, Math.sin(a) * 7.6); }
    c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(13, 0, 1.6, 0, 7); c.fill();
    c.lineWidth = 1.3; c.strokeStyle = 'rgba(232,214,255,0.9)'; c.beginPath(); c.arc(13, 0, 8, 0, 7); c.stroke();
    c.lineWidth = 1.4; c.strokeStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.arc(13, 0, 6, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
  },
  // ---------- プラズマボール ----------
  //   ガラスの球（作り置き）：back＝球の中（暗い紫・下に台座）／front＝ガラスの縁と光沢（放電の上に重ねる）
  pbSprite(R, part) {
    return FxKit.sprite('fz-pb-' + part + R, R * 1.25, FxKit.res(), c => {
      if (part === 'back') {
        c.fillStyle = '#16101c'; c.beginPath();                                      // 台座（球の下からのぞく）
        c.moveTo(-R * 0.48, R * 0.78); c.lineTo(R * 0.48, R * 0.78); c.lineTo(R * 0.62, R * 1.16); c.lineTo(-R * 0.62, R * 1.16); c.closePath(); c.fill();
        c.fillStyle = '#7a3ad8'; c.fillRect(-R * 0.55, R * 1.02, R * 1.1, R * 0.04);
        // 球の中は塗らない（2026-10-12 本体：暗い塗りで下の道と敵が見えにくい。可読性は演出より優先）。ガラスの厚みは縁の内側の薄い輪だけ
        const g = c.createRadialGradient(0, 0, R * 0.78, 0, 0, R);
        g.addColorStop(0, 'rgba(170,110,255,0)'); g.addColorStop(1, 'rgba(170,110,255,0.22)');
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
      } else {
        c.lineWidth = 1.6; c.strokeStyle = 'rgba(8,0,18,0.7)'; c.beginPath(); c.arc(0, 0, R + 1.8, 0, 7); c.stroke();
        c.lineWidth = 3; c.strokeStyle = 'rgba(232,214,255,0.8)'; c.beginPath(); c.arc(0, 0, R, 0, 7); c.stroke();
        c.lineCap = 'round';
        c.lineWidth = R * 0.075; c.strokeStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(0, 0, R * 0.84, Math.PI * 1.08, Math.PI * 1.42); c.stroke();
        c.lineWidth = 2.2; c.strokeStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.arc(0, 0, R * 0.88, Math.PI * 0.12, Math.PI * 0.4); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.ellipse(-R * 0.3, -R * 0.62, R * 0.07, R * 0.035, -0.5, 0, 7); c.fill();
      }
    });
  },
  _pbT: [],
  plasmaZone(ctx, z) {
    const T = z.t, R0 = z.r, out = FxKit.clamp01((z.dur - T) / 0.3);
    const sc = (T < 0.16 ? 0.55 + 0.45 * FxKit.ease(T / 0.16) : 1) * (0.9 + 0.1 * out), R = R0 * sc, fa = out;
    if (fa <= 0.01) return;
    const back = this.pbSprite(R0, 'back'), front = this.pbSprite(R0, 'front'), hb = back.h * sc;
    ctx.globalAlpha = fa; ctx.drawImage(back.cv, z.x - hb, z.y - hb, hb * 2, hb * 2);
    FxKit.glow(ctx, z.x, z.y, R * 0.32, '#b44aff', 0.45 * fa);
    // 放電の筋：中心の電極から球の内側へ。球の中の敵がいれば、その敵へ筋が伸びる（指が触れた所に筋が寄る、おもちゃの動き）
    const tg = this._pbT; tg.length = 0;
    if (typeof Fusion !== 'undefined' && typeof Grid !== 'undefined') for (const e of Fusion.nearestTo(z.x, z.y, R0 * 0.95, 3)) tg.push(e);
    const n = 7, fr = Math.floor(T * 22), ends = [];
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      let a = i * Math.PI * 2 / n + 0.7 * Math.sin(T * 0.8 + i * 1.7) + 0.35 * Math.sin(T * 2.3 + i * 0.9), len = R * 0.95;
      if (i < tg.length) { const e = tg[i]; a = Math.atan2(e.y - z.y, e.x - z.x); len = Math.min(R * 0.95, Math.hypot(e.x - z.x, e.y - z.y)); }
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let j = 0; j <= 8; j++) {
        const q = j / 8, rr = 7 + (len - 7) * q;
        const off = Math.sin(q * Math.PI) * (5 * Math.sin(q * 6 + T * 8 + i * 2.3) + 7 * (FxKit.h(i * 17 + j, fr) - 0.5));
        const px = z.x + ca * rr - sa * off, py = z.y + sa * rr + ca * off;
        j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        if (j === 8) ends.push(px, py);
      }
    }
    ctx.lineCap = 'butt'; ctx.lineJoin = 'bevel';                                    // 丸い継ぎ目は重い（細い筋なので見た目は変わらない）
    // 3層（外の光・本体・白い芯）。加算（lighter）は重いので、筋は重ねて描くだけ
    ctx.globalAlpha = 0.25 * fa; ctx.strokeStyle = '#b050ff'; ctx.lineWidth = 6; ctx.stroke();
    ctx.globalAlpha = 0.95 * fa; ctx.strokeStyle = '#ff7ae6'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.globalAlpha = 0.95 * fa; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';                                          // 光はまとめて加算で
    for (let i = 0; i < ends.length; i += 2) FxKit.glow(ctx, ends[i], ends[i + 1], 10, '#ff9af0', 0.9 * fa);   // 筋が触れた所が明るい
    FxKit.glow(ctx, z.x, z.y, 18, '#e090ff', 0.85 * fa);                                // 中心の電極
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fa; ctx.fillStyle = '#ffeefe'; ctx.beginPath(); ctx.arc(z.x, z.y, 5.5 * sc, 0, 7); ctx.fill();
    const hf = front.h * sc;
    ctx.globalAlpha = fa; ctx.drawImage(front.cv, z.x - hf, z.y - hf, hf * 2, hf * 2);
    ctx.globalAlpha = 1;
    FxKit.flash(ctx, z.x, z.y, R0 * 0.9, T, '#d070ff', 0.12);                          // 出た瞬間
    FxKit.hexWave(ctx, z.x, z.y, R0 * 1.18, T / 0.4, '#c07aff', 4);
    if (out < 1) FxKit.hexWave(ctx, z.x, z.y, R0 * 1.3, 1 - out, '#e6d0ff', 3);         // 消えるとき
  },
  // 球から敵へ飛ぶ電撃（太い3層のジグザグ・当たった所に閃光と火花）。f.pts[0] は球の中心・f.r0 は球の半径。
  //   鎖の全部の区間を1本の折れ線にして、3層を1回ずつ描く（区間ごとに描くと線の回数が増えて重い）
  zap(ctx, f, k) {
    const T = k * f.life, a = 1 - k * 0.7, pts = f.pts, fr = Math.floor(T * 40), seed = f.seed || 0, all = [];
    for (let i = 0; i < pts.length - 1; i++) {
      let p = pts[i];
      const q = pts[i + 1];
      if (i === 0 && f.r0) {                                                            // 球の中心からではなく、球の表面（中の敵なら電極のそば）から
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1, s = d > f.r0 ? f.r0 * 0.96 : 8;
        p = { x: p.x + dx / d * s, y: p.y + dy / d * s };
      }
      const L = Math.hypot(q.x - p.x, q.y - p.y);
      const J = FxKit.jag(p.x, p.y, q.x, q.y, Math.max(3, Math.min(6, Math.round(L / 18))), Math.min(12, L * 0.14), seed + i * 7 + fr);
      for (let j = all.length ? 1 : 0; j < J.length; j++) all.push(J[j]);
    }
    FxKit.beam(ctx, c => FxKit.poly(c, all), 6 * (1 - k * 0.5) + 1, '#f0b8ff', a, '#b048ff');
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < pts.length; i++) {
      const q = pts[i];
      FxKit.flash(ctx, q.x, q.y, 24, T, '#d070ff', 0.09);
      FxKit.glow(ctx, q.x, q.y, 14, '#d070ff', 0.6 * (1 - k));
      FxKit.sparks(ctx, { x: q.x, y: q.y, t: T, seed: seed + i * 13, n: 4, life: 0.2, v: 220, drag: 7, size: 2.8, c0: '#ffffff', c1: '#c070ff' });
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  fx: { zap(ctx, f, k) { this.zap(ctx, f, k); } },
  zones: { plasmaball(ctx, z) { this.plasmaZone(ctx, z); } },
};
FusionFX.register('resonator', FX_RESONATOR);

