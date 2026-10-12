// ---------------------------------------------------------------
// fusionfx/fx-blade.js : 合成武器の演出（撃ち出す弾と刃）・2026-10-12 段1で分けた（設計 docs/FUSION-ART-DIRECTION-2026-10-12.md）
//
//   このファイルの受け持ち（8種）：
//     starassault  スターアサルト（済・手本）。下の7種は第2段（2026-10-12〜13・演出と性能を作り直した）
//     plasmachain  プラズマチェーン
//     chakram      円環刃
//     toxblade     悪魔の流れ星
//     flameblade   フランベルジュ
//     bubblegun    ファンシーバブルガン
//     bubbleblade  ポッピングスター
//     scattergun   クラスター爆弾
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

// スターアサルト（ガトリング＋手裏剣）：直径が六角1つぶんのぷっくりした星・星屑の尾・弾けると大きな星形の閃光と小さな星6個
const FX_STARASSAULT = {
  // スターアサルト：ぷっくりした星の胴から、先に黄色の帯を巻いたガトリングの3本の銃身
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const y of [-5.2, 0, 5.2]) {
      c.beginPath(); c.rect(3, y - 1.8, 17, 3.6); c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
      const g = c.createLinearGradient(0, y - 1.8, 0, y + 1.8); g.addColorStop(0, '#c4cad6'); g.addColorStop(1, '#5d6472');
      c.fillStyle = g; c.fill();
      c.fillStyle = '#ffd83a'; c.fillRect(14, y - 2, 3, 4);
      c.fillStyle = '#fff3a0'; c.beginPath(); c.arc(20.2, y, 1.6, 0, 7); c.fill();
    }
    FxKit.roundStar(c, -3, 0, 12.5, 6.8, Math.PI / 2, 5, 0.26);
    c.lineWidth = 3; c.strokeStyle = '#4a2400'; c.stroke();
    const g = c.createRadialGradient(-6, -4, 0.5, -3, 0, 13); g.addColorStop(0, '#fffbe0'); g.addColorStop(0.35, '#ffe24a'); g.addColorStop(1, '#ff9a0a');
    c.fillStyle = g; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.ellipse(-7, -3.6, 2.6, 1.1, -0.7, 0, 7); c.fill();
    FxKit.starPath(c, -3, 0, 3.6, 1.6, -Math.PI / 2, 5); c.fillStyle = '#ffffff'; c.fill();
  },
  // ---------- スターアサルト ----------
  //   星の大きさ：直径が六角1つぶん（企画「カービィの星の感覚：敵より大きい」）。敵（パケット）の半径は 10
  STAR_R: 24,
  // ぷっくりした星（作り置き）：太い焦げ茶の縁・黄色の本体（左上が明るい丸み）・内側の明るい縁・白いハイライト
  starSprite() {
    const r = this.STAR_R;
    return FxKit.sprite('fz-star', r + 6, FxKit.res(), c => {
      c.lineJoin = 'round';
      FxKit.roundStar(c, 0, 0, r, r * 0.56, 0, 5, 0.26);
      c.lineWidth = 5; c.strokeStyle = '#5a2c00'; c.stroke();
      const g = c.createRadialGradient(-r * 0.22, -r * 0.3, r * 0.04, 0, 0, r * 1.05);
      g.addColorStop(0, '#fffbe2'); g.addColorStop(0.3, '#ffec5c'); g.addColorStop(0.72, '#ffc21a'); g.addColorStop(1, '#ff8f06');
      c.fillStyle = g; c.fill();
      FxKit.roundStar(c, 0, -0.8, r * 0.78, r * 0.43, 0, 5, 0.28);
      c.lineWidth = 1.8; c.strokeStyle = 'rgba(255,255,225,0.55)'; c.stroke();
      c.save(); c.translate(-r * 0.24, -r * 0.2); c.rotate(-0.75);
      c.fillStyle = 'rgba(255,255,255,0.92)'; c.beginPath(); c.ellipse(0, 0, r * 0.2, r * 0.08, 0, 0, 7); c.fill();
      c.restore();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(-r * 0.02, -r * 0.5, r * 0.055, 0, 7); c.fill();
    });
  },
  // 飛んでいる星：後ろに光の帯と星屑・まわりに光・回る本体
  starBullet(ctx, b, t) {
    const r = this.STAR_R, sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
    const trav = Math.hypot(b.x - b.ox, b.y - b.oy), seed = (Math.abs(b.ox * 0.37 + b.oy * 0.11) % 50);
    for (let j = 1; j <= 4; j++) {                      // 尾：光の帯（撃った所より後ろへは描かない）
      const d = j * r * 0.62;
      if (d > trav) break;
      FxKit.glow(ctx, b.x - ux * d, b.y - uy * d, r * (1.3 - j * 0.2), '#ffb420', 0.55 * (1 - j / 5));
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < 6; j++) {                       // 星屑：小さな星が後ろに揺れながら散る
      const d = r * 0.9 + j * r * 0.52;
      if (d > trav) break;
      const off = Math.sin(t * 13 + j * 2.3 + seed) * r * 0.5 * (0.3 + j / 6), s = 6.5 * (1 - j / 8);
      ctx.globalAlpha = 1 - j / 8;
      ctx.fillStyle = j % 2 ? '#fff8d8' : '#ffe24a';
      FxKit.starPath(ctx, b.x - ux * d - uy * off, b.y - uy * d + ux * off, s, s * 0.42, t * 8 + j, 5); ctx.fill();
    }
    ctx.restore();
    FxKit.glow(ctx, b.x, b.y, r * 2.1, '#ffc22a', 0.5);
    const S = this.starSprite();
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(t * 9 + seed);
    ctx.drawImage(S.cv, -S.h, -S.h, S.h * 2, S.h * 2);
    ctx.restore();
  },
  // 撃つ瞬間：砲口の橙の発射炎（白い芯・十字の光）
  starMuzzle(ctx, f, k) {
    const a = 1 - k, ux = Math.cos(f.a), uy = Math.sin(f.a);
    FxKit.glow(ctx, f.x, f.y, 30 * (1 - k * 0.3), '#ff8a1a', 0.9 * a);
    FxKit.glow(ctx, f.x, f.y, 12, '#ffffff', a);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff0b0'; ctx.globalAlpha = a;
    FxKit.ribbon(ctx, [{ x: f.x - ux * 4, y: f.y - uy * 4 }, { x: f.x + ux * 14, y: f.y + uy * 14 }, { x: f.x + ux * 34, y: f.y + uy * 34 }], q => 7 * Math.sin(Math.PI * Math.min(1, q * 1.4 + 0.05)) + 0.5); ctx.fill();
    FxKit.ribbon(ctx, [{ x: f.x - uy * 16, y: f.y + ux * 16 }, { x: f.x, y: f.y }, { x: f.x + uy * 16, y: f.y - ux * 16 }], q => 4 * Math.sin(Math.PI * q) + 0.4); ctx.fill();
  },
  // 弾ける：大きな星形の閃光・六角の衝撃波・放射状に飛ぶ小さな星6個・火の粉。余韻に小さなきらめき（薄く・最後まで明るい色のまま縮んで消える）
  //   時間は秒で決める（主役は life の半分で終わり、残りはきらめきだけ）
  starBurst(ctx, f, k) {
    const T = k * f.life, M = f.life * 0.5, r = f.r, rot = f.rot || 0, seed = f.seed || 0;
    const kk = Math.min(1, T / M), e = FxKit.ease(Math.min(1, kk * 2.4)), a = Math.pow(1 - kk, 1.6);
    FxKit.flash(ctx, f.x, f.y, r * 1.05, T, '#ffd23a', 0.1);
    FxKit.glow(ctx, f.x, f.y, r * 1.35, '#ffae1a', 0.6 * a);
    if (kk < 1) {
      ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
      const R1 = r * (0.4 + 0.75 * e);
      FxKit.roundStar(ctx, f.x, f.y, R1, R1 * 0.46, rot + kk * 0.5, 5, 0.2);
      ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#ffc21a'; ctx.fill();
      ctx.globalAlpha = a * 0.45; ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 12 * (1 - kk) + 3; ctx.stroke();
      ctx.globalAlpha = a; ctx.strokeStyle = '#fff6b8'; ctx.lineWidth = 5 * (1 - kk) + 1.5; ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    FxKit.hexWave(ctx, f.x, f.y, r * 1.12, T / (M * 0.95), '#ffd24a', 4);
    // 小さな星（作り置きの星を縮めて・回しながら）。透けさせると縁の焦げ茶が残って濁るので、明るいまま縮めて消す
    const S = this.starSprite();
    for (let i = 0; i < 6; i++) {
      const li = M * (1.05 + 0.2 * FxKit.h(i, seed));
      if (T >= li) continue;
      const q = T / li, ang = rot + i * Math.PI / 3 - Math.PI / 2, d = r * 1.15 * (1 - Math.exp(-6 * T)) / (1 - Math.exp(-6 * li));
      const s = 10 * (1 - q * q), sc = s * S.h / this.STAR_R;
      ctx.save();
      ctx.translate(f.x + Math.cos(ang) * d, f.y + Math.sin(ang) * d); ctx.rotate(T * 7 + i);
      ctx.drawImage(S.cv, -sc, -sc, sc * 2, sc * 2);
      ctx.restore();
    }
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: seed + 5, n: 10, life: M * 0.95, v: r * 5, drag: 5, size: 3.2, c0: '#fff6c0', c1: '#ff9a20' });
    // 余韻：小さなきらめき（十字の光）が、弾けた範囲にぽつぽつ灯って消える
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff3c0';
    for (let i = 0; i < 7; i++) {
      const t0 = M * 0.3 + i * M * 0.11, li = M * 0.9, q = (T - t0) / li;
      if (q <= 0 || q >= 1) continue;
      const ang = FxKit.h(i + 40, seed) * 6.28, d = r * (0.3 + 0.75 * FxKit.h(i + 50, seed)), x = f.x + Math.cos(ang) * d, y = f.y + Math.sin(ang) * d;
      const s = (4 + 3 * FxKit.h(i + 60, seed)) * Math.sin(Math.PI * q);
      ctx.globalAlpha = 0.9 * Math.sin(Math.PI * q);
      FxKit.ribbon(ctx, [{ x: x - s * 1.6, y }, { x, y }, { x: x + s * 1.6, y }], p => s * 0.45 * Math.sin(Math.PI * p)); ctx.fill();
      FxKit.ribbon(ctx, [{ x, y: y - s * 1.6 }, { x, y }, { x, y: y + s * 1.6 }], p => s * 0.45 * Math.sin(Math.PI * p)); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },

  bullets: { star(ctx, b, t) { this.starBullet(ctx, b, t); } },
  fx: {
    starburst(ctx, f, k) { this.starBurst(ctx, f, k); },
    starmuzzle(ctx, f, k) { this.starMuzzle(ctx, f, k); },
  },
};
FusionFX.register('starassault', FX_STARASSAULT);

// ---------------------------------------------------------------
// このファイルの7種で使い回す小道具（第2段・2026-10-12）
// ---------------------------------------------------------------
const FXB = {
  // 泡（作り置きの中で描く）：薄い膜・縁・2色の反射（虹は使わない）・白い光沢。cA は左上、cB は右下の反射の色、tint は膜の色
  bubble(c, R, cA, cB, tint) {
    const g = c.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
    g.addColorStop(0, FxKit.rgba(tint, 0.04)); g.addColorStop(0.72, FxKit.rgba(tint, 0.12));
    g.addColorStop(0.93, FxKit.rgba(tint, 0.34)); g.addColorStop(1, FxKit.rgba(tint, 0.6));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
    c.lineWidth = 1; c.strokeStyle = 'rgba(30,0,30,0.35)'; c.beginPath(); c.arc(0, 0, R + 1.1, 0, 7); c.stroke();
    c.lineWidth = Math.max(1.3, R * 0.1); c.strokeStyle = 'rgba(255,242,252,0.92)'; c.beginPath(); c.arc(0, 0, R, 0, 7); c.stroke();
    c.lineCap = 'round'; c.globalAlpha = 0.9;
    c.lineWidth = Math.max(1.6, R * 0.17); c.strokeStyle = cA; c.beginPath(); c.arc(0, 0, R * 0.8, Math.PI * 1.02, Math.PI * 1.42); c.stroke();
    c.strokeStyle = cB; c.beginPath(); c.arc(0, 0, R * 0.8, Math.PI * 0.08, Math.PI * 0.46); c.stroke();
    c.globalAlpha = 1;
    c.save(); c.translate(-R * 0.36, -R * 0.42); c.rotate(-0.75);
    c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.ellipse(0, 0, R * 0.22, R * 0.1, 0, 0, 7); c.fill();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(R * 0.44, R * 0.36, R * 0.07, 0, 7); c.fill();
  },
  // 進む向き（単位）・撃った所（跳ねた所）から進んだ距離・弾ごとの決まった種
  dir(b) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    return { ux: b.vx / sp, uy: b.vy / sp, trav: Math.hypot(b.x - b.ox, b.y - b.oy), seed: Math.abs(b.ox * 0.37 + b.oy * 0.11) % 50 };
  },
  // 落ちてくる弾の、いまより back だけ手前の点（画面の上の位置・高さ込み。render.js の山なりと同じ式）
  lobAt(b, back) {
    const tot = Math.hypot(b.landX - b.ox, b.landY - b.oy) || 1, sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
    const trav = Math.hypot(b.x - b.ox, b.y - b.oy), dd = Math.min(back, trav), k = FxKit.clamp01((trav - dd) / tot);
    return { x: b.x - ux * dd, y: b.y - uy * dd - Math.sin(k * Math.PI) * Math.min(46, tot * 0.28) };
  },
  // 炎の舌（下が太く先が尖る・上へ）を、いまのパスに足す
  tongue(ctx, x, y, h, w, sway) {
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w * 0.9, y - h * 0.55, x + sway, y - h);
    ctx.quadraticCurveTo(x + w * 0.9, y - h * 0.55, x + w, y);
    ctx.closePath();
  },
  // 光の刃（凧の形）を、いまのパスに足す：中心 (x,y) から向き a へ、根元 d0 で幅 W、先が L
  kite(ctx, x, y, a, d0, L, W) {
    const ux = Math.cos(a), uy = Math.sin(a), bx = x + ux * d0, by = y + uy * d0;
    ctx.moveTo(bx - ux * W * 0.3, by - uy * W * 0.3);
    ctx.lineTo(bx - uy * W * 0.5, by + ux * W * 0.5);
    ctx.lineTo(x + ux * L, y + uy * L);
    ctx.lineTo(bx + uy * W * 0.5, by - ux * W * 0.5);
    ctx.closePath();
  },
  // 十字のきらめきを、いまのパスに足す
  twinkle(ctx, x, y, s) {
    ctx.moveTo(x - s * 1.6, y); ctx.quadraticCurveTo(x, y - s * 0.22, x + s * 1.6, y); ctx.quadraticCurveTo(x, y + s * 0.22, x - s * 1.6, y);
    ctx.moveTo(x, y - s * 1.6); ctx.quadraticCurveTo(x + s * 0.22, y, x, y + s * 1.6); ctx.quadraticCurveTo(x - s * 0.22, y, x, y - s * 1.6);
  },
  // 煙の塊（作り置き・ふつうの合成で暗く重ねる）
  smoke() {
    return FxKit.sprite('fz-smoke', 32, 1, c => {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 32);
      g.addColorStop(0, 'rgba(74,68,62,0.9)'); g.addColorStop(0.5, 'rgba(62,58,54,0.5)'); g.addColorStop(1, 'rgba(50,48,46,0)');
      c.fillStyle = g; c.fillRect(-32, -32, 64, 64);
    });
  },
  // 泡の膜が破れて、かけらが外へ飛ぶ（ファンシーバブルガン・ポッピングスター）。kk … 0〜1
  shatter(ctx, x, y, R, kk, seed, cA, cB) {
    if (kk >= 1) return;
    const a = Math.pow(1 - kk, 1.3);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let grp = 0; grp < 2; grp++) {
      ctx.beginPath();
      for (let i = grp; i < 8; i += 2) {
        const a0 = i * Math.PI / 4 + FxKit.h(i, seed) * 0.5, len = 0.5 * (1 - kk * 0.6), rr = R * (1 + 0.1 * FxKit.h(i + 5, seed));
        ctx.moveTo(x + Math.cos(a0) * rr, y + Math.sin(a0) * rr); ctx.arc(x, y, rr, a0, a0 + len);
      }
      ctx.globalAlpha = a; ctx.strokeStyle = grp ? cB : cA; ctx.lineWidth = 4.5 * (1 - kk) + 1.2; ctx.stroke();
      ctx.globalAlpha = a * 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2 * (1 - kk) + 0.5; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
};
// ---------------------------------------------------------------
// プラズマチェーン（ガトリング＋テスラ）：青白く帯電した弾（白い芯・まわりにパチパチ放電）→当たった敵から太いジグザグの稲妻が跳ぶ
// ---------------------------------------------------------------
const FX_PLASMACHAIN = {
  // 砲台：ガトリングの3本の銃身に、テスラの銅のコイルを巻く。銃身の先は電極で、先どうしを放電がつなぐ。胴は青く光る芯
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const y of [-5.4, 0, 5.4]) {
      c.beginPath(); c.rect(2, y - 1.9, 16, 3.8); c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
      const g = c.createLinearGradient(0, y - 1.9, 0, y + 1.9); g.addColorStop(0, '#c4cad6'); g.addColorStop(1, '#4d5462');
      c.fillStyle = g; c.fill();
      c.fillStyle = '#d8843a'; for (const x of [6, 9, 12]) c.fillRect(x, y - 2.3, 1.6, 4.6);
      c.fillStyle = '#eef4ff'; c.beginPath(); c.moveTo(18, y - 2.4); c.lineTo(22.5, y); c.lineTo(18, y + 2.4); c.closePath(); c.fill();
    }
    c.beginPath(); c.moveTo(21.5, -5.4); c.lineTo(24, -2.6); c.lineTo(21, 0); c.lineTo(24, 2.8); c.lineTo(21.5, 5.4);
    c.strokeStyle = 'rgba(143,180,255,0.7)'; c.lineWidth = 3.4; c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = 1.1; c.stroke();
    c.beginPath(); c.arc(-4, 0, 9, 0, 7); c.lineWidth = 2.4; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    const mg = c.createRadialGradient(-6, -3, 0.5, -4, 0, 9.5); mg.addColorStop(0, '#d8dee8'); mg.addColorStop(1, '#3e4452');
    c.fillStyle = mg; c.fill();
    const cg = c.createRadialGradient(-4, 0, 0, -4, 0, 5.6); cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.4, '#a8c4ff'); cg.addColorStop(1, '#3a5ad0');
    c.fillStyle = cg; c.beginPath(); c.arc(-4, 0, 5.6, 0, 7); c.fill();
    c.strokeStyle = '#d8843a'; c.lineWidth = 1.5; c.beginPath(); c.arc(-4, 0, 7.3, 0, 7); c.stroke();
  },
  // 弾：芯が白い光の球（作り置き）。見えている本体の半径が約12
  ORB_R: 15,
  orbSprite() {
    const R = this.ORB_R;
    return FxKit.sprite('fz-plorb', R + 2, FxKit.res(), c => {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#f2f7ff'); g.addColorStop(0.52, '#a8c6ff');
      g.addColorStop(0.8, 'rgba(90,130,255,0.7)'); g.addColorStop(1, 'rgba(60,90,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
      c.lineWidth = 1.3; c.strokeStyle = 'rgba(225,238,255,0.8)'; c.beginPath(); c.arc(0, 0, R * 0.6, 0, 7); c.stroke();
    });
  },
  bullet(ctx, b, t) {
    const R = this.ORB_R, d = FXB.dir(b), ux = d.ux, uy = d.uy, s = d.seed, L = Math.min(d.trav, R * 3.4);
    ctx.globalCompositeOperation = 'lighter';
    if (L > 2) {                                   // 尾：後ろへ細る青い帯と白い芯
      const p = [{ x: b.x - ux * L, y: b.y - uy * L }, { x: b.x - ux * L * 0.5, y: b.y - uy * L * 0.5 }, { x: b.x, y: b.y }];
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#4f7cff'; FxKit.ribbon(ctx, p, q => R * 1.5 * q); ctx.fill();
      ctx.globalAlpha = 0.75; ctx.fillStyle = '#dfeaff'; FxKit.ribbon(ctx, p, q => R * 0.55 * q); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    const l = b.link;   // 電撃の線：ひとつ前の弾へ（当たりのある線・fusion.js の linkHalf）
    if (l && !l.gone && Math.hypot(l.x - b.x, l.y - b.y) <= (b.linkMax || 120)) {
      const fr2 = Math.floor(t * 40), Lk = Math.hypot(l.x - b.x, l.y - b.y);
      const J = FxKit.jag(b.x, b.y, l.x, l.y, Math.max(3, Math.round(Lk / 14)), Math.min(10, Lk * 0.15), fr2 * 7 + s);
      FxKit.beam(ctx, c => FxKit.poly(c, J), 6, '#8fb4ff', 0.9, '#4a72ff');
    }
    ctx.globalCompositeOperation = 'lighter';
    FxKit.glow(ctx, b.x, b.y, R * 2.8, '#5f8cff', 0.75);
    const S = this.orbSprite(), fl = 1 + 0.1 * Math.sin(t * 47 + s);
    ctx.globalAlpha = 1;
    ctx.drawImage(S.cv, b.x - S.h * fl, b.y - S.h * fl, S.h * 2 * fl, S.h * 2 * fl);
    // まわりのパチパチ（3本・1/30秒ごとに形が変わる）
    const fr = Math.floor(t * 30);
    ctx.beginPath();
    for (let j = 0; j < 3; j++) {
      const a = t * 9 + j * 2.094 + s, a2 = a + 0.6 + 0.5 * FxKit.h(j, fr);
      const P = FxKit.jag(b.x + Math.cos(a) * R * 0.5, b.y + Math.sin(a) * R * 0.5, b.x + Math.cos(a2) * R * 1.6, b.y + Math.sin(a2) * R * 1.6, 3, 3.4, fr + j * 7 + s);
      for (let i = 0; i < P.length; i++) ctx[i ? 'lineTo' : 'moveTo'](P[i].x, P[i].y);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.85; ctx.strokeStyle = '#8fb4ff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  },
  // 撃つ瞬間：青白い閃光と、前へ散る短い放電4本
  muzzle(ctx, f, k) {
    const a = 1 - k, fr = Math.floor(k * f.life * 60);
    FxKit.glow(ctx, f.x, f.y, 30 * (1 - k * 0.3), '#5f8cff', 0.95 * a);
    FxKit.glow(ctx, f.x, f.y, 13, '#ffffff', a);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let j = 0; j < 4; j++) {
      const an = f.a + (j - 1.5) * 0.45, L = 16 + 9 * FxKit.h(j, fr);
      const P = FxKit.jag(f.x, f.y, f.x + Math.cos(an) * L, f.y + Math.sin(an) * L, 3, 3, fr * 3 + j);
      for (let i = 0; i < P.length; i++) ctx[i ? 'lineTo' : 'moveTo'](P[i].x, P[i].y);
    }
    ctx.globalAlpha = a * 0.85; ctx.strokeStyle = '#8fb4ff'; ctx.lineWidth = 3.2; ctx.stroke();
    ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  // 当たり：白い閃光・六角の衝撃波・青い火花
  hit(ctx, f, k) {
    const T = k * f.life;
    FxKit.flash(ctx, f.x, f.y, 26, T, '#8fb4ff', 0.09);
    FxKit.glow(ctx, f.x, f.y, 26, '#5f8cff', 0.5 * (1 - k));
    FxKit.hexWave(ctx, f.x, f.y, 28, T / 0.28, '#9fc0ff', 3.2);
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: f.seed || 0, n: 9, life: 0.34, v: 190, drag: 6, size: 2.8, c0: '#ffffff', c1: '#7fa8ff', shape: 'shard' });
  },
  // 跳ぶ稲妻：太い本線（7px・白い芯）と細い副線の2本。1/40秒ごとに形が変わる。跳んだ先に閃光
  bolt(ctx, f, k) {
    const T = k * f.life, P = f.pts, a = k < 0.45 ? 1 : (1 - k) / 0.55, fr = Math.floor(T * 40), sd = f.seed || 0;
    if (!P || P.length < 2) return;
    const main = [], sub = [];
    for (let i = 1; i < P.length; i++) {
      const A = P[i - 1], B = P[i], L = Math.hypot(B.x - A.x, B.y - A.y), n = Math.max(3, Math.round(L / 13));
      const m = FxKit.jag(A.x, A.y, B.x, B.y, n, Math.min(13, L * 0.2), sd + fr * 13 + i * 5);
      const s = FxKit.jag(A.x, A.y, B.x, B.y, n, Math.min(18, L * 0.27), sd + fr * 17 + i * 9 + 3);
      for (let j = i > 1 ? 1 : 0; j < m.length; j++) { main.push(m[j]); sub.push(s[j]); }
    }
    FxKit.beam(ctx, c => FxKit.poly(c, sub), 3.4, '#6f96ff', a * 0.6, '#3a5aff');
    FxKit.beam(ctx, c => FxKit.poly(c, main), 7, '#8fb4ff', a, '#4a72ff');
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < P.length; i++) {
      FxKit.flash(ctx, P[i].x, P[i].y, 22, T, '#9fc0ff', 0.1);
      FxKit.glow(ctx, P[i].x, P[i].y, 18, '#8fb4ff', 0.6 * a);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  bullets: { plasma(ctx, b, t) { this.bullet(ctx, b, t); } },
  fx: {
    plasmamuzzle(ctx, f, k) { this.muzzle(ctx, f, k); },
    plasmahit(ctx, f, k) { this.hit(ctx, f, k); },
    plasmabolt(ctx, f, k) { this.bolt(ctx, f, k); },
  },
};
FusionFX.register('plasmachain', FX_PLASMACHAIN);

// ---------------------------------------------------------------
// 円環刃（手裏剣＋刀）：直径が六角1つぶんの、刀の刃が4枚付いた銀の輪。回転の残像・行きは白銀、帰りは青。斬った所に白い切り傷
// ---------------------------------------------------------------
const FX_CHAKRAM = {
  // 砲台：刀の柄（柄巻きと金の鍔）の先に、輪の刃をはめた形
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.rect(-21, -2.7, 12, 5.4); c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke(); c.fillStyle = '#272c38'; c.fill();
    c.strokeStyle = '#c8d4ea'; c.lineWidth = 1; c.beginPath();
    for (let x = -20; x < -10; x += 3) { c.moveTo(x, -2.4); c.lineTo(x + 2, 2.4); c.moveTo(x + 2, -2.4); c.lineTo(x, 2.4); }
    c.stroke();
    c.beginPath(); c.rect(-9.5, -4.4, 2.6, 8.8); c.lineWidth = 1.6; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke(); c.fillStyle = '#ffd24a'; c.fill();
    this.ringArt(c, 6, 0, 12, '#cfe0ff');
  },
  // 輪の刃の絵：4枚の反った刃（回る向きに先が向く）・銀の輪・中の芯
  ringArt(c, x, y, R, edge) {
    c.save(); c.translate(x, y); c.lineJoin = 'round'; c.lineCap = 'round';
    const w = R * 0.3;
    for (let i = 0; i < 4; i++) {
      const b0 = i * Math.PI / 2, P = (a, r) => [Math.cos(b0 + a) * r, Math.sin(b0 + a) * r];
      let p = P(-0.5, R - w * 0.4), q = P(-0.15, R + w * 1.3), e = P(0.34, R + w * 1.6);
      c.beginPath(); c.moveTo(p[0], p[1]); c.quadraticCurveTo(q[0], q[1], e[0], e[1]);
      q = P(0.12, R + w * 0.5); p = P(0.18, R - w * 0.4); c.quadraticCurveTo(q[0], q[1], p[0], p[1]);
      c.closePath();
      c.lineWidth = Math.max(1.6, R * 0.12); c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
      const g0 = P(-0.4, R), g1 = P(0.34, R + w * 1.6), g = c.createLinearGradient(g0[0], g0[1], g1[0], g1[1]);
      g.addColorStop(0, '#7d889e'); g.addColorStop(0.6, '#dfe6f2'); g.addColorStop(1, '#ffffff');
      c.fillStyle = g; c.fill();
      p = P(-0.4, R + w * 0.25); q = P(-0.1, R + w * 1.2); e = P(0.3, R + w * 1.5);
      c.beginPath(); c.moveTo(p[0], p[1]); c.quadraticCurveTo(q[0], q[1], e[0], e[1]);
      c.lineWidth = Math.max(0.9, R * 0.07); c.strokeStyle = edge; c.stroke();
    }
    c.beginPath(); c.arc(0, 0, R - w * 0.5, 0, 7);
    c.lineWidth = w + 3; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    const rg = c.createLinearGradient(-R, -R, R, R); rg.addColorStop(0, '#f6f9ff'); rg.addColorStop(0.5, '#a8b4c8'); rg.addColorStop(1, '#5d6678');
    c.lineWidth = w; c.strokeStyle = rg; c.stroke();
    c.lineWidth = Math.max(0.8, R * 0.06); c.strokeStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.arc(0, 0, R - w * 0.15, Math.PI * 1.0, Math.PI * 1.6); c.stroke();
    c.strokeStyle = edge; c.beginPath(); c.arc(0, 0, R - w, 0, 7); c.stroke();
    c.lineWidth = Math.max(1, R * 0.08); c.strokeStyle = '#3a4252'; c.beginPath();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; c.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2); c.lineTo(Math.cos(a) * (R - w), Math.sin(a) * (R - w)); }
    c.stroke();
    const hg = c.createRadialGradient(0, 0, 0, 0, 0, R * 0.25); hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.5, edge); hg.addColorStop(1, '#3a4a70');
    c.fillStyle = hg; c.beginPath(); c.arc(0, 0, R * 0.25, 0, 7); c.fill();
    c.restore();
  },
  // 輪の半径（刃の先まで約23・六角1つぶん）。当たりの半径は 14
  R: 16,
  sprite(back) {
    const R = this.R;
    return FxKit.sprite('fz-chak' + (back ? 'b' : 'o'), R * 1.5 + 4, FxKit.res(), c => this.ringArt(c, 0, 0, R, back ? '#7fa8ff' : '#e6f0ff'));
  },
  bullet(ctx, b, t) {
    const R = this.R, d = FXB.dir(b), back = b.child, col = back ? '#6f96ff' : '#cfe0ff', rot = t * 17 + d.seed;
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 1; j <= 2; j++) { const dd = j * R * 0.8; if (dd > d.trav) break; FxKit.glow(ctx, b.x - d.ux * dd, b.y - d.uy * dd, R * (1.7 - j * 0.3), col, 0.38 / j); }
    FxKit.glow(ctx, b.x, b.y, R * 2.4, col, 0.5);
    // 回転の残像：4枚の刃の先の後ろに薄い円弧
    ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a1 = rot + i * Math.PI / 2 + 0.3;
      ctx.moveTo(b.x + Math.cos(a1 - 1.25) * R * 1.32, b.y + Math.sin(a1 - 1.25) * R * 1.32);
      ctx.arc(b.x, b.y, R * 1.32, a1 - 1.25, a1);
    }
    ctx.globalAlpha = 0.24; ctx.strokeStyle = col; ctx.lineWidth = 8; ctx.stroke();
    ctx.globalAlpha = 0.6; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    const S = this.sprite(back);
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(rot - 0.4);
    ctx.globalAlpha = 0.28; ctx.drawImage(S.cv, -S.h, -S.h, S.h * 2, S.h * 2);   // ひとつ前の残像
    ctx.rotate(0.4); ctx.globalAlpha = 1; ctx.drawImage(S.cv, -S.h, -S.h, S.h * 2, S.h * 2);
    ctx.restore();
  },
  // 投げる瞬間：白い閃光と、砲台を巻くように走る弧
  throwFx(ctx, f, k) {
    const a = 1 - k, e = FxKit.ease(k), R = 9 + 15 * e;
    FxKit.glow(ctx, f.x, f.y, 28, '#cfe0ff', 0.85 * a);
    FxKit.glow(ctx, f.x, f.y, 11, '#ffffff', a);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(f.x, f.y, R, f.a + 0.4, f.a + 2.8);
    ctx.globalAlpha = 0.45 * a; ctx.strokeStyle = '#9fc0ff'; ctx.lineWidth = 9 * a + 1; ctx.stroke();
    ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6 * a + 0.6; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  // 斬った所：白い切り傷の線（0.06秒で走って薄れて消える）・閃光・銀の火花
  cut(ctx, f, k) {
    const T = k * f.life, D = 0.06, q = Math.min(1, T / D), fade = T < D ? 1 : Math.pow(Math.max(0, 1 - (T - D) / (f.life - D)), 1.4);
    const ux = Math.cos(f.a), uy = Math.sin(f.a), L = 17, x0 = f.x - ux * L, y0 = f.y - uy * L;
    const ex = x0 + ux * 2 * L * q, ey = y0 + uy * 2 * L * q;
    const pts = [{ x: x0, y: y0 }, { x: (x0 + ex) / 2 - uy * 3, y: (y0 + ey) / 2 + ux * 3 }, { x: ex, y: ey }];
    FxKit.flash(ctx, f.x, f.y, 20, T, '#cfe0ff', 0.08);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 * fade; ctx.fillStyle = '#7fa8ff'; FxKit.ribbon(ctx, pts, s => 16 * Math.sin(Math.PI * s)); ctx.fill();
    ctx.globalAlpha = fade; ctx.fillStyle = '#e6f0ff'; FxKit.ribbon(ctx, pts, s => 8 * Math.sin(Math.PI * s)); ctx.fill();
    ctx.fillStyle = '#ffffff'; FxKit.ribbon(ctx, pts, s => 3 * Math.sin(Math.PI * s)); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: f.seed || 0, n: 6, life: 0.28, v: 170, a: f.a + Math.PI / 2, spread: 1.6, drag: 7, size: 2.6, c0: '#ffffff', c1: '#9fb8e0', shape: 'shard' });
  },
  // いちばん遠い所で回る（場 chakspin・当たりの半径 z.r）：速く回る輪・刻む円の白い残像・削る火花
  spin(ctx, z) {
    const T = z.t, a = Math.min(1, T / 0.06, (z.dur - T) / 0.1), rot = T * 34;
    FxKit.glow(ctx, z.x, z.y, z.r * 1.9, '#cfe0ff', 0.55 * a);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a0 = rot * 0.8 + i * 2.094; ctx.moveTo(z.x + Math.cos(a0) * z.r, z.y + Math.sin(a0) * z.r); ctx.arc(z.x, z.y, z.r, a0, a0 + 1.5); }
    ctx.globalAlpha = 0.3 * a; ctx.strokeStyle = '#9fc0ff'; ctx.lineWidth = 9; ctx.stroke();
    ctx.globalAlpha = 0.85 * a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    const S = this.sprite(false);
    ctx.save(); ctx.translate(z.x, z.y);
    for (let j = 2; j >= 0; j--) { ctx.globalAlpha = a * (j ? 0.25 / j : 1); ctx.save(); ctx.rotate(rot - j * 0.35); ctx.drawImage(S.cv, -S.h, -S.h, S.h * 2, S.h * 2); ctx.restore(); }
    ctx.restore(); ctx.globalAlpha = 1;
    FxKit.sparks(ctx, { x: z.x, y: z.y, t: T % 0.2, seed: Math.floor(T / 0.2) + (z.x | 0), n: 7, life: 0.2, v: 260, drag: 4, size: 2.6, c0: '#ffffff', c1: '#9fb8e0', shape: 'shard' });
  },
  bullets: { chakram(ctx, b, t) { this.bullet(ctx, b, t); } },
  zones: { chakspin(ctx, z) { this.spin(ctx, z); } },
  fx: {
    chakthrow(ctx, f, k) { this.throwFx(ctx, f, k); },
    chakcut(ctx, f, k) { this.cut(ctx, f, k); },
  },
};
FusionFX.register('chakram', FX_CHAKRAM);
// ---------------------------------------------------------------
// 悪魔の流れ星（手裏剣＋毒ガス）：頭が尖った紫の手裏剣・毒の緑の尾を引く流れ星。当たった所に毒の雲がぽんと膨らむ
// ---------------------------------------------------------------
const FX_TOXBLADE = {
  // 砲台：前に紫の手裏剣（毒の緑の縁）、後ろに緑の液が見える毒のボンベ
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.ellipse(-12, 0, 8.5, 6.8, 0, 0, 7); c.lineWidth = 2.2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    const tg = c.createLinearGradient(0, -6.8, 0, 6.8); tg.addColorStop(0, '#6a7480'); tg.addColorStop(1, '#2c323c'); c.fillStyle = tg; c.fill();
    c.fillStyle = '#9ae04a'; c.beginPath(); c.ellipse(-12, 1.4, 5.6, 3.4, 0, 0, 7); c.fill();
    c.fillStyle = '#d8ff9a'; c.beginPath(); c.arc(-14, 1, 1, 0, 7); c.arc(-10, 2.4, 0.8, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(-14, -3, 3, 1, -0.3, 0, 7); c.fill();
    c.strokeStyle = '#000'; c.lineWidth = 4.2; c.beginPath(); c.moveTo(-4, 0); c.lineTo(4, 0); c.stroke();
    c.strokeStyle = '#7ac83a'; c.lineWidth = 2.2; c.stroke();
    this.headArt(c, 9, 0, 12.5, Math.PI / 4);
  },
  // 尖った4枚刃の手裏剣：紫の刃・毒の緑の内縁・白い稜線・真ん中の穴
  headArt(c, x, y, r, rot) {
    c.save(); c.translate(x, y); c.rotate(rot); c.lineJoin = 'miter'; c.miterLimit = 6;
    FxKit.starPath(c, 0, 0, r, r * 0.3, 0, 4);
    c.lineWidth = Math.max(1.8, r * 0.18); c.strokeStyle = '#14041e'; c.stroke();
    const g = c.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r); g.addColorStop(0, '#f2d0ff'); g.addColorStop(0.35, '#b25aff'); g.addColorStop(1, '#4a0f78');
    c.fillStyle = g; c.fill();
    FxKit.starPath(c, 0, 0, r * 0.8, r * 0.22, 0, 4); c.lineWidth = Math.max(1, r * 0.1); c.strokeStyle = '#b8ff5a'; c.stroke();
    c.beginPath();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); }
    c.lineWidth = Math.max(0.7, r * 0.05); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.stroke();
    c.fillStyle = '#14041e'; c.beginPath(); c.arc(0, 0, r * 0.2, 0, 7); c.fill();
    c.strokeStyle = '#b8ff5a'; c.lineWidth = Math.max(0.8, r * 0.08); c.beginPath(); c.arc(0, 0, r * 0.2, 0, 7); c.stroke();
    c.restore();
  },
  HR: 14,
  headSprite() { return FxKit.sprite('fz-devil', this.HR + 3, FxKit.res(), c => this.headArt(c, 0, 0, this.HR, 0)); },
  // 毒の雲の塊（作り置き）：緑の本体と、下に落ちる紫の影（厚みを出す）
  blob(dark) {
    return FxKit.sprite(dark ? 'fz-toxsh' : 'fz-toxbl', 32, 1, c => {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 32);
      if (dark) { g.addColorStop(0, 'rgba(60,18,90,0.9)'); g.addColorStop(0.6, 'rgba(60,18,90,0.6)'); g.addColorStop(1, 'rgba(60,18,90,0)'); }
      else { g.addColorStop(0, 'rgba(160,226,80,0.95)'); g.addColorStop(0.55, 'rgba(118,196,52,0.8)'); g.addColorStop(0.82, 'rgba(96,170,44,0.35)'); g.addColorStop(1, 'rgba(80,150,40,0)'); }
      c.fillStyle = g; c.fillRect(-32, -32, 64, 64);
    });
  },
  bullet(ctx, b, t) {
    const R = this.HR, d = FXB.dir(b), ux = d.ux, uy = d.uy, s = d.seed, L = Math.min(d.trav, R * 5.5);
    ctx.globalCompositeOperation = 'lighter';
    if (L > 3) {
      const P = [];   // 尾：後ろへ細る紫の帯・毒の緑の帯・白い芯（少しうねる）
      for (let i = 0; i <= 6; i++) { const q = i / 6, dd = L * (1 - q), w = Math.sin(t * 16 + q * 5 + s) * R * 0.22 * (1 - q); P.push({ x: b.x - ux * dd - uy * w, y: b.y - uy * dd + ux * w }); }
      ctx.globalAlpha = 0.55; ctx.fillStyle = '#8a3ad8'; FxKit.ribbon(ctx, P, q => R * 1.8 * q * q); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.fillStyle = '#8ad83a'; FxKit.ribbon(ctx, P, q => R * 0.85 * q * q); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#efffd0'; FxKit.ribbon(ctx, P, q => R * 0.26 * q); ctx.fill();
      // 毒の粒：尾に沿って流れ、後ろへ取り残される
      const ph = (t * 7 + s) % 1;
      for (let grp = 0; grp < 2; grp++) {
        ctx.beginPath();
        for (let j = grp; j < 10; j += 2) {
          const q = (j + ph) / 10, dd = R * 0.6 + q * L * 1.15;
          if (dd > d.trav) continue;
          const off = Math.sin(j * 2.7 + s + t * 3) * R * 0.9 * q, sz = 3.6 - 2 * q, x = b.x - ux * dd - uy * off, y = b.y - uy * dd + ux * off;
          ctx.rect(x - sz / 2, y - sz / 2, sz, sz);
        }
        ctx.globalAlpha = 0.95; ctx.fillStyle = grp ? '#d8a0ff' : '#c8ff6a'; ctx.fill();
      }
    }
    FxKit.glow(ctx, b.x, b.y, R * 2.6, '#8a3ad8', 0.6);
    FxKit.glow(ctx, b.x, b.y, R * 1.6, '#9ae04a', 0.45);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const S = this.headSprite();
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(t * 15 + s); ctx.drawImage(S.cv, -S.h, -S.h, S.h * 2, S.h * 2); ctx.restore();
  },
  // 撃つ瞬間：紫と緑の閃光・白い4つ角のきらめき
  muzzle(ctx, f, k) {
    const a = 1 - k;
    FxKit.glow(ctx, f.x, f.y, 30 * (1 - k * 0.3), '#8a3ad8', 0.9 * a);
    FxKit.glow(ctx, f.x, f.y, 18, '#9ae04a', 0.7 * a);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = '#ffffff';
    FxKit.starPath(ctx, f.x, f.y, 15 * (1 - k * 0.4), 2.6, f.a, 4); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  // 当たり：閃光・六角の衝撃波・緑と紫の火花。雲が出たときは、雲の範囲そのものの大きさで毒の雲がぽんと膨らむ（そのあと本物の毒の場に引き継ぐ）
  hit(ctx, f, k) {
    const T = k * f.life, sd = f.seed || 0;
    if (f.cr) {
      const cr = f.cr, e = FxKit.ease(Math.min(1, T / 0.16)), pop = 1 + 0.16 * Math.sin(Math.min(1, T / 0.3) * Math.PI);
      const al = T < 0.3 ? 1 : Math.max(0, 1 - (T - 0.3) / (f.life - 0.3));
      const A = this.blob(false), B = this.blob(true);
      for (const [spr, oy, aa, sc] of [[B, cr * 0.14, 0.5, 1.0], [A, 0, 0.55, 0.9]]) {
        ctx.globalAlpha = al * aa;
        for (let i = 0; i < 7; i++) {
          const an = i * 0.898 + FxKit.h(i, sd) * 0.6, dd = cr * 0.45 * e * (0.55 + 0.45 * FxKit.h(i + 9, sd));
          const rr = cr * (0.46 + 0.14 * FxKit.h(i + 19, sd)) * e * pop * sc * (1 + 0.07 * Math.sin(T * 8 + i * 1.7));
          ctx.drawImage(spr.cv, f.x + Math.cos(an) * dd - rr, f.y + Math.sin(an) * dd * 0.8 + oy - rr, rr * 2, rr * 2);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {   // 雲の上の明るいふくらみ
        const an = i * 2.1 + sd, dd = cr * 0.3 * e;
        FxKit.glow(ctx, f.x + Math.cos(an) * dd, f.y + Math.sin(an) * dd * 0.8 - cr * 0.12, cr * 0.5 * e, '#c8ff6a', 0.35 * al);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    FxKit.flash(ctx, f.x, f.y, 24, T, '#b8ff5a', 0.09);
    FxKit.hexWave(ctx, f.x, f.y, 28, T / 0.3, '#a8e05a', 3.2);
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: sd + 3, n: 8, life: 0.36, v: 170, drag: 5, size: 3, c0: '#e6ffb0', c1: '#a85aff', shape: 'shard' });
  },
  // 毒の尾の筋（帯の場 toxtrail・幅は当たりそのもの z.hh×2）：揺れる緑の帯・白っぽい芯・立ちのぼる毒の粒。消える前に薄れる
  trail(ctx, z, run) {
    const T = z.t, a = Math.min(1, T / 0.1) * Math.min(1, (z.dur - T) / 0.5), ux = Math.cos(z.a), uy = Math.sin(z.a), t = run.time, N = 8, P = [];
    for (let i = 0; i <= N; i++) { const q = i / N, d = (q - 0.5) * 2 * z.hw, o = Math.sin(t * 6 + i * 1.3 + z.x * 0.1) * 2.5; P.push({ x: z.x + ux * d - uy * o, y: z.y + uy * d + ux * o }); }
    const env = q => Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + q * 0.88)), 0.4);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 * a; ctx.fillStyle = '#6a3aa8'; FxKit.ribbon(ctx, P, q => z.hh * 2.6 * env(q)); ctx.fill();
    ctx.globalAlpha = 0.5 * a; ctx.fillStyle = '#7ac83a'; FxKit.ribbon(ctx, P, q => z.hh * 2 * env(q)); ctx.fill();
    ctx.globalAlpha = 0.45 * a; ctx.fillStyle = '#e6ffb0'; FxKit.ribbon(ctx, P, q => z.hh * 0.5 * env(q)); ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { const q = FxKit.h(i, z.x | 0), ph = (t * 1.6 + q) % 1, d = (q - 0.5) * 2 * z.hw * 0.9, x = z.x + ux * d, y = z.y + uy * d - ph * 16, r = 2.2 * (1 - ph) + 0.6; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 7); }
    ctx.globalAlpha = 0.8 * a; ctx.fillStyle = '#c8ff6a'; ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  bullets: { devilstar(ctx, b, t) { this.bullet(ctx, b, t); } },
  zones: { toxtrail(ctx, z, run) { this.trail(ctx, z, run); } },
  fx: {
    toxmuzzle(ctx, f, k) { this.muzzle(ctx, f, k); },
    toxhit(ctx, f, k) { this.hit(ctx, f, k); },
  },
};
FusionFX.register('toxblade', FX_TOXBLADE);

// ---------------------------------------------------------------
// フランベルジュ（刀＋火炎）：波打つ赤熱の刃の滅多斬り。太い赤橙の斬撃（白い芯・赤の光）が角度を変えて重なり、切り口が揺れる炎で燃え残る
// ---------------------------------------------------------------
const FX_FLAMEBLADE = {
  // 砲台：波打つ赤熱の刃（フランベルジュ）。鍔は火炎放射のノズルで、両脇から小さな炎。柄に赤い宝玉
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    const top = [], bot = [];
    for (let x = -3; x <= 24; x += 1.5) { const hw = 3.9 * (1 - (x + 3) / 29) + 0.7, wv = 1.15 * Math.sin(x * 0.85); top.push([x, -hw + wv]); bot.push([x, hw + wv]); }
    c.beginPath(); c.moveTo(top[0][0], top[0][1]);
    for (const p of top) c.lineTo(p[0], p[1]);
    c.lineTo(27, 1.15 * Math.sin(27 * 0.85));
    for (let i = bot.length - 1; i >= 0; i--) c.lineTo(bot[i][0], bot[i][1]);
    c.closePath();
    c.lineWidth = 2.4; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    const g = c.createLinearGradient(-3, 0, 27, 0); g.addColorStop(0, '#7a1408'); g.addColorStop(0.45, '#ff3a1a'); g.addColorStop(0.85, '#ffa040'); g.addColorStop(1, '#fff0c0');
    c.fillStyle = g; c.fill();
    c.beginPath(); for (let x = -1; x <= 22; x += 1.5) c[x === -1 ? 'moveTo' : 'lineTo'](x, 1.15 * Math.sin(x * 0.85));
    c.lineWidth = 1; c.strokeStyle = 'rgba(255,240,200,0.8)'; c.stroke();
    for (const s of [-1, 1]) {   // 鍔の両脇の炎
      c.save(); c.translate(-6, s * 6.5); c.rotate(s > 0 ? Math.PI : 0);
      c.beginPath(); FXB.tongue(c, 0, 0, 7, 2.6, -1.5); c.fillStyle = '#ff7a1a'; c.fill();
      c.beginPath(); FXB.tongue(c, 0, 0, 4, 1.3, -0.8); c.fillStyle = '#ffe0a0'; c.fill();
      c.restore();
    }
    c.beginPath(); c.rect(-8.5, -6, 5, 12); c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    const ng = c.createLinearGradient(0, -6, 0, 6); ng.addColorStop(0, '#9aa2b0'); ng.addColorStop(1, '#3a404c'); c.fillStyle = ng; c.fill();
    c.fillStyle = '#ff6a2a'; c.fillRect(-7.5, -4.4, 3, 1.6); c.fillRect(-7.5, 2.8, 3, 1.6);
    c.beginPath(); c.rect(-18, -2.3, 9.5, 4.6); c.lineWidth = 1.8; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke(); c.fillStyle = '#2a1a18'; c.fill();
    c.beginPath(); c.arc(-19.5, 0, 2.8, 0, 7); c.lineWidth = 1.6; c.stroke(); c.fillStyle = '#ff2a2a'; c.fill();
    c.fillStyle = '#ffd0c0'; c.beginPath(); c.arc(-20.3, -0.8, 0.9, 0, 7); c.fill();
  },
  // 斬撃1本：中心線 pts（刃の走る向きに並ぶ）と太さ wd(q)。T＝この斬撃の経過秒・SW＝刃が走りきる時間
  //   斬撃（0.2秒で消える）→ 焼けた切り口と揺れる炎の舌（余韻・life の終わりまで）→ 火の粉
  draw(ctx, pts, wd, T, SW, life, seed, up) {
    const N = pts.length - 1, sa = T < SW ? 1 : Math.max(0, 1 - (T - SW) / 0.2);
    const ba = FxKit.clamp01((T - SW) / 0.06) * Math.pow(Math.max(0, 1 - (T - SW) / (life - SW)), 1.3);
    ctx.globalCompositeOperation = 'lighter';
    if (ba > 0.01) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.75 * ba; ctx.strokeStyle = '#ff3a1a'; ctx.lineWidth = 4; FxKit.poly(ctx, pts); ctx.stroke();
      ctx.globalAlpha = 0.9 * ba; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.4; ctx.stroke();
      for (let layer = 0; layer < 2; layer++) {   // 揺れる炎の舌（切り口に沿って・上へ）
        ctx.beginPath();
        for (let i = 2; i < N; i += 3) {   // 3つおき（8連が重なると塗る面積が大きいので数を抑える）
          const P = pts[i], env = Math.sin(Math.PI * i / N), hh = (10 + 9 * FxKit.h(i, seed)) * (0.75 + 0.25 * Math.sin(T * 19 + i * 1.3)) * env * (layer ? 0.55 : 1);
          FXB.tongue(ctx, P.x, P.y + 1, hh * (0.6 + 0.4 * ba), (layer ? 1.9 : 3.8) * env + 0.6, Math.sin(T * 11 + i) * 2.5);
        }
        ctx.globalAlpha = (layer ? 1 : 0.85) * ba; ctx.fillStyle = layer ? '#ffe0a0' : '#ff6a1a'; ctx.fill();
      }
    }
    if (sa > 0) {
      ctx.globalAlpha = 0.42 * sa; ctx.fillStyle = '#ff2a10'; FxKit.ribbon(ctx, pts, q => wd(q) * 1.8); ctx.fill();
      ctx.globalAlpha = 0.95 * sa; ctx.fillStyle = '#ff6a2a'; FxKit.ribbon(ctx, pts, wd); ctx.fill();
      ctx.globalAlpha = sa; ctx.fillStyle = '#fff4d0'; FxKit.ribbon(ctx, pts, q => wd(q) * 0.33); ctx.fill();
      const H = pts[N];
      FxKit.flash(ctx, H.x, H.y, 28, T - SW * 0.6, '#ff8a3a', 0.1);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    for (const qq of [0.5]) {   // 火の粉（斬った所から噴いて、上へ流れる）
      const P = pts[Math.round(N * qq)];
      FxKit.sparks(ctx, { x: P.x, y: P.y, t: T - SW * qq, seed: seed + qq * 10, n: 7, life: 0.55, v: 150, a: up, spread: 2, drag: 3, g: -90, size: 2.8, c0: '#fff2b0', c1: '#ff4a1a' });
    }
  },
  slash(ctx, f, k) {
    const d0 = f.d || 0, T = k * f.life - d0, life = f.life - d0, seed = f.seed || 0;
    if (T < 0) return;
    const SW = 0.075, p = Math.min(1, T / SW), N = 16, pts = [];
    if (f.line) {
      // 紅蓮の一閃：前方へまっすぐ走る炎の斬撃（太さは当たりの幅そのもの）
      const ux = Math.cos(f.a), uy = Math.sin(f.a), s0 = f.s0 === undefined ? 18 : f.s0, L = f.r * p, W = (f.w || 26) * 2;
      for (let i = 0; i <= N; i++) { const q = i / N, dd = s0 + (L - s0) * q, o = Math.sin(q * 14 + seed) * W * 0.05; pts.push({ x: f.x + ux * dd - uy * o, y: f.y + uy * dd + ux * o }); }
      return this.draw(ctx, pts, q => W * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + q * 0.92)), 0.5) * (0.85 + 0.15 * Math.sin(q * 30)), T, SW, life, seed, f.a);
    }
    const R = f.r * (0.5 + 0.32 * FxKit.h(1, seed)), span = f.arc * 1.9, sg = FxKit.h(2, seed) < 0.5 ? 1 : -1, a0 = f.a - sg * span / 2;
    for (let i = 0; i <= N; i++) { const an = a0 + sg * span * (i / N) * p; pts.push({ x: f.x + Math.cos(an) * R, y: f.y + Math.sin(an) * R }); }
    // 太さ：真ん中が太く（18px）、両端が細い。縁が波打つ（フランベルジュの刃）
    this.draw(ctx, pts, q => 18 * Math.pow(Math.sin(Math.PI * q), 0.6) * (0.82 + 0.18 * Math.sin(q * 28)), T, SW, life, seed, f.a);
  },
  // 十字の跡の燃える線（帯の場 flametrail）：焼けた切り口と揺れる炎の舌。幅は当たりそのもの
  burnLine(ctx, z, run) {
    const T = z.t, ba = Math.min(1, T / 0.15) * Math.pow(Math.max(0, 1 - T / z.dur), 0.8), ux = Math.cos(z.a), uy = Math.sin(z.a), t = run.time, N = 10, seed = z.seed || 0;
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(z.x - ux * z.hw, z.y - uy * z.hw); ctx.lineTo(z.x + ux * z.hw, z.y + uy * z.hw);
    ctx.globalAlpha = 0.3 * ba; ctx.strokeStyle = '#ff3a10'; ctx.lineWidth = z.hh * 2.2; ctx.stroke();
    ctx.globalAlpha = 0.8 * ba; ctx.strokeStyle = '#ff5a1a'; ctx.lineWidth = 4; ctx.stroke();
    for (let layer = 0; layer < 2; layer++) {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const q = i / N, d = (q - 0.5) * 2 * z.hw, x = z.x + ux * d, y = z.y + uy * d, env = Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + q * 0.9)), 0.5);
        const hh = (11 + 9 * FxKit.h(i, seed)) * (0.7 + 0.3 * Math.sin(t * 17 + i * 1.7)) * env * (layer ? 0.55 : 1);
        FXB.tongue(ctx, x, y + 1, hh, (layer ? 2 : 4) * env + 0.6, Math.sin(t * 9 + i) * 2.5);
      }
      ctx.globalAlpha = (layer ? 1 : 0.85) * ba; ctx.fillStyle = layer ? '#ffe0a0' : '#ff6a1a'; ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  // 十字の交点の炎の爆発（範囲 f.r そのもの）：閃光・火の玉・広がる炎の輪・六角の衝撃波・火の粉・煙
  boom(ctx, f, k) {
    const T = k * f.life, r = f.r, seed = f.seed || 0, kk = Math.min(1, T / 0.32), e = FxKit.ease(kk), Sm = FXB.smoke();
    if (T > 0.1) { const q = (T - 0.1) / (f.life - 0.1), rr = r * (0.6 + 0.5 * q); ctx.globalAlpha = 0.4 * (1 - q); ctx.drawImage(Sm.cv, f.x - rr, f.y - rr - 14 * q, rr * 2, rr * 2); ctx.globalAlpha = 1; }
    FxKit.flash(ctx, f.x, f.y, r * 1.1, T, '#ff8a3a', 0.1);
    if (kk < 1) {
      ctx.globalCompositeOperation = 'lighter';
      FxKit.glow(ctx, f.x, f.y, r * (0.8 + 0.8 * e), '#ff4a1a', 0.9 * (1 - kk));
      FxKit.glow(ctx, f.x, f.y, r * 0.6 * (1 - kk * 0.5), '#ffe0a0', 1 - kk);
      ctx.globalAlpha = 1 - kk; ctx.strokeStyle = '#ffb040'; ctx.lineWidth = 10 * (1 - kk) + 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, r * (0.3 + 0.75 * e), 0, 7); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    FxKit.hexWave(ctx, f.x, f.y, r * 1.05, T / 0.36, '#ff8a3a', 4.5);
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed, n: 12, life: 0.6, v: r * 4.5, drag: 4, g: -60, size: 3.2, c0: '#fff2b0', c1: '#ff4a1a' });
  },
  fx: { flamberge(ctx, f, k) { this.slash(ctx, f, k); }, flameboom(ctx, f, k) { this.boom(ctx, f, k); } },
  zones: { flametrail(ctx, z, run) { this.burnLine(ctx, z, run); } },
};
FusionFX.register('flameblade', FX_FLAMEBLADE);
// ---------------------------------------------------------------
// ファンシーバブルガン（泡＋ガトリング）：つやつやの大きめの泡（水色と桃色の反射）を連射。当たると膜が破れ、小さな泡が散る
// ---------------------------------------------------------------
const FX_BUBBLEGUN = {
  // 砲台：桃色と水色のガトリングの3本の銃身（先に泡の輪の口）・白い胴に泡の入ったガラスの瓶
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const [y, col] of [[-5.2, '#ff9ad8'], [0, '#8fe8ff'], [5.2, '#ff9ad8']]) {
      c.beginPath(); c.rect(2, y - 1.9, 15, 3.8); c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
      const g = c.createLinearGradient(0, y - 1.9, 0, y + 1.9); g.addColorStop(0, '#ffffff'); g.addColorStop(1, col);
      c.fillStyle = g; c.fill();
      c.beginPath(); c.arc(19.6, y, 2.5, 0, 7); c.lineWidth = 2.6; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.stroke();
      c.lineWidth = 1.3; c.strokeStyle = '#ffe6f6'; c.stroke();
    }
    c.beginPath(); c.arc(-4, 0, 8.6, 0, 7); c.lineWidth = 2.4; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    const mg = c.createRadialGradient(-6, -3, 0.5, -4, 0, 9); mg.addColorStop(0, '#ffffff'); mg.addColorStop(1, '#c8a0d8');
    c.fillStyle = mg; c.fill();
    c.save(); c.translate(-5, 0); FXB.bubble(c, 6.2, '#8fe8ff', '#ff8ad0', '#ff9ad8'); c.restore();
    c.save(); c.translate(-14, -6.5); FXB.bubble(c, 3.2, '#8fe8ff', '#ff8ad0', '#ff9ad8'); c.restore();
    c.save(); c.translate(-15, 5.5); FXB.bubble(c, 2.5, '#8fe8ff', '#ff8ad0', '#ff9ad8'); c.restore();
  },
  BR: 12.5,
  sprite() { const R = this.BR; return FxKit.sprite('fz-fbub', R + 3, FxKit.res(), c => FXB.bubble(c, R, '#8fe8ff', '#ff8ad0', '#ff9ad8')); },
  // 飛んでいる泡（泡の弾は render.js の「降らせる・泡」の道を通るので lobs に登録する。by は b.y と同じ）
  bullet(ctx, b, by, br, run) {
    const t = run.time, R = this.BR * (b.child ? 0.7 : 1), d = FXB.dir(b), s = d.seed;
    ctx.beginPath();   // 後ろに小さな泡が3つ
    for (let j = 0; j < 3; j++) {
      const dd = R * 1.5 + j * R * 0.95;
      if (dd > d.trav) break;
      const off = Math.sin(t * 9 + j * 2 + s) * 4, r = 4.2 - j * 0.9, x = b.x - d.ux * dd - d.uy * off, y = by - d.uy * dd + d.ux * off;
      ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 7);
    }
    ctx.globalAlpha = 0.85; ctx.lineWidth = 1.3; ctx.strokeStyle = '#ffd6f0'; ctx.stroke();
    FxKit.glow(ctx, b.x, by, R * 2.1, '#ff9ad8', 0.4);
    const S = this.sprite(), w = Math.sin(t * 13 + s) * 0.08, k = R / this.BR;
    ctx.globalAlpha = 1;
    ctx.drawImage(S.cv, b.x - S.h * k * (1 + w), by - S.h * k * (1 - w), S.h * 2 * k * (1 + w), S.h * 2 * k * (1 - w));
  },
  // 撃つ瞬間：桃色の閃光と泡の輪
  muzzle(ctx, f, k) {
    const a = 1 - k, e = FxKit.ease(k);
    FxKit.glow(ctx, f.x, f.y, 26 * (1 - k * 0.3), '#ff7ac8', 0.85 * a);
    FxKit.glow(ctx, f.x, f.y, 11, '#ffffff', a);
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.arc(f.x + Math.cos(f.a) * 6 * e, f.y + Math.sin(f.a) * 6 * e, 7 + 12 * e, 0, 7);
    ctx.globalAlpha = a; ctx.strokeStyle = '#ffd6f0'; ctx.lineWidth = 3 * a + 0.8; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  // はじける：膜が破れてかけらが飛ぶ・六角の衝撃波・小さな泡が散ってふわっと上がる・しぶき（範囲 f.r そのものの大きさ）
  pop(ctx, f, k) {
    const T = k * f.life, r = f.r, seed = f.seed || 0, kk = Math.min(1, T / 0.3), e = FxKit.ease(Math.min(1, kk * 1.6));
    FxKit.flash(ctx, f.x, f.y, r * 0.8, T, '#ff9ad8', 0.08);
    FxKit.glow(ctx, f.x, f.y, r * 1.1, '#ff7ac8', 0.35 * (1 - kk));
    FXB.shatter(ctx, f.x, f.y, r * (0.35 + 0.7 * e), kk, seed, '#ffc8ec', '#8fe8ff');
    FxKit.hexWave(ctx, f.x, f.y, r * 1.05, T / 0.3, '#ff9ad8', 3);
    ctx.beginPath();
    const hl = [];
    for (let i = 0; i < 7; i++) {
      const li = f.life * (0.75 + 0.25 * FxKit.h(i, seed)), q = T / li;
      if (q >= 1) continue;
      const an = i * 0.8976 + FxKit.h(i + 3, seed) * 0.6, dd = r * 0.95 * (1 - Math.exp(-5 * T)) / (1 - Math.exp(-5 * li));
      const x = f.x + Math.cos(an) * dd, y = f.y + Math.sin(an) * dd - 22 * T, rr = (2.6 + 3 * FxKit.h(i + 7, seed)) * (q < 0.8 ? 1 : (1 - q) / 0.2);
      ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, 7); hl.push(x - rr * 0.35, y - rr * 0.35, rr * 0.3);
    }
    ctx.globalAlpha = 0.95; ctx.lineWidth = 1.3; ctx.strokeStyle = '#ffe0f4'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,154,216,0.18)'; ctx.fill();
    ctx.beginPath(); for (let i = 0; i < hl.length; i += 3) { ctx.moveTo(hl[i] + hl[i + 2], hl[i + 1]); ctx.arc(hl[i], hl[i + 1], hl[i + 2], 0, 7); }
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.globalAlpha = 1;
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: seed + 11, n: 8, life: 0.34, v: 220, drag: 6, g: 160, size: 2.4, c0: '#ffffff', c1: '#8fe8ff' });
  },
  lobs: { fancybubble(ctx, b, by, br, run) { this.bullet(ctx, b, by, br, run); } },
  fx: {
    bubblemuzzle(ctx, f, k) { this.muzzle(ctx, f, k); },
    bubblepop(ctx, f, k) { this.pop(ctx, f, k); },
  },
};
FusionFX.register('bubblegun', FX_BUBBLEGUN);

// ---------------------------------------------------------------
// ポッピングスター（泡＋手裏剣）：泡に包まれた金の手裏剣星が光の尾を引いて落ちる → 泡がはじけ、星の角が光の刃になって走る
// ---------------------------------------------------------------
const FX_BUBBLEBLADE = {
  // 砲台：泡の筒の口に、泡に包まれた金の手裏剣星。後ろに小さな泡
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.rect(-10, -5.5, 18, 11); c.lineWidth = 2.2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    const g = c.createLinearGradient(0, -5.5, 0, 5.5); g.addColorStop(0, '#e8f6ff'); g.addColorStop(1, '#6aa8d8'); c.fillStyle = g; c.fill();
    c.fillStyle = '#ffd24a'; c.fillRect(-4, -5.8, 2.2, 11.6); c.fillRect(3, -5.8, 2.2, 11.6);
    c.save(); c.translate(-15, -5); FXB.bubble(c, 3.4, '#8fe8ff', '#ff8ad0', '#b8e6ff'); c.restore();
    c.save(); c.translate(-15.5, 5); FXB.bubble(c, 2.6, '#8fe8ff', '#ff8ad0', '#b8e6ff'); c.restore();
    c.save(); c.translate(15, 0); c.rotate(0.2); this.starArt(c, 8.5); c.restore();
    c.save(); c.translate(15, 0); FXB.bubble(c, 10.5, '#8fe8ff', '#ff8ad0', '#b8e6ff'); c.restore();
  },
  // 金の手裏剣星（5つ角・尖った刃・白い稜線・真ん中の穴）
  starArt(c, r) {
    c.lineJoin = 'miter'; c.miterLimit = 6;
    FxKit.starPath(c, 0, 0, r, r * 0.42, -Math.PI / 2, 5);
    c.lineWidth = Math.max(1.6, r * 0.16); c.strokeStyle = '#5a3000'; c.stroke();
    const g = c.createRadialGradient(-r * 0.25, -r * 0.3, 0, 0, 0, r); g.addColorStop(0, '#fffbe0'); g.addColorStop(0.4, '#ffe38a'); g.addColorStop(1, '#ff9a10');
    c.fillStyle = g; c.fill();
    c.beginPath();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); }
    c.lineWidth = Math.max(0.8, r * 0.07); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
    c.fillStyle = '#3a2000'; c.beginPath(); c.arc(0, 0, r * 0.16, 0, 7); c.fill();
  },
  SR: 15, BR: 22,
  starSprite() { return FxKit.sprite('fz-ppstar', this.SR + 3, FxKit.res(), c => this.starArt(c, this.SR)); },
  bubSprite() { return FxKit.sprite('fz-ppbub', this.BR + 3, FxKit.res(), c => FXB.bubble(c, this.BR, '#8fe8ff', '#ff8ad0', '#b8e6ff')); },
  // 落ちてくる流れ星：山なりに沿った光の尾ときらめき・金と水色の光・回る星・揺れる泡（高いほど少し大きい）
  meteor(ctx, b, by, br, run) {
    const t = run.time, d = FXB.dir(b), sc = Math.min(1.3, Math.max(1, br / (b.r || 1))), s = d.seed;
    const L = Math.min(d.trav, 64);
    ctx.globalCompositeOperation = 'lighter';
    if (L > 3) {
      const P = [];
      for (let i = 0; i <= 5; i++) P.push(i === 5 ? { x: b.x, y: by } : FXB.lobAt(b, L * (1 - i / 5)));
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffb020'; FxKit.ribbon(ctx, P, q => this.BR * 1.5 * sc * q); ctx.fill();
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff3c0'; FxKit.ribbon(ctx, P, q => this.BR * 0.5 * sc * q); ctx.fill();
      ctx.beginPath();
      for (let j = 0; j < 4; j++) {   // 尾のきらめき（流れて取り残される）
        const q = ((j + (t * 4 + s) % 1) / 4), p = FXB.lobAt(b, 10 + q * L * 1.1), sz = 5 * (1 - q) + 1.5;
        FXB.twinkle(ctx, p.x + Math.sin(j * 2.3 + s) * 6, p.y + Math.cos(j * 1.7 + s) * 6, sz);
      }
      ctx.globalAlpha = 0.95; ctx.fillStyle = '#fff6d8'; ctx.fill();
    }
    FxKit.glow(ctx, b.x, by, this.BR * 2.4 * sc, '#ffc23a', 0.55);
    FxKit.glow(ctx, b.x, by, this.BR * 1.7 * sc, '#8fe8ff', 0.25);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const S = this.starSprite(), B = this.bubSprite(), w = Math.sin(t * 11 + s) * 0.06;
    ctx.save(); ctx.translate(b.x, by); ctx.scale(sc, sc);
    ctx.save(); ctx.rotate(t * 9 + s); ctx.drawImage(S.cv, -S.h, -S.h, S.h * 2, S.h * 2); ctx.restore();
    ctx.drawImage(B.cv, -B.h * (1 + w), -B.h * (1 - w), B.h * 2 * (1 + w), B.h * 2 * (1 - w));
    ctx.restore();
  },
  // 撃つ瞬間：金の閃光と、筒の口から出る泡の輪
  muzzle(ctx, f, k) {
    const a = 1 - k, e = FxKit.ease(k);
    FxKit.glow(ctx, f.x, f.y, 30 * (1 - k * 0.3), '#ffc23a', 0.85 * a);
    FxKit.glow(ctx, f.x, f.y, 12, '#ffffff', a);
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.arc(f.x, f.y, 8 + 14 * e, 0, 7);
    ctx.globalAlpha = a; ctx.strokeStyle = '#b8e6ff'; ctx.lineWidth = 3 * a + 0.8; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  // 着地：泡がはじけ、星の角（n 本）が光の刃になって走る。刃の長さ・根元の太さは当たりそのもの（f.r・f.w×2）
  pop(ctx, f, k) {
    const T = k * f.life, n = f.n || 5, W = (f.w || 12) * 2, r = f.r, seed = f.seed || 0;
    const ext = FxKit.ease(Math.min(1, T / 0.09)), fa = T < 0.16 ? 1 : Math.max(0, 1 - (T - 0.16) / 0.32);
    FxKit.flash(ctx, f.x, f.y, 46, T, '#ffe38a', 0.1);
    FxKit.glow(ctx, f.x, f.y, r * 0.9, '#ffc23a', 0.45 * fa);
    FXB.shatter(ctx, f.x, f.y, this.BR * (1 + 1.2 * FxKit.ease(Math.min(1, T / 0.25))), Math.min(1, T / 0.25), seed, '#8fe8ff', '#ffc8ec');
    if (T < 0.15) {   // 真ん中の星が膨らんで弾ける
      const S = this.starSprite(), q = T / 0.15, s2 = 1 + 1.1 * q;
      ctx.save(); ctx.globalAlpha = 1 - q; ctx.translate(f.x, f.y); ctx.rotate(f.a + Math.PI / 2); ctx.scale(s2, s2); ctx.drawImage(S.cv, -S.h, -S.h, S.h * 2, S.h * 2); ctx.restore();
    }
    if (fa > 0) {
      const d0 = 4 + r * 0.32 * Math.max(0, (T - 0.1) / 0.4);   // 根元が外へ抜けていく
      ctx.globalCompositeOperation = 'lighter';
      for (const [wm, lm, col, al] of [[1.9, 1.07, '#ffb020', 0.42], [1, 1, '#ffe38a', 0.95], [0.34, 0.97, '#ffffff', 1]]) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) FXB.kite(ctx, f.x, f.y, f.a + i * 2 * Math.PI / n, d0, Math.max(d0 + 1, r * ext * lm), W * wm * (0.55 + 0.45 * fa));
        ctx.globalAlpha = al * fa; ctx.fillStyle = col; ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (T > 0.07 && T < 0.5) {   // 刃の先のきらめき（伸びきってから灯って消える）
      const q = (T - 0.07) / 0.43, sz = 7 * Math.sin(Math.PI * q);
      ctx.globalCompositeOperation = 'lighter'; ctx.beginPath();
      for (let i = 0; i < n; i++) { const an = f.a + i * 2 * Math.PI / n; FXB.twinkle(ctx, f.x + Math.cos(an) * r, f.y + Math.sin(an) * r, sz); }
      ctx.globalAlpha = 0.95; ctx.fillStyle = '#fff6d0'; ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    FxKit.hexWave(ctx, f.x, f.y, r * 0.75, T / 0.32, '#ffd24a', 4);
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed: seed + 7, n: 10, life: 0.5, v: r * 4, drag: 5, size: 4.2, c0: '#fff6c0', c1: '#ffb020', shape: 'star', even: true, a: f.a });
  },
  lobs: { meteor(ctx, b, by, br, run) { this.meteor(ctx, b, by, br, run); } },
  fx: {
    popmuzzle(ctx, f, k) { this.muzzle(ctx, f, k); },
    popstar(ctx, f, k) { this.pop(ctx, f, k); },
  },
};
FusionFX.register('bubbleblade', FX_BUBBLEBLADE);

// ---------------------------------------------------------------
// クラスター爆弾（迫撃砲＋ガトリング）：真鍮の帯の親の砲弾（継ぎ目が赤く光る）→ 落ちる間際に割れて閃光 → 子弾が尾を引いて散り、小爆発が続く
// ---------------------------------------------------------------
const FX_SCATTERGUN = {
  // 砲台：太い迫撃砲の筒の両脇に、ガトリングの細い銃身を束ねる。真鍮の帯・筒の口の奥が橙に光る
  turret(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.rect(-13, -8.5, 9, 17); c.lineWidth = 2.2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    const bg = c.createLinearGradient(0, -8.5, 0, 8.5); bg.addColorStop(0, '#6a6450'); bg.addColorStop(1, '#2a2618'); c.fillStyle = bg; c.fill();
    for (const y of [-8.6, 8.6]) {
      c.beginPath(); c.rect(-2, y - 1.8, 18, 3.6); c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
      const g = c.createLinearGradient(0, y - 1.8, 0, y + 1.8); g.addColorStop(0, '#c4cad6'); g.addColorStop(1, '#4d5462'); c.fillStyle = g; c.fill();
      c.fillStyle = '#ffd890'; c.beginPath(); c.arc(16.5, y, 1.3, 0, 7); c.fill();
    }
    c.beginPath(); c.moveTo(-5, -5.6); c.lineTo(15, -6.6); c.lineTo(20, -8.2); c.lineTo(20, 8.2); c.lineTo(15, 6.6); c.lineTo(-5, 5.6); c.closePath();
    c.lineWidth = 2.4; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    const mg = c.createLinearGradient(0, -8, 0, 8); mg.addColorStop(0, '#b0a274'); mg.addColorStop(0.5, '#7a6e4a'); mg.addColorStop(1, '#3a3424'); c.fillStyle = mg; c.fill();
    c.fillStyle = '#e0c070'; c.fillRect(3, -6.3, 2.4, 12.6); c.fillRect(11, -6.6, 2.4, 13.2);
    c.fillStyle = '#100c06'; c.beginPath(); c.ellipse(20, 0, 2, 6.8, 0, 0, 7); c.fill();
    c.fillStyle = '#ff9a30'; c.beginPath(); c.ellipse(20.3, 0, 0.9, 3.6, 0, 0, 7); c.fill();
  },
  // 親の砲弾（+x が前）：尾翼・オリーブの胴・十字の継ぎ目（ここから割れる）・真鍮の帯・光沢
  shellArt(c) {
    c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-9, -3); c.lineTo(-15, -8.5); c.lineTo(-12.5, 0); c.lineTo(-15, 8.5); c.lineTo(-9, 3); c.closePath();
    c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke(); c.fillStyle = '#5a5440'; c.fill();
    c.beginPath(); c.moveTo(-11, -5.6); c.lineTo(5, -7); c.quadraticCurveTo(14.5, -6.6, 14.5, 0); c.quadraticCurveTo(14.5, 6.6, 5, 7); c.lineTo(-11, 5.6); c.closePath();
    c.lineWidth = 2.4; c.stroke();
    const g = c.createLinearGradient(0, -7, 0, 7); g.addColorStop(0, '#b4a676'); g.addColorStop(0.45, '#7a6e4a'); g.addColorStop(1, '#3a3424'); c.fillStyle = g; c.fill();
    c.strokeStyle = '#1a1810'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-9, 0); c.lineTo(12.5, 0); c.moveTo(-1, -6.6); c.lineTo(-1, 6.6); c.stroke();
    c.fillStyle = '#e0c070'; c.fillRect(-7, -5.9, 2.2, 11.8); c.fillRect(6.5, -6.8, 2, 13.6);
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(2, -4.2, 7, 1.3, -0.05, 0, 7); c.fill();
  },
  shellSprite() { return FxKit.sprite('fz-cluster', 17, FxKit.res(), c => this.shellArt(c)); },
  // 飛んでいる親の砲弾：煙の尾・尾翼の後ろの火・回りながら揺れる。落ちる間際（進み55%から）は継ぎ目が赤く光る
  shell(ctx, b, by, br, run) {
    const t = run.time, d = FXB.dir(b), tot = Math.hypot(b.landX - b.ox, b.landY - b.oy) || 1, kp = Math.min(1, d.trav / tot);
    const sc = 1.15 * Math.min(1.3, Math.max(1, br / (b.r || 1)));
    const Sm = FXB.smoke();
    for (let j = 4; j >= 1; j--) {
      if (j * 9 > d.trav) continue;
      const p = FXB.lobAt(b, j * 9 + 6), r = 5 + j * 2.8;
      ctx.globalAlpha = 0.34 * (1 - j / 5); ctx.drawImage(Sm.cv, p.x - r, p.y - r - j * 1.5, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    const p1 = FXB.lobAt(b, 6), ang = d.trav > 1 ? Math.atan2(by - p1.y, b.x - p1.x) : Math.atan2(d.uy, d.ux);
    FxKit.glow(ctx, b.x - Math.cos(ang) * 15 * sc, by - Math.sin(ang) * 15 * sc, 13, '#ffa030', 0.75);
    const S = this.shellSprite(), g = Math.max(0, (kp - 0.55) / 0.45);
    ctx.save(); ctx.translate(b.x, by); ctx.rotate(ang + Math.sin(t * 7 + d.seed) * 0.12); ctx.scale(sc, sc);
    ctx.drawImage(S.cv, -S.h, -S.h, S.h * 2, S.h * 2);
    if (g > 0) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = g; ctx.strokeStyle = '#ffb040'; ctx.lineWidth = 1.9;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(12.5, 0); ctx.moveTo(-1, -6.6); ctx.lineTo(-1, 6.6); ctx.stroke();
    }
    ctx.restore();
    if (g > 0) FxKit.glow(ctx, b.x, by, 24, '#ff9a30', 0.55 * g);
  },
  // 撃つ瞬間：筒の口の閃光と、立ちのぼる煙
  muzzle(ctx, f, k) {
    const a = 1 - k, T = k * f.life, Sm = FXB.smoke(), r = 10 + 18 * FxKit.ease(k);
    ctx.globalAlpha = 0.45 * a; ctx.drawImage(Sm.cv, f.x - r, f.y - r - 10 * k, r * 2, r * 2); ctx.globalAlpha = 1;
    FxKit.flash(ctx, f.x, f.y, 30, T, '#ffb040', 0.1);
    FxKit.glow(ctx, f.x, f.y, 22, '#ff8a20', 0.7 * Math.max(0, 1 - k * 2));
  },
  // 割れる：割れた所（落ちる点の少し上）の閃光・六角の衝撃波・殻のかけら・煙。子弾は、割れた所から各自の落ちる点へ山なりに飛び、
  //   その子弾の爆発の時刻（f.pts[i].d）にちょうど着く
  open(ctx, f, k) {
    const T = k * f.life, bx = f.x, by = f.y - 12, seed = f.seed || 0, Sm = FXB.smoke();
    const r = 14 + 34 * T;
    ctx.globalAlpha = 0.42 * (1 - k); ctx.drawImage(Sm.cv, bx - r, by - r - 8 * T, r * 2, r * 2); ctx.globalAlpha = 1;
    FxKit.flash(ctx, bx, by, 38, T, '#ffd890', 0.1);
    FxKit.glow(ctx, bx, by, 32, '#ff9a30', 0.65 * Math.max(0, 1 - T / 0.25));
    FxKit.hexWave(ctx, bx, by, 36, T / 0.3, '#ffd890', 3.6);
    FxKit.sparks(ctx, { x: bx, y: by, t: T, seed, n: 8, life: 0.55, v: 210, drag: 4, g: 320, size: 3.8, c0: '#e0c070', c1: '#5a5038', shape: 'shard', add: false });
    if (!f.pts) return;
    const heads = [];
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const p of f.pts) {
      const ti = p.d;
      if (ti < 0.02 || T >= ti) continue;
      const q = T / ti, q0 = Math.max(0, q - 0.35);
      const ax = bx + (p.x - bx) * q0, ay = by + (p.y - by) * q0 - 34 * q0 * (1 - q0);
      const cx = bx + (p.x - bx) * q, cy = by + (p.y - by) * q - 34 * q * (1 - q);
      ctx.moveTo(ax, ay); ctx.lineTo(cx, cy); heads.push(cx, cy);
    }
    ctx.globalAlpha = 0.6; ctx.strokeStyle = '#ff8a20'; ctx.lineWidth = 5; ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#fff0c0'; ctx.lineWidth = 1.8; ctx.stroke();
    for (let i = 0; i < heads.length; i += 2) FxKit.glow(ctx, heads[i], heads[i + 1], 12, '#ffb040', 0.9);
    ctx.beginPath(); for (let i = 0; i < heads.length; i += 2) { ctx.moveTo(heads[i] + 3, heads[i + 1]); ctx.arc(heads[i], heads[i + 1], 3, 0, 7); }
    ctx.fillStyle = '#fff6d8'; ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  },
  // 子弾の小爆発：閃光・火の玉（白い芯と橙の外）・広がる輪・六角の衝撃波・火の粉・残る煙。最後の大きな1発（big）は大きく
  pellet(ctx, f, k) {
    const T = k * f.life, R0 = f.big ? 26 : 15, seed = f.seed || 0, Sm = FXB.smoke();
    if (T > 0.05) { const q = (T - 0.05) / (f.life - 0.05), r = R0 * (0.9 + 0.9 * q); ctx.globalAlpha = 0.42 * (1 - q); ctx.drawImage(Sm.cv, f.x - r, f.y - r - 10 * q, r * 2, r * 2); ctx.globalAlpha = 1; }
    FxKit.flash(ctx, f.x, f.y, R0 * 1.4, T, '#ffb040', 0.09);
    const kk = T / 0.24;
    if (kk < 1) {
      const e = FxKit.ease(kk);
      ctx.globalCompositeOperation = 'lighter';
      FxKit.glow(ctx, f.x, f.y, R0 * (1.2 + 1.1 * e), '#ff7a1a', 0.85 * (1 - kk));
      FxKit.glow(ctx, f.x, f.y, R0 * 0.9 * (1 - kk * 0.5), '#ffe0a0', 1 - kk);
      ctx.globalAlpha = 1 - kk; ctx.strokeStyle = '#ffb040'; ctx.lineWidth = 4 * (1 - kk) + 1;
      ctx.beginPath(); ctx.arc(f.x, f.y, R0 * (0.5 + 0.8 * e), 0, 7); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    FxKit.hexWave(ctx, f.x, f.y, R0 * 1.6, T / 0.3, '#ffcf70', 2.6);
    FxKit.sparks(ctx, { x: f.x, y: f.y, t: T, seed, n: 7, life: 0.4, v: 180, drag: 5, g: 200, size: 2.6, c0: '#fff0c0', c1: '#ff6a1a' });
  },
  lobs: { cluster(ctx, b, by, br, run) { this.shell(ctx, b, by, br, run); } },
  fx: {
    clustermuzzle(ctx, f, k) { this.muzzle(ctx, f, k); },
    clusteropen(ctx, f, k) { this.open(ctx, f, k); },
    pellet(ctx, f, k) { this.pellet(ctx, f, k); },
  },
};
FusionFX.register('scattergun', FX_SCATTERGUN);

// 見本の部屋（debugroom.js の DebugRoom.SR）の、この7種の映し方と4つの時刻。debugroom.js はこのファイルより後に読むので、読み終えてから足す
//   （円環刃は射程の端で回るので、既定の映し方では画面の外になる）
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('load', () => {
  if (typeof DebugRoom === 'undefined' || !DebugRoom.SR) return;
  const F = [[60, 0], [95, -14], [130, 12], [165, -10], [200, 8], [240, 0]];
  Object.assign(DebugRoom.SR, {
    plasmachain: { face: -90, foes: F, times: [[0.05, '撃つ'], [0.3, '網'], [0.45, '当たり'], [0.9, '余韻']], look: 120, w: 300 },
    chakram: { face: -90, foes: [[60, 0], [110, 4], [160, -4], [220, 3], [280, -2], [335, 0]], times: [[0.04, '投げる'], [0.2, '飛ぶ'], [1.0, '回る'], [1.85, '戻る']], look: 165, w: 300 },
    toxblade: { face: -90, foes: F, times: [[0.04, '撃つ'], [0.15, '飛ぶ'], [0.35, '跳ねる'], [0.9, '毒の筋']], look: 120, w: 300 },
    flameblade: { face: -90, foes: F, times: [[0.03, '1本目'], [0.2, '滅多斬り'], [0.36, '十字'], [0.9, '燃える線']], look: 120, w: 300 },
    bubblegun: { face: -90, foes: F, times: [[0.04, '撃つ'], [0.12, '飛ぶ'], [0.2, '割れる'], [0.45, '小さな泡']], look: 120, w: 300 },
    bubbleblade: { face: -90, foes: F, times: [[0.05, '撃つ'], [0.25, '落ちる'], [0.5, '光の刃'], [0.9, '泡が割れる']], look: 120, w: 300 },
    scattergun: { face: -90, foes: F, times: [[0.05, '撃つ'], [0.35, '飛ぶ'], [0.75, '割れる'], [1.1, '子弾の雨']], look: 120, w: 300 },
  });
});

