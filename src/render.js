// ---------------------------------------------------------------
// render.js : Canvas描画。タイルマップ＋敵＋弾＋場＋演出
// ---------------------------------------------------------------
'use strict';

// 線の弾のまとめ先。**毎フレーム作り直さない**（1フレームに何百回も通る）
const _bulGroups = new Map();

const _spins = [];        // 手裏剣のまとめ描き用（毎フレーム作り直さない）
const _spinPts = new Float32Array(16);

const Render = {
  canvas: null, ctx: null, dpr: 1,
  scale: 1, offX: 0, offY: 0,
  cssW: 1, cssH: 1,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.resize();
  },

  resize() {
    const c = this.canvas;
    const rect = c.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(this.cssW * this.dpr);
    c.height = Math.round(this.cssH * this.dpr);
    this.fit();
  },

  // ステージ全体が収まるように拡大率と余白を決める
  // 見る場所。**画面に収まるステージでは使わない**（cam は 0 のまま）
  cam: { x: 0, y: 0 },
  viewW: 0, viewH: 0,
  camStage: null,

  fit() {
    const st = Game.run ? Game.run.stage : Stage.build(Game.perm ? (Game.perm.currentStage || 'ch1') : 'ch1');
    this.stage = st;

    // **画面に収まらないステージは、縮小せずに一部を切り取る。**
    // 全部映すと1タイルが小さくなりすぎて、密集も配置も見えなくなる
    const REF_W = 15 * TILE, REF_H = 21 * TILE;     // これまでのステージの広さ
    const s = Math.min(this.cssW / Math.min(st.w, REF_W), this.cssH / Math.min(st.h, REF_H));
    this.scale = s;
    this.viewW = this.cssW / s;
    this.viewH = this.cssH / s;

    if (this.camStage !== st.id) { this.cam.x = 0; this.cam.y = st.h; this.camStage = st.id; }
    this.clampCam();

    this.offX = (st.w * s <= this.cssW) ? (this.cssW - st.w * s) / 2 : -this.cam.x * s;
    this.offY = (st.h * s <= this.cssH) ? (this.cssH - st.h * s) / 2 : -this.cam.y * s;
  },

  clampCam() {
    const st = this.stage;
    if (!st) return;
    if (!Number.isFinite(this.cam.x)) this.cam.x = 0;
    if (!Number.isFinite(this.cam.y)) this.cam.y = 0;
    this.cam.x = Math.min(Math.max(0, st.w - this.viewW), Math.max(0, this.cam.x));
    this.cam.y = Math.min(Math.max(0, st.h - this.viewH), Math.max(0, this.cam.y));
  },

  // なぞって動かせるか（画面に収まっていれば動かす必要が無い）
  canPan() {
    const st = this.stage;
    return !!st && (st.w > this.viewW + 1 || st.h > this.viewH + 1);
  },
  panBy(dxPx, dyPx) {
    if (!this.canPan()) return;
    this.cam.x -= dxPx / this.scale;
    this.cam.y -= dyPx / this.scale;
    this.fit();
  },

  // 画面座標 -> ステージ座標
  toStage(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) - this.offX) / this.scale,
      y: ((clientY - r.top) - this.offY) / this.scale,
    };
  },

  // ステージ座標 -> 画面座標（調整ポップアップを武器の横に置くのに使う）
  toClient(x, y) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: r.left + this.offX + x * this.scale,
      y: r.top + this.offY + y * this.scale,
    };
  },

  tileAt(clientX, clientY) {
    const p = this.toStage(clientX, clientY);
    return { c: Math.floor(p.x / TILE), r: Math.floor(p.y / TILE), x: p.x, y: p.y };
  },

  draw(run) {
    const ctx = this.ctx;
    const k = this.scale * this.dpr;
    const st = (run && run.stage) || this.stage;
    this.stage = st;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#06070a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    let sx = 0, sy = 0;
    if (run && run.shake > 0) { sx = Util.rand(-run.shake, run.shake); sy = Util.rand(-run.shake, run.shake); }
    ctx.setTransform(k, 0, 0, k, (this.offX * this.dpr) + sx * k, (this.offY * this.dpr) + sy * k);

    this.tiles(ctx, st);
    if (!run) { ctx.setTransform(1, 0, 0, 1, 0, 0); return; }

    this.arcs(ctx, run);
    this.fields(ctx, run);
    this.aims(ctx, run);
    this.core(ctx, run);
    this.enemies(ctx, run);
    this.bullets(ctx, run);
    this.units(ctx, run);
    this.effects(ctx, run);
    this.numbers(ctx, run);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.miniMap(ctx);
    // **仕掛けの凡例は、盤の変換を戻してから描く。**
    //   盤の中で描くと縮尺が掛かって字が潰れ、左端で切れていた
    this.zoneLegend(ctx, run.stage);
  },

  tiles(ctx, st) {
    // **折れ線があるなら、通路は滑らかに描く**（src/mapgen.js の vec）。
    //   タイルに焼いた地形をそのまま四角で描くと、せっかく自由な角度で作った通路が
    //   また45度の階段に見える。**遊びの判定はタイルのまま**で、絵だけベクタを見る。
    //   焼くときに使った判定（タイルの中心が幅の内側か）と同じ線を描くので、
    //   通路タイルの中心は必ず描いた帯の中に入る。ずれるのは縁の半タイルぶんだけ
    if (st.vec) return this.tilesVec(ctx, st);
    for (let r = 0; r < st.rows; r++) {
      for (let c = 0; c < st.cols; c++) {
        const ch = st.grid[r][c];
        const x = c * TILE, y = r * TILE;
        if (ch === ' ') {
          // 障害物
          ctx.fillStyle = '#0a0b0f';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = '#181b22'; ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else if (ch === '#') {
          // 地面（ユニットを置ける）。
          // **通路との明暗差はしっかり開ける。** 近い明るさだと、
          // どこが自分の陣地でどこが敵の道なのか一目で分からなかった
          ctx.fillStyle = '#31384a';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = 'rgba(255,170,80,0.10)'; ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else {
          // 通路（敵が通る）。**ほぼ黒まで落とす**
          ctx.fillStyle = '#05060a';
          ctx.fillRect(x, y, TILE, TILE);
        }
        if (ch === 'S') {
          ctx.fillStyle = 'rgba(255,60,90,0.18)';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = '#ff5566'; ctx.lineWidth = 2;
          ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
        }
      }
    }

    // 通行量と漏れルートのヒートマップ
    this.heat(ctx, st);


    // **進行方向の矢印は出さない。**
    // 通路のどこをどう通るかは、敵が来てから目で見て分かればいい。
    // 盤面いっぱいに散った記号は、敵と弾を読むのを邪魔していた

    // 置き場所を選んでいるとき。**盤面を落として、置けるところだけ光らせる。**
    // 薄く塗るだけでは「どこに置けるか分からない」ままだった
    const picking = (UI.placingType || UI.moving) && Game.canBuild();
    if (picking) {
      ctx.fillStyle = 'rgba(4,8,13,0.5)';
      ctx.fillRect(0, 0, st.cols * TILE, st.rows * TILE);

      // **武器ごとに要るマスが違う**（weapons.js の foot）ので、
      //   「1マス空いている」ではなく「その武器が収まる」で光らせる。
      //   ここを1マス判定のままにすると、光っているのに置けない場所ができる
      const wid = UI.placingType || (UI.moving && UI.moving.id);
      const def = wid ? WEAPONS[wid] : null;
      const pulse = 0.16 + 0.08 * Math.sin((Game.run ? Game.run.time : 0) * 5);
      // **射線が通らない壁マスは、置けても仕事をしない。**（2026-09-22）
      //   壁が弾を止めるようにしたので、壁の奥へ引っ込めた砲は何も撃てない。
      //   置けるかどうかと同じ色で光らせると、**押しても何も起きない罠**になる。
      //   通路が1マスも見えないところは暗いままにして、光らせない。
      //   **毎フレーム数えない。**武器ごとに1回だけ作ってステージに持たせる
      //   （全マス × 全通路 × 射線で、素直に回すと1フレーム百万回になる）
      const sees = this.losMap(st, def);
      for (let r = 0; r < st.rows; r++) {
        for (let c = 0; c < st.cols; c++) {
          if (!def || !Game.canPlaceAt(def, c, r, UI.moving || null)) continue;
          const ok = !sees || sees[r * st.cols + c];
          ctx.fillStyle = ok ? 'rgba(255,170,50,' + pulse.toFixed(3) + ')'
                             : 'rgba(120,132,152,0.10)';
          // その武器が埋めるマスをまとめて光らせる＝**置く前に広さが分かる**
          for (const t of Game.footTiles(def, c, r)) {
            ctx.fillRect(t.c * TILE + 2, t.r * TILE + 2, TILE - 4, TILE - 4);
          }
        }
      }
    }
  },

  // 「そのマスから通路が1マスでも見えるか」を、武器ごとに1枚作る。
  //   壁を抜ける武器（触手・刀・火炎・毒ガス）は全部見えることにして null を返す
  losMap(st, def) {
    if (!def || def.wallThrough) return null;
    const cache = st._los || (st._los = {});
    if (cache[def.id]) return cache[def.id];
    // 通路の中心を先に集めておく（毎マスで作り直さない）
    let path = st._pathPts;
    if (!path) {
      path = st._pathPts = [];
      for (let r = 0; r < st.rows; r++)
        for (let c = 0; c < st.cols; c++)
          if (st.walkable(c, r)) path.push(st.center(c, r));
    }
    const rng = def.base.range * 1.6;      // ツリーで伸びるぶんを見込む
    const rng2 = rng * rng;
    const out = new Uint8Array(st.cols * st.rows);
    for (let r = 0; r < st.rows; r++) {
      for (let c = 0; c < st.cols; c++) {
        if (!st.buildable(c, r)) continue;
        const g = st.center(c, r);
        for (const p of path) {
          const dx = p.x - g.x, dy = p.y - g.y;
          if (dx * dx + dy * dy > rng2) continue;
          if (Combat.losBlocked(st, g.x, g.y, p.x, p.y)) continue;
          out[r * st.cols + c] = 1; break;
        }
      }
    }
    cache[def.id] = out;
    return out;
  },

  // 折れ線から描く通路。**tiles() の代わり**
  tilesVec(ctx, st) {
    const v = st.vec;
    // 1. 盤ぜんぶを地面で塗る
    ctx.fillStyle = '#31384a';
    ctx.fillRect(0, 0, st.w, st.h);

    // 2. **通路は六角セル（ハニカム）で描く。**
    //   （ユーザー 2026-09-21「6角形の道とかにしよう、ハニカムで道とかカーブを再現して」）
    //   折れ線をそのまま太い帯で塗ると、曲がりが丸い管になって有機的に見えた。
    //   同じ曲線を六角の階段で辿らせると、構造物として読める。
    //   **焼くときに使ったセルをそのまま描く**ので、絵と当たり判定がずれない
    const R = v.hexR || 26;
    const hexPath = (x, y) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i;
        const px = x + Math.cos(a) * R, py = y + Math.sin(a) * R;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };
    // **盤の外へはみ出した六角を描かない。** 盤の縁に半端なセルが見えていた
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, st.cols * TILE, st.rows * TILE);
    ctx.clip();
    // 縁：一回り大きく塗って、通路の外周に枠が出るようにする
    ctx.fillStyle = '#232838';
    for (const h of v.hexes) { hexPath(h.x, h.y); ctx.fill(); }
    // 本体：境目に線を残すと、六角の集まりとして読める。
    //   **仕掛けのあるセルは色を変える**（泥＝遅くなる／坂＝速くなる）。
    //   見て分かること自体が仕掛けの半分。分からないと置き場所を選べない
    ctx.strokeStyle = '#151a26';
    ctx.lineWidth = 2;
    for (const h of v.hexes) {
      ctx.fillStyle = h.zone === 1 ? '#0d1b14' : h.zone === 2 ? '#1c1220' : '#05060a';
      hexPath(h.x, h.y); ctx.fill(); ctx.stroke();
    }
    // 仕掛けの印。**塗りの差だけだと暗い画面で読めない**ので、記号を重ねる
    for (const h of v.hexes) {
      if (!h.zone) continue;
      ctx.strokeStyle = h.zone === 1 ? 'rgba(110,230,170,0.55)' : 'rgba(215,140,255,0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (h.zone === 1) {                    // 泥：横に3本（沈む感じ）
        for (let i = -1; i <= 1; i++) { ctx.moveTo(h.x - R * 0.45, h.y + i * 6); ctx.lineTo(h.x + R * 0.45, h.y + i * 6); }
      } else {                               // 坂：山形（下る感じ）
        ctx.moveTo(h.x - R * 0.42, h.y + 5); ctx.lineTo(h.x, h.y - 6); ctx.lineTo(h.x + R * 0.42, h.y + 5);
      }
      ctx.stroke();
    }
    ctx.restore();

    // 2b. **盤の縁は六角を描いたあとで塗り直す。**
    //   edge() が縁の通路を壁に戻しているので、そこだけ「絵は道／規則は壁」になる。
    //   内側は食い違わない（実測：40枚で内側のずれ0・縁だけ783）
    ctx.fillStyle = '#31384a';
    for (let c = 0; c < st.cols; c++) {
      if (st.grid[0][c] === '#') ctx.fillRect(c * TILE, 0, TILE, TILE);
      if (st.grid[st.rows - 1][c] === '#') ctx.fillRect(c * TILE, (st.rows - 1) * TILE, TILE, TILE);
    }
    for (let r = 0; r < st.rows; r++) {
      if (st.grid[r][0] === '#') ctx.fillRect(0, r * TILE, TILE, TILE);
      if (st.grid[r][st.cols - 1] === '#') ctx.fillRect((st.cols - 1) * TILE, r * TILE, TILE, TILE);
    }

    // 3. 置ける場所の格子。**設置はタイルのままなので、ここは四角で見せる。**
    //    （ユーザー決定 2026-09-21「タイルのまま」）
    ctx.strokeStyle = 'rgba(255,170,80,0.10)';
    ctx.lineWidth = 1;
    for (let r = 0; r < st.rows; r++) {
      for (let c = 0; c < st.cols; c++) {
        if (st.grid[r][c] !== '#') continue;
        ctx.strokeRect(c * TILE + 0.5, r * TILE + 0.5, TILE - 1, TILE - 1);
      }
    }

    // 4. 障害物
    ctx.fillStyle = '#0a0b0f';
    for (let r = 0; r < st.rows; r++) {
      for (let c = 0; c < st.cols; c++) {
        if (st.grid[r][c] === ' ') ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }

    // 5. **壁に開いた穴。** 1タイルの印ではなく、開いている幅ぶんを1本の口として描く
    for (const h of v.holes) {
      const t0 = h.tiles[0], t1 = h.tiles[h.tiles.length - 1];
      const x = Math.min(t0.c, t1.c) * TILE, y = Math.min(t0.r, t1.r) * TILE;
      const w = (Math.abs(t1.c - t0.c) + 1) * TILE, hh = (Math.abs(t1.r - t0.r) + 1) * TILE;
      ctx.fillStyle = 'rgba(255,60,90,0.16)';
      ctx.fillRect(x, y, w, hh);
      ctx.strokeStyle = '#ff5566';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 2, y + 2, w - 4, hh - 4);
    }

    this.heat(ctx, st);
  },

  // 炎の舌。**扇1枚ではなく、長さの違う舌を重ねて「噴いている」形にする**
  //   `f.seed` は発射ごとに固定なので、1回の噴射のあいだ形が暴れない
  flameCone(ctx, f, k) {
    const n = 7;
    const fade = 1 - k;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      // 舌ごとの向きと長さ。seed と i から決める（毎フレーム同じ）
      const t = (i + 0.5) / n;
      const rnd = ((f.seed + i * 9781) % 997) / 997;
      const a = f.a + (t * 2 - 1) * f.arc;
      // 中央ほど長い（噴流の芯）。k が進むと伸びて薄れる＝噴き出して散る
      const core = 1 - Math.abs(t * 2 - 1) * 0.55;
      const len = f.r * core * (0.62 + rnd * 0.38) * (0.65 + 0.5 * k);
      const halfW = f.arc / n * (1.5 + rnd * 0.9);
      const g = ctx.createLinearGradient(f.x, f.y, f.x + Math.cos(a) * len, f.y + Math.sin(a) * len);
      g.addColorStop(0, 'rgba(255,250,214,' + (0.55 * fade) + ')');
      g.addColorStop(0.35, 'rgba(255,196,64,' + (0.42 * fade) + ')');
      g.addColorStop(0.75, 'rgba(255,92,24,' + (0.24 * fade) + ')');
      g.addColorStop(1, 'rgba(120,30,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.arc(f.x, f.y, len, a - halfW, a + halfW);
      ctx.closePath();
      ctx.fill();
    }
    // 噴き口の白熱
    const gc = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 14);
    gc.addColorStop(0, 'rgba(255,255,235,' + (0.85 * fade) + ')');
    gc.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = gc;
    ctx.beginPath(); ctx.arc(f.x, f.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  // 画面の隅に置く、仕掛けの凡例。**盤の変換の外で描く**（字が潰れないように）
  //
  //   色の丸を添える形にしたら、丸が黒く潰れて「謎の四角」に見えた。
  //   **部品を減らして、見出しの文字そのものに色を付ける。**
  // 触手。**根元が太く、先へ細くなる、うねった腕。**
  //   線1本だと「掴んでいる」ようには見えない（ユーザー 2026-09-22）
  tentacle(ctx, f, k) {
    const x0 = f.x1, y0 = f.y1, x1 = f.e.x, y1 = f.e.y;
    const dx = x1 - x0, dy = y1 - y0;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;        // 腕に垂直な向き
    const N = 12;
    const amp = Math.min(26, L * 0.16) * (1 - k * 0.55);   // 掴んだ直後ほど大きくうねる
    const ptx = [], pty = [], wid = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // 端は動かさない（砲身と敵から離れると、掴んでいるように見えない）
      const sway = Math.sin(t * 5.2 + f.ph + k * 7) * amp * Math.sin(t * Math.PI);
      ptx[i] = x0 + dx * t + nx * sway;
      pty[i] = y0 + dy * t + ny * sway;
      wid[i] = (7.5 * (1 - t * 0.82)) * (1 - k * 0.3);     // 根元 7.5px → 先 1.4px
    }
    // 片側を往き、もう片側を戻って閉じる＝先細りの帯
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(N, i + 1);
      const tx = ptx[i1] - ptx[i0], ty = pty[i1] - pty[i0];
      const m = Math.hypot(tx, ty) || 1;
      const ox = -ty / m * wid[i], oy = tx / m * wid[i];
      i ? ctx.lineTo(ptx[i] + ox, pty[i] + oy) : ctx.moveTo(ptx[i] + ox, pty[i] + oy);
    }
    for (let i = N; i >= 0; i--) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(N, i + 1);
      const tx = ptx[i1] - ptx[i0], ty = pty[i1] - pty[i0];
      const m = Math.hypot(tx, ty) || 1;
      ctx.lineTo(ptx[i] + ty / m * wid[i], pty[i] - tx / m * wid[i]);
    }
    ctx.closePath();
    ctx.globalAlpha = (1 - k) * 0.92;
    ctx.fillStyle = f.color; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    // 吸盤。根元寄りの太いところにだけ。**腕であることは、ここで決まる**
    ctx.globalAlpha = (1 - k) * 0.7;
    ctx.fillStyle = '#ffd0f2';
    for (let i = 1; i < N - 2; i += 2) {
      ctx.beginPath();
      ctx.arc(ptx[i], pty[i], Math.max(0.8, wid[i] * 0.34), 0, Math.PI * 2);
      ctx.fill();
    }
    // 先端は敵に巻き付く
    ctx.globalAlpha = (1 - k) * 0.85;
    ctx.strokeStyle = f.color; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(x1, y1, (f.e.r || 8) + 3, f.ph, f.ph + 4.4); ctx.stroke();
    ctx.globalAlpha = 1;
  },

  // 凍結装置の冷気。**輪1本では「冷気を放った」ようには見えない。**
  //   広がる霜の輪＋外へ散る氷の結晶＋内側の冷たい膜（ユーザー 2026-09-22）
  frostWave(ctx, f, k) {
    const R = f.r * (0.25 + k * 0.85);
    ctx.globalAlpha = (1 - k) * 0.20;
    ctx.fillStyle = f.color;
    ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.strokeStyle = f.color; ctx.lineWidth = 2.5 * (1 - k) + 0.8;
    ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.stroke();
    // 結晶。**六条の針**にして、氷だと分かるようにする
    ctx.globalAlpha = (1 - k) * 0.85;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = f.ph + i * 0.6283 + k * 0.5;
      const rr = R * (0.72 + (i % 3) * 0.1);
      const cx = f.x + Math.cos(a) * rr, cy = f.y + Math.sin(a) * rr;
      const sz = 5 * (1 - k) + 1.5;
      for (let j = 0; j < 3; j++) {          // 3本の線＝六条
        const b = a + j * 1.047;
        ctx.moveTo(cx - Math.cos(b) * sz, cy - Math.sin(b) * sz);
        ctx.lineTo(cx + Math.cos(b) * sz, cy + Math.sin(b) * sz);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  },

  zoneLegend(ctx, st) {
    if (!st || !st.vec || !st.vec.hexes.some(h => h.zone)) return;
    const rows = [
      { c: '#6ee6aa', k: '減速', t: '敵が遅くなる' },
      { c: '#d78cff', k: '加速', t: '敵が速くなる' },
    ];
    const d = this.dpr || 1;
    const w = 168 * d, h = (20 * rows.length + 12) * d;
    const x = 8 * d, y = this.canvas.height - h - 8 * d;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    if ('filter' in ctx) ctx.filter = 'none';
    ctx.fillStyle = 'rgba(8,10,16,0.9)';
    ctx.strokeStyle = '#2c3446'; ctx.lineWidth = 1 * d;
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    rows.forEach((r, i) => {
      const cy = y + (18 + i * 20) * d;
      ctx.font = '700 ' + Math.round(13 * d) + 'px system-ui, sans-serif';
      ctx.fillStyle = r.c;
      ctx.fillText(r.k, x + 10 * d, cy);
      ctx.font = Math.round(12 * d) + 'px system-ui, sans-serif';
      ctx.fillStyle = '#aab4c4';
      ctx.fillText(r.t, x + 44 * d, cy);
    });
    ctx.restore();
  },

  // 広いステージのとき、今どこを見ているかを小さく出す。
  // **画面に収まるステージでは出さない**（邪魔にしかならない）
  miniMap(ctx) {
    if (!this.canPan()) return;
    const st = this.stage;
    const d = this.dpr;
    const w = 46 * d, h = w * st.h / st.w;
    const x = this.canvas.width - w - 10 * d, y = 10 * d;
    ctx.save();
    ctx.fillStyle = 'rgba(8,13,20,.62)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1 * d;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = '#ffb43c'; ctx.lineWidth = 1.4 * d;
    ctx.strokeRect(x + this.cam.x / st.w * w, y + this.cam.y / st.h * h,
                   Math.min(1, this.viewW / st.w) * w, Math.min(1, this.viewH / st.h) * h);
    ctx.restore();
  },

  // 蓄積された通行量／漏れを盤面に塗る
  heat(ctx, st) {
    const run = Game.run;
    const saved = Game.perm && Game.perm.heat ? Game.perm.heat[st.id] : null;
    if (!saved) return;
    // 戦闘中は「今の戦闘ぶん」を、準備中は「これまでの蓄積」を見せる
    const live = run && Game.phase === 'battle';
    const traf = live ? run.traffic : saved.traffic;
    const leak = live ? run.leak : saved.leak;
    if (!traf) return;

    let mt = 0, ml = 0;
    for (let i = 0; i < traf.length; i++) { if (traf[i] > mt) mt = traf[i]; if (leak[i] > ml) ml = leak[i]; }

    if (Game.showHeat && mt > 0) {
      for (let r = 0; r < st.rows; r++) {
        for (let c = 0; c < st.cols; c++) {
          const v = traf[st.idx(c, r)] / mt;
          if (v <= 0.02) continue;
          const k = Math.pow(v, 0.6);
          // 琥珀 -> 赤。濃いほど敵が長く居座る場所。
          // **盤面と同じ暖色でそろえる。** 以前は薄い青から始めていて、
          // 黒×琥珀の床の上で1箇所だけ寒色が浮いていた
          // **タイルいっぱいには塗らない。** 全面を塗ると敵と弾が見えなくなるので、
          // 内側に余白を残してマス目の境界を潰さないようにする
          const cr = Math.round(200 + 55 * k);
          const cg = Math.round(150 - 100 * k);
          const cb = Math.round(40 - 30 * k);
          ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (0.04 + k * 0.15).toFixed(3) + ')';
          ctx.fillRect(c * TILE + 2, r * TILE + 2, TILE - 4, TILE - 4);
        }
      }
    }
    if (Game.showLeak && ml > 0) {
      for (let r = 0; r < st.rows; r++) {
        for (let c = 0; c < st.cols; c++) {
          const v = leak[st.idx(c, r)] / ml;
          if (v <= 0.35) continue;           // 薄いところまで塗ると全面が赤くなる
          const k = (v - 0.35) / 0.65;
          ctx.strokeStyle = 'rgba(255,70,90,' + (0.12 + k * 0.38).toFixed(3) + ')';
          ctx.lineWidth = 1 + k * 1.5;
          ctx.setLineDash([5, 4]);
          ctx.strokeRect(c * TILE + 4, r * TILE + 4, TILE - 8, TILE - 8);
          ctx.setLineDash([]);
        }
      }
    }
  },

  // 場（毒の雲・火の海・酸だまり）。
  //
  //   **前は3種とも「色を変えた円」を1枚描いているだけだった。**
  //   毒の雲も火の海も同じ形なので、何が起きているのか絵から分からない。
  //   （ユーザー 2026-09-22「こういった武器と実際のデザイン面の矛盾を解消して」）
  //
  //   **塊（lobe）をいくつか重ねて、種類ごとに動かし方を変える。**
  //     毒 … ゆっくり渦を巻きながら広がる＝雲
  //     火 … ちらついて上に伸びる＝燃えている
  //     酸 … ほとんど動かず、縁だけ泡立つ＝たまり
  fields(ctx, run) {
    ctx.save();
    for (const f of run.fields) {
      const k = f.t / f.dur;
      const fade = 1 - k * 0.65;
      const fire = f.kind === 'fire';
      ctx.globalCompositeOperation = fire ? 'lighter' : 'source-over';
      const lobes = 6;
      for (let i = 0; i < lobes; i++) {
        const base = i * 2.399;                       // 黄金角。種を持たなくても散る
        // 種類ごとの動き
        const spin = fire ? 0 : f.t * 0.5;
        const a = base + spin;
        const rad = f.r * (0.34 + 0.30 * ((i * 37) % 11) / 11);
        const dist = f.r * (0.18 + 0.36 * ((i * 53) % 7) / 7) * (fire ? 1 : 1 + k * 0.25);
        const wob = fire ? Math.sin(f.t * 9 + i) * f.r * 0.10 : 0;
        const x = f.x + Math.cos(a) * dist;
        const y = f.y + Math.sin(a) * dist - (fire ? Math.abs(wob) : 0);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad + Math.abs(wob));
        const al = (fire ? 0.30 : 0.22) * fade;
        g.addColorStop(0, this.tint(f.color, al));
        g.addColorStop(1, this.tint(f.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, rad + Math.abs(wob), 0, Math.PI * 2); ctx.fill();
      }
      // 縁。**どこまでが場なのかは、遊ぶうえで必要な情報**なので必ず出す
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.45 * (1 - k);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(fire ? [] : [5, 4]);
      ctx.lineDashOffset = -f.t * 12;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },

  // '#rrggbb' を rgba に。場の塊を柔らかく落とすのに使う
  tint(hex, a) {
    const h = (hex || '#ffffff').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  },

  core(ctx, run) {
    const t = run.tower;
    const hpR = Util.clamp(t.hp / t.maxHp, 0, 1);
    ctx.save();
    ctx.shadowColor = '#ff8a1f'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#2a1f08';
    ctx.strokeStyle = '#ffa32e'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 3;
      const px = t.x + Math.cos(a) * t.r, py = t.y + Math.sin(a) * t.r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 7, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = hpR > 0.5 ? '#48e08a' : hpR > 0.22 ? '#ffc23c' : '#ff4e63';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpR);
    ctx.stroke();
  },

  // 射界（扇）。画面に出ているこの形が、そのまま当たる範囲
  // 射界の扇。**常時は出さない。**
  //   全基ぶん重ねると盤面が扇で埋まり、敵も弾も読めなかった。
  //   出すのは「今いじっている1基」と「置き場所を選んでいる最中」だけ
  arcs(ctx, run) {
    const sel = UI.selected;
    const picking = !!(UI.placingType || UI.moving);
    if (!sel && !picking) return;

    for (const u of run.units) {
      const isSel = sel === u;
      if (!isSel && !picking) continue;
      ctx.globalAlpha = isSel ? 0.55 : 0.14;

      const c = u.def.color;
      ctx.strokeStyle = c;
      ctx.lineWidth = isSel ? 2 : 1.2;

      if (Game.usesAimPoint(u.def)) {
        // 指定攻撃は扇を持たない。全方位のどこにでも落とせるので、
        // **塗らずに境界線だけ**引く。塗ると盤面の半分が色で埋まって何も読めない
        ctx.setLineDash([7, 7]);
        ctx.beginPath();
        ctx.arc(u.x, u.y, u.s.range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(u.x + Math.cos(u.face - u.arc) * u.s.range, u.y + Math.sin(u.face - u.arc) * u.s.range);
      ctx.arc(u.x, u.y, u.s.range, u.face - u.arc, u.face + u.arc);
      ctx.closePath();
      ctx.stroke();

      ctx.globalAlpha = isSel ? 0.16 : 0.07;
      ctx.fillStyle = c;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  },

  // 指定攻撃の着弾円。**砲弾はこの円の中のどこかに落ちる。**
  //   外側の破線 … 円そのもの（つまみで大きさが変わる）
  //   内側の薄い円 … 1発ぶんの爆風。この2つの差が「どれだけ散るか」
  aims(ctx, run) {
    for (const w of run.units) {
      // **w.aim ではなく w.ax/ay を見る。** w.aim は戦闘中しか入らないので、
      // これを見ていると「円を置く準備フェーズで円が見えない」ことになる
      if (w.ax === undefined || w.ax === null) continue;
      const ax = w.ax, ay = w.ay;
      const R = Math.max(14, Game.spotR(w));
      const c = w.def.color;
      ctx.strokeStyle = c + 'cc';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.arc(ax, ay, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalAlpha = 0.10;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(ax, ay, R, 0, Math.PI * 2); ctx.fill();
      // 内側の細い円は「1発ぶんの爆風」。この2つの差が、そのまま散り具合
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ax, ay, Math.max(8, w.s.splash), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ax - 6, ay); ctx.lineTo(ax + 6, ay);
      ctx.moveTo(ax, ay - 6); ctx.lineTo(ax, ay + 6);
      ctx.stroke();
    }
  },

  // ---------- 武器の見た目 ----------
  //
  //   **12種が「色の違う丸」だったのをやめた。** 形で見分けられるようにする。
  //   絵は持たない（ビルドの無いプロジェクトなので）。全部その場で描く。
  //
  //   描く順   台座 → 砲塔（武器ごと） → 発砲の火
  //   座標系   砲塔は原点・+x が砲身の向き。台座は回らない
  //   3文字の略号は**準備フェーズだけ**出す。戦闘中は形だけで読む
  units(ctx, run) {
    const build = run.phase === 'build' || Game.phase !== 'battle';
    for (const u of run.units) {
      const c = u.def.color;
      const sel = UI.selected === u;

      // --- 台座。**占めているマスぜんぶを踏む。**（2026-09-22）
      //   武器ごとに要る広さが違うので（weapons.js の foot）、
      //   六角の座を1つ描くだけだと「2マス使っているのに1マスに見える」。
      //   **踏んでいる面をそのまま見せる**のが、置き場所を選ぶための情報になる
      const tiles = Game.tilesOf(u);
      ctx.save();
      ctx.shadowColor = c; ctx.shadowBlur = sel ? 16 : 7;
      ctx.fillStyle = '#0c0e13';
      ctx.strokeStyle = sel ? '#ffffff' : c;
      ctx.lineWidth = sel ? 2.4 : 1.5;
      const pad = 3, rr = 6;
      for (const t of tiles) {
        const x = t.c * TILE + pad, y = t.r * TILE + pad, w = TILE - pad * 2, h = TILE - pad * 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, rr);
        else ctx.rect(x, y, w, h);
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();

      // --- 砲塔 ---
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.rotate(u.angle);
      // 撃った瞬間に後ろへ下がる。**動いて見えるのはこれだけで足りる**
      if (u.muzzle > 0) ctx.translate(-u.muzzle * 26, 0);
      // 2マス使う武器は砲塔も大きく描く（同じ大きさだと広さが嘘になる）
      const sc = tiles.length >= 2 ? 1.25 : 1;
      if (sc !== 1) ctx.scale(sc, sc);
      this.turret(ctx, u, c);
      ctx.restore();

      // --- 発砲の火。砲身の先に出す（後退とは無関係の位置） ---
      if (u.muzzle > 0) {
        const bl = this.barrelLen(u);
        ctx.save();
        ctx.translate(u.x, u.y); ctx.rotate(u.angle);
        ctx.globalAlpha = Math.min(1, u.muzzle * 12);
        ctx.fillStyle = '#fff6e0';
        ctx.beginPath();
        ctx.moveTo(bl, -1.5); ctx.lineTo(bl + 7, 0); ctx.lineTo(bl, 1.5);
        ctx.lineTo(bl + 1, 3.5); ctx.lineTo(bl - 1, 0); ctx.lineTo(bl + 1, -3.5);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      // --- 略号。準備中だけ。戦闘中は盤面を汚さない ---
      if (build) {
        ctx.fillStyle = c;
        ctx.font = 'bold 7px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(u.def.short, u.x, u.y + 18);
      }
    }
  },

  // 砲身の長さ（発砲の火を出す位置）
  barrelLen(u) {
    switch (u.id) {
      case 'sniper': return 24;
      case 'katana': return 19;
      case 'mortar': return 12;
      case 'missile': return 13;
      case 'flame': return 11;
      case 'gas': return 12;
      case 'tesla': case 'cryo': case 'shuriken': case 'tentacle': return 9;
      default: return 15;
    }
  },

  // 武器ごとの砲塔。**+x が砲身の向き。** 描くのは全部ここに集める
  turret(ctx, u, c) {
    const bar = (len, w, off) => { ctx.fillRect(off || 0, -w / 2, len, w); };
    ctx.fillStyle = c;
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';

    switch (u.id) {
      // 🔫 3本の回転銃身
      case 'gatling':
        ctx.fillStyle = '#1b1d23';
        ctx.fillRect(-4, -6, 9, 12);
        ctx.strokeRect(-4, -6, 9, 12);
        ctx.fillStyle = c;
        bar(15, 2.6, 3); ctx.fillRect(3, -6.2, 15, 2.2); ctx.fillRect(3, 4, 15, 2.2);
        break;

      // 🎯 長い一本＋照準器＋脚
      case 'sniper':
        ctx.fillStyle = c; bar(24, 2.4, 2);
        ctx.fillRect(4, -5.5, 7, 2.2);                 // スコープ
        ctx.fillStyle = '#1b1d23';
        ctx.fillRect(-5, -4, 8, 8); ctx.strokeRect(-5, -4, 8, 8);
        ctx.strokeStyle = c;                            // 二脚
        ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(15, -6); ctx.moveTo(11, 0); ctx.lineTo(15, 6); ctx.stroke();
        break;

      // 🚀 4連装の発射箱
      case 'missile':
        ctx.fillStyle = '#1b1d23';
        ctx.fillRect(-5, -7, 17, 14); ctx.strokeRect(-5, -7, 17, 14);
        ctx.fillStyle = c;
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          ctx.beginPath(); ctx.arc(1 + i * 7, -3.5 + j * 7, 2.1, 0, 7); ctx.fill();
        }
        break;

      // ⚡ コイル。輪が2枚と、先端の球
      case 'tesla':
        ctx.fillStyle = '#1b1d23';
        ctx.fillRect(-4, -4, 8, 8); ctx.strokeRect(-4, -4, 8, 8);
        ctx.strokeStyle = c;
        for (const r of [5.5, 7.5]) { ctx.beginPath(); ctx.ellipse(2, 0, 2.5, r, 0, 0, 7); ctx.stroke(); }
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(9, 0, 3.4, 0, 7); ctx.fill();
        break;

      // 🔥 太い噴射口＋燃料タンク
      case 'flame':
        ctx.fillStyle = '#1b1d23';
        ctx.beginPath(); ctx.arc(-5, 0, 5.5, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(0, -3); ctx.lineTo(11, -6.5); ctx.lineTo(11, 6.5); ctx.lineTo(0, 3);
        ctx.closePath(); ctx.fill();
        break;

      // ☣ ボンベ＋短い散布筒
      case 'gas':
        ctx.fillStyle = '#1b1d23';
        ctx.beginPath(); ctx.ellipse(-4, 0, 5, 6.5, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c;
        bar(12, 4.4, 1);
        ctx.beginPath(); ctx.arc(13, 0, 3, 0, 7); ctx.fill();
        break;

      // ❄ 放射状のフィン。砲身を持たない
      case 'cryo':
        ctx.strokeStyle = c; ctx.lineWidth = 1.8;
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
          ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9); ctx.stroke();
        }
        ctx.fillStyle = '#1b1d23';
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill(); ctx.stroke();
        break;

      // 🗡 刃
      case 'katana':
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(2, -1.6); ctx.lineTo(19, -0.6); ctx.lineTo(20, 0); ctx.lineTo(19, 0.9); ctx.lineTo(2, 1.6);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1b1d23';
        ctx.fillRect(-4, -3.5, 6, 7); ctx.strokeRect(-4, -3.5, 6, 7);
        ctx.fillStyle = c; ctx.fillRect(1, -4.5, 1.8, 9);       // 鍔
        break;

      // ✳ 四方手裏剣
      case 'shuriken':
        ctx.fillStyle = c;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4, r = i % 2 ? 3.2 : 10;
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#0c0e13';
        ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, 7); ctx.fill();
        break;

      // 🐙 うねる3本の腕
      case 'tentacle':
        ctx.fillStyle = '#1b1d23'; ctx.strokeStyle = c; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(-3, 0, 4.5, 0, 7); ctx.fill(); ctx.stroke();
        ctx.lineCap = 'round'; ctx.lineWidth = 2;
        for (const s of [-1, 0, 1]) {
          ctx.beginPath(); ctx.moveTo(0, s * 2.6);
          ctx.bezierCurveTo(5, s * 6, 9, s * -2, 14, s * 5);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
        break;

      // 🫧 輪の噴出口
      case 'bubble':
        ctx.fillStyle = '#1b1d23';
        ctx.beginPath(); ctx.arc(-3, 0, 5, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = c; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(8, 0, 5, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(8, 0, 2.2, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(1, -2.5); ctx.lineTo(4, -4);
        ctx.moveTo(1, 2.5); ctx.lineTo(4, 4); ctx.stroke();
        break;

      // 💥 太く短い筒＋底板
      case 'mortar':
        ctx.fillStyle = '#1b1d23';
        ctx.beginPath();
        ctx.moveTo(-7, -7); ctx.lineTo(-2, -5); ctx.lineTo(-2, 5); ctx.lineTo(-7, 7);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(-2, -4.2); ctx.lineTo(12, -6); ctx.lineTo(12, 6); ctx.lineTo(-2, 4.2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#0c0e13';
        ctx.beginPath(); ctx.ellipse(11, 0, 1.6, 4.6, 0, 0, 7); ctx.fill();
        break;

      default:
        ctx.fillStyle = c; bar(15, 5, 0);
    }
  },

  // 敵の形。**3種が色と大きさでしか違わず、丸が並ぶだけだった。**
  //   武器と同じ作り方（その場で描くパス）で、種類ごとの輪郭を付ける。
  //   進む向きに合わせて回すので、どっちへ歩いているかも読める
  //     grunt … 六角。標準
  //     swift … 前が尖った矢じり。速さが形で分かる
  //     tank  … 角を落とした八角＋厚い縁。重さが形で分かる
  enemyBody(ctx, e) {
    const r = e.r;
    ctx.beginPath();
    if (e.tname === 'swift') {
      ctx.moveTo(r * 1.35, 0);
      ctx.lineTo(-r * 0.75, -r * 0.92);
      ctx.lineTo(-r * 0.3, 0);
      ctx.lineTo(-r * 0.75, r * 0.92);
    } else if (e.tname === 'tank') {
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + Math.PI / 8;
        const p = r * 0.98;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * p, Math.sin(a) * p);
      }
    } else if (e.boss) {
      // ボス：厚い十二角。**動かないので、据え物として大きく見せる**
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        const p = r * (i % 2 ? 0.82 : 1.0);
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * p, Math.sin(a) * p);
      }
    } else if (e.tname === 'shield') {
      // 装甲：前面が平らな盾。**「正面から殴っても通らない」を形で言う**
      ctx.moveTo(r * 0.95, -r * 0.95);
      ctx.lineTo(r * 0.95, r * 0.95);
      ctx.lineTo(-r * 0.5, r * 1.05);
      ctx.lineTo(-r * 1.05, 0);
      ctx.lineTo(-r * 0.5, -r * 1.05);
    } else if (e.tname === 'swarm') {
      // 群れ：小さい三角。1体では何もできない見た目
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(-r * 0.8, -r * 0.95);
      ctx.lineTo(-r * 0.8, r * 0.95);
    } else if (e.tname === 'split') {
      // 分裂：ひし形。**割れ目が入っているのが分かるよう、あとで線を足す**
      ctx.moveTo(r * 1.15, 0);
      ctx.lineTo(0, -r * 1.05);
      ctx.lineTo(-r * 1.15, 0);
      ctx.lineTo(0, r * 1.05);
    } else {
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
      }
    }
    ctx.closePath();
  },

  enemies(ctx, run) {
    for (const e of run.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.ang || 0);
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff'
                    : e.chill > 0 ? '#7fd8ff'
                    : e.burnT > 0 ? '#ff9a4a' : e.color;
      this.enemyBody(ctx, e);
      ctx.fill();
      // **輪郭を入れる。** 塗りだけだと、押し合って重なったときに
      // ひとかたまりの染みに見えて、何体いるのか読めなかった
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = e.tname === 'tank' ? 2.2 : 1.4;
      ctx.stroke();
      // 重い相手だけ、内側にもう1本。**硬さを形で伝える**
      if (e.tname === 'tank') {
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.5, 0, Math.PI * 2); ctx.stroke();
      }
      // ボス：残りHPを輪で見せる。**DPSチェックなので、減り方が見えないと意味がない**
      if (e.boss) {
        const f = Math.max(0, e.hp / e.maxHp);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 7, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); ctx.stroke();
      }
      // 装甲：厚い縁。**残っている装甲が見えるように**
      if (e.armor > 0) {
        ctx.strokeStyle = 'rgba(180,220,255,0.65)';
        ctx.lineWidth = 2.6;
        this.enemyBody(ctx, e); ctx.stroke();
      }
      // 分裂：割れ目
      if (e.split > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(0, -e.r); ctx.lineTo(0, e.r); ctx.stroke();
      }
      // 再生：十字。**燃やしている間は消える**ので、効いているのが目で分かる
      if (e.regen > 0 && e.burnT <= 0) {
        ctx.strokeStyle = 'rgba(160,255,200,0.9)';
        ctx.lineWidth = 2;
        const q = e.r * 0.45;
        ctx.beginPath();
        ctx.moveTo(-q, 0); ctx.lineTo(q, 0);
        ctx.moveTo(0, -q); ctx.lineTo(0, q);
        ctx.stroke();
      }
      ctx.restore();

      if (e.stun > 0) {   // 泡に閉じ込められている
        ctx.strokeStyle = 'rgba(160,220,255,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(140,216,255,0.16)';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6, 0, Math.PI * 2); ctx.fill();
      } else if (e.shock > 0) {
        ctx.strokeStyle = 'rgba(190,160,255,0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2); ctx.stroke();
      }
      if (e.grabT > 0) {
        ctx.strokeStyle = 'rgba(200,90,176,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2); ctx.stroke();
      }
      // 凍っている敵。**色を変えるだけだと「凍った」とは読めない**ので氷の棘を生やす
      //   （ユーザー 2026-09-22「武器と実際のデザイン面の矛盾を解消して」）
      //   4本だけ。敵は同時に100体を超えるので、1体あたりを増やさない
      if (e.chill > 0) {
        ctx.strokeStyle = 'rgba(210,244,255,0.9)'; ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = i * 1.5708 + (e.r % 1);
          const cx = Math.cos(a), cy = Math.sin(a);
          ctx.moveTo(e.x + cx * e.r * 0.5, e.y + cy * e.r * 0.5);
          ctx.lineTo(e.x + cx * (e.r + 4), e.y + cy * (e.r + 4));
        }
        ctx.stroke();
      }
      if (e.hp < e.maxHp) {
        const bw = e.r * 2.2, bh = 2.5;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 7, bw, bh);
        ctx.fillStyle = '#7ef08a';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 7, bw * Util.clamp(e.hp / e.maxHp, 0, 1), bh);
      }
    }
  },

  // 弾。**色と太さでまとめてから「にじみ → 本体 → 白い芯」の3枚を重ねる。**
  //   平らな棒1本だったのを、曳光弾らしく光らせるため。
  //
  //   **速くはならない。** 851発（第9章の実測ピーク）で比べたところ
  //   1発ずつ描く旧実装 0.305ms に対して 0.455ms。重ねたぶんだけ遅い。
  //   ただし1フレームの予算16.7msに対して誤差なので、見た目を取った。
  //   （まとめ描き自体はほぼ無効果だった。1パスでも 0.342ms で旧と大差ない。
  //     効いているのは描画命令の数ではなく、弾1発ごとのJS処理のほう）
  bullets(ctx, run) {
    ctx.lineCap = 'round';
    const groups = _bulGroups;
    const spins = _spins; spins.length = 0;
    for (const g of groups.values()) g.n = 0;
    for (const b of run.bullets) {
      if (b.bubble || b.lob) {
        // **「降らせる」武器は、高さを見せないと降っていることが分からない。**
        //   （ユーザー 2026-09-22「武器と実際のデザイン面の矛盾を解消して」）
        //   前は平らな丸を1つ置いていただけで、地を這っているのと区別が付かなかった。
        //   撃った点 (ox,oy) と着弾点 (landX,landY) から進み具合を出し、
        //   **影は地面に置いたまま、弾だけを持ち上げる。**
        //   影と弾が離れているほど高い ＝ 山なりに飛んでいるのが読める
        let h = 0, k = 0;
        if (b.lob && b.landX !== undefined) {
          const tot = Math.hypot(b.landX - b.ox, b.landY - b.oy) || 1;
          k = Util.clamp(Math.hypot(b.x - b.ox, b.y - b.oy) / tot, 0, 1);
          h = Math.sin(k * Math.PI) * Math.min(46, tot * 0.28);
        }
        if (h > 1) {                       // 地面の影。落ちるほど小さく濃くなる
          ctx.globalAlpha = 0.16 + 0.22 * (1 - Math.sin(k * Math.PI));
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.ellipse(b.x, b.y, b.r * 1.15, b.r * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        const by = b.y - h;
        const br = b.r * (1 + h / 90);     // 高いほど大きく＝こちらに近い
        if (b.rocket) {                    // ミサイル：機体と噴射炎
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / sp, uy = b.vy / sp;
          ctx.save();
          ctx.translate(b.x, by);
          ctx.rotate(Math.atan2(uy, ux));
          ctx.globalCompositeOperation = 'lighter';
          for (let j = 0; j < 3; j++) {    // 噴射炎。後ろへ伸びる3枚
            const L = (16 + j * 9) * (0.75 + Math.random() * 0.5);
            ctx.globalAlpha = 0.5 - j * 0.14;
            ctx.fillStyle = j === 0 ? '#fff3c8' : j === 1 ? '#ffb43c' : '#ff6a2a';
            ctx.beginPath();
            ctx.moveTo(-br * 0.9, -br * (0.55 - j * 0.1));
            ctx.lineTo(-br * 0.9 - L, 0);
            ctx.lineTo(-br * 0.9, br * (0.55 - j * 0.1));
            ctx.closePath(); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.fillStyle = b.color;         // 弾頭。先が尖った紡錘形
          ctx.beginPath();
          ctx.moveTo(br * 2.0, 0);
          ctx.lineTo(-br * 0.8, -br * 0.78);
          ctx.lineTo(-br * 0.4, 0);
          ctx.lineTo(-br * 0.8, br * 0.78);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.restore();
          continue;
        }
        ctx.fillStyle = b.color;
        ctx.globalAlpha = b.bubble ? 0.4 : 0.9;
        ctx.beginPath(); ctx.arc(b.x, by, br, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = b.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(b.x, by, br, 0, Math.PI * 2); ctx.stroke();
        if (b.bubble) {                    // 泡らしく、光の点を1つ
          ctx.globalAlpha = 0.75; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(b.x - br * 0.3, by - br * 0.35, br * 0.22, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        continue;
      }
      if (b.spin) { spins.push(b); continue; }   // 手裏剣はあとでまとめて描く
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const len = b.long ? 22 : Math.min(16, sp * 0.018);
      const w = Math.max(0.5, Math.round(b.r * 3.2) / 2);   // 0.5px 刻みでまとめる
      const key = b.color + '|' + w;
      let g = groups.get(key);
      if (!g) groups.set(key, g = { color: b.color, w, n: 0, seg: [] });
      const i = g.n * 4;
      g.seg[i] = b.x; g.seg[i + 1] = b.y;
      g.seg[i + 2] = b.x - b.vx / sp * len; g.seg[i + 3] = b.y - b.vy / sp * len;
      g.n++;
    }

    // 手裏剣。**4枚刃の星。**十字2本では棒手裏剣にしか見えなかった（ユーザー 2026-09-22）
    //   **1発ずつ save/rotate/fill/stroke すると 851発で 16.5ms**（実測）。
    //   1フレームの予算 16.7ms を使い切るので、
    //   **回転角は全発共通なので cos/sin を1回だけ出し、全部を1本のパスに積んで
    //     塗りと縁を1回ずつ**にした。同じ851発で 0.9ms（実測）
    if (spins.length) {
      const ca = Math.cos(run.time * 22), sa = Math.sin(run.time * 22);
      // 単位星の頂点（刃の先と、刃の間のえぐり）を先に回しておく
      const P = _spinPts;
      for (let j = 0; j < 4; j++) {
        const a = j * Math.PI / 2, b2 = a + Math.PI / 4;
        const ox = Math.cos(a) * 2.0, oy = Math.sin(a) * 2.0;
        const ix = Math.cos(b2) * 0.62, iy = Math.sin(b2) * 0.62;
        P[j * 4] = ox * ca - oy * sa; P[j * 4 + 1] = ox * sa + oy * ca;
        P[j * 4 + 2] = ix * ca - iy * sa; P[j * 4 + 3] = ix * sa + iy * ca;
      }
      // **1本の巨大なパスにすると、塗りの費用が発数に対して跳ね上がる。**（実測）
      //   100発 0.11ms / 200発 0.38 / 400発 1.34 / 851発 5.75。
      //   **120発ずつ区切って塗る**と、発数に比例するところまで戻る
      ctx.fillStyle = spins[0].color;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
      const thin = spins.length > 220;      // 密集時は縁を省く（1発数ピクセルで見えない）
      for (let n = 0; n < spins.length; n += 120) {
        const end = Math.min(spins.length, n + 120);
        ctx.beginPath();
        for (let m = n; m < end; m++) {
          const b = spins[m];
          for (let j = 0; j < 8; j++) {
            const px = b.x + P[j * 2] * b.r, py = b.y + P[j * 2 + 1] * b.r;
            j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.closePath();
        }
        ctx.fill();
        if (!thin) ctx.stroke();
      }
    }

    //          にじみ          本体          白い芯
    const A = [0.20, 0.95, 0.55], W = [2.8, 1.0, 0.34];
    for (let pass = 0; pass < 3; pass++) {
      ctx.globalAlpha = A[pass];
      for (const g of groups.values()) {
        if (!g.n) continue;
        ctx.strokeStyle = pass === 2 ? '#ffffff' : g.color;
        ctx.lineWidth = Math.max(0.6, g.w * W[pass]);
        ctx.beginPath();
        for (let i = 0; i < g.n * 4; i += 4) {
          ctx.moveTo(g.seg[i], g.seg[i + 1]);
          ctx.lineTo(g.seg[i + 2], g.seg[i + 3]);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  },

  effects(ctx, run) {
    for (const f of run.fx) {
      const k = f.t / f.life;
      if (f.type === 'boom') {
        const r = f.r * (0.35 + k * 0.9);
        ctx.globalAlpha = (1 - k) * 0.85;
        ctx.strokeStyle = f.color; ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = (1 - k) * 0.26;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.8, 0, Math.PI * 2); ctx.fill();
      } else if (f.type === 'ring') {
        ctx.globalAlpha = (1 - k) * 0.7;
        ctx.strokeStyle = f.color; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + k * 0.8), 0, Math.PI * 2); ctx.stroke();
      } else if (f.type === 'spark') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, 3 * (1 - k) + 1, 0, Math.PI * 2); ctx.fill();
      } else if (f.type === 'cone') {
        // **火炎放射器は「炎を噴いている」ように描く。**（ユーザー 2026-09-22）
        //   > 「火炎放射機は旧来では扇状に光ってる何かなので、火を噴いてるように
        //   >   見せてください」
        //   前は扇を1枚、放射グラデーションで塗っていただけだった。
        //   **炎の舌を何本か、長さを変えて重ねる。**
        //   根元は白熱、先は赤から煙へ。加算合成で重なりが明るくなる
        this.flameCone(ctx, f, k);
      } else if (f.type === 'slash') {
        // **斬撃を、太さの変わらない円弧1本で描いていた。**（ユーザー 2026-09-22）
        //   刃は真ん中が一番深く入り、両端へ抜けていく。三日月の帯にする
        const a0 = f.a - f.arc, a1 = f.a + f.arc, N = 16;
        const R = f.r * 0.92, W = 9 * (1 - k * 0.6);
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const a = a0 + (a1 - a0) * (i / N);
          const w = W * Math.sin((i / N) * Math.PI);      // 両端が0＝抜ける
          const rr = R + w * 0.5;
          i ? ctx.lineTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr)
            : ctx.moveTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr);
        }
        for (let i = N; i >= 0; i--) {
          const a = a0 + (a1 - a0) * (i / N);
          const w = W * Math.sin((i / N) * Math.PI);
          const rr = R - w * 0.5;
          ctx.lineTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.globalAlpha = (1 - k) * 0.85;
        ctx.fillStyle = f.color; ctx.fill();
        // 刃先の光。**外側の縁だけ**鋭く光らせる
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(f.x, f.y, R + W * 0.5, a0, a1);
        ctx.stroke();
      } else if (f.type === 'tentacle') {
        // **「掴んで引き戻す」武器が、ただの線だった。**（ユーザー 2026-09-22）
        //   根元が太く先が細い、うねった腕として描く。吸盤も付ける
        if (f.e && !f.e.dead) this.tentacle(ctx, f, k);
      } else if (f.type === 'frost') {
        this.frostWave(ctx, f, k);
      } else if (f.type === 'link') {
        if (f.e && !f.e.dead) {
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.strokeStyle = f.color; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(f.x1, f.y1);
          const mx = (f.x1 + f.e.x) / 2 + Util.rand(-10, 10);
          const my = (f.y1 + f.e.y) / 2 + Util.rand(-10, 10);
          ctx.quadraticCurveTo(mx, my, f.e.x, f.e.y);
          ctx.stroke();
        }
      } else if (f.type === 'coin') {
        // 撃破した場所から、画面上のコイン表示のほうへ飛ばす
        const st = this.stage;
        const ex = st.w - 26, ey = 18;
        const q = k * k;                       // 最初ゆっくり、あとで速く
        const x = f.x + (ex - f.x) * q, y = f.y + (ey - f.y) * q - Math.sin(k * Math.PI) * 14;
        ctx.globalAlpha = 1 - k * 0.55;
        ctx.fillStyle = '#ffb43c';
        ctx.beginPath(); ctx.arc(x, y, f.big ? 5 : 2.8, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.type === 'trail') {
        // 貫通の軌跡。**当たった数だけ太くなる**ので、何体抜いたかが見える
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 1.2 + Math.min(f.n, 8) * 0.7;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        ctx.lineCap = 'butt';
      } else if (f.type === 'bolt') {
        ctx.globalAlpha = 1 - k;
        ctx.save();
        ctx.shadowColor = f.color; ctx.shadowBlur = 14;
        ctx.strokeStyle = f.color; ctx.lineWidth = 2.4;
        ctx.beginPath();
        for (let i = 0; i < f.pts.length; i++) {
          const p = f.pts[i];
          const jx = i === 0 ? 0 : Util.rand(-7, 7), jy = i === 0 ? 0 : Util.rand(-7, 7);
          i ? ctx.lineTo(p.x + jx, p.y + jy) : ctx.moveTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  },

  numbers(ctx, run) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const n of run.nums) {
      const k = n.t / n.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = (n.crit ? 'bold 15px ' : '11px ') + 'system-ui,sans-serif';
      ctx.fillStyle = n.crit ? '#ffb43c' : n.color;
      ctx.fillText(n.txt, n.x, n.y);
    }
    ctx.globalAlpha = 1;
  },
};
