// ---------------------------------------------------------------
// fusionfx/fx-blade.js : 合成武器の演出（撃ち出す弾と刃）・2026-10-12 段1で分けた（設計 docs/FUSION-ART-DIRECTION-2026-10-12.md）
//
//   このファイルの受け持ち（8種）：
//     starassault  スターアサルト（済・手本）
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

