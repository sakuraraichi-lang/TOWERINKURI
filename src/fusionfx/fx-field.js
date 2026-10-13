// ---------------------------------------------------------------
// fusionfx/fx-field.js : 合成武器の演出（場・落ちる弾・爆発）・2026-10-12 段1で分けた（設計 docs/FUSION-ART-DIRECTION-2026-10-12.md）
//
//   このファイルの受け持ち（8種）：
//     voidblade    異界の剣（済・手本）
//     abyssnet     狂気の海底（済・段2）
//     napalm       ヴォルケイノブラスト（済・段2）
//     icefoam      永久凍土（fx2）：砲台を包む泡のドームが凍って砕け、破片が中の敵に刺さる・足元に凍土
//     carpet       滅尽嵐（済・段2）
//     acidfoam     王水（済・段2）
//     toxmortar    破滅の雨（済・段2）
//     icebomb      スノーグレイブ（済・段2）
//
//   書き方：合成武器ごとに1つの物を作り、FusionFX.register(合成の id, 物) で登録する。物に書けるもの（どれも省ける）：
//     turret(c)                 砲台の絵（作り置き。+x が砲身の向き・およそ ±20。FusionFX.turretSprite が 1.2 倍して描く）
//     bullets: { 形: fn(ctx, b, t, run) }   弾の形（fusion.js が spawnBullet に渡す fx の名前）
//     lobs:    { 形: fn(ctx, b, by, br, run) }   落ちてくる弾（spawnLob の fx）
//     fx:      { 名前: fn(ctx, f, k, R) }  一度きりの演出（Fusion.fx(run, { k: 名前, … }) の k。k は 0〜1）
//     zones:   { 種類: fn(ctx, z, run) }   居座る場（Fusion.zone の kind）。敵の下に描く
//     over:    { 種類: fn(ctx, z, run) }   同じ場の、敵の上に描く部分
//     ground(ctx, run)          毎フレーム1回、場（zones）より先・敵の下に描く（ふつうの場 run.fields に絵を重ねるとき。段2）
//     sr                        確認室の見本の部屋の設定（DebugRoom.SR と同じ形。読み込みのあとで DebugRoom.SR へ写す・段2）
//   fn の this は登録した物（物の中に道具を置ける）。描く前後の ctx.save/restore は FusionFX がやる。
//   **名前（形・k・kind）は全体で1つ。**同じ名前を2回登録すると、読み込みのときに警告が出る。
//   部品は src/fxkit.js（光・粒・六角の衝撃波・閃光・3層の線・帯・角の丸い星）。shadowBlur は毎フレーム使わない。乱数（Math.random）を使わない
//   （確認室の見本の部屋で時刻を止めて見るため。時間は f.t・z.t・run.time だけで決める）。
//   当たり・ダメージ・挙動は fusion.js。ここは絵だけ。作ったら確認室の「見本の部屋」で4つの時刻を見る。
//
//   段2（2026-10-12）の決まり：場の演出は**道と敵が透けて見える**こと（塗りは薄く、形は縁・光・粒で見せる）。
//   ぼけた大きな絵（放射グラデーション）は作り置きにし、解像度は2までにする（見本の部屋の拡大で6倍にすると、半径140の絵が1枚11MBになる）。
// ---------------------------------------------------------------
'use strict';

// ---------- このファイルの道具 ----------
const FXF = {
  // ぼけた大きな絵の解像度（作り置き）。くっきりした小さな絵は FxKit.res() のまま
  softRes() { return Math.min(2, FxKit.res()); },
  // 作り置きの絵を (x,y) に。sc … 拡大・rot … 回転
  put(ctx, s, x, y, sc, rot) {
    const h = s.h * (sc === undefined ? 1 : sc);
    if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(s.cv, -h, -h, h * 2, h * 2); ctx.restore(); }
    else ctx.drawImage(s.cv, x - h, y - h, h * 2, h * 2);
  },
  // 放射グラデーションの円（作り置き）。stops … [[位置, 'rgba(...)'], …]
  radial(key, R, stops) {
    return FxKit.sprite(key, R, this.softRes(), c => {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
      for (const [o, col] of stops) g.addColorStop(o, col);
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
    });
  },
  // 場の種（漂う場は、生まれた位置から出す。位置が動いても絵の並びが変わらないように）
  seedOf(z) {
    const x0 = z.x - (z.drift ? z.drift.x * z.t : 0), y0 = z.y - (z.drift ? z.drift.y * z.t : 0);
    return Math.abs(Math.round(x0 * 0.13 + y0 * 0.07)) % 97;
  },
  // 落ちてくる弾の山なり（render.js の bullets と同じ式：高さ = sin(kπ)·min(46, 距離×0.28)）
  lobGeo(b) {
    const tot = Math.hypot(b.landX - b.ox, b.landY - b.oy) || 1;
    return { tot, H: Math.min(46, tot * 0.28), k: FxKit.clamp01(Math.hypot(b.x - b.ox, b.y - b.oy) / tot) };
  },
  lobAt(b, g, k) {
    k = FxKit.clamp01(k);
    return { x: b.ox + (b.landX - b.ox) * k, y: b.oy + (b.landY - b.oy) * k - Math.sin(k * Math.PI) * g.H };
  },
  // 画面の上での進む向き（山なりの傾きを含む）
  lobDir(b, g) {
    const p = this.lobAt(b, g, g.k - 0.02), q = this.lobAt(b, g, g.k + 0.02);
    return Math.atan2(q.y - p.y, q.x - p.x);
  },
  // ゆらぐ円の輪郭（n 点）。amp … 半径に対する揺れ
  blob(ctx, x, y, R, seed, amp, T, n) {
    n = n || 32;
    const p1 = FxKit.h(1, seed) * 6.28, p2 = FxKit.h(2, seed) * 6.28, p3 = FxKit.h(3, seed) * 6.28;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2;
      const r = R * (1 + amp * (0.55 * Math.sin(a * 3 + p1 + T * 0.9) + 0.3 * Math.sin(a * 5 + p2 - T * 1.3) + 0.15 * Math.sin(a * 7 + p3 + T * 0.6)));
      i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  },
  // 太い触手（先が細る・縁取り・ぬめった桃色・吸盤）。異界の剣の触手と同じ描き方
  tentacle(ctx, pts, w0, a) {
    const N = pts.length - 1;
    if (N < 2) return;
    const wd = q => 1.6 + w0 * (1 - Math.pow(q, 1.6));
    ctx.globalAlpha = 0.95 * a; FxKit.ribbon(ctx, pts, q => wd(q) + 2.4); ctx.fillStyle = '#16031a'; ctx.fill();
    const p0 = pts[0], tip = pts[N], gr = ctx.createLinearGradient(p0.x, p0.y, tip.x, tip.y);
    gr.addColorStop(0, '#3a0c40'); gr.addColorStop(0.15, '#9a2c7c'); gr.addColorStop(0.6, '#e2559e'); gr.addColorStop(1, '#ffb0d8');
    ctx.globalAlpha = a; FxKit.ribbon(ctx, pts, wd); ctx.fillStyle = gr; ctx.fill();
    const nrm = j => { const p = pts[Math.max(0, j - 1)], q = pts[Math.min(N, j + 1)], l = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: -(q.y - p.y) / l, y: (q.x - p.x) / l }; };
    ctx.beginPath();
    for (const q of [0.18, 0.32, 0.46, 0.6, 0.74]) {
      const j = Math.round(q * N), p = pts[j], n = nrm(j), w = wd(q), rr = Math.max(1, w * 0.18);
      const sx = p.x - n.x * w * 0.22, sy = p.y - n.y * w * 0.22;
      ctx.moveTo(sx + rr, sy); ctx.arc(sx, sy, rr, 0, 7);
    }
    ctx.fillStyle = '#ffd6ea'; ctx.fill();
    ctx.globalAlpha = 0.6 * a; ctx.strokeStyle = '#ffe8f4'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let j = 1; j <= Math.round(N * 0.8); j++) { const p = pts[j], n = nrm(j), w = wd(j / N) * 0.26; ctx[j > 1 ? 'lineTo' : 'moveTo'](p.x + n.x * w, p.y + n.y * w); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  },
  // 煙の玉（加算にしない・まとめて1回で塗る）。pts … [x, y, r, …]
  puffs(ctx, P, color, a) {
    if (a <= 0.01 || !P.length) return;
    ctx.beginPath();
    for (let i = 0; i < P.length; i += 3) { ctx.moveTo(P[i] + P[i + 2], P[i + 1]); ctx.arc(P[i], P[i + 1], P[i + 2], 0, 7); }
    ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
  },
  _P: [],
  // 触手の一突き（0.2秒前後）：根元 (x0,y0) から敵 (ex,ey) へ一気に伸びて刺さり、縮む。刺さった所に閃光と飛沫
  stab(ctx, x0, y0, ex, ey, T, life, seed, col) {
    const k = T / life, ext = k < 0.35 ? FxKit.ease(k / 0.35) : 1 - FxKit.clamp01((k - 0.55) / 0.45);
    if (ext > 0.02) {
      const dx = ex - x0, dy = ey - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, pts = [], N = 10, bend = (FxKit.h(seed, 3) - 0.5) * L * 0.35;
      for (let j = 0; j <= N; j++) { const q = j / N * ext; pts.push({ x: x0 + dx * q + nx * Math.sin(q * Math.PI) * bend, y: y0 + dy * q + ny * Math.sin(q * Math.PI) * bend }); }
      this.tentacle(ctx, pts, 12, Math.min(1, ext * 2));
    }
    if (k > 0.3) {
      const Th = T - life * 0.3;
      FxKit.flash(ctx, ex, ey, 22, Th, col, 0.08);
      FxKit.sparks(ctx, { x: ex, y: ey, t: Th, seed: seed + 5, n: 6, life: 0.2, v: 200, drag: 7, size: 2.8, c0: '#ffffff', c1: col });
    }
  },
};

// ===============================================================
// 異界の剣（刀＋触手）：斬撃の軌跡そのものが黒紫の裂け目になり、裂け目から太い触手が突き出す
// ===============================================================
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

  // 裂け目の触手の一突き：裂け目の中心線の、敵にいちばん近い所から伸びる
  stab(ctx, f, k) {
    FXF.stab(ctx, f.x + (f.ex - f.x) * 0.25, f.y + (f.ey - f.y) * 0.25, f.ex, f.ey, k * f.life, f.life, f.seed || 0, '#ff5ad0');
  },
  fx: { voidslash(ctx, f, k) { this.voidSlash(ctx, f, k); }, riftstab(ctx, f, k) { this.stab(ctx, f, k); } },
  zones: { rift(ctx, z) { this.riftZone(ctx, z); } },
  over: { rift(ctx, z) { this.riftTentacles(ctx, z); } },
};
FusionFX.register('voidblade', FX_VOIDBLADE);

// ===============================================================
// 狂気の海底（触手＋泡）：範囲いっぱいの大きな泡。中は深い青で、外から中心へ渦を巻いて敵を集める。
//   破裂の直前に、泡の下から太い触手が一突き（泡が張りつめて桃色を帯びる）→ 泡が破れて膜の破片・水しぶき・光の輪
// ===============================================================
const FX_ABYSSNET = {
  sr: { face: -90, foes: [[100, 0], [80, -42], [130, 46], [150, -20], [72, 30], [124, -58]], times: [[0.1, '泡'], [1.5, '引き寄せ'], [2.84, '一突き'], [3.12, '破裂']], look: 108, w: 300 },
  // 狂気の海底：ガラスの泡の玉の中で触手が巻き、先が前へ突き出す。後ろに小さな泡の房
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const [x, y, r] of [[-15, -6, 3.2], [-17, 4.5, 2.6], [-12, 8, 2]]) {
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = 'rgba(138,216,255,0.35)'; c.fill();
      c.lineWidth = 1.2; c.strokeStyle = '#8ad8ff'; c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, 7); c.fill();
    }
    // 台：暗い青の輪
    c.beginPath(); c.arc(-6, 0, 6.5, 0, 7); c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke(); c.fillStyle = '#1a2e40'; c.fill();
    c.lineWidth = 1.4; c.strokeStyle = '#4ab8d8'; c.beginPath(); c.arc(-6, 0, 4.2, 0, 7); c.stroke();
    // 触手：台から泡の中を一巻きして、泡の外の前へ
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const q = i / 28, a = -2.2 + q * 5.2, rr = 7 * (1 - q) + 2;
      pts.push({ x: -4 + q * 26 + Math.cos(a) * rr * (1 - q * 0.6), y: Math.sin(a) * rr * (1 - q * 0.5) });
    }
    FxKit.ribbon(c, pts, q => 4.6 * (1 - q * 0.8) + 1.8); c.fillStyle = '#16031a'; c.fill();
    FxKit.ribbon(c, pts, q => 4.6 * (1 - q * 0.8)); c.fillStyle = '#d05aa8'; c.fill();
    c.fillStyle = '#ffd6ea';
    for (const i of [5, 11, 17, 22]) { const p = pts[i]; c.beginPath(); c.arc(p.x, p.y + 0.6, 0.75, 0, 7); c.fill(); }
    // ガラスの泡（触手の上に重ねる・中は薄い青）
    c.beginPath(); c.arc(6, 0, 11.5, 0, 7);
    const g = c.createRadialGradient(3, -3, 1, 6, 0, 11.5); g.addColorStop(0, 'rgba(160,230,255,0.08)'); g.addColorStop(0.75, 'rgba(60,170,220,0.22)'); g.addColorStop(1, 'rgba(120,220,255,0.5)');
    c.fillStyle = g; c.fill();
    c.lineWidth = 2.6; c.strokeStyle = 'rgba(0,10,30,0.8)'; c.stroke();
    c.lineWidth = 1.6; c.strokeStyle = '#9ee8ff'; c.stroke();
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.arc(6, 0, 8.6, Math.PI * 1.08, Math.PI * 1.45); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(1.5, -6.5, 1.3, 0, 7); c.fill();
  },
  // 泡の中の深い青（作り置き・端ほど濃い。真ん中は道が透ける）
  bodySpr(R) {
    return FXF.radial('fz-aby-body' + R, R, [[0, 'rgba(20,70,130,0.06)'], [0.6, 'rgba(25,100,160,0.14)'], [0.88, 'rgba(50,170,230,0.26)'], [0.97, 'rgba(150,235,255,0.34)'], [1, 'rgba(150,235,255,0)']]);
  },
  // 触手の一突き：泡の下の縁の外から、泡の上のほうへ。ext … 伸び（0〜1）
  thrustPts(x, y, R, ext, T, seed) {
    const pts = [], N = 14, bx = x + (FxKit.h(4, seed) - 0.5) * R * 0.3, by = y + R * 1.15, L = (R * 1.15 + R * 0.4) * ext;
    for (let j = 0; j <= N; j++) {
      const q = j / N;
      pts.push({ x: bx + (x - bx) * q * 0.9 + Math.sin(q * 3.2 + T * 9 + seed) * R * 0.09 * q, y: by - L * q });
    }
    return pts;
  },
  zone(ctx, z) {
    const T = z.t, R0 = z.r, seed = FXF.seedOf(z), left = z.dur - T;
    const grow = T < 0.22 ? 0.5 + 0.5 * FxKit.ease(T / 0.22) : 1;
    const strain = FxKit.clamp01((0.42 - left) / 0.36);                                // 破裂の間際：張りつめる
    const R = R0 * grow * (1 + 0.06 * strain + 0.015 * Math.sin(T * 2.4));
    const a = Math.min(1, T / 0.08 + 0.2);
    // 1. 本体：深い青（真ん中は薄い）
    ctx.globalAlpha = a; FXF.put(ctx, this.bodySpr(R0), z.x, z.y, R / R0);
    // 2. 渦：外から中心へ巻き込む4本の流れ（太い光の帯＋細い芯）
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a0 = -T * 2.2 + i * Math.PI / 2 + seed;
      for (let j = 0; j <= 12; j++) {
        const q = j / 12, an = a0 + q * 2.4, rr = R * (0.9 - q * 0.74);
        j ? ctx.lineTo(z.x + Math.cos(an) * rr, z.y + Math.sin(an) * rr) : ctx.moveTo(z.x + Math.cos(an) * rr, z.y + Math.sin(an) * rr);
      }
    }
    ctx.globalAlpha = 0.16 * a; ctx.strokeStyle = '#4ad0ff'; ctx.lineWidth = 9; ctx.stroke();
    ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = '#c8f4ff'; ctx.lineWidth = 1.8; ctx.stroke();
    // 3. 渦に吸われる光の粒（外から中心へ）
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const ph = (T * 0.5 + FxKit.h(i, seed)) % 1, an = FxKit.h(i + 20, seed) * 6.28 - ph * 3.2 - T * 0.6, rr = R * (0.95 - 0.85 * ph), s = 1.2 + 1.6 * (1 - ph);
      const px = z.x + Math.cos(an) * rr, py = z.y + Math.sin(an) * rr;
      ctx.moveTo(px + s, py); ctx.arc(px, py, s, 0, 7);
    }
    ctx.globalAlpha = 0.85 * a; ctx.fillStyle = '#dff8ff'; ctx.fill();
    // 4. 中心の光と、底に潜む触手の気配（桃色・破裂の間際に強く）
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, z.x, z.y, R * 0.42, '#3ac0ff', 0.4 * a);
    FxKit.glow(ctx, z.x, z.y + R * 0.55, R * 0.4, '#ff5ab8', (0.18 + 0.5 * strain) * a);
    ctx.globalCompositeOperation = 'source-over';
    // 5. 膜：ゆらぐ輪郭（外の光・本体・白い芯）。張りつめると桃色が差す
    FXF.blob(ctx, z.x, z.y, R, seed, 0.035 * (1 - strain * 0.7), T * 2.2, 36);
    ctx.globalAlpha = 0.22 * a; ctx.strokeStyle = strain > 0 ? '#ff7ad0' : '#4ad0ff'; ctx.lineWidth = 10; ctx.stroke();
    ctx.globalAlpha = 0.95 * a; ctx.strokeStyle = '#8ae6ff'; ctx.lineWidth = 3.4; ctx.stroke();
    if (strain > 0) { ctx.globalAlpha = strain * a; ctx.strokeStyle = '#ff8ad8'; ctx.lineWidth = 3.4; ctx.stroke(); }
    ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke();
    // 6. つや：左上の光の弧と点
    ctx.globalAlpha = 0.7 * a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(z.x, z.y, R * 0.84, Math.PI * 1.1, Math.PI * 1.38); ctx.stroke();
    ctx.lineWidth = 2; ctx.globalAlpha = 0.35 * a; ctx.beginPath(); ctx.arc(z.x, z.y, R * 0.84, Math.PI * 0.08, Math.PI * 0.3); ctx.stroke();
    ctx.globalAlpha = 0.9 * a; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(z.x - R * 0.36, z.y - R * 0.66, R * 0.07, R * 0.035, -0.55, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    // 7. 出た瞬間：閃光と六角の衝撃波
    FxKit.flash(ctx, z.x, z.y, R0 * 0.8, T, '#4ad0ff', 0.1);
    FxKit.hexWave(ctx, z.x, z.y, R0 * 1.15, T / 0.4, '#6ad8ff', 4);
  },
  // 破裂の間際（最後の0.36秒）：下から触手が一突き（敵の上に描く）
  thrust(ctx, z) {
    const left = z.dur - z.t, ext = FxKit.ease((0.36 - left) / 0.22);
    if (ext <= 0.01) return;
    const seed = FXF.seedOf(z);
    FXF.tentacle(ctx, this.thrustPts(z.x, z.y, z.r, ext, z.t, seed), 22, Math.min(1, ext * 3));
  },
  // 破裂：膜の破片が外へ飛び、水しぶき・光の輪。触手は引っ込む
  burst(ctx, f, k) {
    const T = k * f.life, R = f.r, seed = Math.abs(Math.round(f.x * 0.13 + f.y * 0.07)) % 97;
    // 光の輪と六角の衝撃波
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, f.x, f.y, R * (0.7 + 0.6 * FxKit.ease(T / 0.3)), '#4ad0ff', 0.55 * (1 - k));
    ctx.globalCompositeOperation = 'source-over';
    FxKit.flash(ctx, f.x, f.y, R * 0.9, T, '#9ae8ff', 0.1);
    FxKit.hexWave(ctx, f.x, f.y, R * 1.3, T / 0.45, '#6ad8ff', 6);
    FxKit.hexWave(ctx, f.x, f.y, R * 0.8, (T - 0.06) / 0.4, '#ff8ad8', 3);
    // 膜の破片：輪が10の弧に割れて外へ
    const q = FxKit.ease(T / 0.32), ra = R * (1 + 0.55 * q), fa = 1 - FxKit.clamp01(T / 0.36);
    if (fa > 0.01) {
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const c = i * Math.PI / 5 + FxKit.h(i, seed) * 0.3, w = 0.2 * (1 - q * 0.5);
        ctx.moveTo(f.x + Math.cos(c - w) * ra, f.y + Math.sin(c - w) * ra); ctx.arc(f.x, f.y, ra, c - w, c + w);
      }
      ctx.globalAlpha = fa * 0.3; ctx.strokeStyle = '#4ad0ff'; ctx.lineWidth = 9; ctx.stroke();
      ctx.globalAlpha = fa; ctx.strokeStyle = '#a8ecff'; ctx.lineWidth = 3.2; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 水しぶき（重さで落ちる）と小さな泡
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed, n: 12, life: 0.5, v: 300, drag: 4, g: 420, size: 4, shape: 'shard', even: true, c0: '#ffffff', c1: '#5ad0ff' });
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: seed + 5, n: 8, life: 0.45, v: 200, drag: 5, size: 3, c0: '#dff8ff', c1: '#8ad8ff' });
    // 触手が引っ込む
    const ext = 1 - FxKit.ease(T / 0.34);
    if (ext > 0.02) FXF.tentacle(ctx, this.thrustPts(f.x, f.y, R / 1.05, ext, 3 + T, seed), 22, ext);
  },
  // 泡の中の触手の一突き：泡の下の縁から、中の敵へ
  stab(ctx, f, k) {
    const a = (FxKit.h(f.seed || 0, 9) - 0.5) * 1.2 + Math.PI / 2;
    FXF.stab(ctx, f.x + Math.cos(a) * f.r * 0.95, f.y + Math.sin(a) * f.r * 0.95, f.ex, f.ey, k * f.life, f.life, f.seed || 0, '#ff8ad8');
  },
  fx: { abyssburst(ctx, f, k) { this.burst(ctx, f, k); }, abyssstab(ctx, f, k) { this.stab(ctx, f, k); } },
  zones: { abyss(ctx, z) { this.zone(ctx, z); } },
  over: { abyss(ctx, z) { this.thrust(ctx, z); } },
};
FusionFX.register('abyssnet', FX_ABYSSNET);

// ===============================================================
// ヴォルケイノブラスト（火炎＋迫撃砲）：火口の砲身から、黒い岩に赤い割れ目の火山弾を噴き上げる。
//   放物線で飛び（煙と火の粉の尾）、落ちた所で溶岩が飛び散り、燃える溜まり（割れた黒い殻の間で溶岩が脈打つ）が残る
// ===============================================================
const FX_NAPALM = {
  sr: { face: -90, foes: [[70, -30], [105, 24], [140, -12], [175, 30], [205, -26], [235, 6]], times: [[0.05, '噴く'], [0.28, '飛ぶ'], [0.62, '落ちる'], [2.0, '燃える']], look: 130, w: 320 },
  // ヴォルケイノブラスト：後ろに燃料の玉、前は火口の形の太い砲身（黒い岩に溶岩の割れ目）。火口が赤く光る
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    // 燃料の玉
    c.beginPath(); c.arc(-12, 0, 7, 0, 7); c.lineWidth = 2.2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    const tg = c.createRadialGradient(-14, -3, 1, -12, 0, 7); tg.addColorStop(0, '#9aa0ac'); tg.addColorStop(1, '#3a3e48'); c.fillStyle = tg; c.fill();
    c.fillStyle = '#ff6a2a'; c.fillRect(-15, -1.2, 6, 2.4);
    // 砲身：火山の形（根元が太く、口が少しすぼむ）
    c.beginPath(); c.moveTo(-6, -8.5); c.lineTo(15, -5.4); c.lineTo(19, -6.6); c.lineTo(19, 6.6); c.lineTo(15, 5.4); c.lineTo(-6, 8.5); c.closePath();
    c.lineWidth = 2.4; c.strokeStyle = 'rgba(0,0,0,0.9)'; c.stroke();
    const bg = c.createLinearGradient(0, -8, 0, 8); bg.addColorStop(0, '#5a3a2c'); bg.addColorStop(0.5, '#2b1a14'); bg.addColorStop(1, '#140a06'); c.fillStyle = bg; c.fill();
    // 溶岩の割れ目
    c.strokeStyle = '#ff5a1a'; c.lineWidth = 1.6; c.beginPath();
    c.moveTo(-4, -5); c.lineTo(1, -2.5); c.lineTo(5, -4.4); c.lineTo(10, -1.6); c.lineTo(15, -3.6);
    c.moveTo(-3, 5.2); c.lineTo(2, 2.4); c.lineTo(7, 4.2); c.lineTo(12, 2); c.moveTo(1, -2.5); c.lineTo(2, 2.4);
    c.stroke();
    c.strokeStyle = '#ffd27a'; c.lineWidth = 0.6; c.stroke();
    // 火口
    c.beginPath(); c.ellipse(19, 0, 2.6, 6.6, 0, 0, 7);
    const mg = c.createRadialGradient(19, 0, 0, 19, 0, 6.6); mg.addColorStop(0, '#fff2b0'); mg.addColorStop(0.45, '#ff9a2a'); mg.addColorStop(1, '#b0200a'); c.fillStyle = mg; c.fill();
    c.lineWidth = 1.2; c.strokeStyle = '#2b1a14'; c.stroke();
    // 炎の舌（火炎放射器の名残）
    c.beginPath(); c.moveTo(20.5, -3.4); c.quadraticCurveTo(25, -2, 26.5, 0); c.quadraticCurveTo(25, 2, 20.5, 3.4); c.closePath();
    c.fillStyle = '#ffb43c'; c.fill();
  },
  // 火山弾（作り置き）：黒い岩・赤い割れ目・芯が光る
  rockSpr() {
    return FxKit.sprite('fz-magma-rock', 16, FxKit.res(), c => {
      const P = [];
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, r = 12.5 * (0.82 + 0.3 * FxKit.h(i, 7)); P.push(Math.cos(a) * r, Math.sin(a) * r); }
      c.beginPath(); for (let i = 0; i < 9; i++) c[i ? 'lineTo' : 'moveTo'](P[i * 2], P[i * 2 + 1]); c.closePath();
      c.lineJoin = 'round'; c.lineWidth = 2.4; c.strokeStyle = '#0a0402'; c.stroke();
      const g = c.createRadialGradient(-3, -4, 1, 0, 0, 13); g.addColorStop(0, '#6a3a24'); g.addColorStop(0.55, '#2e1810'); g.addColorStop(1, '#120804'); c.fillStyle = g; c.fill();
      // 割れ目（中心から外へ枝分かれ）
      c.lineCap = 'round';
      const crack = (w, col) => {
        c.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = i * 1.26 + 0.4, r1 = 5 + 2 * FxKit.h(i, 3), r2 = 10.5;
          c.moveTo(Math.cos(a) * 1.5, Math.sin(a) * 1.5); c.lineTo(Math.cos(a + 0.25) * r1, Math.sin(a + 0.25) * r1); c.lineTo(Math.cos(a - 0.1) * r2, Math.sin(a - 0.1) * r2);
        }
        c.lineWidth = w; c.strokeStyle = col; c.stroke();
      };
      crack(3.2, 'rgba(255,60,10,0.55)'); crack(1.7, '#ff7a1a'); crack(0.7, '#fff0a0');
      const cg = c.createRadialGradient(0, 0, 0, 0, 0, 5); cg.addColorStop(0, 'rgba(255,240,180,0.95)'); cg.addColorStop(1, 'rgba(255,120,30,0)'); c.fillStyle = cg; c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill();
    });
  },
  lob(ctx, b, by, br, run) {
    const g = FXF.lobGeo(b), k = g.k, sc = br / (b.r || 1), R = 12 * Math.min(1.5, sc), seed = Math.abs(Math.round(b.landX * 0.13 + b.landY * 0.07)) % 97;
    // 尾：山なりをさかのぼって、煙の玉（暗い灰）と火の粉
    const P = FXF._P; P.length = 0;
    for (let j = 1; j <= 7; j++) { const p = FXF.lobAt(b, g, k - j * 0.045); P.push(p.x + Math.sin(j * 2.1 + seed) * 2, p.y, 4 + j * 1.5); }
    FXF.puffs(ctx, P, '#3a2e2a', 0.32);
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 1; j <= 4; j++) { const p = FXF.lobAt(b, g, k - j * 0.04); FxKit.glow(ctx, p.x, p.y, R * (1.3 - j * 0.2), '#ff5a1a', 0.42 - j * 0.08); }
    ctx.beginPath();
    for (let j = 0; j < 8; j++) {
      const p = FXF.lobAt(b, g, k - 0.03 - j * 0.035), s = 2.2 - j * 0.18;
      const ox = Math.sin(run.time * 13 + j * 2.7 + seed) * 6, oy = Math.cos(run.time * 11 + j * 1.9) * 5;
      ctx.rect(p.x + ox - s / 2, p.y + oy - s / 2, s, s);
    }
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffb040'; ctx.fill();
    FxKit.glow(ctx, b.x, by, R * 2.5, '#ff5a1a', 0.5);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    FXF.put(ctx, this.rockSpr(), b.x, by, R / 12.5, run.time * 5 + seed);
  },
  // 噴く瞬間：火口から炎の柱（3層）と溶岩の粒・煙
  eruption(ctx, f, k) {
    const T = k * f.life, ux = Math.cos(f.a), uy = Math.sin(f.a), mx = f.x + ux * 25, my = f.y + uy * 25;
    const L = 52 * FxKit.ease(T / 0.07) * (1 - FxKit.clamp01((T - 0.12) / 0.2)), W = 15;
    if (L > 2) {
      const pts = [];
      for (let i = 0; i <= 8; i++) { const q = i / 8; pts.push({ x: mx + ux * L * q + -uy * Math.sin(q * 5 + T * 30) * 2 * q, y: my + uy * L * q + ux * Math.sin(q * 5 + T * 30) * 2 * q }); }
      const wd = m => q => m * (1 - q * 0.75) * Math.sqrt(Math.sin(Math.PI * Math.min(1, q * 0.9 + 0.1)));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#ff3a0a'; FxKit.ribbon(ctx, pts, wd(W * 2.2)); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.95; ctx.fillStyle = '#ff9a2a'; FxKit.ribbon(ctx, pts, wd(W)); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff4c8'; FxKit.ribbon(ctx, pts, wd(W * 0.38)); ctx.fill();
    }
    FxKit.flash(ctx, mx, my, 34, T, '#ff7a1a', 0.1);
    FxKit.sparks(ctx, { x: mx, y: my, t: T, seed: 3, n: 12, life: 0.45, a: f.a, spread: 0.9, v: 330, drag: 4, size: 3.4, c0: '#fff0b0', c1: '#ff3a0a' });
    const P = FXF._P; P.length = 0;
    for (let i = 0; i < 4; i++) { const d = 6 + 18 * FxKit.ease(T / 0.4) * (0.6 + i * 0.2), s = (i % 2 ? 1 : -1) * (4 + i * 3); P.push(mx + ux * d - uy * s, my + uy * d + ux * s, 5 + 9 * FxKit.ease(T / 0.4)); }
    FXF.puffs(ctx, P, '#2e2622', 0.32 * (1 - k));
  },
  // 落ちた所：溶岩が飛び散る（黒い岩の破片と赤い飛沫）・閃光・六角の衝撃波
  land(ctx, f, k) {
    const T = k * f.life, R = f.r, seed = f.seed || 0;
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, f.x, f.y, R * (0.6 + 0.5 * FxKit.ease(T / 0.2)), '#ff4a0a', 0.75 * (1 - k));
    ctx.globalCompositeOperation = 'source-over';
    FxKit.flash(ctx, f.x, f.y, R * 0.95, T, '#ff8a2a', 0.09);
    FxKit.hexWave(ctx, f.x, f.y, R * 1.15, T / 0.38, '#ff7a2a', 4.5);
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed, n: 12, life: 0.5, v: 270, drag: 5, size: 3.8, shape: 'shard', even: true, c0: '#fff0b0', c1: '#ff3a0a' });
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: seed + 9, n: 6, life: 0.45, v: 200, drag: 6, size: 3.6, shape: 'shard', add: false, c0: '#3a2018', c1: '#1a0c08' });
  },
  // 燃える溜まり（作り置き・3つの形）：赤橙の溶岩の上に、黒い殻が割れて浮く。殻の間が光る
  poolSpr(v) {
    return FxKit.sprite('fz-magma-pool' + v, 64, FXF.softRes(), c => {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 62);
      g.addColorStop(0, 'rgba(255,190,70,0.5)'); g.addColorStop(0.55, 'rgba(255,90,20,0.36)'); g.addColorStop(0.85, 'rgba(170,30,8,0.22)'); g.addColorStop(1, 'rgba(120,20,5,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 62, 0, 7); c.fill();
      // 黒い殻（多角形の板）。間に溶岩の割れ目が残る
      c.lineJoin = 'round';
      for (let i = 0; i < 11; i++) {
        const a = FxKit.h(i, v * 13) * 6.28, d = 10 + 38 * Math.sqrt(FxKit.h(i + 30, v * 13)), r = 7 + 7 * FxKit.h(i + 60, v * 13);
        const cx = Math.cos(a) * d, cy = Math.sin(a) * d;
        c.beginPath();
        for (let j = 0; j < 6; j++) { const b = j / 6 * 6.28 + FxKit.h(j + i * 7, v) * 0.6, rr = r * (0.7 + 0.4 * FxKit.h(j + i * 5, v + 1)); c[j ? 'lineTo' : 'moveTo'](cx + Math.cos(b) * rr, cy + Math.sin(b) * rr); }
        c.closePath();
        c.globalAlpha = 0.55 * (1 - d / 70); c.fillStyle = '#2a0c06'; c.fill();
        c.globalAlpha = 0.8 * (1 - d / 70); c.lineWidth = 1.2; c.strokeStyle = '#ffb040'; c.stroke();
      }
      c.globalAlpha = 1;
    });
  },
  // 燃える溜まり：ふつうの火の場（run.fields・render.js が加算の炎を描く）の下地に、溶岩の溜まりを重ねる。ヴォルケイノブラストの場だけ
  ground(ctx, run) {
    const fs = run.fields;
    if (!fs || !fs.length) return;
    const t = run.time;
    for (const f of fs) {
      if (f.kind !== 'fire' || !f.src || f.src.fuse !== 'napalm') continue;
      const k = f.t / f.dur, sp = 0.45 + 0.55 * FxKit.ease(f.t / 0.35), fade = Math.min(1, (1 - k) * 3), v = Math.abs(Math.round(f.x * 0.13 + f.y * 0.07)) % 3;
      const pulse = 0.85 + 0.15 * Math.sin(t * 3 + f.x * 0.05);
      ctx.globalAlpha = fade * pulse;
      FXF.put(ctx, this.poolSpr(v), f.x, f.y, (f.r / 62) * sp, v * 2.1);
    }
    ctx.globalAlpha = 1;
  },
  lobs: { magma(ctx, b, by, br, run) { this.lob(ctx, b, by, br, run); } },
  fx: { eruption(ctx, f, k) { this.eruption(ctx, f, k); }, magmaland(ctx, f, k) { this.land(ctx, f, k); } },
};
FusionFX.register('napalm', FX_NAPALM);

// ===============================================================
// 永久凍土（凍結＋泡）（2026-10-13 fx2 で作り直し・前は敵1体ずつに小さな泡の殻）：砲台を包む大きな泡（半径＝射程）が膨らみ、縁から凍って白い氷のドームになる。
//   中の敵は氷の結晶に閉じ込められる → ドームにひび → 砕けて、縁の破片が中の敵へ飛び込んで刺さる → 足元に凍土が残る
// ===============================================================
const FX_ICEFOAM = {
  sr: { face: -90, foes: [[60, -40], [95, 50], [125, -70], [150, 20], [185, -25], [30, 110]], times: [[0.12, '膨らむ'], [0.5, '凍る'], [0.95, '砕ける'], [1.6, '凍土']], look: 40, w: 470 },
  // 永久凍土：雪の結晶の台座の前に、凍った泡の房（白い氷の殻）。口は六角の氷
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    // 雪の結晶（後ろ）
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI / 3 + Math.PI / 6;
      c.beginPath(); c.moveTo(-8 + Math.cos(a) * 11, Math.sin(a) * 11); c.lineTo(-8 - Math.cos(a) * 11, -Math.sin(a) * 11);
      c.lineWidth = 4.6; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke(); c.lineWidth = 2.4; c.strokeStyle = '#7fe6ff'; c.stroke();
    }
    c.beginPath(); c.arc(-8, 0, 4.2, 0, 7); c.fillStyle = '#2a3e50'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = '#bff0ff'; c.stroke();
    // 凍った泡（前へ3つ）
    for (const [x, y, r] of [[3, -5, 5.2], [4, 5.5, 4.4], [12, 0, 6.2]]) {
      c.beginPath(); FxKit.hexAdd(c, x, y, r, Math.PI / 6);
      c.lineWidth = 2.2; c.strokeStyle = 'rgba(0,10,25,0.85)'; c.stroke();
      const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.5, x, y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#cdeeff'); g.addColorStop(1, '#7ac8f0');
      c.fillStyle = g; c.fill();
      c.lineWidth = 0.7; c.strokeStyle = 'rgba(70,140,190,0.8)'; c.beginPath();
      for (let j = 0; j < 6; j += 2) { const a = j * Math.PI / 3 + Math.PI / 6; c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      c.stroke();
    }
    // 口（白く光る）
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(18, 0, 1.8, 0, 7); c.fill();
  },
  // 縁に並ぶ氷の板（作り置きの六角・半径16）。毎フレーム六角の線を引くと重い（半径210の縁に26枚で 1.4ms）ので絵を貼る。ice＝ドームの縁／ground＝凍土の縁
  plateSpr(kind) {
    return FxKit.sprite('fz-pf-plate-' + kind, 18, FxKit.res(), c => {
      c.beginPath(); FxKit.hexAdd(c, 0, 0, 16, Math.PI / 6);
      if (kind === 'ice') { c.fillStyle = 'rgba(223,246,255,0.55)'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = '#ffffff'; c.stroke(); }
      else { c.fillStyle = 'rgba(143,220,255,0.16)'; c.fill(); c.lineWidth = 1.3; c.strokeStyle = 'rgba(191,240,255,0.75)'; c.stroke(); }
    });
  },
  // 敵を閉じ込める氷の結晶の塊（作り置き）：六角柱が5本、敵から外へ突き出す。中は透ける
  coatSpr() {
    return FxKit.sprite('fz-pf-coat', 30, FxKit.res(), c => {
      c.lineJoin = 'round';
      const prism = (a, L, W) => {
        const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, b = 4;
        c.beginPath();
        c.moveTo(ux * b + nx * W, uy * b + ny * W); c.lineTo(ux * (L - W) + nx * W, uy * (L - W) + ny * W); c.lineTo(ux * L, uy * L);
        c.lineTo(ux * (L - W) - nx * W, uy * (L - W) - ny * W); c.lineTo(ux * b - nx * W, uy * b - ny * W); c.closePath();
        c.lineWidth = 2.4; c.strokeStyle = 'rgba(10,40,80,0.75)'; c.stroke();
        const g = c.createLinearGradient(nx * W, ny * W, -nx * W, -ny * W); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(190,236,255,0.7)'); g.addColorStop(1, 'rgba(110,190,240,0.75)');
        c.fillStyle = g; c.fill();
        c.lineWidth = 1; c.strokeStyle = '#ffffff'; c.stroke();
        c.beginPath(); c.moveTo(ux * b, uy * b); c.lineTo(ux * L, uy * L); c.lineWidth = 0.8; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
      };
      for (const [a, L, W] of [[-2.6, 22, 4.4], [-0.5, 24, 4.6], [2.2, 20, 4], [0.9, 18, 3.8], [-1.55, 28, 5.2]]) prism(a, L, W);
      c.beginPath(); FxKit.hexAdd(c, 0, 0, 12, Math.PI / 6);
      c.lineWidth = 2.4; c.strokeStyle = 'rgba(10,40,80,0.75)'; c.stroke();
      const g = c.createRadialGradient(-4, -4, 1, 0, 0, 12); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(150,215,250,0.38)');
      c.fillStyle = g; c.fill(); c.lineWidth = 1.2; c.strokeStyle = '#e6f8ff'; c.stroke();
    });
  },
  // 大きな泡のドーム（砲台が中心・半径＝射程）：膨らむ（0.2秒）→ 縁から凍って白い氷のドームに（六角の板・内へ伸びる霜の棘）→ ひび → 震える → 砕ける（縁の破片が内へ倒れて落ちる・白い霧）
  dome(ctx, f, k) {
    const T = k * f.life, H = f.hold, R = f.r, x = f.x, y = f.y, seed = f.seed || 0;
    const N = Math.max(10, Math.round(R * 2 * Math.PI / 50));            // 縁の板と棘の数（細かくすると線の描画が重い：半径210で 44→26）
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.miterLimit = 3;     // 丸い継ぎ目は重い
    if (T < H) {
      const rr = R * (0.12 + 0.88 * FxKit.ease(T / 0.2)), fz = FxKit.clamp01((T - 0.15) / 0.3), cr = FxKit.clamp01((T - 0.45) / Math.max(0.1, H - 0.45));
      const cx = x + (H - T < 0.18 ? Math.sin(T * 95) * 1.8 : 0);
      // 中は塗らない（半径210を塗ると重い・中の敵が読めなくなる）。縁の内側に太く薄い帯を2本重ねて、ドームの厚みに見せる
      ctx.beginPath(); ctx.arc(cx, y, Math.max(4, rr - 22), 0, 7);
      ctx.globalAlpha = 0.1 + 0.08 * fz; ctx.strokeStyle = fz < 0.5 ? '#8fdcff' : '#dff6ff'; ctx.lineWidth = 34; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, y, Math.max(4, rr - 50), 0, 7);
      ctx.globalAlpha = 0.05 + 0.04 * fz; ctx.lineWidth = 30; ctx.stroke();
      // 縁：外の光・本体（泡の水色 → 氷の白）・白い芯
      ctx.beginPath(); ctx.arc(cx, y, rr, 0, 7);
      ctx.globalAlpha = 0.18; ctx.strokeStyle = '#9fe6ff'; ctx.lineWidth = 20 + 6 * fz; ctx.stroke();
      if (fz < 1) { ctx.globalAlpha = 0.9 * (1 - fz); ctx.strokeStyle = '#8fdcff'; ctx.lineWidth = 7; ctx.stroke(); }
      if (fz > 0) { ctx.globalAlpha = 0.95 * fz; ctx.strokeStyle = '#e6f8ff'; ctx.lineWidth = 11; ctx.stroke(); }
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.stroke();
      // 泡のつや（左上の太い白い弧・凍ると薄く）
      ctx.globalAlpha = 0.7 * (1 - 0.6 * fz); ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(cx, y, rr * 0.88, Math.PI * 1.1, Math.PI * 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, y, rr * 0.88, Math.PI * 1.47, Math.PI * 1.53); ctx.stroke();
      if (fz > 0) {
        // 縁に並ぶ氷の板（六角）：場所ごとに凍る時刻がずれる
        const PL = this.plateSpr('ice');
        ctx.globalAlpha = 1;
        for (let i = 0; i < N; i++) {
          if (FxKit.h(i, seed) * 0.7 + 0.3 * (i / N) > fz) continue;
          const a = i / N * Math.PI * 2, d = rr - 6, s = 12 + 5 * FxKit.h(i + 7, seed);
          FXF.put(ctx, PL, cx + Math.cos(a) * d, y + Math.sin(a) * d, s / 16);
        }
        // 内へ伸びる霜の棘
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const a = (i + 0.5) / N * Math.PI * 2, L = (16 + 26 * FxKit.h(i + 3, seed)) * fz, d = rr - 14, ux = Math.cos(a), uy = Math.sin(a), w = 7;
          ctx.moveTo(cx + ux * d - uy * w, y + uy * d + ux * w); ctx.lineTo(cx + ux * (d - L), y + uy * (d - L)); ctx.lineTo(cx + ux * d + uy * w, y + uy * d - ux * w);
        }
        ctx.globalAlpha = 0.75 * fz; ctx.fillStyle = '#eefaff'; ctx.fill();
      }
      // ひび（縁から中へ・ぎざぎざ）
      if (cr > 0) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = FxKit.h(i, seed + 11) * 6.28, L = rr * (0.22 + 0.4 * FxKit.h(i + 5, seed)) * cr;
          const J = FxKit.jag(cx + Math.cos(a) * rr, y + Math.sin(a) * rr, cx + Math.cos(a) * (rr - L), y + Math.sin(a) * (rr - L), 3, 10, seed + i);
          for (let j = 0; j < J.length; j++) ctx[j ? 'lineTo' : 'moveTo'](J[j].x, J[j].y);
        }
        ctx.globalAlpha = 0.95; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6; ctx.stroke();
      }
      // 膨らむ瞬間の閃光と六角の衝撃波・凍る瞬間の白い光
      FxKit.flash(ctx, x, y, 56, T, '#bff0ff', 0.1);
      FxKit.hexWave(ctx, x, y, R * 0.45, T / 0.3, '#bff0ff', 5);
      if (fz > 0 && fz < 1) { ctx.globalCompositeOperation = 'lighter'; FxKit.glow(ctx, cx, y, rr * 0.7, '#dff6ff', 0.3 * Math.sin(Math.PI * fz)); ctx.globalCompositeOperation = 'source-over'; }
    } else {
      const t = T - H, q = FxKit.clamp01(t / (f.life - H));
      FxKit.flash(ctx, x, y, R * 0.45, t, '#dff6ff', 0.1);
      FxKit.hexWave(ctx, x, y, R * 1.05, t / 0.4, '#bff0ff', 7);
      // 縁の破片（大きな三角）：内へ倒れ込みながら落ちて消える
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const a = (i + FxKit.h(i, seed) * 0.6) / N * Math.PI * 2, d = R * (1 - 0.28 * FxKit.ease(q) * (0.5 + FxKit.h(i + 3, seed)));
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d + 70 * q * q, s = (15 + 12 * FxKit.h(i + 9, seed)) * (1 - 0.35 * q), ro = a + q * (FxKit.h(i + 13, seed) - 0.5) * 9;
        ctx.moveTo(px + Math.cos(ro) * s, py + Math.sin(ro) * s); ctx.lineTo(px + Math.cos(ro + 2.3) * s * 0.6, py + Math.sin(ro + 2.3) * s * 0.6); ctx.lineTo(px + Math.cos(ro + 4) * s * 0.85, py + Math.sin(ro + 4) * s * 0.85); ctx.closePath();
      }
      ctx.globalAlpha = 0.9 * (1 - q); ctx.fillStyle = '#e6f8ff'; ctx.fill();
      ctx.globalAlpha = 0.9 * (1 - q); ctx.strokeStyle = '#6ab8e8'; ctx.lineWidth = 1.6; ctx.stroke();
      // 白い霧（縁の内側に残る）
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + seed, d = R * 0.6; FxKit.glow(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d - q * 12, R * (0.24 + 0.14 * q), '#dff6ff', 0.32 * (1 - q)); }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  },
  // 閉じ込められた敵：氷の結晶の塊が、少し行き過ぎて生える → 光るきらめき → 割れる直前に震える。敵に付いて動く（敵の上に描く）
  coat(ctx, f, k) {
    const e = f.e, T = k * f.life, L = f.life;
    let x = e ? (e.dead ? f.x : e.x) : f.x;
    const y = e ? (e.dead ? f.y : e.y) : f.y;
    const q = FxKit.clamp01((T - 0.12) / 0.16);
    if (q <= 0) return;
    if (L - T < 0.2) x += Math.sin(T * 90) * 1.5;
    const g = q - 1, sc = (1 + 2.7 * g * g * g + 1.7 * g * g) * (f.r / 15);
    ctx.globalAlpha = Math.min(1, (L - T) / 0.04);
    FXF.put(ctx, this.coatSpr(), x, y, sc);
    ctx.globalCompositeOperation = 'lighter';
    if (q < 1) FxKit.glow(ctx, x, y, 30 * sc, '#dff6ff', 0.7 * (1 - q));
    const ph = (T * 1.3 + (f.seed || 0) * 0.37) % 1;
    FxKit.glow(ctx, x - 8 * sc + 16 * sc * ph, y - 12 * sc, 7, '#ffffff', 0.8 * Math.sin(Math.PI * ph));
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  // 砕けた破片が刺さる：ドームの縁から大きな氷の破片が n 本、敵へ飛び込む（travel 秒）→ 刺さるたび閃光・六角の衝撃波・小さな破片
  shard(ctx, f, k) {
    const T = k * f.life, e = f.e, tx = e && !e.dead ? e.x : f.x, ty = e && !e.dead ? e.y : f.y, seed = f.seed || 0;
    for (let h = 0; h < f.n; h++) {
      const t0 = h * f.gap, q = (T - t0) / f.travel;
      if (q < 0) continue;
      if (q < 1) {
        const a = f.a + (h - (f.n - 1) / 2) * 0.32, sx = f.cx + Math.cos(a) * f.R, sy = f.cy + Math.sin(a) * f.R;
        const m = q * q, px = sx + (tx - sx) * m, py = sy + (ty - sy) * m, dx = tx - sx, dy = ty - sy, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
        // 尾（3層）
        const bx = px - ux * Math.min(46, dl * m), by = py - uy * Math.min(46, dl * m);
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(px, py);
        ctx.globalAlpha = 0.3; ctx.strokeStyle = '#7fd0ff'; ctx.lineWidth = 12; ctx.stroke();
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
        // 破片（細長い菱形・白い芯）
        const L = 15, W = 6;
        ctx.beginPath(); ctx.moveTo(px + ux * L, py + uy * L); ctx.lineTo(px - uy * W, py + ux * W); ctx.lineTo(px - ux * L * 0.8, py - uy * L * 0.8); ctx.lineTo(px + uy * W, py - ux * W); ctx.closePath();
        ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = '#2a6aa0'; ctx.stroke(); ctx.fillStyle = '#bfeaff'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(px + ux * L * 0.8, py + uy * L * 0.8); ctx.lineTo(px - ux * L * 0.5, py - uy * L * 0.5); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      } else {
        const t = T - t0 - f.travel;
        FxKit.flash(ctx, tx, ty, f.r * 0.9, t, '#bff0ff', 0.08);
        if (h === 0) FxKit.hexWave(ctx, tx, ty, f.r * 1.05, t / 0.3, '#bff0ff', 4);   // 六角の衝撃波は1本目だけ（重さ）
        FxKit.sparks(ctx, { x: tx, y: ty, t, seed: seed + h * 5, n: 6, life: 0.4, v: 220, drag: 5, size: 4, shape: 'shard', even: true, add: false, c0: '#ffffff', c1: '#8fd8ff' });
      }
    }
    ctx.globalAlpha = 1;
  },
  // 連鎖凍裂（fp_icefoam）の破裂：閃光・六角の衝撃波・破片
  burst(ctx, f, k) {
    const T = k * f.life;
    FxKit.flash(ctx, f.x, f.y, f.r * 0.9, T, '#bff0ff', 0.08);
    FxKit.hexWave(ctx, f.x, f.y, f.r * 1.05, T / 0.32, '#bff0ff', 4);
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: (f.seed || 0) + 21, n: 8, life: 0.45, v: 230, drag: 5, size: 4.2, shape: 'shard', even: true, add: false, c0: '#ffffff', c1: '#8fd8ff' });
  },
  // 凍土（居座る場・敵の下）：凍った地面・縁に霜の六角の板・中へ伸びる霜の筋・きらめき
  ground(ctx, z) {
    const a = Math.min(1, z.t / 0.25) * Math.min(1, (z.dur - z.t) / 0.5), R = z.r, seed = z.seed || 0, x = z.x, y = z.y;
    if (a <= 0.01) return;
    ctx.beginPath(); ctx.arc(x, y, R - 18, 0, 7);
    ctx.globalAlpha = 0.12 * a; ctx.strokeStyle = '#8fdcff'; ctx.lineWidth = 36; ctx.stroke();
    const N = Math.max(10, Math.round(R * 2 * Math.PI / 46));
    ctx.lineJoin = 'miter'; ctx.miterLimit = 3;
    const PL = this.plateSpr('ground');
    ctx.globalAlpha = a;
    for (let i = 0; i < N; i++) { const an = i / N * Math.PI * 2, d = R - 8 - 8 * FxKit.h(i, seed), s = 9 + 4 * FxKit.h(i + 7, seed); FXF.put(ctx, PL, x + Math.cos(an) * d, y + Math.sin(an) * d, s / 16); }
    // 凍った地面のひび（縁から中へ・ぎざぎざ。矢印に見えないよう枝は付けない）
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const an = (i + FxKit.h(i, seed + 3)) / 10 * Math.PI * 2, d0 = R * 0.9, d1 = R * (0.45 + 0.25 * FxKit.h(i + 2, seed));
      const J = FxKit.jag(x + Math.cos(an) * d0, y + Math.sin(an) * d0, x + Math.cos(an) * d1, y + Math.sin(an) * d1, 4, 7, seed + i * 3);
      for (let j = 0; j < J.length; j++) ctx[j ? 'lineTo' : 'moveTo'](J[j].x, J[j].y);
    }
    ctx.globalAlpha = 0.45 * a; ctx.strokeStyle = '#bff0ff'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const ph = (z.t * 1.4 + FxKit.h(i, seed)) % 1, an = FxKit.h(i + 20, seed) * 6.28, d = R * (0.2 + 0.75 * FxKit.h(i + 30, seed));
      FxKit.glow(ctx, x + Math.cos(an) * d, y + Math.sin(an) * d, 5 + 5 * Math.sin(Math.PI * ph), '#ffffff', 0.7 * a * Math.sin(Math.PI * ph));
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  fx: { pfdome(ctx, f, k) { this.dome(ctx, f, k); }, pfcoat(ctx, f, k) { this.coat(ctx, f, k); }, pfshard(ctx, f, k) { this.shard(ctx, f, k); }, pfburst(ctx, f, k) { this.burst(ctx, f, k); } },
  zones: { permafrost(ctx, z) { this.ground(ctx, z); } },
};
FusionFX.register('icefoam', FX_ICEFOAM);

// ===============================================================
// 滅尽嵐（ミサイル＋迫撃砲）：空から煙の尾を引くミサイルが降り、着弾で火の玉と六角の衝撃波。
//   跡に火炎旋風（縦に立ち上がる炎の渦・巻き上がる火の粉・地面の焦げ）が数秒漂う
// ===============================================================
const FX_CARPET = {
  sr: { face: -90, foes: [[110, -30], [135, 20], [150, -8], [165, 34], [185, -26], [205, 6]], times: [[0.14, '降る'], [0.4, '着弾'], [1.0, '旋風'], [3.7, '消える']], look: 120, w: 300 },
  // 滅尽嵐：迫撃砲の太い筒の上に、3本のミサイルを扇に並べたポッド。橙の帯
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    // 台座の筒（迫撃砲）
    c.beginPath(); c.rect(-14, -8, 10, 16); c.lineWidth = 2.2; c.strokeStyle = 'rgba(0,0,0,0.88)'; c.stroke();
    const bg = c.createLinearGradient(0, -8, 0, 8); bg.addColorStop(0, '#8a8f9a'); bg.addColorStop(1, '#3a3e48'); c.fillStyle = bg; c.fill();
    c.fillStyle = '#e0b060'; c.fillRect(-12.5, -8, 2.4, 16);
    // ミサイル3本（扇）
    for (const [y, a] of [[-6.5, -0.16], [0, 0], [6.5, 0.16]]) {
      c.save(); c.translate(-4, y); c.rotate(a);
      c.beginPath(); c.moveTo(0, -2.6); c.lineTo(15, -2.6); c.quadraticCurveTo(22, 0, 15, 2.6); c.lineTo(0, 2.6); c.closePath();
      c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.88)'; c.stroke();
      const mg = c.createLinearGradient(0, -2.6, 0, 2.6); mg.addColorStop(0, '#f2f4f8'); mg.addColorStop(1, '#9aa0ac'); c.fillStyle = mg; c.fill();
      c.beginPath(); c.moveTo(13, -2.6); c.quadraticCurveTo(21.5, 0, 13, 2.6); c.closePath(); c.fillStyle = '#ff7a3c'; c.fill();
      c.fillStyle = '#ff7a3c'; c.fillRect(3, -2.6, 1.6, 5.2);
      c.beginPath(); c.moveTo(0, -2.6); c.lineTo(-2.5, -4.6); c.lineTo(2.5, -2.6); c.moveTo(0, 2.6); c.lineTo(-2.5, 4.6); c.lineTo(2.5, 2.6); c.fillStyle = '#5a606e'; c.fill();
      c.restore();
    }
    // 留め具（橙の帯）
    c.beginPath(); c.rect(-1, -10, 3.2, 20); c.fillStyle = '#2a2e36'; c.fill(); c.lineWidth = 1; c.strokeStyle = '#ff9a4a'; c.stroke();
  },
  // 降るミサイル：山なりの向きに傾けた機体・噴射炎（3層）・煙の尾
  lob(ctx, b, by, br, run) {
    const g = FXF.lobGeo(b), k = g.k, sc = Math.min(1.5, br / (b.r || 1)), ang = FXF.lobDir(b, g), seed = Math.abs(Math.round(b.landX * 0.13 + b.landY * 0.07)) % 97;
    const P = FXF._P; P.length = 0;
    for (let j = 1; j <= 8; j++) { const p = FXF.lobAt(b, g, k - j * 0.04); P.push(p.x + Math.sin(j * 1.7 + seed) * 2.5, p.y, 3.5 + j * 1.3); }
    FXF.puffs(ctx, P, '#9aa0aa', 0.22);
    ctx.save(); ctx.translate(b.x, by); ctx.rotate(ang); ctx.scale(sc, sc);
    // 噴射炎
    const fl = 1 + 0.15 * Math.sin(run.time * 40 + seed);
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, -14, 0, 16, '#ff7a2a', 0.6);
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#ff5a1a'; ctx.beginPath(); ctx.moveTo(-11, -5); ctx.lineTo(-11 - 22 * fl, 0); ctx.lineTo(-11, 5); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffc060'; ctx.beginPath(); ctx.moveTo(-11, -3); ctx.lineTo(-11 - 13 * fl, 0); ctx.lineTo(-11, 3); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.moveTo(-11, -1.6); ctx.lineTo(-17 * fl, 0); ctx.lineTo(-11, 1.6); ctx.closePath(); ctx.fill();
    // 機体
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-11, -4.6); ctx.lineTo(8, -4.6); ctx.quadraticCurveTo(18, 0, 8, 4.6); ctx.lineTo(-11, 4.6); ctx.closePath();
    ctx.lineWidth = 2.2; ctx.strokeStyle = '#0a0c10'; ctx.stroke(); ctx.fillStyle = '#e6e9ef'; ctx.fill();
    ctx.fillStyle = '#9aa0ac'; ctx.fillRect(-11, 1.2, 19, 3.4);
    ctx.beginPath(); ctx.moveTo(6, -4.6); ctx.quadraticCurveTo(17.6, 0, 6, 4.6); ctx.closePath(); ctx.fillStyle = '#ff6a2a'; ctx.fill();
    ctx.fillStyle = '#ff6a2a'; ctx.fillRect(-4, -4.6, 2.2, 9.2);
    ctx.beginPath(); ctx.moveTo(-11, -4.6); ctx.lineTo(-15, -9); ctx.lineTo(-6, -4.6); ctx.moveTo(-11, 4.6); ctx.lineTo(-15, 9); ctx.lineTo(-6, 4.6); ctx.fillStyle = '#4a505c'; ctx.fill();
    ctx.restore();
  },
  // 着弾：大きな閃光・火の玉・六角の衝撃波・煙の輪・破片
  blast(ctx, f, k) {
    const T = k * f.life, R = f.r, seed = f.seed || 0, q = FxKit.ease(T / 0.25);
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, f.x, f.y, R * (0.9 + 0.8 * q), '#ff6a1a', 0.85 * (1 - FxKit.clamp01(T / 0.45)));
    FxKit.glow(ctx, f.x, f.y, R * (0.5 + 0.4 * q), '#ffd060', 0.9 * (1 - FxKit.clamp01(T / 0.3)));
    ctx.globalCompositeOperation = 'source-over';
    FxKit.flash(ctx, f.x, f.y, R * 1.5, T, '#ffb040', 0.1);
    FxKit.hexWave(ctx, f.x, f.y, R * 1.7, T / 0.4, '#ff9a3a', 5);
    // 煙の輪（暗い灰・外へ広がって薄れる）
    const sa = 0.35 * (1 - FxKit.clamp01((T - 0.08) / (f.life - 0.08)));
    if (sa > 0.01) {
      ctx.beginPath(); ctx.arc(f.x, f.y, R * (0.7 + 0.75 * FxKit.ease((T - 0.05) / 0.5)), 0, 7);
      ctx.globalAlpha = sa; ctx.strokeStyle = '#3a3634'; ctx.lineWidth = 11; ctx.stroke(); ctx.globalAlpha = 1;
    }
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed, n: 10, life: 0.5, v: 320, drag: 5, size: 3.6, shape: 'shard', even: true, c0: '#fff0c0', c1: '#ff5a1a' });
  },
  // 火炎旋風：地面の焦げと炎の輪 → 縦に立ち上がる渦（上ほど広がる炎の帯・後ろは暗く前は明るい）→ 巻き上がる火の粉。上に中心の白い熱
  whirl(ctx, z) {
    const T = z.t, R = z.r, seed = FXF.seedOf(z), ap = FxKit.ease(T / 0.3), out = FxKit.clamp01((z.dur - T) / 0.45), a = ap * out;
    if (a <= 0.01) return;
    const x = z.x, y = z.y, H = R * 1.7 * (0.4 + 0.6 * ap), SQ = 0.34, ph = T * 9 + seed;
    // 地面：焦げと炎の輪
    ctx.globalAlpha = 0.45 * a; FXF.put(ctx, FXF.radial('fz-whirl-scorch' + R, R * 1.15, [[0, 'rgba(30,8,0,0.7)'], [0.7, 'rgba(40,12,2,0.45)'], [1, 'rgba(40,12,2,0)']]), x, y, 1);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, x, y, R * 1.2, '#ff4a0a', 0.5 * a);
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath(); ctx.ellipse(x, y, R * 0.95, R * 0.95 * SQ * 1.6, 0, 0, 7);
    ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = '#ff7a2a'; ctx.lineWidth = 3; ctx.stroke();
    // 渦の帯：高さ6段・上ほど広い。後ろ半分（暗い）→ 前半分（明るい3層）
    const N = 6, back = [], front = [];
    for (let j = 0; j < N; j++) {
      const q = j / (N - 1), hy = y - H * q, rx = R * (0.32 + 0.55 * q) * (1 + 0.06 * Math.sin(T * 7 + j)), ry = rx * SQ, s = ph * (1 - q * 0.25) + j * 0.9;
      back.push(hy, rx, ry, s + Math.PI, s + Math.PI + 2.1); front.push(hy, rx, ry, s, s + 2.3);
    }
    const arcs = (L) => { ctx.beginPath(); for (let i = 0; i < L.length; i += 5) { const hy = L[i], rx = L[i + 1], ry = L[i + 2], s = L[i + 3], e = L[i + 4]; ctx.moveTo(x + Math.cos(s) * rx, hy + Math.sin(s) * ry); ctx.ellipse(x, hy, rx, ry, 0, s, e); } };
    ctx.lineCap = 'round';
    arcs(back); ctx.globalAlpha = 0.45 * a; ctx.strokeStyle = '#a0300a'; ctx.lineWidth = 5; ctx.stroke();
    // 中心の熱（縦の光）
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < 3; j++) FxKit.glow(ctx, x, y - H * (0.15 + j * 0.32), R * (0.42 + j * 0.1), j ? '#ff9a3a' : '#ffd070', 0.55 * a);
    ctx.globalCompositeOperation = 'source-over';
    arcs(front);
    ctx.globalAlpha = 0.3 * a; ctx.strokeStyle = '#ff5a1a'; ctx.lineWidth = 11; ctx.stroke();
    ctx.globalAlpha = 0.95 * a; ctx.strokeStyle = '#ffa040'; ctx.lineWidth = 4.2; ctx.stroke();
    ctx.globalAlpha = a; ctx.strokeStyle = '#fff2c0'; ctx.lineWidth = 1.5; ctx.stroke();
    // 巻き上がる火の粉
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const p = (T * 0.8 + FxKit.h(i, seed)) % 1, an = FxKit.h(i + 30, seed) * 6.28 + T * 6 + p * 4, rr = R * (0.3 + 0.6 * p), s = 2.6 * (1 - p * 0.5);
      const px = x + Math.cos(an) * rr, py = y - H * 1.15 * p + Math.sin(an) * rr * SQ;
      ctx.rect(px - s / 2, py - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.95 * a; ctx.fillStyle = '#ffc060'; ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  lobs: { stormmsl(ctx, b, by, br, run) { this.lob(ctx, b, by, br, run); } },
  fx: { carpetblast(ctx, f, k) { this.blast(ctx, f, k); } },
  zones: { firewhirl(ctx, z) { this.whirl(ctx, z); } },
};
FusionFX.register('carpet', FX_CARPET);

// ===============================================================
// 王水（毒ガス＋泡）：狙った所に黄金の液体が撒かれ、つやのある金の水たまりがゆっくり広がる。
//   表面に波紋と光の筋・泡がぷくぷく。中の敵から金色の湯気（溶ける）
// ===============================================================
const FX_ACIDFOAM = {
  sr: { face: -90, foes: [[110, 0], [80, -40], [140, 44], [170, -24], [96, 52], [190, 18]], times: [[0.06, '撒く'], [0.35, '広がる'], [2.0, '溶かす'], [5.75, '乾く']], look: 130, w: 320 },
  // 王水：毒ガスのボンベの胴に金の液の窓・前にガラスの泡の口（中に金の液）。金のしずく
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    // ボンベ
    c.beginPath(); c.arc(-8, 0, 8.5, 0, 7); c.lineWidth = 2.2; c.strokeStyle = 'rgba(0,0,0,0.88)'; c.stroke();
    const tg = c.createRadialGradient(-11, -4, 1, -8, 0, 8.5); tg.addColorStop(0, '#a0a6b0'); tg.addColorStop(1, '#3a3e48'); c.fillStyle = tg; c.fill();
    // 窓（金の液面）
    c.save(); c.beginPath(); c.arc(-8, 0, 5.2, 0, 7); c.clip();
    c.fillStyle = '#20180a'; c.fillRect(-14, -6, 12, 12);
    const lg = c.createLinearGradient(0, -1, 0, 6); lg.addColorStop(0, '#fff0a0'); lg.addColorStop(0.4, '#ffd24a'); lg.addColorStop(1, '#b07a10'); c.fillStyle = lg; c.fillRect(-14, -0.5, 12, 7);
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(-12, -0.6, 7, 0.9);
    c.restore();
    c.lineWidth = 1.2; c.strokeStyle = '#ffd24a'; c.beginPath(); c.arc(-8, 0, 5.2, 0, 7); c.stroke();
    // 首
    c.beginPath(); c.rect(0, -2.4, 6, 4.8); c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.88)'; c.stroke(); c.fillStyle = '#6a6e78'; c.fill();
    // ガラスの泡の口（金の液が半分）
    c.beginPath(); c.arc(13, 0, 7.5, 0, 7); c.lineWidth = 2.4; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    c.save(); c.beginPath(); c.arc(13, 0, 7.5, 0, 7); c.clip();
    c.fillStyle = 'rgba(140,216,255,0.22)'; c.fillRect(5, -8, 16, 16);
    const fg = c.createLinearGradient(0, 0, 0, 8); fg.addColorStop(0, '#ffe680'); fg.addColorStop(1, '#c08a10'); c.fillStyle = fg;
    c.beginPath(); c.moveTo(5, 1); c.quadraticCurveTo(13, -1.5, 21, 1); c.lineTo(21, 9); c.lineTo(5, 9); c.closePath(); c.fill();
    c.restore();
    c.lineWidth = 1.4; c.strokeStyle = '#bfefff'; c.beginPath(); c.arc(13, 0, 7.5, 0, 7); c.stroke();
    c.lineWidth = 1.6; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(13, 0, 5.4, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
    // 金のしずく
    c.fillStyle = '#ffd24a';
    for (const [x, y, r] of [[22.5, -2.5, 1.6], [24.5, 2.2, 1.2]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
  },
  // 金の面（作り置き・水たまりの形で塗るので、色の付いた円の絵ではなく、塗りのグラデーションを半径ごとに1つ）
  // 金の面（作り置き・半径ごとに1枚）：真ん中は薄く、縁に向かって濃い金。端の外に柔らかい光
  faceSpr(R) {
    return FXF.radial('fz-aqua-face' + Math.round(R), R * 1.08, [[0, 'rgba(255,240,170,0.22)'], [0.5, 'rgba(255,205,70,0.19)'], [0.8, 'rgba(225,150,20,0.27)'], [0.9, 'rgba(190,115,10,0.36)'], [0.95, 'rgba(255,176,32,0.2)'], [1, 'rgba(255,176,32,0)']]);
  },
  pool(ctx, z) {
    const T = z.t, seed = FXF.seedOf(z), out = FxKit.clamp01((z.dur - T) / 0.6);
    const R = z.r * (0.35 + 0.6 * FxKit.ease(T / 0.55) + 0.05 * FxKit.clamp01((T - 0.55) / 4)) * (0.9 + 0.1 * out), a = out;
    if (a <= 0.01) return;
    ctx.translate(z.x, z.y);
    // 1. 金の面（薄い・道が透ける）。形で塗ると重い（2026-10-13：盤まるごとの0.58）ので、作り置きの円を貼り、ゆらぐ形は縁で見せる
    ctx.globalAlpha = a; FXF.put(ctx, this.faceSpr(z.r), 0, 0, R / z.r);
    // 2. 縁：金・白い芯（外の光は面の絵の端に含める）
    FXF.blob(ctx, 0, 0, R, seed, 0.045, T * 0.5, 32);
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.95 * a; ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3; ctx.stroke();
    ctx.globalAlpha = 0.9 * a; ctx.strokeStyle = '#fff8d8'; ctx.lineWidth = 1; ctx.stroke();
    // 3. 波紋（中心から外へ・3本の円を1回で）
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const q = (T * 0.32 + i / 3) % 1, rr = R * (0.15 + 0.8 * q); ctx.moveTo(rr, 0); ctx.arc(0, 0, rr, 0, 7); }
    ctx.globalAlpha = 0.3 * a; ctx.strokeStyle = '#fff2b0'; ctx.lineWidth = 1.6; ctx.stroke();
    // 4. つや：左上の光の筋と、ゆっくり滑る光
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.76, Math.PI * 1.08, Math.PI * 1.32); ctx.stroke();
    ctx.lineWidth = 2.2; ctx.globalAlpha = 0.35 * a;
    const sl = T * 0.35 + seed;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.55, sl, sl + 0.5); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, -R * 0.32, -R * 0.42, R * 0.3, '#fff0a0', 0.35 * a);
    ctx.globalCompositeOperation = 'source-over';
    // 5. 泡（ぷくぷく：膨らんで弾ける）
    ctx.beginPath();
    const pops = [];
    for (let i = 0; i < 9; i++) {
      const per = 1.1 + 0.6 * FxKit.h(i, seed), ph = (T / per + FxKit.h(i + 40, seed)) % 1, an = FxKit.h(i + 10, seed) * 6.28, d = Math.sqrt(FxKit.h(i + 20, seed)) * R * 0.82;
      const bx = Math.cos(an) * d, by = Math.sin(an) * d;
      if (ph < 0.82) { const s = 1.5 + 3.2 * (ph / 0.82); ctx.moveTo(bx + s, by); ctx.arc(bx, by, s, 0, 7); }
      else pops.push(bx, by, (ph - 0.82) / 0.18);
    }
    ctx.globalAlpha = 0.85 * a; ctx.strokeStyle = '#fff0a0'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < pops.length; i += 3) { const s = 4.7 + 4 * pops[i + 2]; ctx.moveTo(pops[i] + s, pops[i + 1]); ctx.arc(pops[i], pops[i + 1], s, 0, 7); }
    ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;
    // 6. 撒いた瞬間：六角の衝撃波
    FxKit.hexWave(ctx, 0, 0, z.r * 0.9, T / 0.45, '#ffd24a', 4);
  },
  _st: [],
  // 中の敵から金色の湯気（敵の上に描く）。数は4体まで（重さ）
  steam(ctx, z) {
    if (typeof Fusion === 'undefined' || typeof Grid === 'undefined') return;
    const T = z.t, a = FxKit.clamp01((z.dur - T) / 0.6) * FxKit.clamp01((T - 0.2) / 0.3);
    if (a <= 0.01) return;
    const R = z.r * (0.35 + 0.6 * FxKit.ease(T / 0.55)), L = this._st; L.length = 0;
    for (const e of Fusion.enemiesIn(z.x, z.y, R)) { if (L.length >= 4) break; L.push(e); }
    if (!L.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      for (let j = 0; j < 2; j++) {
        const p = (T * 1.1 + j * 0.5 + i * 0.23) % 1;
        FxKit.glow(ctx, e.x + Math.sin(p * 5 + i) * 4, e.y - 8 - p * 22, 6 + 7 * p, '#ffd860', (1 - p) * 0.5 * a);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  },
  // 撒く瞬間：金のしずくが飛び散る・閃光
  splash(ctx, f, k) {
    const T = k * f.life, R = f.r, seed = Math.abs(Math.round(f.x * 0.13 + f.y * 0.07)) % 97;
    FxKit.flash(ctx, f.x, f.y, R * 0.55, T, '#ffd24a', 0.1);
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed, n: 14, life: 0.5, v: 300, drag: 4.5, size: 4, shape: 'shard', even: true, add: false, c0: '#fff2b0', c1: '#e0a020' });
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: seed + 3, n: 8, life: 0.4, v: 200, drag: 5, size: 3, c0: '#ffffff', c1: '#ffd24a' });
  },
  fx: { aquasplash(ctx, f, k) { this.splash(ctx, f, k); } },
  zones: { aquaregia(ctx, z) { this.pool(ctx, z); } },
  over: { aquaregia(ctx, z) { this.steam(ctx, z); } },
};
FusionFX.register('acidfoam', FX_ACIDFOAM);

// ===============================================================
// 破滅の雨（毒ガス＋迫撃砲）：毒の緑に光る重い砲弾が次々と降り、着弾ごとに大きな毒の爆発
//   （白い芯・緑の火の玉・緑の衝撃波・毒の煙のきのこ）。最初の1発の跡に短い毒の雲（ふつうの毒の場）
// ===============================================================
const FX_TOXMORTAR = {
  sr: { face: -90, foes: [[110, 0], [90, -40], [140, 40], [170, -20], [130, -60], [190, 30]], times: [[0.3, '降る'], [0.42, '着弾'], [1.3, '雨'], [2.4, '余韻']], look: 130, w: 340 },
  // 破滅の雨：後ろに毒のボンベ（緑に光る窓）、前は暗い緑の太い迫撃砲。危険の帯と緑に光る口
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.arc(-12, 0, 7, 0, 7); c.lineWidth = 2.2; c.strokeStyle = 'rgba(0,0,0,0.88)'; c.stroke();
    const tg = c.createRadialGradient(-14, -3, 1, -12, 0, 7); tg.addColorStop(0, '#8a9a6a'); tg.addColorStop(1, '#2a321a'); c.fillStyle = tg; c.fill();
    c.beginPath(); c.arc(-12, 0, 3.2, 0, 7); c.fillStyle = '#b8ff6a'; c.fill(); c.lineWidth = 1; c.strokeStyle = '#1a2a0a'; c.stroke();
    // 砲身
    c.beginPath(); c.moveTo(-5, -5); c.lineTo(13, -5.6); c.lineTo(19, -8); c.lineTo(19, 8); c.lineTo(13, 5.6); c.lineTo(-5, 5); c.closePath();
    c.lineWidth = 2.4; c.strokeStyle = 'rgba(0,0,0,0.9)'; c.stroke();
    const bg = c.createLinearGradient(0, -8, 0, 8); bg.addColorStop(0, '#6a7a4a'); bg.addColorStop(0.5, '#3a4a22'); bg.addColorStop(1, '#1a220c'); c.fillStyle = bg; c.fill();
    // 危険の帯（黒と緑の斜め縞）
    c.save(); c.beginPath(); c.rect(2, -5.4, 6, 10.8); c.clip();
    c.fillStyle = '#10140a'; c.fillRect(2, -6, 6, 12); c.fillStyle = '#7fe35a';
    for (let y = -10; y < 8; y += 4) { c.beginPath(); c.moveTo(2, y); c.lineTo(8, y + 4); c.lineTo(8, y + 6); c.lineTo(2, y + 2); c.closePath(); c.fill(); }
    c.restore();
    // 口（緑に光る）
    c.beginPath(); c.ellipse(19, 0, 2.2, 7.6, 0, 0, 7);
    const mg = c.createRadialGradient(19, 0, 0, 19, 0, 7.6); mg.addColorStop(0, '#f0ffc0'); mg.addColorStop(0.5, '#7fe35a'); mg.addColorStop(1, '#1a3a0a'); c.fillStyle = mg; c.fill();
    c.lineWidth = 1.2; c.strokeStyle = '#10180a'; c.stroke();
  },
  // 砲弾（作り置き）：暗い緑の弾殻・光る緑の帯・とがった弾頭（+x が進む向き）
  shellSpr() {
    return FxKit.sprite('fz-doom-shell', 20, FxKit.res(), c => {
      c.lineJoin = 'round';
      c.beginPath(); c.moveTo(-13, -8); c.lineTo(5, -8); c.quadraticCurveTo(17, -6, 18, 0); c.quadraticCurveTo(17, 6, 5, 8); c.lineTo(-13, 8); c.quadraticCurveTo(-16, 0, -13, -8); c.closePath();
      c.lineWidth = 2.6; c.strokeStyle = '#060a02'; c.stroke();
      const g = c.createLinearGradient(0, -8, 0, 8); g.addColorStop(0, '#7a8a5a'); g.addColorStop(0.35, '#3e4e26'); g.addColorStop(1, '#141c08'); c.fillStyle = g; c.fill();
      // 光る帯
      for (const x of [-7, 0]) { c.fillStyle = '#b8ff6a'; c.fillRect(x, -8, 2.6, 16); c.fillStyle = '#f0ffc8'; c.fillRect(x + 0.8, -8, 1, 16); }
      // 弾頭
      c.beginPath(); c.moveTo(7, -7.6); c.quadraticCurveTo(17, -6, 18, 0); c.quadraticCurveTo(17, 6, 7, 7.6); c.closePath();
      const ng = c.createLinearGradient(0, -7, 0, 7); ng.addColorStop(0, '#d8ff9a'); ng.addColorStop(1, '#4ac81a'); c.fillStyle = ng; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(-12, -6, 17, 1.6);
    });
  },
  lob(ctx, b, by, br, run) {
    const g = FXF.lobGeo(b), k = g.k, sc = Math.min(1.5, br / (b.r || 1)), ang = FXF.lobDir(b, g), seed = Math.abs(Math.round(b.landX * 0.13 + b.landY * 0.07)) % 97;
    // 緑の尾：光の玉と毒のしずく
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 1; j <= 3; j++) { const p = FXF.lobAt(b, g, k - j * 0.06); FxKit.glow(ctx, p.x, p.y, 16 * sc * (1 - j * 0.18), '#5ad81a', 0.42 - j * 0.1); }
    ctx.beginPath();
    for (let j = 0; j < 7; j++) {
      const p = FXF.lobAt(b, g, k - 0.03 - j * 0.04), s = 2.6 - j * 0.25, ox = Math.sin(j * 2.3 + seed + run.time * 6) * 5;
      ctx.moveTo(p.x + ox + s, p.y + j * 1.2); ctx.arc(p.x + ox, p.y + j * 1.2, s, 0, 7);
    }
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#b8ff6a'; ctx.fill();
    FxKit.glow(ctx, b.x, by, 30 * sc, '#7fe35a', 0.55);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    FXF.put(ctx, this.shellSpr(), b.x, by, sc * 0.95, ang);
  },
  // 着弾：白い芯の閃光・緑の火の玉・緑の衝撃波・破片・毒の煙のきのこ
  blast(ctx, f, k) {
    const T = k * f.life, R = f.r, seed = f.seed || 0, q = FxKit.ease(T / 0.25);
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, f.x, f.y, R * (0.4 + 0.45 * q), '#4ad81a', 0.7 * (1 - FxKit.clamp01(T / 0.5)));
    FxKit.glow(ctx, f.x, f.y, R * (0.2 + 0.2 * q), '#e8ffa0', 0.9 * (1 - FxKit.clamp01(T / 0.25)));
    ctx.globalCompositeOperation = 'source-over';
    FxKit.flash(ctx, f.x, f.y, R * 0.6, T, '#9aff5a', 0.1);
    FxKit.hexWave(ctx, f.x, f.y, R, T / 0.45, '#8aff4a', 6);
    // 毒の煙（暗い緑の玉が膨らみ、上へ）
    const sm = FxKit.ease((T - 0.05) / 0.5), sa = 0.42 * (1 - FxKit.clamp01((T - 0.2) / (f.life - 0.2)));
    if (sa > 0.01 && sm > 0) {
      const P = FXF._P; P.length = 0;
      for (let i = 0; i < 6; i++) { const an = i / 6 * 6.28 + FxKit.h(i, seed), d = R * 0.16 * sm; P.push(f.x + Math.cos(an) * d, f.y + Math.sin(an) * d * 0.6 - R * 0.12 * sm, R * (0.1 + 0.09 * sm) * (0.8 + 0.4 * FxKit.h(i + 6, seed))); }
      P.push(f.x, f.y - R * 0.28 * sm, R * 0.16 * sm);
      FXF.puffs(ctx, P, '#2a4a14', sa);
    }
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed, n: 12, life: 0.55, v: 380, drag: 4.5, size: 3.8, shape: 'shard', even: true, c0: '#eaffb0', c1: '#4ac81a' });
  },
  lobs: { doomshell(ctx, b, by, br, run) { this.lob(ctx, b, by, br, run); } },
  fx: { doomblast(ctx, f, k) { this.blast(ctx, f, k); } },
};
FusionFX.register('toxmortar', FX_TOXMORTAR);

// ===============================================================
// スノーグレイブ（迫撃砲＋凍結）：白い霜の尾を引く氷の塊の砲弾。落ちた所に氷の破片と六角の衝撃波、
//   そのあと氷の嵐（白と水色の風の渦・回る吹雪の粒・大きな雪の結晶）がゆっくり漂う
// ===============================================================
const FX_ICEBOMB = {
  sr: { face: -90, foes: [[125, -26], [140, 20], [160, -6], [175, 30], [190, -30], [210, 8]], times: [[0.3, '飛ぶ'], [0.68, '着弾'], [1.6, '吹雪'], [5.45, '消える']], look: 140, w: 300 },
  // スノーグレイブ：氷に覆われた迫撃砲。筒の上下に氷の結晶が生え、口は水色に光る。台に雪の印
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.rect(-15, -7, 9, 14); c.lineWidth = 2.2; c.strokeStyle = 'rgba(0,0,0,0.88)'; c.stroke();
    const bg0 = c.createLinearGradient(0, -7, 0, 7); bg0.addColorStop(0, '#9aa6b8'); bg0.addColorStop(1, '#3a4252'); c.fillStyle = bg0; c.fill();
    // 雪の印
    c.strokeStyle = '#dff6ff'; c.lineWidth = 1;
    c.beginPath(); for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; c.moveTo(-10.5 + Math.cos(a) * 4, Math.sin(a) * 4); c.lineTo(-10.5 - Math.cos(a) * 4, -Math.sin(a) * 4); } c.stroke();
    // 砲身
    c.beginPath(); c.moveTo(-6, -4.6); c.lineTo(13, -5.2); c.lineTo(18, -7.4); c.lineTo(18, 7.4); c.lineTo(13, 5.2); c.lineTo(-6, 4.6); c.closePath();
    c.lineWidth = 2.4; c.strokeStyle = 'rgba(0,0,0,0.9)'; c.stroke();
    const bg = c.createLinearGradient(0, -7, 0, 7); bg.addColorStop(0, '#d8eaf6'); bg.addColorStop(0.5, '#7a98b0'); bg.addColorStop(1, '#2e3e52'); c.fillStyle = bg; c.fill();
    // 氷の結晶（筒の上下に生える）
    for (const [x, s, h] of [[-2, -1, 6], [5, -1, 8], [11, -1, 5], [1, 1, 5], [8, 1, 7]]) {
      c.beginPath(); c.moveTo(x - 2.4, s * 4.8); c.lineTo(x + 0.6, s * (4.8 + h)); c.lineTo(x + 2.6, s * 4.8); c.closePath();
      c.fillStyle = '#e6f8ff'; c.fill(); c.lineWidth = 0.9; c.strokeStyle = '#5aa8d8'; c.stroke();
    }
    // 口
    c.beginPath(); c.ellipse(18, 0, 2.2, 7.4, 0, 0, 7);
    const mg = c.createRadialGradient(18, 0, 0, 18, 0, 7.4); mg.addColorStop(0, '#ffffff'); mg.addColorStop(0.5, '#9fe0ff'); mg.addColorStop(1, '#2a5a8a'); c.fillStyle = mg; c.fill();
    c.lineWidth = 1.2; c.strokeStyle = '#1a2a3a'; c.stroke();
  },
  // 氷の塊（作り置き）：六角の結晶の面・白い稜線
  iceSpr() {
    return FxKit.sprite('fz-ice-chunk', 16, FxKit.res(), c => {
      const P = [];
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, r = 12.5 * (0.85 + 0.25 * FxKit.h(i, 21)); P.push(Math.cos(a) * r, Math.sin(a) * r); }
      c.lineJoin = 'miter';
      c.beginPath(); for (let i = 0; i < 7; i++) c[i ? 'lineTo' : 'moveTo'](P[i * 2], P[i * 2 + 1]); c.closePath();
      c.lineWidth = 2.4; c.strokeStyle = '#0a2236'; c.stroke();
      const g = c.createLinearGradient(-10, -10, 10, 10); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#bfe8ff'); g.addColorStop(1, '#4a90c8'); c.fillStyle = g; c.fill();
      // 面（中心の少しずれた点から角へ）
      c.beginPath(); for (let i = 0; i < 7; i++) { c.moveTo(-2, -2); c.lineTo(P[i * 2], P[i * 2 + 1]); }
      c.lineWidth = 0.9; c.strokeStyle = 'rgba(255,255,255,0.75)'; c.stroke();
      c.beginPath(); c.moveTo(-2, -2); c.lineTo(P[0], P[1]); c.lineTo(P[2], P[3]); c.closePath(); c.fillStyle = 'rgba(40,100,160,0.25)'; c.fill();
      c.beginPath(); c.moveTo(-2, -2); c.lineTo(P[8], P[9]); c.lineTo(P[10], P[11]); c.closePath(); c.fillStyle = 'rgba(255,255,255,0.45)'; c.fill();
    });
  },
  lob(ctx, b, by, br, run) {
    const g = FXF.lobGeo(b), k = g.k, sc = Math.min(1.5, br / (b.r || 1)), seed = Math.abs(Math.round(b.landX * 0.13 + b.landY * 0.07)) % 97;
    // 霜の尾：白いもや（光）と雪の粒
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 1; j <= 5; j++) { const p = FXF.lobAt(b, g, k - j * 0.04); FxKit.glow(ctx, p.x, p.y, 15 * sc * (1 - j * 0.12), '#bfe8ff', 0.4 - j * 0.06); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    for (let j = 0; j < 10; j++) {
      const p = FXF.lobAt(b, g, k - 0.02 - j * 0.03), s = 2.4 - j * 0.15;
      const ox = Math.sin(j * 2.9 + seed + run.time * 5) * 7, oy = Math.cos(j * 1.7 + run.time * 4) * 5;
      ctx.moveTo(p.x + ox + s, p.y + oy); ctx.arc(p.x + ox, p.y + oy, s, 0, 7);
    }
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter'; FxKit.glow(ctx, b.x, by, 28 * sc, '#9fe0ff', 0.5); ctx.globalCompositeOperation = 'source-over';
    FXF.put(ctx, this.iceSpr(), b.x, by, sc, run.time * 3 + seed);
  },
  // 着弾：白い閃光・六角の衝撃波・氷の破片（加算にしない）・雪の粉
  burst(ctx, f, k) {
    const T = k * f.life, R = f.r, seed = f.seed || 0;
    FxKit.flash(ctx, f.x, f.y, R * 1.0, T, '#bfefff', 0.1);
    FxKit.hexWave(ctx, f.x, f.y, R * 1.35, T / 0.4, '#bfefff', 5);
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed, n: 12, life: 0.5, v: 280, drag: 5, size: 4.4, shape: 'shard', even: true, add: false, c0: '#ffffff', c1: '#8fd0ff' });
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: seed + 7, n: 12, life: 0.55, v: 200, drag: 3.5, size: 2.6, c0: '#ffffff', c1: '#dff6ff' });
  },
  // 氷の嵐：地面の霜・回る風の帯（5本の渦）・吹雪の粒（流れる線）・大きな雪の結晶・縁のもや
  storm(ctx, z) {
    const T = z.t, R = z.r, seed = FXF.seedOf(z), ap = FxKit.ease(T / 0.3), out = FxKit.clamp01((z.dur - T) / 0.5), a = ap * out;
    if (a <= 0.01) return;
    const x = z.x, y = z.y, Rr = R * (0.6 + 0.4 * ap);
    ctx.globalAlpha = a; FXF.put(ctx, FXF.radial('fz-bliz-frost' + R, R * 1.12, [[0, 'rgba(220,245,255,0.22)'], [0.7, 'rgba(170,225,255,0.16)'], [0.92, 'rgba(200,240,255,0.22)'], [1, 'rgba(200,240,255,0)']]), x, y, Rr / R);
    // 風の帯（渦）
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a0 = T * 3 + i * Math.PI * 2 / 5 + seed;
      for (let j = 0; j <= 12; j++) { const q = j / 12, an = a0 + q * 2.5, rr = Rr * (0.22 + 0.76 * q); j ? ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr) : ctx.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
    }
    ctx.globalAlpha = 0.16 * a; ctx.strokeStyle = '#9fe0ff'; ctx.lineWidth = 10; ctx.stroke();
    ctx.globalAlpha = 0.6 * a; ctx.strokeStyle = '#e6fbff'; ctx.lineWidth = 2.6; ctx.stroke();
    // 吹雪の粒（回りながら流れる短い線）
    ctx.beginPath();
    for (let i = 0; i < 22; i++) {
      const w = 1.6 + 1.6 * FxKit.h(i, seed), an = FxKit.h(i + 30, seed) * 6.28 + T * w, rr = Rr * (0.12 + 0.88 * FxKit.h(i + 60, seed));
      ctx.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); ctx.arc(x, y, rr, an, an + 0.18 + 0.12 * w);
    }
    ctx.globalAlpha = 0.85 * a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.stroke();
    // 大きな雪の結晶（4つ・回る）
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const an = i * 1.57 + T * 1.3 + seed, rr = Rr * (0.4 + 0.35 * FxKit.h(i, seed)), cx = x + Math.cos(an) * rr, cy = y + Math.sin(an) * rr, s = 5.5, r0 = T * 2 + i;
      for (let j = 0; j < 3; j++) { const b = r0 + j * Math.PI / 3; ctx.moveTo(cx + Math.cos(b) * s, cy + Math.sin(b) * s); ctx.lineTo(cx - Math.cos(b) * s, cy - Math.sin(b) * s); }
    }
    ctx.globalAlpha = 0.95 * a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.stroke();
    // 中心の白い光と、縁のもや
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, x, y, Rr * 0.45, '#dff6ff', 0.35 * a);
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath(); ctx.arc(x, y, Rr, 0, 7);
    ctx.globalAlpha = 0.14 * a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 12; ctx.stroke();
    ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.globalAlpha = 1;
  },
  lobs: { iceshell(ctx, b, by, br, run) { this.lob(ctx, b, by, br, run); } },
  fx: { snowburst(ctx, f, k) { this.burst(ctx, f, k); } },
  zones: { blizzard(ctx, z) { this.storm(ctx, z); } },
};
FusionFX.register('icebomb', FX_ICEBOMB);

// 見本の部屋の設定（sr）を DebugRoom.SR へ写す（debugroom.js はこのファイルより後に読む）
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
  if (typeof DebugRoom === 'undefined' || !DebugRoom.SR) return;
  for (const [fid, o] of [['abyssnet', FX_ABYSSNET], ['napalm', FX_NAPALM], ['icefoam', FX_ICEFOAM], ['carpet', FX_CARPET], ['acidfoam', FX_ACIDFOAM], ['toxmortar', FX_TOXMORTAR], ['icebomb', FX_ICEBOMB]]) {
    if (o.sr && !DebugRoom.SR[fid]) DebugRoom.SR[fid] = o.sr;
  }
});
