// ---------------------------------------------------------------
// fusionfx/fx-elem.js : 合成武器の演出（雷・光線・炎の放射）・2026-10-12 段1で分けた（設計 docs/FUSION-ART-DIRECTION-2026-10-12.md）
//
//   このファイルの受け持ち（8種）：
//     resonator    プラズマボール（済・手本）
//     thunderwhip  航海の悪夢（段2・1013 作り直し）：立ち上がる雷の竜巻（FxKit.tornado・雷雲の傘・胴を走る稲妻・足元の土煙・掴んだ敵に絡む触手）
//     hellmist     爆裂放射器（fx2）：火炎放射器と同じく吹き続ける炎（橙から毒の緑へ）・炎の線に沿って連鎖する火球・毒の煙
//     vortex       相反の渦（fx3）：射程いっぱいの地面の渦（氷と炎の太い腕・内へ流れる破片と火の粉・中心の目で蒸気が爆ぜる）・凍った敵が炎の腕に入ると熱衝撃で砕ける
//     cryobeam     凍結光線（段2）：青白い太い光線と霜の結晶・反射した所に透き通った氷の棘山
//     convergence  スーパーノヴァ（段2）：道1本分の太さの光の奔流（流れる模様と粒）・反射の角の閃光・多段ヒットの光
//     chainstrike  磁気嵐（段2）：帯電したミサイル・着弾点に渦巻く嵐と磁力線の輪・稲妻
//     stormcloud   雷雲（段2）：毒の緑を帯びた厚い雲（揺れる縁・中で光る・毒の雨）・枝分かれする太い落雷
//
//   段2の7種は、Combat が出す演出（光線 'laser'・爆発 'boom'）を Fusion.reskin で合成の演出に差し替えて描くものがある（当たりは変えない）。
//   見本の部屋の「4つの時刻」と的の並べ方は、このファイルの末尾（SR_ELEM）で DebugRoom.SR に足す。
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
    if (typeof Fusion !== 'undefined' && typeof Grid !== 'undefined') for (const e of Fusion.nearestTo(z.x, z.y, R0 * 0.95, 7)) tg.push(e);
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


// ===============================================================
// 段2（2026-10-12）：雷・光線・炎の7種。共通の道具
// ===============================================================
const FXE = {
  _all: [],
  // 電撃の鎖（Fusion.chainFrom の fxk）：太い3層のジグザグ・跳んだ先に閃光と火花。鎖の全部の区間を1本の折れ線にして3層を1回ずつ
  //   o: { w 太さ, body 本体の色, glow 外光の色, hit 跳んだ先の色, lift 最初の点を上へ持ち上げる px, amp 振れ幅 }
  chain(ctx, f, k, o) {
    const T = k * f.life, a = 1 - k * 0.7, pts = f.pts, fr = Math.floor(T * 40), seed = f.seed || 0, all = this._all;
    all.length = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], px = p.x, py = p.y - (i === 0 && o.lift ? o.lift : 0);
      const L = Math.hypot(q.x - px, q.y - py);
      const J = FxKit.jag(px, py, q.x, q.y, Math.max(3, Math.min(7, Math.round(L / 16))), Math.min(o.amp || 12, L * 0.16), seed + i * 7 + fr);
      for (let j = all.length ? 1 : 0; j < J.length; j++) all.push(J[j]);
    }
    FxKit.beam(ctx, c => FxKit.poly(c, all), o.w * (1 - k * 0.5) + 1, o.body, a, o.glow);
    ctx.globalCompositeOperation = 'lighter';
    if (o.lift) FxKit.glow(ctx, pts[0].x, pts[0].y - o.lift, 20, o.glow, 0.8 * (1 - k));
    for (let i = 1; i < pts.length; i++) {
      const q = pts[i];
      FxKit.flash(ctx, q.x, q.y, 24, T, o.hit, 0.09);
      FxKit.glow(ctx, q.x, q.y, 14, o.hit, 0.6 * (1 - k));
      FxKit.sparks(ctx, { x: q.x, y: q.y, t: T, seed: seed + i * 13, n: 4, life: 0.2, v: 220, drag: 7, size: 2.8, c0: '#ffffff', c1: o.hit });
    }
    ctx.globalCompositeOperation = 'source-over';
  },
  // 吹き続ける放射の1枚（爆裂放射器・相反の渦）。毎秒十数枚が重なって途切れない流れになるので、1枚は軽く・閃光を持たない（点滅になる）。
  //   形の主役は「炎の舌」（作り置きの涙形・FXE.tongue）を扇に並べたもの。舌の先に別の色の舌（毒の緑など）を重ね、流れる塊で揺らぎを足す。
  //   f: { x, y, a 向き, arc 扇の半角, r 長さ, life, seed }。o: { pal 舌の色, far 先の舌の色（省ける）, nT 舌の数, puff 根元の塊・puffFar 先の塊（FxKit.sprite・半径32）,
  //      nP 塊の数, alpha, glow 撃ち口の光の色, wob 揺れの強さ }
  stream(ctx, f, k, o) {
    const T = k * f.life, r = Math.min(f.r, 300), seed = f.seed || 0, grow = FxKit.ease(Math.min(1, T / 0.07)), fade = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
    const A = this.tongue(o.pal), B = o.far ? this.tongue(o.far) : null, C = this.tongue('core'), nT = o.nT || 4;
    ctx.globalCompositeOperation = 'lighter';
    ctx.save(); ctx.translate(f.x, f.y);
    let rot = 0;
    for (let i = 0; i < nT; i++) {
      const t = nT > 1 ? i / (nT - 1) * 2 - 1 : 0, h = FxKit.h(i, seed), h2 = FxKit.h(i + 9, seed);
      const an = f.a + t * f.arc * 0.62 + (h - 0.5) * 0.1 + Math.sin(T * 20 + i * 2.1) * 0.03 * (o.wob || 1);
      const len = r * (1 - Math.abs(t) * 0.22) * (0.84 + 0.22 * h2) * grow * (0.92 + 0.16 * k), H = len * (0.17 + 0.05 * h);
      ctx.rotate(an - rot); rot = an;
      ctx.globalAlpha = o.alpha * fade;
      if (B) { ctx.drawImage(A.cv, 6, -H * 0.85, len * 0.72, H * 1.7); ctx.drawImage(B.cv, len * 0.3, -H, len * 0.78, H * 2); }
      else ctx.drawImage(A.cv, 6, -H, len, H * 2);
      if (i === (nT >> 1)) { ctx.globalAlpha = 0.45 * fade; ctx.drawImage(C.cv, 4, -H * 0.4, len * 0.42, H * 0.8); }
    }
    ctx.restore(); ctx.globalCompositeOperation = 'lighter';
    // 流れる塊（根元から先へ・揺らぎ）
    const nP = o.nP || 5;
    for (let j = 0; j < nP; j++) {
      const h1 = FxKit.h(j + 20, seed), h2 = FxKit.h(j + 40, seed), age = T - h1 * 0.04;
      if (age <= 0) continue;
      const q = Math.min(1, age / (0.2 * (0.8 + 0.4 * h1))), d = 14 + (r - 14) * q, an = f.a + (h2 * 2 - 1) * f.arc * 0.8;
      const px = f.x + Math.cos(an) * d, py = f.y + Math.sin(an) * d, S = q < 0.5 || !o.puffFar ? o.puff : o.puffFar;
      this.putS(ctx, S, px, py, 8 + 22 * q, o.alpha * 0.8 * fade * (1 - 0.4 * q));
    }
    FxKit.glow(ctx, f.x + Math.cos(f.a) * 16, f.y + Math.sin(f.a) * 16, 24, o.glow, 0.4 * fade);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  // 炎の舌（作り置き）：左端（根元）から右へ伸びる涙形。3重に塗って縁をぼかす。pal＝fire（白→黄→橙→赤）／tox（淡黄→黄緑→緑）／ice（白→水色→青）／core（白い芯）
  tongue(pal) {
    const P = { fire: ['255,252,230', '255,214,110', '255,128,36', '200,48,18'], tox: ['246,255,200', '214,240,80', '130,200,40', '50,110,20'],
      ice: ['255,255,255', '200,244,255', '110,196,255', '40,100,220'], core: ['255,255,255', '255,255,245', '255,250,220', '255,240,200'] }[pal];
    return FxKit.sprite('fz-tongue-' + pal, 64, FxKit.res(), c => {
      c.setTransform(c.getTransform().a, 0, 0, c.getTransform().d, 0, c.getTransform().f);   // 原点を左端の真ん中へ（幅128・高さ±64）
      for (const [wk, al] of [[1, 0.35], [0.72, 0.6], [0.45, 1]]) {
        const g = c.createLinearGradient(0, 0, 128, 0);
        g.addColorStop(0, 'rgba(' + P[0] + ',' + al + ')'); g.addColorStop(0.3, 'rgba(' + P[1] + ',' + (al * 0.95) + ')');
        g.addColorStop(0.62, 'rgba(' + P[2] + ',' + (al * 0.7) + ')'); g.addColorStop(0.88, 'rgba(' + P[3] + ',' + (al * 0.3) + ')'); g.addColorStop(1, 'rgba(' + P[3] + ',0)');
        c.fillStyle = g;
        const W = 60 * wk;
        c.beginPath(); c.moveTo(0, 0);
        c.bezierCurveTo(20, -W * 0.5, 60, -W, 96, -W * 0.8); c.bezierCurveTo(118, -W * 0.6, 128, -W * 0.2, 128, 0);
        c.bezierCurveTo(128, W * 0.2, 118, W * 0.6, 96, W * 0.8); c.bezierCurveTo(60, W, 20, W * 0.5, 0, 0);
        c.fill();
      }
    });
  },
  putS(ctx, S, x, y, r, a) { if (a <= 0.004 || r <= 0.5) return; ctx.globalAlpha = a > 1 ? 1 : a; ctx.drawImage(S.cv, x - r, y - r, r * 2, r * 2); },
  // 少し行き過ぎて戻る伸び（0〜1 → 0〜1。途中で 1 を少し超える）
  back(q) { q = FxKit.clamp01(q) - 1; return 1 + 2.7 * q * q * q + 1.7 * q * q; },
  // 砲台の部品：金属の塗り（上が明るい）と黒い縁
  metal(c, y0, y1, hi, lo) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, hi || '#c4cad6'); g.addColorStop(1, lo || '#4f5664'); return g; },
  edge(c, lw) { c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = lw || 2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke(); },
  ball(c, x, y, r, c0, c1, c2) {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.2, x, y, r);
    g.addColorStop(0, c0); g.addColorStop(0.45, c1); g.addColorStop(1, c2);
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = g; c.fill();
  },
  // 決まった時刻の Game.run の時間（見本の部屋でも本番でも同じ）
  now() { return typeof Game !== 'undefined' && Game.run ? Game.run.time : 0; },
  // 折れ線の長さ（区間ごと）を out に入れて合計を返す
  lens(pts, out) { out.length = 0; let L = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); out.push(d); L += d; } return L; },
};

// ---------------------------------------------------------------
// 航海の悪夢（触手＋テスラ）：雷を纏った竜巻。足元の渦（敵の下）・巻き上がる風の帯と中を走る稲妻・掴んだ敵に絡みつく触手（敵の上）
// ---------------------------------------------------------------
const FX_THUNDERWHIP = {
  // 砲台：テスラの丸い胴から、電気のコイルを巻いた太い触手が前へうねり、先に紫の電極の玉
  turret(c) {
    for (const s of [-1, 1]) {                                          // 後ろの電極の脚
      c.beginPath(); c.moveTo(-8, s * 4); c.lineTo(-17, s * 10); c.lineTo(-15, s * 12.5); c.lineTo(-6, s * 7); c.closePath();
      FXE.edge(c, 2); c.fillStyle = '#7a6ac8'; c.fill();
      c.fillStyle = '#e6dcff'; c.beginPath(); c.arc(-16, s * 11.2, 1.4, 0, 7); c.fill();
    }
    c.beginPath(); c.arc(-6, 0, 8.5, 0, 7); FXE.edge(c, 2.4); c.fillStyle = FXE.metal(c, -8, 8); c.fill();
    c.lineWidth = 1.6; c.strokeStyle = '#a890ff'; c.beginPath(); c.arc(-6, 0, 5.6, 0, 7); c.stroke();
    // 触手（根元が太く先が細い・うねる）
    const P = [];
    for (let i = 0; i <= 12; i++) { const q = i / 12, x = -2 + 22 * q; P.push({ x, y: Math.sin(q * 5.2 + 0.6) * 4.2 * (0.4 + q) }); }
    FxKit.ribbon(c, P, q => 9 - 5.5 * q); FXE.edge(c, 2.4);
    const tg = c.createLinearGradient(0, -6, 0, 6); tg.addColorStop(0, '#b47ae8'); tg.addColorStop(1, '#5a2a90');
    c.fillStyle = tg; c.fill();
    c.fillStyle = '#ffd0f0';
    for (const i of [3, 6, 9]) { c.beginPath(); c.arc(P[i].x, P[i].y + 2.2 - i * 0.08, 1.1, 0, 7); c.fill(); }
    c.lineWidth = 1.1; c.strokeStyle = '#e6dcff'; c.beginPath();                // 巻きついた電気のコイル
    for (let i = 1; i < 12; i++) { const p = P[i], s = i % 2 ? -1 : 1; c[i > 1 ? 'lineTo' : 'moveTo'](p.x, p.y + s * (4.4 - i * 0.22)); }
    c.stroke();
    FXE.ball(c, P[12].x + 1, P[12].y, 4.2, '#ffffff', '#c09aff', '#4a2a8a');
    c.lineWidth = 0.9; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(P[12].x + 1, P[12].y, 4.2, 0, 7); c.stroke();
  },
  fade(z) { return Math.min(FxKit.clamp01(z.t / 0.15), FxKit.clamp01((z.dur - z.t) / 0.35)); },
  // 敵の下：足元の土煙（当たる範囲そのものの大きさで回る塊）と範囲の縁・出るときと消えるときの衝撃波
  //   1013a までは足元に渦の腕を描いていた（上から見た渦の線で、竜巻に見えない）。竜巻は over の漏斗が主役、足元は巻き上げる土煙
  groundZ(ctx, z) {
    const T = z.t, R = z.r, fa = this.fade(z);
    if (fa <= 0.01) return;
    const seed = z.sd === undefined ? (z.sd = Math.abs((z.x * 7 + z.y * 3) | 0) % 97) : z.sd;
    ctx.globalAlpha = 0.3 * fa; ctx.fillStyle = '#120a28';
    ctx.beginPath(); ctx.arc(z.x, z.y, R * 0.92, 0, 7); ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const an = FxKit.h(i, seed) * 6.28 - T * (5 + 2 * FxKit.h(i + 7, seed)), rr = R * (0.3 + 0.62 * FxKit.h(i + 20, seed)), s = R * (0.1 + 0.1 * FxKit.h(i + 40, seed));   // 塊の大きさは半径に比例（fx4 で竜巻を大きくしたとき、形がそのまま大きくなる）
      const x = z.x + Math.cos(an) * rr, y = z.y + Math.sin(an) * rr;
      ctx.moveTo(x + s, y); ctx.arc(x, y, s, 0, 7);
    }
    ctx.globalAlpha = 0.34 * fa; ctx.fillStyle = '#5a4e8a'; ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, z.x, z.y, R * 1.1, '#5a3ad8', 0.3 * fa);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5 * fa; ctx.strokeStyle = '#b8a8ff'; ctx.lineWidth = 1.8; ctx.setLineDash([10, 7]); ctx.lineDashOffset = -T * 60;
    ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    FxKit.flash(ctx, z.x, z.y, R * 1.1, T, '#a890ff', 0.12);
    FxKit.hexWave(ctx, z.x, z.y, R * 1.25, T / 0.4, '#a890ff', 4);
    if (z.dur - T < 0.35) FxKit.hexWave(ctx, z.x, z.y, R * 1.3, 1 - (z.dur - T) / 0.35, '#d8d0ff', 3);
  },
  // 敵の上：立ち上がる雷の竜巻（FxKit.tornado）・上の雷雲の傘・胴の中を走る稲妻・掴んだ敵に絡む触手
  _tg: [], _bj: [],
  funnel(ctx, z) {
    const T = z.t, R = z.r, fa = this.fade(z);
    if (fa <= 0.01) return;
    const grow = FxKit.ease(T / 0.35), seed = z.sd === undefined ? (z.sd = Math.abs((z.x * 7 + z.y * 3) | 0) % 97) : z.sd;
    const sp = FxKit.tornado(ctx, { x: z.x, y: z.y, H: R * 2.5 * (0.25 + 0.75 * grow), wb: R * 0.2, wt: R * (0.4 + 0.55 * grow), T, seed, a: fa, sway: R * 0.34, spin: 7,
      body: ['rgba(150,136,220,1)', 'rgba(70,60,140,1)'], bodyA: 0.62, rim: '#b8a8ff', mid: '#7a6ae8', back: '#3a2a80', glow: '#6a4aff', streak: '#d8ceff', core: '#ffffff', sw: R * 0.055, debris: '#e6dcff', nd: 24, ds: R * 0.046 });   // 筋と破片も半径に比例（1013g の絵のまま大きく・fx4）
    if (!sp) return;
    const N = sp.length - 1, top = sp[N], fr = Math.floor(T * 16);
    // 胴の中を走る稲妻：上の傘から足元へ、背骨に沿ってぎざぎざ（ちらつく・2本まで）
    const J = this._bj;
    for (let j = 0; j < 2; j++) {
      if (FxKit.h(fr + j * 31, seed) < 0.3) continue;
      J.length = 0;
      for (let i = N; i >= 0; i -= 2) { const p = sp[i], o = i === 0 ? 0 : (FxKit.h(i + fr * 3 + j * 11, seed) - 0.5) * p.w * 1.2; J.push({ x: p.x + o, y: p.y }); }
      FxKit.beam(ctx, c => FxKit.poly(c, J), R * 0.068, '#e6dcff', 0.95 * fa, '#8a6aff');
    }
    // 雷雲の傘：上にぼけた暗い雲の塊（上の幅より一回り広い・ゆっくり渦巻く）・中が光る
    const cv = FxKit.glowCv('#3a3270');
    for (let i = 0; i < 7; i++) {
      const u = (i / 6 - 0.5) * 2, an = T * 1.6 + i * 0.9, x = top.x + u * top.w * 1.3 + Math.cos(an) * 6, y = top.y - 2 + Math.abs(u) * 9 + Math.sin(an) * 3, s = top.w * (0.95 - Math.abs(u) * 0.3);
      ctx.globalAlpha = fa; ctx.drawImage(cv, x - s, y - s * 0.7, s * 2, s * 1.4);
    }
    ctx.globalCompositeOperation = 'lighter';
    const lit = FxKit.h(fr + 31, seed) >= 0.35;
    FxKit.glow(ctx, top.x, top.y, top.w * 1.5, '#6a4aff', (lit ? 0.75 : 0.35) * fa);
    if (lit) FxKit.glow(ctx, top.x + (FxKit.h(fr, seed) - 0.5) * top.w, top.y, top.w * 0.8, '#ffffff', 0.5 * fa);
    FxKit.glow(ctx, sp[0].x, sp[0].y, R * 0.5, '#a890ff', 0.55 * fa);
    ctx.globalCompositeOperation = 'source-over';
    // 掴んだ敵に絡む触手（範囲の中の近い敵2体まで）：漏斗の下のほうから伸びる
    const tg = this._tg; tg.length = 0;
    if (typeof Fusion !== 'undefined' && typeof Grid !== 'undefined') for (const e of Fusion.nearestTo(z.x, z.y, R, 2)) tg.push(e);
    const b = { cx: sp[2].x, cy: sp[2].y };
    for (let n = 0; n < tg.length; n++) this.tentacle(ctx, z, tg[n], b, n, fa, seed);
    ctx.globalAlpha = 1;
  },
  tentacle(ctx, z, e, b, n, fa, seed) {
    const T = z.t, sx = b.cx, sy = b.cy, dx = e.x - sx, dy = e.y - sy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const sg = n % 2 ? -1 : 1, er = (e.r || 10) + 4, pts = [];
    for (let i = 0; i <= 8; i++) {                                    // 漏斗から敵へ（弧を描いてうねる）
      const s = i / 8, bow = Math.sin(Math.PI * s) * Math.min(18, L * 0.3) * sg + Math.sin(T * 9 + s * 6 + n) * 2.5 * s;
      pts.push({ x: sx + dx * s * (1 - er / L * 0.6) + nx * bow, y: sy + dy * s * (1 - er / L * 0.6) + ny * bow });
    }
    const a0 = Math.atan2(-uy, -ux);                                   // 敵のまわりを1周ちょっと巻く
    for (let i = 1; i <= 9; i++) { const a = a0 + sg * i * 0.78 + T * 2 * sg; pts.push({ x: e.x + Math.cos(a) * er * (1 - i * 0.03), y: e.y + Math.sin(a) * er * (1 - i * 0.03) }); }
    const wd = q => 5.5 * (1 - q) + 1.5;
    FxKit.ribbon(ctx, pts, q => wd(q) + 2); ctx.globalAlpha = 0.7 * fa; ctx.fillStyle = '#1a0830'; ctx.fill();
    FxKit.ribbon(ctx, pts, wd); ctx.globalAlpha = 0.95 * fa; ctx.fillStyle = '#9a52d8'; ctx.fill();
    ctx.beginPath(); for (let i = 1; i < 12; i++) ctx[i > 1 ? 'lineTo' : 'moveTo'](pts[i].x - nx * 1.2, pts[i].y - ny * 1.2);
    ctx.globalAlpha = 0.6 * fa; ctx.strokeStyle = '#f0d0ff'; ctx.lineWidth = 1.2; ctx.stroke();       // ぬめりの光
    ctx.fillStyle = '#ffd0f0'; ctx.globalAlpha = 0.9 * fa; ctx.beginPath();
    for (const i of [2, 4, 6]) { const p = pts[i]; ctx.moveTo(p.x + nx * 2 + 1.2, p.y + ny * 2); ctx.arc(p.x + nx * 2, p.y + ny * 2, 1.2, 0, 7); }
    ctx.fill();
    // 絡んだ所の電撃（ちらつく）
    const fr = Math.floor(T * 20);
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, e.x, e.y, 16, '#c8b0ff', (0.45 + 0.35 * FxKit.h(fr, seed + n)) * fa);
    if (FxKit.h(fr + 5, seed + n) > 0.45) {
      const a = FxKit.h(fr + 11, seed + n) * 6.28, J = FxKit.jag(e.x + Math.cos(a) * er, e.y + Math.sin(a) * er, e.x + Math.cos(a + 2.4) * er * 1.3, e.y + Math.sin(a + 2.4) * er * 1.3, 4, 4, fr + n);
      FxKit.beam(ctx, c => FxKit.poly(c, J), 2, '#ffffff', 0.9 * fa, '#a890ff');
    }
    ctx.globalCompositeOperation = 'source-over';
  },
  zones: { twister(ctx, z) { this.groundZ(ctx, z); } },
  over: { twister(ctx, z) { this.funnel(ctx, z); } },
  fx: { nmzap(ctx, f, k) { FXE.chain(ctx, f, k, { w: 5.5, body: '#dcd0ff', glow: '#6a4aff', hit: '#b8a0ff', lift: 34 }); } },
};
FusionFX.register('thunderwhip', FX_THUNDERWHIP);

// ---------------------------------------------------------------
// 爆裂放射器（火炎＋毒ガス）：根元は白熱の橙・先へ行くほど毒の黄緑に変わる炎の放射。炎の先で火球が連鎖して弾け、毒の煙が残る
// ---------------------------------------------------------------
const FX_HELLMIST = {
  // 砲台：後ろに毒の緑のボンベ（危険の縞）・真ん中に六角の混合室・前へ太いノズル（先が黄緑に焼けている）
  turret(c) {
    c.beginPath(); c.rect(-19, -8, 13, 16); FXE.edge(c, 2.2);
    const tg = c.createLinearGradient(0, -8, 0, 8); tg.addColorStop(0, '#b8f06a'); tg.addColorStop(0.5, '#5aa82a'); tg.addColorStop(1, '#2a5a14'); c.fillStyle = tg; c.fill();
    c.fillStyle = '#1a1d24'; for (const x of [-17, -12.5]) { c.beginPath(); c.moveTo(x, -8); c.lineTo(x + 2.4, -8); c.lineTo(x + 0.4, 8); c.lineTo(x - 2, 8); c.closePath(); c.fill(); }
    c.fillStyle = '#ffd24a'; c.fillRect(-15.4, -8, 1.5, 16);
    c.beginPath(); c.rect(-7, -2.2, 5, 4.4); FXE.edge(c, 1.6); c.fillStyle = '#6a7080'; c.fill();     // 管
    c.beginPath(); FxKit.hexAdd(c, 1, 0, 7.4, Math.PI / 6); FXE.edge(c, 2.2); c.fillStyle = FXE.metal(c, -7, 7); c.fill();
    FXE.ball(c, 1, 0, 3.6, '#fff6c0', '#ffa030', '#7a2a08');
    c.beginPath(); c.moveTo(6, -4.6); c.lineTo(19, -3.4); c.lineTo(22, -5.4); c.lineTo(22, 5.4); c.lineTo(19, 3.4); c.lineTo(6, 4.6); c.closePath();
    FXE.edge(c, 2.2); c.fillStyle = FXE.metal(c, -5, 5, '#d0d4de', '#5a6070'); c.fill();
    c.fillStyle = '#ff8a2a'; c.fillRect(11, -4.2, 2.2, 8.4); c.fillStyle = '#9ad82a'; c.fillRect(14.4, -3.9, 1.6, 7.8);
    c.fillStyle = '#d8f06a'; c.beginPath(); c.ellipse(22, 0, 1.6, 4.6, 0, 0, 7); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(22, 0, 0.7, 2.4, 0, 0, 7); c.fill();
  },
  // 作り置きの炎の塊（白→黄→橙→赤）・毒の炎の塊（淡黄→黄緑→緑）・火球（白い芯・橙・外は毒の緑）・毒の煙
  spr(kind) {
    const S = { fire: [[0, 'rgba(255,252,230,1)'], [0.18, 'rgba(255,226,130,0.95)'], [0.45, 'rgba(255,140,40,0.75)'], [0.72, 'rgba(220,60,20,0.38)'], [1, 'rgba(120,20,10,0)']],
      tox: [[0, 'rgba(246,255,190,0.95)'], [0.3, 'rgba(206,236,70,0.8)'], [0.62, 'rgba(120,196,40,0.42)'], [1, 'rgba(40,90,20,0)']],
      ball: [[0, 'rgba(255,255,255,1)'], [0.16, 'rgba(255,248,205,1)'], [0.36, 'rgba(255,206,64,0.98)'], [0.6, 'rgba(255,118,26,0.92)'], [0.8, 'rgba(156,206,40,0.72)'], [1, 'rgba(70,130,20,0)']],
      smoke: [[0, 'rgba(78,104,44,0.62)'], [0.5, 'rgba(62,86,36,0.34)'], [1, 'rgba(40,52,26,0)']] }[kind];
    return FxKit.sprite('fz-hm-' + kind, 32, FxKit.res(), c => {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 32);
      for (const [p, col] of S) g.addColorStop(p, col);
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 32, 0, 7); c.fill();
    });
  },
  put(ctx, S, x, y, r, a) { if (a <= 0.004 || r <= 0.5) return; ctx.globalAlpha = a > 1 ? 1 : a; ctx.drawImage(S.cv, x - r, y - r, r * 2, r * 2); },
  // 炎の放射（1枚ぶん）：火炎放射器と同じく毎秒 rate 枚が重なって、途切れない炎の流れになる（2026-10-13 fx2・ユーザー「元の火炎放射器のように出しっぱでいい」）。
  //   1枚＝撃ち口から先へ流れる炎の塊。根元は白熱の橙、先へ行くほど毒の黄緑。白熱の芯・毒の滴・火の粉
  cone(ctx, f, k) {
    FXE.stream(ctx, f, k, { pal: 'fire', far: 'tox', nT: 3, puff: this.spr('fire'), puffFar: this.spr('tox'), nP: 3, alpha: 0.36, glow: '#ffb030' });
    const T = k * f.life, mx = f.x + Math.cos(f.a) * 18, my = f.y + Math.sin(f.a) * 18;
    FxKit.sparks(ctx, { x: mx, y: my, t: T, seed: (f.seed || 0) + 3, n: 3, life: 0.3, v: f.r * 2.6, drag: 2.5, a: f.a, spread: f.arc * 1.6, size: 2.6, c0: '#fff0b0', c1: '#ffa030' });
    FxKit.sparks(ctx, { x: mx, y: my, t: T, seed: (f.seed || 0) + 9, n: 2, life: 0.3, v: f.r * 2.2, drag: 2, g: 260, a: f.a, spread: f.arc * 1.2, size: 3.2, add: false, c0: '#e8ff80', c1: '#5aa82a' });
  },
  // 炎の先の爆発（Combat.explode の演出を差し替え）：大きな火球＋まわりで小さな火球が連鎖・毒の緑の六角の衝撃波・火の粉・毒の煙（余韻）
  blast(ctx, f, k) {
    const T = k * f.life, r = f.r, seed = f.seed || 0, ball = this.spr('ball'), big = f.big !== false;   // big＝連鎖の最後の大きな爆発（小さな火球の連鎖と毒の煙はこれだけ・重さ対策）
    FxKit.flash(ctx, f.x, f.y, r * 0.75, T, '#ffd040', 0.1);
    if (T < 0.3) this.put(ctx, ball, f.x, f.y, r * (0.4 + 0.72 * FxKit.ease(Math.min(1, T / 0.09))), Math.pow(1 - T / 0.3, 1.3) * 0.8);
    if (big) for (let i = 0; i < 3; i++) {                             // 連鎖する小さな火球
      const t0 = 0.05 + i * 0.06, q = (T - t0) / 0.24;
      if (q <= 0 || q >= 1) continue;
      const an = FxKit.h(i, seed) * 6.28, d = r * (0.5 + 0.25 * FxKit.h(i + 9, seed));
      this.put(ctx, ball, f.x + Math.cos(an) * d, f.y + Math.sin(an) * d, r * (0.22 + 0.24 * FxKit.ease(Math.min(1, q * 2.5))), Math.pow(1 - q, 1.4) * 0.95);
      FxKit.flash(ctx, f.x + Math.cos(an) * d, f.y + Math.sin(an) * d, r * 0.35, T - t0, '#ffd040', 0.07);
    }
    if (big) FxKit.hexWave(ctx, f.x, f.y, r * 1.15, T / 0.4, '#c8e03a', 4);   // 六角の衝撃波は連鎖の最後だけ（1つ約0.7ms・見本の部屋の測定。途中の爆発は閃光と火球と火の粉）
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: seed + 1, n: big ? 10 : 5, life: 0.55, v: r * 4, drag: 3.5, g: 220, size: 3, c0: '#fff0b0', c1: '#9ad82a' });
    // 毒の煙（ゆっくり広がって上へ）
    const sm = this.spr('smoke');
    ctx.globalCompositeOperation = 'source-over';
    if (big) for (let i = 0; i < 4; i++) {
      const t0 = 0.12 + i * 0.04, q = (T - t0) / (f.life - t0);
      if (q <= 0 || q >= 1) continue;
      const an = FxKit.h(i + 20, seed) * 6.28, d = r * (0.15 + 0.5 * FxKit.h(i + 30, seed)) + q * 16;
      this.put(ctx, sm, f.x + Math.cos(an) * d, f.y + Math.sin(an) * d - q * 16, r * (0.32 + 0.3 * q), 0.6 * Math.sin(Math.PI * q));
    }
    ctx.globalAlpha = 1;
  },
  fx: { hellcone(ctx, f, k) { this.cone(ctx, f, k); }, hellblast(ctx, f, k) { this.blast(ctx, f, k); } },
};
FusionFX.register('hellmist', FX_HELLMIST);

// ---------------------------------------------------------------
// 相反の渦（凍結＋火炎）：氷の放射と炎の放射が背中合わせに吹き続けながら回る（2026-10-13 fx2 で作り直し・前は範囲いっぱいに巻く2本の帯）。
//   1枚ずつは爆裂放射器と同じ「吹き続ける放射」（FXE.stream）。回りながら重なるので、先ほど後ろへ反る2本の渦の腕に見える。
//   氷で凍った敵に炎が掛かると熱衝撃（白い蒸気・氷の破片・火の粉・六角の衝撃波）
// ---------------------------------------------------------------
const FX_VORTEX = {
  // 砲台：氷と炎の巴（半分ずつの丸）を回る台に載せる。外の輪に噴き口が6つ（ここから地面へ渦が広がる）
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (let i = 0; i < 6; i++) {                                    // 噴き口（氷と炎が交互）
      const a = i * Math.PI / 3, x = Math.cos(a) * 14, y = Math.sin(a) * 14;
      c.beginPath(); c.arc(x, y, 4, 0, 7); FXE.edge(c, 2); c.fillStyle = i % 2 ? '#ff8a2a' : '#7fe6ff'; c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x, y, 1.4, 0, 7); c.fill();
    }
    c.beginPath(); c.arc(0, 0, 14, 0, 7); c.lineWidth = 3.4; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    c.lineWidth = 1.6; c.strokeStyle = '#c8ccd8'; c.stroke();
    c.beginPath(); c.arc(0, 0, 10.5, 0, 7); FXE.edge(c, 2.6); c.fillStyle = '#ff7a2a'; c.fill();
    c.beginPath(); c.arc(0, 0, 10.5, -Math.PI / 2, Math.PI / 2, true); c.arc(0, 5.25, 5.25, Math.PI / 2, -Math.PI / 2, true); c.arc(0, -5.25, 5.25, Math.PI / 2, Math.PI * 1.5, false); c.closePath();
    c.fillStyle = '#7fe6ff'; c.fill();
    c.fillStyle = '#ffd0a0'; c.beginPath(); c.arc(0, -5.25, 1.8, 0, 7); c.fill();
    c.fillStyle = '#e6fbff'; c.beginPath(); c.arc(0, 5.25, 1.8, 0, 7); c.fill();
    c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.arc(0, 0, 8.4, Math.PI * 1.05, Math.PI * 1.45); c.stroke();
  },
  // 腕の中心線（q0〜q1 を n 等分）。形の式は fusion.js の FUSIONS.vortex.arm（当たりと同じ）
  armPts(V, P, x, y, R, base, k, q0, q1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const q = q0 + (q1 - q0) * i / n, t = V.arm(P, base, k, q), d = q * R;
      pts.push({ x: x + Math.cos(t) * d, y: y + Math.sin(t) * d, q });
    }
    return pts;
  },
  // 毎フレーム1回・敵の下：盤の上の相反の渦すべて。撃ち始め（w.vxS）から腕が伸び、撃たなくなる（w.vxOn から空く）と消える
  ground(ctx, run) {
    if (typeof FUSIONS === 'undefined' || !run || !run.units) return;
    const V = FUSIONS.vortex, T = run.time;
    for (const w of run.units) {
      if (w.fuse !== 'vortex' || w.vxOn === undefined || T < w.vxS) continue;
      const idle = T - w.vxOn;
      if (idle > 0.6) continue;
      const up = FxKit.ease((T - w.vxS) / 0.45), a = Math.min(up, FxKit.clamp01(1 - (idle - 0.15) / 0.45));
      if (a > 0.01) { ctx.save(); this.swirl(ctx, w, V, Fusion.p(w), V.base(w, run), T, a, up); ctx.restore(); }
    }
  },
  swirl(ctx, w, V, P, base, T, a, up) {
    const x = w.x, y = w.y, R = w.s.range, q0 = 0.06, q1 = q0 + (1 - q0) * up, seed = Math.abs((x * 7 + y * 3) | 0) % 97;
    // 1. 縁の細い輪（範囲が読める）。射程いっぱいの円は塗らない（大きな面の塗りが重い）
    ctx.globalAlpha = 0.3 * a; ctx.strokeStyle = '#ff9ad0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke();
    // 2. 流れの筋：腕より速く回る細い渦の線（氷の色と炎の色を交互）。渦の流れを見せる
    ctx.lineCap = 'round'; ctx.lineWidth = 2;
    for (const [col, k0] of [['#9fe6ff', 0], ['#ffb070', 1]]) {
      ctx.beginPath();
      for (let j = 0; j < 3; j++) {
        const off = k0 * Math.PI + j * Math.PI * 2 / 3 + T * P.spin * 0.9 + FxKit.h(j, seed) * 0.6;
        const qa = 0.2 + 0.25 * FxKit.h(j + 5, seed), qb = Math.min(1, qa + 0.5);
        for (let i = 0; i <= 10; i++) {
          const q = qa + (qb - qa) * i / 10, t = V.arm(P, base + off, 0, q), d = q * R * up;
          i ? ctx.lineTo(x + Math.cos(t) * d, y + Math.sin(t) * d) : ctx.moveTo(x + Math.cos(t) * d, y + Math.sin(t) * d);
        }
      }
      ctx.globalAlpha = 0.22 * a; ctx.strokeStyle = col; ctx.stroke();
    }
    // 3. 腕2本：光（加算・太い根元の半分だけ。面が大きいと重い）→ 本体 → 明るい内側 → 白い芯。根元が太く、先が細る
    const ARM = [{ glow: '#3a9cff', body: '#5cc8ff', mid: '#c8f2ff', core: '#ffffff' }, { glow: '#ff4a1a', body: '#ff7a2a', mid: '#ffd27a', core: '#fff6d8' }];
    for (let k = 0; k < 2; k++) {
      const C = ARM[k], pts = this.armPts(V, P, x, y, R, base, k, q0, q1, 22), n = pts.length - 1;
      const wd = (s) => (i => { const q = pts[Math.round(i * n)].q, u = i; return V.armW(P, q) * s * Math.min(1, (1 - u) * 5 + 0.08) * Math.min(1, u * 6 + 0.35); });
      ctx.globalCompositeOperation = 'lighter';
      FxKit.ribbon(ctx, pts.slice(0, (n >> 1) + 1), (wf => i => wf(i * 0.5) * Math.min(1, (1 - i) * 2.5))(wd(1.5))); ctx.globalAlpha = 0.2 * a; ctx.fillStyle = C.glow; ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      FxKit.ribbon(ctx, pts, wd(1)); ctx.globalAlpha = 0.5 * a; ctx.fillStyle = C.body; ctx.fill();
      FxKit.ribbon(ctx, pts, wd(0.5)); ctx.globalAlpha = 0.6 * a; ctx.fillStyle = C.mid; ctx.fill();
      FxKit.ribbon(ctx, pts, i => Math.max(3, V.armW(P, pts[Math.round(i * n)].q) * 0.12) * Math.min(1, (1 - i) * 5)); ctx.globalAlpha = 0.85 * a; ctx.fillStyle = C.core; ctx.fill();
    }
    // 4. 腕に沿って内側へ流れる粒：氷の破片（白と水色）・火の粉（加算）
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const u = (FxKit.h(i, seed + k * 31) + T * 0.42) % 1, q = q0 + (q1 - q0) * (1 - u);
        const t = V.arm(P, base, k, q) + (FxKit.h(i + 40, seed + k) - 0.5) * V.armW(P, q) * 0.9 / Math.max(20, q * R);
        const d = q * R, px = x + Math.cos(t) * d, py = y + Math.sin(t) * d, s = (k ? 2.6 : 4.2) * (0.6 + 0.6 * Math.min(1, u * 4, (1 - u) * 4));
        if (k) { ctx.moveTo(px + s, py); ctx.arc(px, py, s, 0, 7); }
        else { const r = t + T * 6 + i; ctx.moveTo(px + Math.cos(r) * s * 1.5, py + Math.sin(r) * s * 1.5); ctx.lineTo(px + Math.cos(r + 2.3) * s, py + Math.sin(r + 2.3) * s); ctx.lineTo(px + Math.cos(r - 2.3) * s, py + Math.sin(r - 2.3) * s); ctx.closePath(); }
      }
      if (k) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9 * a; ctx.fillStyle = '#ffc060'; ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
      else { ctx.globalAlpha = 0.9 * a; ctx.fillStyle = '#e6fbff'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#4ab0ff'; ctx.stroke(); }
    }
    // 5. 中心の目：氷と炎がぶつかる白い光（ゆっくり脈打つ）
    const pu = 0.85 + 0.15 * Math.sin(T * 5);
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, x, y, P.eyeR * 1.1 * pu, '#ffb0d8', 0.35 * a);
    FxKit.glow(ctx, x, y, P.eyeR * 0.5, '#ffffff', 0.55 * a);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  // 中心の目の蒸気の爆発（熱衝撃）：白い閃光・桃の六角の衝撃波・白い蒸気が渦に沿って外へ広がる・氷の破片と火の粉
  eye(ctx, f, k) {
    const T = k * f.life, R = f.r, seed = f.seed || 0;
    FxKit.flash(ctx, f.x, f.y, R * 1.3, T, '#ffd2e8', 0.1);
    FxKit.hexWave(ctx, f.x, f.y, R * 1.35, T / 0.4, '#ffb0d8', 5);
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < 8; j++) {
      const q = FxKit.clamp01(T / (f.life * 0.9)), aa = j * Math.PI / 4 + q * 1.2 + FxKit.h(j, seed) * 0.4, d = R * (0.2 + 0.9 * FxKit.ease(q));
      FxKit.glow(ctx, f.x + Math.cos(aa) * d, f.y + Math.sin(aa) * d, R * (0.35 + 0.35 * q), '#ffffff', 0.5 * (1 - q));
    }
    ctx.globalCompositeOperation = 'source-over';
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed, n: 8, life: 0.45, v: R * 5, drag: 5, size: 4.4, shape: 'shard', even: true, add: false, c0: '#ffffff', c1: '#8fd8ff' });
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: seed + 5, n: 6, life: 0.4, v: R * 5.5, drag: 4, size: 2.8, c0: '#fff0b0', c1: '#ff6a2a' });
    ctx.globalAlpha = 1;
  },
  // 熱衝撃：凍った敵に炎が掛かって砕ける。白い閃光・六角の衝撃波（桃）・氷の破片（白と水色・加算しない）・火の粉・白い蒸気が昇る
  shock(ctx, f, k) {
    const T = k * f.life, R = f.r, seed = f.seed || 0;
    FxKit.flash(ctx, f.x, f.y, R * 1.1, T, '#ffd2e8', 0.09);
    FxKit.hexWave(ctx, f.x, f.y, R * 1.1, T / 0.35, '#ffb0d8', 4.5);
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed, n: 8, life: 0.45, v: R * 5.5, drag: 5, size: 4.4, shape: 'shard', even: true, add: false, c0: '#ffffff', c1: '#8fd8ff' });
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: seed + 5, n: 6, life: 0.4, v: R * 6, drag: 4, g: 200, size: 2.8, c0: '#fff0b0', c1: '#ff6a2a' });
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < 4; j++) {
      const q = FxKit.clamp01((T - j * 0.04) / (f.life - j * 0.04));
      if (q <= 0 || q >= 1) continue;
      const x = f.x + (FxKit.h(j, seed) - 0.5) * R * 0.8;
      FxKit.glow(ctx, x, f.y - 4 - q * R * 0.9, R * (0.3 + 0.4 * q), '#ffffff', 0.5 * (1 - q));
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  fx: { vtxeye(ctx, f, k) { this.eye(ctx, f, k); }, vtxshock(ctx, f, k) { this.shock(ctx, f, k); } },
};
FusionFX.register('vortex', FX_VORTEX);

// ---------------------------------------------------------------
// 凍結光線（レーザー＋凍結）：青白い太い光線（白い芯・水色の光）と、線に沿って残る霜の結晶。反射した所に透き通った氷の棘山
// ---------------------------------------------------------------
const FX_CRYOBEAM = {
  // 砲台：後ろに六角の氷の結晶の器（雪の結晶が透ける）・前へ長い光線の銃身（水色の溝）・銃身に氷の棘・先に水色のレンズ
  turret(c) {
    c.beginPath(); c.rect(-2, -3.4, 24, 6.8); FXE.edge(c, 2.2); c.fillStyle = FXE.metal(c, -3.4, 3.4, '#e0e6f0', '#5a6274'); c.fill();
    c.fillStyle = '#7fe6ff'; c.fillRect(2, -0.9, 18, 1.8);
    for (const [x, s] of [[6, -1], [12, 1], [17, -1]]) {
      c.beginPath(); c.moveTo(x - 2.2, s * 3.2); c.lineTo(x + 0.4, s * 8.6); c.lineTo(x + 2.4, s * 3.2); c.closePath();
      FXE.edge(c, 1.4); c.fillStyle = '#c8f4ff'; c.fill();
    }
    FXE.ball(c, 22.5, 0, 3.8, '#ffffff', '#8fe8ff', '#1a6a9a');
    c.beginPath(); FxKit.hexAdd(c, -9, 0, 10); FXE.edge(c, 2.6);
    const hg = c.createLinearGradient(-16, -9, -2, 9); hg.addColorStop(0, '#e6fbff'); hg.addColorStop(0.5, '#7fd8f8'); hg.addColorStop(1, '#2a7ab8'); c.fillStyle = hg; c.fill();
    c.lineWidth = 1.3; c.strokeStyle = '#ffffff'; c.beginPath();
    for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + Math.PI / 6; c.moveTo(-9 + Math.cos(a) * 6, Math.sin(a) * 6); c.lineTo(-9 - Math.cos(a) * 6, -Math.sin(a) * 6); }
    c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(-9, 0, 1.6, 0, 7); c.fill();
  },
  // 作り置き：雪の結晶（霜）・氷の棘1本（下が根元）・地面の霜の跡
  snow() {
    return FxKit.sprite('fz-cb-snow', 8, FxKit.res(), c => {
      c.lineCap = 'round';
      for (const [w, col] of [[3.2, 'rgba(120,220,255,0.45)'], [1.3, '#ffffff']]) {
        c.lineWidth = w; c.strokeStyle = col; c.beginPath();
        for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; c.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); c.lineTo(-Math.cos(a) * 6, -Math.sin(a) * 6); }
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, x = Math.cos(a) * 3.6, y = Math.sin(a) * 3.6; c.moveTo(x, y); c.lineTo(x + Math.cos(a + 0.8) * 2, y + Math.sin(a + 0.8) * 2); c.moveTo(x, y); c.lineTo(x + Math.cos(a - 0.8) * 2, y + Math.sin(a - 0.8) * 2); }
        c.stroke();
      }
    });
  },
  spike() {
    return FxKit.sprite('fz-cb-spike', 22, FxKit.res(), c => {
      c.lineJoin = 'round';
      const TIP = [0, -20], BL = [-7, 17], BM = [1, 20], BR = [7, 17];
      c.beginPath(); c.moveTo(...TIP); c.lineTo(...BL); c.lineTo(...BM); c.lineTo(...BR); c.closePath();
      c.lineWidth = 2; c.strokeStyle = 'rgba(8,40,70,0.7)'; c.stroke();
      c.beginPath(); c.moveTo(...TIP); c.lineTo(...BL); c.lineTo(...BM); c.closePath();
      let g = c.createLinearGradient(0, -20, 0, 20); g.addColorStop(0, 'rgba(255,255,255,0.97)'); g.addColorStop(0.5, 'rgba(200,244,255,0.82)'); g.addColorStop(1, 'rgba(140,216,250,0.62)'); c.fillStyle = g; c.fill();
      c.beginPath(); c.moveTo(...TIP); c.lineTo(...BM); c.lineTo(...BR); c.closePath();
      g = c.createLinearGradient(0, -20, 0, 20); g.addColorStop(0, 'rgba(210,246,255,0.92)'); g.addColorStop(0.5, 'rgba(90,184,236,0.75)'); g.addColorStop(1, 'rgba(40,120,200,0.6)'); c.fillStyle = g; c.fill();
      c.lineWidth = 0.9; c.strokeStyle = '#ffffff'; c.beginPath(); c.moveTo(...TIP); c.lineTo(...BM); c.stroke();
      c.lineWidth = 1.4; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.moveTo(-1.2, -12); c.lineTo(-4, 6); c.stroke();
    });
  },
  frost() {
    return FxKit.sprite('fz-cb-frost', 60, FxKit.res(), c => {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 58);
      g.addColorStop(0, 'rgba(210,246,255,0.42)'); g.addColorStop(0.6, 'rgba(150,222,255,0.2)'); g.addColorStop(1, 'rgba(150,222,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 58, 0, 7); c.fill();
      c.lineCap = 'round'; c.lineWidth = 1.3; c.strokeStyle = 'rgba(235,252,255,0.55)'; c.beginPath();
      for (let i = 0; i < 7; i++) {
        let a = i * 0.9 + 0.3, x = 0, y = 0;
        c.moveTo(0, 0);
        for (let j = 1; j <= 4; j++) { a += (FxKit.h(i * 5 + j, 3) - 0.5) * 0.7; x += Math.cos(a) * 11; y += Math.sin(a) * 11; c.lineTo(x, y); }
      }
      c.stroke();
    });
  },
  _ln: [],
  // 光線（Combat.laser の演出を差し替え）
  ray(ctx, f, k) {
    const T = k * f.life, pts = f.pts, hw = f.w || 22, seed = f.seed || 0;
    const main = FxKit.clamp01(1 - T / 0.16), a = T < 0.16 ? 1 : FxKit.clamp01(1 - (T - 0.16) / (f.life - 0.16));
    const W = hw * 1.15 * (0.25 + 0.75 * main) * (T < 0.03 ? 0.6 + 0.4 * T / 0.03 : 1);
    FxKit.beam(ctx, c => FxKit.poly(c, pts), W, '#8fe8ff', a * (0.45 + 0.55 * main), '#2a9aff');
    // 線に沿って残る霜の結晶（左右に交互・撃った所から順に咲く）
    const S = this.snow(), ln = this._ln, L = FXE.lens(pts, ln);
    let seg = 0, acc = 0;
    for (let d = 20, i = 0; d < L; d += 26, i++) {
      while (seg < ln.length - 1 && d > acc + ln[seg]) { acc += ln[seg]; seg++; }
      const p = pts[seg], q = pts[seg + 1], u = ln[seg] ? (d - acc) / ln[seg] : 0, tx = (q.x - p.x) / (ln[seg] || 1), ty = (q.y - p.y) / (ln[seg] || 1);
      const app = FxKit.clamp01((T - d / 6000) / 0.06);
      if (app <= 0) continue;
      const side = i % 2 ? 1 : -1, off = side * (W * 0.42 + 3 + 4 * FxKit.h(i, seed)), s = (5 + 4 * FxKit.h(i + 30, seed)) * FXE.back(app) * (0.7 + 0.3 * a);
      const x = p.x + (q.x - p.x) * u - ty * off, y = p.y + (q.y - p.y) * u + tx * off;
      ctx.globalAlpha = Math.min(1, a * 1.3); ctx.drawImage(S.cv, x - s, y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    // 撃ち口と、反射した所・行き止まりの閃光と氷の粒
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, pts[0].x, pts[0].y, 40 * (0.5 + 0.5 * main), '#8fe8ff', 0.9 * a);
    FxKit.flash(ctx, pts[0].x, pts[0].y, 44, T, '#8fe8ff', 0.08);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      FxKit.flash(ctx, p.x, p.y, 46, T - 0.01, '#bff0ff', 0.12);
      FxKit.glow(ctx, p.x, p.y, 30, '#8fe8ff', 0.7 * a);
      FxKit.sparks(ctx, { x: p.x, y: p.y, t: T, seed: seed + i * 11, n: 8, life: 0.4, v: 210, drag: 5, size: 3.4, shape: 'shard', c0: '#ffffff', c1: '#7fe6ff' });
    }
    ctx.globalCompositeOperation = 'source-over';
  },
  // 氷の棘山（場）：地面の霜・根元から生える透き通った氷柱（真ん中ほど高い・少し行き過ぎて止まる）・先のきらめき・最後に砕ける
  spikes(ctx, z) {
    const T = z.t, R = z.r, out = FxKit.clamp01((z.dur - T) / 0.4), seed = z.sd === undefined ? (z.sd = Math.abs((z.x * 7 + z.y * 3) | 0) % 97) : z.sd;
    const F = this.frost(), sp = this.spike();
    ctx.globalAlpha = Math.min(1, T / 0.08) * out; ctx.drawImage(F.cv, z.x - R * 1.15, z.y - R * 1.15, R * 2.3, R * 2.3);
    if (!z._sk) {                                                       // 並びは場ごとに1回だけ決める（奥から手前へ描く）
      z._sk = [];
      for (let i = 0; i < 12; i++) {
        const an = FxKit.h(i, seed) * 6.28, d = R * 0.82 * Math.sqrt(FxKit.h(i + 20, seed));
        z._sk.push({ x: z.x + Math.cos(an) * d, y: z.y + Math.sin(an) * d * 0.8 + 6, h: 18 + 28 * (1 - d / R) * (0.6 + 0.4 * FxKit.h(i + 40, seed)), w: 9 + 5 * FxKit.h(i + 60, seed), dl: d / R * 0.07 + FxKit.h(i + 80, seed) * 0.03 });
      }
      z._sk.sort((p, q) => p.y - q.y);
    }
    const sink = 0.25 + 0.75 * out;
    for (const s of z._sk) {
      const g = FXE.back((T - s.dl) / 0.16);
      if (g <= 0.01) continue;
      const H = s.h * g * sink, sx = s.w / 14, sy = H / 40;
      ctx.globalAlpha = 0.92 * Math.sqrt(out);
      ctx.drawImage(sp.cv, s.x - 22 * sx, s.y - H / 2 - 22 * sy, 44 * sx, 44 * sy);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {                                       // 先のきらめき
      const s = z._sk[(i * 3 + 2) % z._sk.length], tw = Math.max(0, Math.sin(T * 3.1 + i * 1.9));
      FxKit.glow(ctx, s.x + 0.5, s.y - s.h * sink, 9, '#e6fbff', 0.8 * tw * out);
    }
    FxKit.glow(ctx, z.x, z.y, R * 0.95, '#bff0ff', 0.18 * out);
    FxKit.flash(ctx, z.x, z.y, R * 1.1, T, '#bff0ff', 0.1);
    FxKit.hexWave(ctx, z.x, z.y, R * 1.2, T / 0.38, '#bff0ff', 4);
    if (T < 0.45) FxKit.sparks(ctx, { x: z.x, y: z.y, t: T, seed: seed + 5, n: 10, life: 0.45, v: R * 4.5, drag: 5, size: 3.6, shape: 'shard', c0: '#ffffff', c1: '#7fe6ff' });
    if (out < 1) FxKit.sparks(ctx, { x: z.x, y: z.y - 10, t: z.dur - 0.4 < 0 ? T : T - (z.dur - 0.4), seed: seed + 9, n: 12, life: 0.4, v: R * 4, drag: 3, g: 240, size: 4, shape: 'shard', c0: '#ffffff', c1: '#8fe8ff' });
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  // 霜の線（場・敵の下）：光線が通った帯に、霜の白い縁と結晶が残って薄れていく（帯の太さ＝当たる太さ）
  frostline(ctx, z) {
    const T = z.t, fa = Math.min(1, T / 0.05) * FxKit.clamp01((z.dur - T) / 0.5);
    if (fa <= 0.01) return;
    const S = this.snow(), sd = z.sd === undefined ? (z.sd = Math.abs((z.x * 7 + z.y * 3) | 0) % 97) : z.sd;
    ctx.translate(z.x, z.y); ctx.rotate(z.a);
    ctx.globalAlpha = 0.2 * fa; ctx.fillStyle = '#9fe6ff'; ctx.fillRect(-z.hw, -z.hh * 0.85, z.hw * 2, z.hh * 1.7);
    ctx.globalAlpha = 0.55 * fa; ctx.strokeStyle = '#e6fbff'; ctx.lineWidth = 1.6; ctx.beginPath();
    ctx.moveTo(-z.hw, -z.hh * 0.85); ctx.lineTo(z.hw, -z.hh * 0.85); ctx.moveTo(-z.hw, z.hh * 0.85); ctx.lineTo(z.hw, z.hh * 0.85); ctx.stroke();
    ctx.globalAlpha = 0.8 * fa;
    for (let d = -z.hw + 12, i = 0; d < z.hw - 6; d += 30, i++) {
      const y = (FxKit.h(i, sd) - 0.5) * z.hh * 1.3, s = 4 + 3 * FxKit.h(i + 30, sd);
      ctx.drawImage(S.cv, d - s, y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
  },
  fx: { cryoray(ctx, f, k) { this.ray(ctx, f, k); } },
  zones: { spikes(ctx, z) { this.spikes(ctx, z); }, frostline(ctx, z) { this.frostline(ctx, z); } },
};
FusionFX.register('cryobeam', FX_CRYOBEAM);

// ---------------------------------------------------------------
// スーパーノヴァ（レーザー＋ミサイル）：道1本分の太さの、撃ち続ける光の奔流（白い芯・黄・橙・赤の外光）。
//   流れる模様と光の粒は盤の時刻（run.time）で動くので、1発ずつの光線が重なっても途切れずに流れて見える。反射の角で閃光・当たっている敵に多段ヒットの光
// ---------------------------------------------------------------
const FX_CONVERGENCE = {
  // 砲台：太い砲身（中に橙白の光の溝）と、両脇にミサイルの筒（赤い弾頭）。先に集光のレンズ
  turret(c) {
    for (const s of [-1, 1]) {
      c.beginPath(); c.rect(-12, s * 8.5 - 3.4, 16, 6.8); FXE.edge(c, 2); c.fillStyle = FXE.metal(c, s * 8.5 - 3.4, s * 8.5 + 3.4, '#b8bfcc', '#4a5060'); c.fill();
      c.beginPath(); c.moveTo(4, s * 8.5 - 2.6); c.lineTo(10, s * 8.5); c.lineTo(4, s * 8.5 + 2.6); c.closePath(); FXE.edge(c, 1.4); c.fillStyle = '#ff5a3a'; c.fill();
    }
    c.beginPath(); c.moveTo(-10, -6); c.lineTo(17, -5); c.lineTo(17, 5); c.lineTo(-10, 6); c.closePath(); FXE.edge(c, 2.4); c.fillStyle = FXE.metal(c, -6, 6, '#e2e6ee', '#5a6070'); c.fill();
    const g = c.createLinearGradient(0, -2.6, 0, 2.6); g.addColorStop(0, '#ff8a2a'); g.addColorStop(0.5, '#fff6d0'); g.addColorStop(1, '#ff8a2a');
    c.fillStyle = g; c.fillRect(-6, -2.2, 22, 4.4);
    c.beginPath(); c.rect(16, -7, 4, 14); FXE.edge(c, 2); c.fillStyle = '#3a3f4c'; c.fill();
    FXE.ball(c, 21, 0, 4.4, '#ffffff', '#ffe08a', '#c84a10');
    c.fillStyle = '#ffd24a'; c.fillRect(-9, -6, 2.2, 12);
  },
  _ln: [],
  ray(ctx, f, k) {
    const pts = f.pts, hw = f.w || 30, rt = FXE.now(), a = k < 0.7 ? 1 : (1 - k) / 0.3;
    if (a <= 0.01 || pts.length < 2) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    FxKit.poly(ctx, pts);
    ctx.globalAlpha = 0.2 * a; ctx.strokeStyle = '#ff3a10'; ctx.lineWidth = hw * 2.5; ctx.stroke();      // 外光（赤）
    ctx.globalAlpha = 0.3 * a; ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = hw * 1.55; ctx.stroke();     // 本体（橙）
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28 * a; ctx.strokeStyle = '#ffb840'; ctx.lineWidth = hw * 0.85; ctx.stroke();     // 内（黄）
    // 流れる模様（2つの速さの光の筋）
    ctx.setLineDash([24, 34]); ctx.lineDashOffset = -rt * 820;
    ctx.globalAlpha = 0.32 * a; ctx.strokeStyle = '#fff0b8'; ctx.lineWidth = hw * 0.5; ctx.stroke();
    ctx.setLineDash([9, 52]); ctx.lineDashOffset = -rt * 1300;
    ctx.globalAlpha = 0.2 * a; ctx.strokeStyle = '#ffc060'; ctx.lineWidth = hw * 1.15; ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.85 * a; ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 5; ctx.stroke();            // 白い芯
    // 光の粒（帯の中を流れる）
    ctx.globalCompositeOperation = 'lighter';
    const ln = this._ln, L = FXE.lens(pts, ln), M = Math.min(36, Math.floor(L / 20));
    ctx.beginPath();
    for (let i = 0; i < M; i++) {
      let d = (i * L / M + rt * 640 + FxKit.h(i, 1) * 30) % L, seg = 0;
      while (seg < ln.length - 1 && d > ln[seg]) { d -= ln[seg]; seg++; }
      const p = pts[seg], q = pts[seg + 1], u = ln[seg] ? d / ln[seg] : 0, tx = (q.x - p.x) / (ln[seg] || 1), ty = (q.y - p.y) / (ln[seg] || 1);
      const lat = (FxKit.h(i + 50, 1) - 0.5) * hw * 1.3, s = 2 + 2.6 * FxKit.h(i + 90, 1);
      const x = p.x + (q.x - p.x) * u - ty * lat, y = p.y + (q.y - p.y) * u + tx * lat;
      ctx.moveTo(x + tx * s * 2, y + ty * s * 2); ctx.lineTo(x - ty * s * 0.5, y + tx * s * 0.5); ctx.lineTo(x - tx * s * 2, y - ty * s * 2); ctx.lineTo(x + ty * s * 0.5, y - tx * s * 0.5); ctx.closePath();
    }
    ctx.globalAlpha = 0.9 * a; ctx.fillStyle = '#fffbe8'; ctx.fill();
    // 撃ち口・反射の角（まぶしい閃光と回る十字の光）・行き止まり
    const ux = (pts[1].x - pts[0].x) / (ln[0] || 1), uy = (pts[1].y - pts[0].y) / (ln[0] || 1);
    FxKit.glow(ctx, pts[0].x + ux * 22, pts[0].y + uy * 22, hw * 1.5, '#ffd080', 0.85 * a);
    FxKit.glow(ctx, pts[0].x + ux * 22, pts[0].y + uy * 22, hw * 0.6, '#ffffff', 0.9 * a);
    ctx.fillStyle = '#ffffff';
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], end = i === pts.length - 1, pul = 0.85 + 0.15 * Math.sin(rt * 40 + i);
      FxKit.glow(ctx, p.x, p.y, hw * (end ? 1.6 : 2.6) * pul, '#ff9a30', 0.6 * a);
      FxKit.glow(ctx, p.x, p.y, hw * (end ? 0.8 : 1.3) * pul, '#ffffff', 0.85 * a);
      if (end) continue;
      const r = hw * 1.5 * pul, an = rt * 3 + i;
      ctx.globalAlpha = 0.9 * a;
      for (const b of [an, an + Math.PI / 2]) {
        const cx = Math.cos(b) * r, cy = Math.sin(b) * r;
        FxKit.ribbon(ctx, [{ x: p.x - cx, y: p.y - cy }, { x: p.x, y: p.y }, { x: p.x + cx, y: p.y + cy }], q => 4.5 * Math.sin(Math.PI * q) + 0.3); ctx.fill();
      }
    }
    // 当たっている敵：細かいヒットの光（1秒に9回・敵ごとにずらす）
    const H = f.hits;
    if (H) for (let n = 0, m = 0; n < H.length && m < 10; n++) {
      const e = H[n];
      if (!e || e.dead) continue;
      m++;
      const ph = (rt * 9 + n * 0.37) % 1;
      FxKit.glow(ctx, e.x, e.y, 13, '#ffffff', 0.3 * (1 - ph) * a);
      FxKit.sparks(ctx, { x: e.x, y: e.y, t: ph * 0.12, seed: n * 7 + Math.floor(rt * 9), n: 4, life: 0.12, v: 300, drag: 6, size: 2.6, c0: '#ffffff', c1: '#ffb040' });
      FxKit.hexWave(ctx, e.x, e.y, 18, ph, '#fff0b0', 2);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  fx: { novaray(ctx, f, k) { this.ray(ctx, f, k); } },
};
FusionFX.register('convergence', FX_CONVERGENCE);

// ---------------------------------------------------------------
// 磁気嵐（ミサイル＋テスラ）：コイルを巻いた帯電したミサイル（青紫の尾・放電）。着弾点に、渦巻く嵐の帯・磁力線の輪・落ちる稲妻
// ---------------------------------------------------------------
const FX_CHAINSTRIKE = {
  // 砲台：ミサイルの箱から、コイルを巻いた2発のミサイルが前を向く。上下にテスラの電極
  turret(c) {
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(-6, s * 9); c.lineTo(4, s * 15); c.lineTo(6, s * 13); c.lineTo(-3, s * 7); c.closePath(); FXE.edge(c, 1.8); c.fillStyle = '#7a6ac8'; c.fill();
      c.fillStyle = '#e6dcff'; c.beginPath(); c.arc(5, s * 14, 1.5, 0, 7); c.fill();
    }
    c.beginPath(); c.rect(-15, -9, 15, 18); FXE.edge(c, 2.4); c.fillStyle = FXE.metal(c, -9, 9, '#b8bfcc', '#454b5a'); c.fill();
    c.fillStyle = '#9a7cff'; c.fillRect(-13, -1, 11, 2);
    for (const y of [-4.6, 4.6]) {
      c.beginPath(); c.moveTo(-3, y - 2.8); c.lineTo(13, y - 2.8); c.quadraticCurveTo(21, y, 13, y + 2.8); c.lineTo(-3, y + 2.8); c.closePath();
      FXE.edge(c, 1.8); c.fillStyle = FXE.metal(c, y - 2.8, y + 2.8, '#e0e4ec', '#5a6070'); c.fill();
      c.beginPath(); c.moveTo(13, y - 2.8); c.quadraticCurveTo(21, y, 13, y + 2.8); c.closePath(); c.fillStyle = '#b58bff'; c.fill();
      c.fillStyle = '#e8a050'; for (const x of [1, 5.5]) c.fillRect(x, y - 3.1, 1.6, 6.2);
    }
    c.lineWidth = 1; c.strokeStyle = '#ffffff'; c.beginPath(); c.moveTo(18, -9); c.lineTo(20, -6.5); c.lineTo(18.5, -5.5); c.lineTo(21, -3); c.stroke();
  },
  // 作り置きのミサイル（+x が前）：濃い機体・コイルの輪2つ・紫白の弾頭・羽
  body() {
    return FxKit.sprite('fz-cs-msl', 18, FxKit.res(), c => {
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(-13, s * 2); c.lineTo(-16, s * 8); c.lineTo(-9, s * 3.5); c.closePath(); FXE.edge(c, 1.6); c.fillStyle = '#7a6ac8'; c.fill(); }
      c.beginPath(); c.moveTo(-14, -4.4); c.lineTo(8, -4.4); c.quadraticCurveTo(17, -3, 18, 0); c.quadraticCurveTo(17, 3, 8, 4.4); c.lineTo(-14, 4.4); c.closePath();
      FXE.edge(c, 2.2); c.fillStyle = FXE.metal(c, -4.4, 4.4, '#8a86a8', '#2a2640'); c.fill();
      c.beginPath(); c.moveTo(8, -4.4); c.quadraticCurveTo(17, -3, 18, 0); c.quadraticCurveTo(17, 3, 8, 4.4); c.closePath();
      const g = c.createLinearGradient(8, 0, 18, 0); g.addColorStop(0, '#7a5aff'); g.addColorStop(1, '#f0e8ff'); c.fillStyle = g; c.fill();
      for (const x of [-7, -1]) { c.beginPath(); c.ellipse(x, 0, 1.6, 5.6, 0, 0, 7); c.fillStyle = '#e8a050'; c.fill(); c.lineWidth = 0.8; c.strokeStyle = '#5a3008'; c.stroke(); }
      c.fillStyle = '#d8c7ff'; c.fillRect(-12, -1, 3, 2);
    });
  },
  missile(ctx, b, by, br, run) {
    const t = run.time, sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp, trav = Math.hypot(b.x - b.ox, b.y - b.oy);
    const seed = Math.abs((b.ox * 0.37 + b.oy * 0.11) | 0) % 50, L = Math.min(52, trav + 6), nx = -uy, ny = ux;
    ctx.globalCompositeOperation = 'lighter';
    const P = [];
    for (let j = 0; j <= 6; j++) { const s = j / 6, w = Math.sin(t * 38 + j * 1.3 + seed) * 2.2 * s; P.push({ x: b.x - ux * (12 + L * s) + nx * w, y: by - uy * (12 + L * s) + ny * w }); }
    FxKit.ribbon(ctx, P, q => 11 * (1 - q) + 0.5); ctx.globalAlpha = 0.6; ctx.fillStyle = '#6a4aff'; ctx.fill();
    FxKit.ribbon(ctx, P, q => 4.5 * (1 - q) + 0.3); ctx.globalAlpha = 0.95; ctx.fillStyle = '#e6dcff'; ctx.fill();
    FxKit.glow(ctx, b.x - ux * 12, by - uy * 12, 18, '#a890ff', 0.85);
    FxKit.glow(ctx, b.x, by, 24, '#7a5aff', 0.45);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const S = this.body();
    ctx.save(); ctx.translate(b.x, by); ctx.rotate(Math.atan2(uy, ux)); ctx.drawImage(S.cv, -S.h, -S.h, S.h * 2, S.h * 2); ctx.restore();
    const fr = Math.floor(t * 30);                                     // 機体のまわりの放電（ちらつく）
    for (let i = 0; i < 2; i++) {
      if (FxKit.h(fr + i * 3, seed) < 0.4) continue;
      const s0 = (FxKit.h(fr + i * 5, seed) - 0.5) * 20, side = i ? 1 : -1;
      const J = FxKit.jag(b.x + ux * s0 + nx * side * 5, by + uy * s0 + ny * side * 5, b.x + ux * (s0 - 6) + nx * side * 15, by + uy * (s0 - 6) + ny * side * 15, 3, 3.5, fr + i);
      FxKit.beam(ctx, c => FxKit.poly(c, J), 1.8, '#f0e8ff', 0.95, '#8a6aff');
    }
  },
  // 着弾（Combat.explode の演出を差し替え）：閃光・六角の衝撃波・火花
  boom(ctx, f, k) {
    const T = k * f.life, seed = f.seed || 0;
    FxKit.flash(ctx, f.x, f.y, f.r * 0.95, T, '#b58bff', 0.1);
    FxKit.hexWave(ctx, f.x, f.y, f.r * 1.15, T / 0.42, '#b58bff', 4);
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, f.x, f.y, f.r * 0.7, '#9a7cff', 0.7 * (1 - k));
    ctx.globalCompositeOperation = 'source-over';
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: seed + 2, n: 10, life: 0.5, v: f.r * 4, drag: 4, size: 3, c0: '#ffffff', c1: '#9a7cff' });
  },
  // 残る嵐（場・敵の下）：渦巻く嵐の帯・磁力線の輪・範囲の縁。稲妻は場の当たり（magzap）が描く
  storm(ctx, z) {
    const T = z.t, R = z.r, ph = z.ph || 0;
    const grow = FxKit.ease(Math.min(1, T / 0.18)), fa = Math.min(1, T / 0.08) * FxKit.clamp01((z.dur - T) / 0.4);
    if (fa <= 0.01) return;
    const Rr = R * (0.45 + 0.55 * grow), arms = [];
    for (let j = 0; j < 3; j++) {
      const P = [];
      for (let i = 0; i <= 14; i++) { const q = i / 14, a = ph - T * 4.5 + j * 2.094 + q * 2.4, rr = Rr * (0.18 + 0.82 * q); P.push({ x: z.x + Math.cos(a) * rr, y: z.y + Math.sin(a) * rr }); }
      arms.push(P);
    }
    const wd = q => 12 * Math.sin(Math.PI * Math.min(1, q * 1.1)) + 1.5;
    for (const P of arms) { FxKit.ribbon(ctx, P, q => wd(q) * 1.7); ctx.globalAlpha = 0.28 * fa; ctx.fillStyle = '#241a48'; ctx.fill(); }
    ctx.globalCompositeOperation = 'lighter';
    for (const P of arms) { FxKit.ribbon(ctx, P, wd); ctx.globalAlpha = 0.5 * fa; ctx.fillStyle = '#7a66e0'; ctx.fill(); }
    for (const P of arms) { FxKit.ribbon(ctx, P, q => wd(q) * 0.25); ctx.globalAlpha = 0.75 * fa; ctx.fillStyle = '#e6dcff'; ctx.fill(); }
    FxKit.glow(ctx, z.x, z.y, R * 0.5, '#9a7cff', 0.5 * fa);
    FxKit.glow(ctx, z.x, z.y, 12, '#ffffff', 0.8 * fa);
    ctx.globalCompositeOperation = 'source-over';
    // 磁力線の輪（左右の極を結ぶ輪が4つ・点線が流れる）
    ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(ph * 0.5 + T * 1.1);
    ctx.setLineDash([5, 6]); ctx.lineCap = 'round';
    ctx.beginPath();
    for (const m of [0.5, 0.85]) for (const s of [-1, 1]) { const rx = R * 0.5 * m * (0.6 + 0.4 * grow); ctx.moveTo(s * rx * 2, 0); ctx.ellipse(s * rx, 0, rx, rx * 0.62, 0, 0, Math.PI * 2); }
    ctx.lineDashOffset = -T * 70;
    ctx.globalAlpha = 0.35 * fa; ctx.strokeStyle = '#7a5aff'; ctx.lineWidth = 5; ctx.stroke();
    ctx.globalAlpha = 0.85 * fa; ctx.strokeStyle = '#d8ccff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
    ctx.globalAlpha = 0.5 * fa; ctx.strokeStyle = '#b58bff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(z.x, z.y, R * grow, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  },
  lobs: { magmissile(ctx, b, by, br, run) { this.missile(ctx, b, by, br, run); } },
  zones: { magstorm(ctx, z) { this.storm(ctx, z); } },
  fx: {
    magboom(ctx, f, k) { this.boom(ctx, f, k); },
    magzap(ctx, f, k) { FXE.chain(ctx, f, k, { w: 5.5, body: '#d4c4ff', glow: '#6a4aff', hit: '#a88aff', lift: 0 }); },
  },
};
FusionFX.register('chainstrike', FX_CHAINSTRIKE);

// ---------------------------------------------------------------
// 雷雲（テスラ＋毒ガス）：毒の緑を帯びた厚い雲（塊の縁が揺れる・中で稲光が点滅・毒の雨）。雲は敵の下に描くので、敵は雲の上で読める。
//   落雷は太い（白い芯・枝分かれ・2回光る）
// ---------------------------------------------------------------
const FX_STORMCLOUD = {
  // 砲台：毒の緑のボンベの上に小さな雷雲。前へ伸びた電極の棒と、雲の下の小さな稲妻
  turret(c) {
    c.beginPath(); c.arc(-6, 2, 9, 0, 7); FXE.edge(c, 2.4);
    const tg = c.createRadialGradient(-9, -1, 1, -6, 2, 9); tg.addColorStop(0, '#c8f08a'); tg.addColorStop(0.6, '#5aa82a'); tg.addColorStop(1, '#2a5a14'); c.fillStyle = tg; c.fill();
    c.fillStyle = '#1a1d24'; c.fillRect(-14, 1, 16, 2.2);
    c.beginPath(); c.rect(1, -1.6, 15, 3.2); FXE.edge(c, 1.8); c.fillStyle = FXE.metal(c, -1.6, 1.6); c.fill();
    FXE.ball(c, 18, 0, 3.6, '#ffffff', '#c8b0ff', '#4a3a8a');
    for (const [x, y, r] of [[-11, -8, 5], [-5, -10.5, 6], [1.5, -8, 4.8], [-4, -6, 5]]) {
      c.beginPath(); c.arc(x, y, r, 0, 7); c.lineWidth = 2.2; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.stroke();
    }
    for (const [x, y, r] of [[-11, -8, 5], [-5, -10.5, 6], [1.5, -8, 4.8], [-4, -6, 5]]) {
      const g = c.createRadialGradient(x - 1.5, y - 2, 0.5, x, y, r); g.addColorStop(0, '#a89ad0'); g.addColorStop(1, '#4a4070'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
    c.lineWidth = 1.4; c.strokeStyle = '#fff6a0'; c.beginPath(); c.moveTo(-3, -4); c.lineTo(-5, 0); c.lineTo(-2.4, 0); c.lineTo(-4.6, 4); c.stroke();
  },
  // 作り置きの雲の塊：芯が濃い紫灰・上が明るい・縁に毒の緑
  puff() {
    return FxKit.sprite('fz-sc-puff', 40, FxKit.res(), c => {
      let g = c.createRadialGradient(0, 4, 0, 0, 2, 40);
      g.addColorStop(0, 'rgba(126,116,170,1)'); g.addColorStop(0.68, 'rgba(98,90,142,0.97)'); g.addColorStop(0.84, 'rgba(92,146,74,0.85)'); g.addColorStop(0.93, 'rgba(40,46,40,0.55)'); g.addColorStop(1, 'rgba(30,36,30,0)');   // 縁をはっきり（塊が読める）・縁に毒の緑と暗い影
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 40, 0, 7); c.fill();
      g = c.createRadialGradient(-8, -14, 0, -8, -12, 24); g.addColorStop(0, 'rgba(214,206,250,0.75)'); g.addColorStop(1, 'rgba(176,166,224,0)');
      c.fillStyle = g; c.beginPath(); c.arc(-8, -12, 24, 0, 7); c.fill();
    });
  },
  // 雲の塊の並び [横, 縦, 大きさ]（範囲の半径に対する割合・奥から手前）
  PUFF: [[-0.42, -0.42, 0.42], [0.08, -0.5, 0.5], [0.5, -0.36, 0.4], [-0.72, -0.08, 0.4], [-0.32, -0.12, 0.5], [0.18, -0.14, 0.52], [0.66, -0.04, 0.42], [-0.45, 0.16, 0.38], [0.02, 0.18, 0.42], [0.46, 0.16, 0.38]],
  cloud(ctx, z) {
    const T = z.t, R = z.r, seed = z.sd === undefined ? (z.sd = Math.abs((z.x * 7 + z.y * 3) | 0) % 97) : z.sd;
    const inA = FxKit.ease(Math.min(1, T / 0.35)), out = FxKit.clamp01((z.dur - T) / 0.5), fa = Math.min(inA, out), sc = 0.6 + 0.4 * inA * (0.85 + 0.15 * out);
    const cx = z.x, cy = z.y - R * 0.3;
    // 地面：範囲の輪（点線・毒の緑と紫）
    ctx.setLineDash([7, 7]); ctx.lineDashOffset = -T * 12;
    ctx.globalAlpha = 0.55 * fa; ctx.strokeStyle = '#9a8ae0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, z.x, z.y, R * 1.05, '#5aa82a', 0.16 * fa);
    // 毒の雨（雲の下から地面へ）
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const x = cx + (FxKit.h(i, seed) - 0.5) * R * 1.5 * sc, top = cy + R * 0.1, span = R * 0.95, y = top + ((T * 230 + FxKit.h(i + 20, seed) * span) % span);
      ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 8);
    }
    ctx.globalAlpha = 0.55 * fa; ctx.strokeStyle = '#b8f07a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    // 雲の塊（縁が揺れる）
    const S = this.puff();
    for (let i = 0; i < this.PUFF.length; i++) {
      const p = this.PUFF[i], s = R * p[2] * sc * (1 + 0.07 * Math.sin(T * 1.7 + i * 1.3)) * 1.05;
      const x = cx + p[0] * R * sc + Math.sin(T * 0.9 + i) * 2.5, y = cy + p[1] * R * sc + Math.cos(T * 1.1 + i * 2) * 1.8;
      ctx.globalAlpha = 0.8 * fa; ctx.drawImage(S.cv, x - s, y - s, s * 2, s * 2);
    }
    // 中で光る稲光と、雲の中を走る小さな稲妻
    const fr = Math.floor(T * 9);
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, cx, cy + R * 0.2, R * 0.9, '#8ad84a', 0.14 * fa);
    if (FxKit.h(fr, seed) > 0.45) {
      const p = this.PUFF[Math.floor(FxKit.h(fr + 50, seed) * this.PUFF.length)], q = this.PUFF[Math.floor(FxKit.h(fr + 60, seed) * this.PUFF.length)];
      const px = cx + p[0] * R * sc, py = cy + p[1] * R * sc;
      FxKit.glow(ctx, px, py, R * 0.6, '#d8c8ff', 0.7 * fa);
      const J = FxKit.jag(px, py, cx + q[0] * R * sc, cy + q[1] * R * sc, 5, 8, fr + seed);
      FxKit.beam(ctx, c => FxKit.poly(c, J), 2.6, '#f0e8ff', 0.8 * fa, '#8a6aff');
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    FxKit.flash(ctx, cx, cy, R * 0.9, T, '#b8a8ff', 0.12);
    FxKit.hexWave(ctx, z.x, z.y, R * 1.15, T / 0.45, '#9a8ae0', 4);
    if (out < 1) FxKit.hexWave(ctx, z.x, z.y, R * 1.2, 1 - out, '#c8f08a', 3);
  },
  // 落雷：雲から敵へ、太い3層のジグザグと枝2本。0.11秒光って一度暗くなり、もう一度落ちる（形が変わる）
  strike(ctx, f, k) {
    const T = k * f.life, seed = f.seed || 0, ox = (f.fromX !== undefined ? f.fromX * 0.45 + f.x * 0.55 : f.x) + (FxKit.h(1, seed) - 0.5) * 16, oy = f.fromY;
    const a = T < 0.11 ? 1 : T < 0.15 ? 0.25 : T < 0.22 ? 0.95 : Math.max(0, 1 - (T - 0.22) / (f.life - 0.22)) * 0.35, re = T < 0.15 ? 0 : 1;
    const M = FxKit.jag(ox, oy, f.x, f.y, 7, 13, seed + re * 11);
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, ox, oy, 40, '#d8c8ff', 0.45 * a);
    ctx.globalCompositeOperation = 'source-over';
    FxKit.beam(ctx, c => FxKit.poly(c, M), 8, '#ece4ff', a, '#8a6aff');
    for (const [i, s] of [[2, 1], [4, -1]]) {                            // 枝
      const p = M[i], q = M[i + 1], an = Math.atan2(q.y - p.y, q.x - p.x) + s * 0.75, L = 22 + 12 * FxKit.h(i, seed + re);
      const B = FxKit.jag(p.x, p.y, p.x + Math.cos(an) * L, p.y + Math.sin(an) * L, 3, 5, seed + i + re * 7);
      FxKit.beam(ctx, c => FxKit.poly(c, B), 3.2, '#ece4ff', a * 0.85, '#8a6aff');
    }
    ctx.globalCompositeOperation = 'lighter';
    FxKit.flash(ctx, f.x, f.y, 26, T, '#d8c7ff', 0.1);
    FxKit.flash(ctx, f.x, f.y, 30, T - 0.15, '#d8c7ff', 0.08);
    FxKit.glow(ctx, f.x, f.y, 24, '#a8e07a', 0.45 * (1 - k));
    ctx.globalCompositeOperation = 'source-over';
    FxKit.hexWave(ctx, f.x, f.y, 36, T / 0.28, '#d8c7ff', 3);
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: seed + 4, n: 9, life: 0.3, v: 240, drag: 4, g: 300, size: 2.8, c0: '#ffffff', c1: '#a8e07a' });
    ctx.globalAlpha = 1;
  },
  zones: { storm(ctx, z) { this.cloud(ctx, z); } },
  fx: {
    strike(ctx, f, k) { this.strike(ctx, f, k); },
    stormzap(ctx, f, k) { FXE.chain(ctx, f, k, { w: 4.5, body: '#e0d8ff', glow: '#5a9a2a', hit: '#b8f07a', amp: 10 }); },
  },
};
FusionFX.register('stormcloud', FX_STORMCLOUD);

// ---------------------------------------------------------------
// 確認室の見本の部屋（DebugRoom.SR）：このファイルの7種の「4つの時刻」と的の並べ方。
//   debugroom.js はこのファイルより後に読むので、ページを読み終わってから足す（測定器 tools/sim.html には DebugRoom が無いので何もしない）
//   face 武器の向き（度）・foes 的の位置 [前へ, 横へ]・times 4つの時刻・look 映す中心（前へ）・w 画面の横幅に映す盤の幅
// ---------------------------------------------------------------
const SR_ELEM = {
  thunderwhip: { face: -90, foes: [[80, 0], [115, -50], [140, 40], [180, -20], [220, 55], [260, -10]], times: [[0.12, '立ち上がる'], [0.6, '進む'], [1.5, '絡む'], [4.3, '消える']], look: 230, w: 480 },
  hellmist: { hold: true, face: -90, foes: [[60, 0], [95, -14], [130, 12], [160, -10], [185, 8], [175, -20]], times: [[0.05, '噴く'], [0.2, '爆発'], [0.35, '吹き続ける'], [1.3, '毒の雲']], look: 115, w: 300 },
  vortex: { hold: true, face: -90, foes: [[60, 0], [110, -30], [150, 40], [-70, 20], [-120, -40], [40, 120], [-30, -150], [20, -100]], times: [[0.2, '渦が立つ'], [0.75, '蒸気の爆発'], [1.5, '巻き込む'], [2.6, '熱衝撃']], look: 0, w: 480 },
  cryobeam: { face: -90, foes: [[70, 0], [110, -8], [150, 8], [190, -6], [230, 6], [270, 0]], times: [[0.03, '撃つ'], [0.12, '光線'], [0.4, '棘山'], [3.0, '砕ける']], look: 150, w: 360 },
  convergence: { face: -90, foes: [[60, 0], [95, -10], [130, 10], [165, -8], [200, 6], [240, 0]], times: [[0.02, '撃つ'], [0.04, '奔流'], [0.06, '多段'], [0.085, '消える']], look: 130, w: 320 },
  chainstrike: { face: -90, foes: [[120, 0], [150, -30], [170, 26], [195, -12], [215, 30], [235, 0]], times: [[0.2, '飛ぶ'], [0.45, '着弾'], [0.7, '嵐'], [1.15, '余韻']], look: 130, w: 320 },
  stormcloud: { face: -90, foes: [[80, 0], [105, -30], [125, 28], [150, -12], [170, 30], [195, 0]], times: [[0.15, '湧く'], [0.48, '落雷'], [2.0, '漂う'], [4.75, '消える']], look: 110, w: 300 },
};
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('load', () => {
  if (typeof DebugRoom !== 'undefined' && DebugRoom.SR) for (const k of Object.keys(SR_ELEM)) if (!DebugRoom.SR[k]) DebugRoom.SR[k] = SR_ELEM[k];
});
