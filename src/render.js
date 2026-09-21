// ---------------------------------------------------------------
// render.js : Canvas描画。タイルマップ＋敵＋弾＋場＋演出
// ---------------------------------------------------------------
'use strict';

// 線の弾のまとめ先。**毎フレーム作り直さない**（1フレームに何百回も通る）
const _bulGroups = new Map();

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

      const occupied = {};
      if (Game.run) for (const u of Game.run.units) {
        if (u === UI.moving) continue;          // 動かす本人の足元は空きとして扱う
        occupied[u.c + ',' + u.r] = 1;
      }
      const pulse = 0.16 + 0.08 * Math.sin((Game.run ? Game.run.time : 0) * 5);
      for (let r = 0; r < st.rows; r++) {
        for (let c = 0; c < st.cols; c++) {
          if (!st.buildable(c, r) || occupied[c + ',' + r]) continue;
          ctx.fillStyle = 'rgba(255,170,50,' + pulse.toFixed(3) + ')';
          ctx.fillRect(c * TILE + 2, r * TILE + 2, TILE - 4, TILE - 4);
        }
      }
    }
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
    // 本体：境目に線を残すと、六角の集まりとして読める
    ctx.fillStyle = '#05060a';
    ctx.strokeStyle = '#151a26';
    ctx.lineWidth = 2;
    for (const h of v.hexes) { hexPath(h.x, h.y); ctx.fill(); ctx.stroke(); }
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

  fields(ctx, run) {
    for (const f of run.fields) {
      const k = f.t / f.dur;
      ctx.globalAlpha = 0.20 * (1 - k * 0.5) + 0.06;
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5 * (1 - k);
      ctx.strokeStyle = f.color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
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

      // --- 台座。回らない。機械が据え付けてある、という土台 ---
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.shadowColor = c; ctx.shadowBlur = sel ? 16 : 7;
      ctx.fillStyle = '#0c0e13';
      ctx.strokeStyle = sel ? '#ffffff' : c;
      ctx.lineWidth = sel ? 2.4 : 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {                  // 六角の座
        const a = Math.PI / 6 + i * Math.PI / 3;
        const x = Math.cos(a) * 12, y = Math.sin(a) * 12;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();

      // --- 砲塔 ---
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.rotate(u.angle);
      // 撃った瞬間に後ろへ下がる。**動いて見えるのはこれだけで足りる**
      if (u.muzzle > 0) ctx.translate(-u.muzzle * 26, 0);
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
    for (const g of groups.values()) g.n = 0;
    for (const b of run.bullets) {
      if (b.bubble || b.lob) {
        ctx.fillStyle = b.color;
        ctx.globalAlpha = b.bubble ? 0.4 : 0.9;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = b.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
        continue;
      }
      if (b.spin) {    // 手裏剣
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(run.time * 22);
        ctx.strokeStyle = b.color; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-b.r, 0); ctx.lineTo(b.r, 0);
        ctx.moveTo(0, -b.r); ctx.lineTo(0, b.r);
        ctx.stroke();
        ctx.restore();
        continue;
      }
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
        ctx.globalAlpha = (1 - k) * 0.5;
        const g = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.r);
        g.addColorStop(0, '#fff3c0'); g.addColorStop(0.45, f.color); g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(f.x, f.y);
        ctx.arc(f.x, f.y, f.r, f.a - f.arc, f.a + f.arc);
        ctx.closePath(); ctx.fill();
      } else if (f.type === 'slash') {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = f.color; ctx.lineWidth = 3.5 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * 0.92, f.a - f.arc, f.a + f.arc);
        ctx.stroke();
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
