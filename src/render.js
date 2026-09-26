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

  // **盤のまわりに六角1つぶんの余白を取る。**（2026-09-25・プレイヤーの感想「画面端が見えないのがUIとして酷い、1マス分大きくすべき」→ ユーザー採用）
  //   前は盤の四角をそのまま画面の端に合わせていたので、縁の六角（盤の外へ半分はみ出して描く）と縁の口が切れていた
  margin() { return Math.sqrt(3) * MapGen.HEX_R; },

  fit() {
    const st = Game.run ? Game.run.stage : Stage.build(Game.perm ? (Game.perm.currentStage || 'ch1') : 'ch1');
    this.stage = st;
    const M = this.margin();

    // **画面に収まらないステージは、縮小せずに一部を切り取る。**
    // 全部映すと1タイルが小さくなりすぎて、密集も配置も見えなくなる
    const REF_W = 15 * TILE, REF_H = 21 * TILE;     // これまでのステージの広さ
    const s = Math.min(this.cssW / (Math.min(st.w, REF_W) + 2 * M), this.cssH / (Math.min(st.h, REF_H) + 2 * M));
    this.scale = s;
    this.viewW = this.cssW / s;
    this.viewH = this.cssH / s;

    if (this.camStage !== st.id) { this.cam.x = -M; this.cam.y = st.h; this.camStage = st.id; }
    this.clampCam();

    this.offX = ((st.w + 2 * M) * s <= this.cssW) ? (this.cssW - st.w * s) / 2 : -this.cam.x * s;
    this.offY = ((st.h + 2 * M) * s <= this.cssH) ? (this.cssH - st.h * s) / 2 : -this.cam.y * s;
  },

  clampCam() {
    const st = this.stage;
    if (!st) return;
    const M = this.margin();
    if (!Number.isFinite(this.cam.x)) this.cam.x = -M;
    if (!Number.isFinite(this.cam.y)) this.cam.y = -M;
    this.cam.x = Math.min(Math.max(-M, st.w + M - this.viewW), Math.max(-M, this.cam.x));
    this.cam.y = Math.min(Math.max(-M, st.h + M - this.viewH), Math.max(-M, this.cam.y));
  },

  // なぞって動かせるか（画面に収まっていれば動かす必要が無い）
  canPan() {
    const st = this.stage, M = this.margin();
    return !!st && (st.w + 2 * M > this.viewW + 1 || st.h + 2 * M > this.viewH + 1);
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

  //   `c,r` はタイル（経路・着弾点むけ）、`hc,hr` は**六角セル**（設置むけ）。
  //   設置がハニカムになったので、同じタップから両方返す（ユーザー 2026-09-23）
  tileAt(clientX, clientY) {
    const p = this.toStage(clientX, clientY);
    const h = MapGen.hexPick(p.x, p.y) || { c: 0, r: 0 };
    return { c: Math.floor(p.x / TILE), r: Math.floor(p.y / TILE), hc: h.c, hr: h.r, x: p.x, y: p.y };
  },

  draw(run) {
    const ctx = this.ctx;
    const k = this.scale * this.dpr;
    const st = (run && run.stage) || this.stage;
    this.stage = st;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bgImage(this.canvas.width, this.canvas.height), 0, 0);

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
    // 減速・加速の説明は DOM の札に移した（UI.renderZoneTip・閉じられる）。2026-09-26
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



    // **進行方向の矢印は出さない。**
    // 通路のどこをどう通るかは、敵が来てから目で見て分かればいい。
    // 盤面いっぱいに散った記号は、敵と弾を読むのを邪魔していた

    this.placeOverlay(ctx, st);
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
    // **六角セル単位で持つ。**（設置がハニカムになったので・2026-09-23）
    //   前はタイルの配列だったが、光らせる単位が六角になったので合わせる
    const out = {};
    for (const h of st.hexCells()) {
      const g = st.hexCenter(h.c, h.r);
      for (const p of path) {
        const dx = p.x - g.x, dy = p.y - g.y;
        if (dx * dx + dy * dy > rng2) continue;
        if (Combat.losBlocked(st, g.x, g.y, p.x, p.y)) continue;
        out[h.c + ',' + h.r] = 1; break;
      }
    }
    cache[def.id] = out;
    return out;
  },

  // 折れ線から描く通路。**tiles() の代わり**
  // 置き場所を選んでいるとき。**盤面を落として、置けるところだけ光らせる。**
  //
  //   **【2026-09-22】生成マップでは一度も動いていなかった。**
  //   `tiles()` は折れ線のある地形だと先頭で `tilesVec()` へ逃げるので、
  //   この下にあったこの処理に届かなかった。**ほぼ全章で「どこに置けるか」が
  //   光らないままだった。** 両方から呼ぶ形にする
  placeOverlay(ctx, st) {
  // 薄く塗るだけでは「どこに置けるか分からない」ままだった
  const picking = (UI.placingType || UI.moving) && Game.canBuild();
  if (picking) {
    ctx.fillStyle = 'rgba(4,8,13,0.5)';
    ctx.fillRect(0, 0, st.cols * TILE, st.rows * TILE);

    // どの武器も1六角（2026-09-23 に武器の大きさ概念を撤去）
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
    // **六角で光らせる。**（ユーザー 2026-09-23）
    //   壁がハニカムなのに、置ける場所だけ四角いタイルで光っていた。
    //   同じ盤の上で作りが2つあると、**どこに置けるのかが読めない**
    const R = MapGen.HEX_R - 3;
    const hexPath = (x, y) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i;
        const px = x + Math.cos(a) * R, py = y + Math.sin(a) * R;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };
    if (def) {
      for (const h of st.hexCells()) {
        if (!Game.canPlaceAt(h.c, h.r, UI.moving || null)) continue;
        const ok = !sees || sees[h.c + ',' + h.r];
        ctx.fillStyle = ok ? 'rgba(255,170,50,' + pulse.toFixed(3) + ')'
                           : 'rgba(120,132,152,0.10)';
        const p = st.hexCenter(h.c, h.r);
        hexPath(p.x, p.y); ctx.fill();
      }
    }
  }

  },

  // 壁（置ける地面）側の六角セル。**通路と同じ格子から、通路ぶんを抜いたもの。**
  //
  //   **ユーザー 2026-09-22**
  //   > 「壁の中がハニカム構造なのにグリッドが残っている、
  //   >   デザイン面の問題を解決してくれると助かります」
  //
  //   通路だけ六角で、壁は四角の格子という状態だった。
  //   盤ぜんぶを同じ六角の格子で作り、**設置の格子は置くときだけ出す**
  //   （設置も六角セル＝この壁の六角そのもの（2026-09-23・stage.hexBuildable）。
  //    置ける六角を光らせるのは置くときだけで、常時は出さない）
  wallHexes(st) {
    if (st._wallHex) return st._wallHex;
    const v = st.vec;
    if (!v) return (st._wallHex = []);
    const used = {};
    for (const h of v.hexes) used[h.c + ',' + h.r] = 1;
    const g = MapGen.hexRange(0, 0, st.w, st.h, 0);
    const R = v.hexR || MapGen.HEX_R;
    const out = [];
    for (let c = g.c0; c <= g.c1; c++) {
      for (let r = g.r0; r <= g.r1; r++) {
        if (used[c + ',' + r]) continue;
        const hx = MapGen.hexAt(c, r);
        // **中心が盤の中にある六角だけ。**丸ごと描くので、これが盤の輪郭（六角のギザギザ）になる
        if (hx.x < 0 || hx.y < 0 || hx.x > st.w || hx.y > st.h) continue;
        out.push(hx);
      }
    }
    return (st._wallHex = out);
  },

  // ---------------------------------------------------------------
  // 盤面（六角）。**動かない部分は下絵として作り置きし、毎フレームは貼るだけ。**
  //   （2026-09-24・ユーザー「デザイン面を大きく変えましょう、まだ質素です」「今のSF（黒×橙）を豪華に」）
  //   下絵：壁（面取りした金属板・継ぎ目・表示灯）／通路の縁の橙のネオン／通路（暗い床と薄い格子）／
  //         仕掛けのマス／出現口（警告の縞）
  //   毎フレーム：通路を出現口からコアへ流れる光・出現口の脈動
  // ---------------------------------------------------------------
  tilesVec(ctx, st) {
    const img = this.boardImage(st);
    ctx.drawImage(img.canvas, img.x0, img.y0, img.w, img.h);
    this.boardAnim(ctx, st);
    // 置き場所を選んでいるときの表示（置ける六角だけ光らせる）
    this.placeOverlay(ctx, st);
  },

  hexPathOn(ctx, x, y, R) {
    ctx.beginPath();
    this.hexAddOn(ctx, x, y, R);
  },
  // 今のパスに六角を足す（まとめて1回で塗るとき）
  hexAddOn(ctx, x, y, R) {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i;
      const px = x + Math.cos(a) * R, py = y + Math.sin(a) * R;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  },

  // 下絵。盤ごと・解像度ごとに1枚
  boardImage(st) {
    const res = Math.min(2.5, Math.max(1, Math.round((this.scale || 1) * (this.dpr || 1) * 2) / 2));
    if (st._board && st._board.res === res) return st._board;
    const v = st.vec;
    const R = v.hexR || MapGen.HEX_R;
    const pad = R + 8;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((st.w + pad * 2) * res);
    cv.height = Math.ceil((st.h + pad * 2) * res);
    const c = cv.getContext('2d');
    c.setTransform(res, 0, 0, res, pad * res, pad * res);
    const hex = (x, y, r) => this.hexPathOn(c, x, y, r === undefined ? R : r);
    // 1. 壁：**隣り合う壁の六角を1つの塊として塗る。**
    //    前は六角1つずつに縁・継ぎ目・表示灯・排気口を描いていて、細かい穴の並びに見えた
    //    （ユーザー 2026-09-24「壁の見た目が細かすぎて重合体恐怖症を刺激します、くっ付いたらどうか」）。
    //    塊の形は、通路の縁の光（2.）で見せる
    const wallPath = () => {
      c.beginPath();
      for (const h of this.wallHexes(st)) this.hexAddOn(c, h.x, h.y, R + 0.8);
    };
    const wg = c.createLinearGradient(0, 0, st.w, st.h);
    wg.addColorStop(0, '#262c3b'); wg.addColorStop(0.55, '#171b26'); wg.addColorStop(1, '#0e1118');
    wallPath(); c.fillStyle = wg; c.fill();
    //    塊の縁の厚み：通路に面したところだけ、内側に明るい帯と暗い筋（塊の中に切り込まない）
    c.save(); wallPath(); c.clip();
    c.strokeStyle = 'rgba(150,170,205,0.10)'; c.lineWidth = 16;
    for (const h of v.hexes) { hex(h.x, h.y); c.stroke(); }
    c.strokeStyle = 'rgba(150,170,205,0.16)'; c.lineWidth = 7;
    for (const h of v.hexes) { hex(h.x, h.y); c.stroke(); }
    c.restore();
    // 2. 通路の縁の橙のネオン：通路の六角を太い光の線で縁取ってから、上を床で塗る
    //    → 通路どうしの境目は床に隠れ、壁との境目だけ光が残る
    c.save();
    c.shadowColor = '#ff7a18'; c.shadowBlur = 14;
    c.strokeStyle = 'rgba(255,122,24,0.95)'; c.lineWidth = 4;
    for (const h of v.hexes) { hex(h.x, h.y); c.stroke(); }
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(255,220,160,0.9)'; c.lineWidth = 1.2;
    for (const h of v.hexes) { hex(h.x, h.y); c.stroke(); }
    c.restore();
    // 3. 通路の床
    //    **ぴったりより少し大きく塗る。**小さいと通路どうしの境目の光が残り、六角1枚ずつが光ってしまう
    for (const h of v.hexes) {
      hex(h.x, h.y, R + 0.8);
      c.fillStyle = h.zone === 1 ? '#0b1a14' : h.zone === 2 ? '#1a1024' : '#07080d';
      c.fill();
    }
    //    薄い格子（床の六角の継ぎ目）
    c.strokeStyle = 'rgba(255,140,60,0.05)'; c.lineWidth = 1;
    for (const h of v.hexes) { hex(h.x, h.y, R * 0.9); c.stroke(); }
    // 4. 仕掛けの印
    for (const h of v.hexes) {
      if (!h.zone) continue;
      c.strokeStyle = h.zone === 1 ? 'rgba(110,230,170,0.6)' : 'rgba(215,140,255,0.6)';
      c.lineWidth = 1.6;
      c.beginPath();
      if (h.zone === 1) { for (let i = -1; i <= 1; i++) { c.moveTo(h.x - R * 0.45, h.y + i * 6); c.lineTo(h.x + R * 0.45, h.y + i * 6); } }
      else { c.moveTo(h.x - R * 0.42, h.y + 5); c.lineTo(h.x, h.y - 6); c.lineTo(h.x + R * 0.42, h.y + 5); }
      c.stroke();
    }
    // 5. 出現口：警告の縞と赤いネオン
    for (const p of this.mouthHexes(st)) {
      c.save(); hex(p.x, p.y, R - 1); c.clip();
      c.fillStyle = '#1a0508'; c.fillRect(p.x - R, p.y - R, R * 2, R * 2);
      c.strokeStyle = 'rgba(255,60,80,0.55)'; c.lineWidth = 5;
      for (let i = -4; i <= 4; i++) { c.beginPath(); c.moveTo(p.x - R + i * 11, p.y + R); c.lineTo(p.x + i * 11 + R, p.y - R); c.stroke(); }
      c.restore();
      c.save(); c.shadowColor = '#ff3050'; c.shadowBlur = 16;
      hex(p.x, p.y); c.strokeStyle = '#ff4a66'; c.lineWidth = 3; c.stroke(); c.restore();
    }
    st._board = { canvas: cv, res, x0: -pad, y0: -pad, w: cv.width / res, h: cv.height / res };
    return st._board;
  },

  // 出現口の六角（穴のタイルの中心を覆う通路の六角）
  mouthHexes(st) {
    if (st._mouthHex) return st._mouthHex;
    const v = st.vec;
    const road = {};
    for (const h of v.hexes) road[h.c + ',' + h.r] = 1;
    const seen = {}, out = [];
    for (const h of v.holes) for (const t of h.tiles) {
      const q = MapGen.hexPick(t.c * TILE + TILE / 2, t.r * TILE + TILE / 2);
      const k = q.c + ',' + q.r;
      if (seen[k] || !road[k]) continue;
      seen[k] = 1; out.push(MapGen.hexAt(q.c, q.r));
    }
    return (st._mouthHex = out);
  },

  // 出現口からコアまでの道筋（口ごとに1本）。流れる光を描くのに使う
  flowLines(st) {
    if (st._flow) return st._flow;
    const out = [];
    // **レーンごとに1本。**（2026-09-25）敵は口ごとのレーンに分かれて進むので、分かれ道も全部描く。
    //   レーンが無い古い形のときは、口ごとの最短の道
    const list = (st.lanes && st.lanes.length) ? st.lanes.map(l => l.route)
      : (st.routes || []).filter((rt, i) => !st.mouths || st.mouths.findIndex(m => m[0] === i) >= 0);
    list.forEach((rt) => {
      const pts = rt.map(ix => ({ x: (ix % st.cols) * TILE + TILE / 2, y: ((ix / st.cols) | 0) * TILE + TILE / 2 }));
      // 折れを間引いて滑らかに（3点ごと）
      const thin = pts.filter((p, j) => j % 3 === 0 || j === pts.length - 1);
      if (thin.length >= 2) out.push(thin);
    });
    return (st._flow = out);
  },

  boardAnim(ctx, st) {
    const t = performance.now() / 1000;
    // 通路を流れる光：出現口からコアへ、橙の点線が進む
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([2, 22]);
    ctx.lineDashOffset = -t * 46;
    ctx.strokeStyle = 'rgba(255,150,60,0.55)'; ctx.lineWidth = 3;
    for (const line of this.flowLines(st)) {
      ctx.beginPath(); ctx.moveTo(line[0].x, line[0].y);
      for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // 出現口の脈動
    const R = (st.vec && st.vec.hexR) || MapGen.HEX_R;
    const pulse = 0.35 + 0.25 * Math.sin(t * 4);
    for (const p of this.mouthHexes(st)) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 1.6);
      g.addColorStop(0, 'rgba(255,60,80,' + pulse.toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,60,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, R * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    // 湧き口のバリア（stages.js の shield）：範囲の六角を薄い水色で重ねる。**中の敵には攻撃が効かない**ことを見せる
    if (st.shield && st.vec && st.vec.hexes) {
      if (!st._shieldHex) {
        st._shieldHex = st.vec.hexes.filter(h => {
          const c = (h.x / TILE) | 0, r = (h.y / TILE) | 0;
          return c >= 0 && r >= 0 && c < st.cols && r < st.rows && st.shield[r * st.cols + c];
        });
      }
      const a = 0.10 + 0.05 * Math.sin(t * 2.2);
      ctx.fillStyle = 'rgba(90,200,255,' + a.toFixed(3) + ')';
      ctx.strokeStyle = 'rgba(130,215,255,' + (a * 3).toFixed(3) + ')';
      ctx.lineWidth = 1.4;
      for (const h of st._shieldHex) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const an = i * Math.PI / 3, rr = R - 2;
          const x = h.x + Math.cos(an) * rr, y = h.y + Math.sin(an) * rr;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  },

  // 画面の背景（盤の外）。中央が少し明るい暗色＋薄い六角の格子＋走査線。画面の大きさごとに1枚
  bgImage(w, h) {
    if (this._bg && this._bg.w === w && this._bg.h === h) return this._bg.cv;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.75);
    g.addColorStop(0, '#141826'); g.addColorStop(0.6, '#090b12'); g.addColorStop(1, '#040508');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const R = 22 * (this.dpr || 1);
    c.strokeStyle = 'rgba(255,138,31,0.045)'; c.lineWidth = 1;
    for (let x = 0, col = 0; x < w + R * 2; x += R * 1.5, col++) {
      for (let y = (col % 2) * R * 0.866; y < h + R * 2; y += R * 1.732) this.hexPathOn(c, x, y, R), c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < h; y += 3 * (this.dpr || 1)) c.fillRect(0, y, w, 1);
    this._bg = { w, h, cv };
    return cv;
  },
  // 炎の舌。**扇1枚ではなく、長さの違う舌を重ねて「噴いている」形にする**
  //   `f.seed` は発射ごとに固定なので、1回の噴射のあいだ形が暴れない
  flameCone(ctx, f, k, glare) {
    const n = 7;
    // **長さと広がりに天井を置く。**（2026-09-22）
    //   射程を伸ばすカードを積むと f.r が跳ね上がり、
    //   扇1枚が盤ぜんぶを覆って加算で白飛びしていた。
    //   いま伸ばす手は消したが、**描く側でも止める**（同じ事故を二度起こさない）
    const R = Math.min(f.r, BAL.fxConeMax || 260);
    const ARC = Math.min(f.arc, BAL.fxConeArcMax || 0.9);
    const fade = (1 - k) * (glare === undefined ? 1 : glare);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      // 舌ごとの向きと長さ。seed と i から決める（毎フレーム同じ）
      const t = (i + 0.5) / n;
      const rnd = ((f.seed + i * 9781) % 997) / 997;
      const a = f.a + (t * 2 - 1) * ARC;
      // 中央ほど長い（噴流の芯）。k が進むと伸びて薄れる＝噴き出して散る
      const core = 1 - Math.abs(t * 2 - 1) * 0.55;
      const len = R * core * (0.62 + rnd * 0.38) * (0.65 + 0.5 * k);
      const halfW = ARC / n * (1.5 + rnd * 0.9);
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
    // **火の海は加算なので、重なると白飛びする。**（2026-09-22・フラッシュ対策）
    //   枚数で薄める。半径にも天井を置く
    const glare = this.glareScale(run);
    const RMAX = BAL.fxFieldMax || 170;
    for (const f of run.fields) {
      const k = f.t / f.dur;
      const fire = f.kind === 'fire';
      const fade = (1 - k * 0.65) * (fire ? glare : 1);
      ctx.globalCompositeOperation = fire ? 'lighter' : 'source-over';
      const lobes = 6;
      for (let i = 0; i < lobes; i++) {
        const base = i * 2.399;                       // 黄金角。種を持たなくても散る
        // 種類ごとの動き
        const spin = fire ? 0 : f.t * 0.5;
        const a = base + spin;
        // 半径に天井。**巨大な場が重なると、加算で盤ごと白くなる**
        const FR = Math.min(f.r, RMAX);
        const rad = FR * (0.34 + 0.30 * ((i * 37) % 11) / 11);
        const dist = FR * (0.18 + 0.36 * ((i * 53) % 7) / 7) * (fire ? 1 : 1 + k * 0.25);
        const wob = fire ? Math.sin(f.t * 9 + i) * FR * 0.10 : 0;
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

  // コアが2つ以上の盤は全部描く（ライフは共有なので、どれも同じ残りで光る）
  core(ctx, run) {
    for (const t of (run.towers || [run.tower])) this.coreOne(ctx, run, t);
  },

  coreOne(ctx, run, t) {
    // **コアの残りは run.lives / run.livesMax。**（2026-09-24・0924s で壊した）
    //   以前は t.hp / t.maxHp（コアには無い値）を読んでいて、結果が NaN になっていた。
    //   古い描き方は NaN を黙って無視していたが、0924s の光のグラデーションは NaN で例外を出し、
    //   **毎フレームそこで描画と進行が止まって、武器も敵も出ない戦闘画面になっていた**
    const hpR = run.livesMax > 0 ? Util.clamp(run.lives / run.livesMax, 0, 1) : 1;
    // **コアは「炉」。**（2026-09-24 デザインの作り直し）回る2重の輪と、脈打つ光の芯。
    //   漏れてHPが減るほど芯の色が赤に寄り、脈が速くなる
    const tt = performance.now() / 1000;
    const danger = 1 - hpR;
    const beat = 1 + 0.08 * Math.sin(tt * (3 + danger * 9));
    ctx.save();
    ctx.translate(t.x, t.y);
    // 光の暈
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, t.r * 3.2);
    halo.addColorStop(0, danger > 0.5 ? 'rgba(255,80,60,0.45)' : 'rgba(255,150,40,0.45)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, t.r * 3.2, 0, Math.PI * 2); ctx.fill();
    // 台座（六角の金属）
    ctx.save(); ctx.shadowColor = '#ff8a1f'; ctx.shadowBlur = 18;
    this.hexPathOn(ctx, 0, 0, t.r * 1.25);
    const pg = ctx.createLinearGradient(-t.r, -t.r, t.r, t.r);
    pg.addColorStop(0, '#3a3020'); pg.addColorStop(1, '#120d05');
    ctx.fillStyle = pg; ctx.fill();
    ctx.strokeStyle = '#ffa32e'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
    // 回る外輪（切れ目のある輪）
    ctx.save(); ctx.rotate(tt * 0.8);
    ctx.strokeStyle = 'rgba(255,190,90,0.85)'; ctx.lineWidth = 2;
    ctx.setLineDash([t.r * 0.5, t.r * 0.28]);
    ctx.beginPath(); ctx.arc(0, 0, t.r * 0.95, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.rotate(-tt * 1.6);
    ctx.strokeStyle = 'rgba(255,240,200,0.7)'; ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.arc(0, 0, t.r * 0.68, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // 脈打つ芯
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, t.r * 0.55 * beat);
    cg.addColorStop(0, '#fffbe8'); cg.addColorStop(0.35, danger > 0.5 ? '#ff6a4a' : '#ffb43c'); cg.addColorStop(1, 'rgba(255,100,20,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, t.r * 0.55 * beat, 0, Math.PI * 2); ctx.fill();
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

      // --- 台座。**六角1つ。**（ユーザー 2026-09-23）
      //   > 「武器を置いたら**謎の四角**が出てきます、おそらくこれは
      //   >   武器の2マス要求とかを要望した時の名残ですね」
      //   そのとおりで、ここは**タイル座標に四角い台座**を描いていた。
      //   セルが六角になったのに四角を描いていたので、盤と合わない四角が浮いていた。
      //   武器の大きさ概念も撤去したので、**六角の座を1つ**描く
      // 台座は作り置きの絵（面取りした金属板＋武器の色のネオンの輪）
      const ped = this.pedestalSprite(c);
      ctx.drawImage(ped.cv, u.x - ped.h, u.y - ped.h, ped.h * 2, ped.h * 2);
      if (sel) {
        ctx.save(); ctx.shadowColor = '#fff'; ctx.shadowBlur = 14;
        this.hexPathOn(ctx, u.x, u.y, MapGen.HEX_R - 3);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.stroke(); ctx.restore();
      }

      // --- 砲塔。作り置きの絵（金属の光沢つき）を回して貼る ---
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.rotate(u.angle);
      // 撃った瞬間に後ろへ下がる。**動いて見えるのはこれだけで足りる**
      if (u.muzzle > 0) ctx.translate(-u.muzzle * 26, 0);
      const tur = this.turretSprite(u.id, c);
      ctx.drawImage(tur.cv, -tur.h, -tur.h, tur.h * 2, tur.h * 2);
      ctx.restore();

      // --- 発砲の火。砲身の先に出す（後退とは無関係の位置） ---
      if (u.muzzle > 0) {
        const bl = this.barrelLen(u);
        ctx.save();
        ctx.translate(u.x, u.y); ctx.rotate(u.angle);
        ctx.globalAlpha = Math.min(1, u.muzzle * 12);
        // 砲口の光の玉（加算）
        ctx.globalCompositeOperation = 'lighter';
        const mg = ctx.createRadialGradient(bl + 3, 0, 0, bl + 3, 0, 12);
        mg.addColorStop(0, 'rgba(255,240,200,0.9)'); mg.addColorStop(0.4, c + 'aa'); mg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(bl + 3, 0, 12, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
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

  // 作り置きの絵の解像度（画面の拡大率に合わせる）
  spriteRes() { return Math.min(3, Math.max(1.5, Math.round((this.scale || 1) * (this.dpr || 1) * 3) / 2)); },

  // **コイン：歯車の縁の硬貨。**（ユーザー 2026-09-24「ギアのようなコイン」）画面の Icons.coin と同じ形
  coinSprite() {
    const res = this.spriteRes();
    this._coin = this._coin || {};
    if (this._coin[res]) return this._coin[res];
    const h = 8;
    const cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(h * 2 * res);
    const c = cv.getContext('2d'); c.setTransform(res, 0, 0, res, h * res, h * res);
    const n = 10, ro = 7.4, ri = 6, w = (Math.PI / n) * 0.42;
    c.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      if (i % 2 === 0) { c.lineTo(Math.cos(a - w) * ro, Math.sin(a - w) * ro); c.lineTo(Math.cos(a + w) * ro, Math.sin(a + w) * ro); }
      else c.lineTo(Math.cos(a) * ri, Math.sin(a) * ri);
    }
    c.closePath(); c.fillStyle = '#8a5a12'; c.fill();
    const g = c.createRadialGradient(-2, -2, 0.5, 0, 0, 6);
    g.addColorStop(0, '#fff2b8'); g.addColorStop(0.5, '#ffc234'); g.addColorStop(1, '#b87412');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 5.6, 0, 7); c.fill();
    c.strokeStyle = '#7a4c0c'; c.lineWidth = 0.8; c.beginPath(); c.arc(0, 0, 3.6, 0, 7); c.stroke();
    c.fillStyle = '#7a4c0c'; c.beginPath(); c.arc(0, 0, 1, 0, 7); c.fill();
    return (this._coin[res] = cv);
  },

  // 武器の台座：面取りした金属の六角＋武器の色のネオンの輪
  pedestalSprite(color) {
    const res = this.spriteRes();
    const key = color + '@' + res;
    this._ped = this._ped || {};
    if (this._ped[key]) return this._ped[key];
    const h = MapGen.HEX_R + 6;
    const cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(h * 2 * res);
    const c = cv.getContext('2d'); c.setTransform(res, 0, 0, res, h * res, h * res);
    const R = MapGen.HEX_R - 3;
    c.save(); c.shadowColor = color; c.shadowBlur = 10;
    this.hexPathOn(c, 0, 0, R); c.fillStyle = '#0b0d13'; c.fill();
    c.strokeStyle = color; c.lineWidth = 2; c.stroke(); c.restore();
    const g = c.createLinearGradient(-R, -R, R, R);
    g.addColorStop(0, '#3a4256'); g.addColorStop(0.5, '#1c2130'); g.addColorStop(1, '#0c0f16');
    this.hexPathOn(c, 0, 0, R - 3.5); c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.2; c.stroke();
    // 中央の窪み（砲塔が乗る）
    const w = c.createRadialGradient(0, 0, 2, 0, 0, R * 0.62);
    w.addColorStop(0, '#05060a'); w.addColorStop(1, 'rgba(5,6,10,0)');
    c.fillStyle = w; c.beginPath(); c.arc(0, 0, R * 0.62, 0, Math.PI * 2); c.fill();
    // 四隅の表示灯（武器の色）
    c.fillStyle = color;
    for (let i = 0; i < 6; i += 2) { const a = Math.PI / 3 * i + Math.PI / 6; c.beginPath(); c.arc(Math.cos(a) * (R - 6.5), Math.sin(a) * (R - 6.5), 1.3, 0, Math.PI * 2); c.fill(); }
    return (this._ped[key] = { cv, h });
  },

  // 砲塔：turret() で描いたものに、金属の光沢（左上が明るく右下が暗い）を重ねる
  turretSprite(id, color) {
    const res = this.spriteRes();
    const key = id + color + '@' + res;
    this._tur = this._tur || {};
    if (this._tur[key]) return this._tur[key];
    const h = 34;
    const cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(h * 2 * res);
    const c = cv.getContext('2d'); c.setTransform(res, 0, 0, res, h * res, h * res);
    c.save(); c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 5; c.shadowOffsetY = 2;
    this.turret(c, { id }, color);
    c.restore();
    c.globalCompositeOperation = 'source-atop';
    const g = c.createLinearGradient(-h * 0.6, -h * 0.6, h * 0.6, h * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.38)'); g.addColorStop(0.45, 'rgba(255,255,255,0.04)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = g; c.fillRect(-h, -h, h * 2, h * 2);
    return (this._tur[key] = { cv, h });
  },

  // 敵：種類・色・大きさごとに1枚。中心が明るいグラデーション・つや・暗い輪郭・進む向きの「目」
  enemySprite(tname, color, r) {
    const res = this.spriteRes();
    const key = tname + color + r + '@' + res;
    this._enm = this._enm || {};
    if (this._enm[key]) return this._enm[key];
    const h = r + 6;
    const cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(h * 2 * res);
    const c = cv.getContext('2d'); c.setTransform(res, 0, 0, res, h * res, h * res);
    const fake = { tname, r };
    const g = c.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.25);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, color); g.addColorStop(1, 'rgba(0,0,0,0.9)');
    c.beginPath(); this.enemyBody(c, fake); c.fillStyle = color; c.fill();
    c.beginPath(); this.enemyBody(c, fake); c.globalAlpha = 0.55; c.fillStyle = g; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = tname === 'tank' ? 2.4 : 1.5; c.stroke();
    // つや
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath(); c.ellipse(-r * 0.25, -r * 0.4, r * 0.35, r * 0.16, -0.5, 0, Math.PI * 2); c.fill();
    // 重い相手は内側にもう1本（硬さを形で）
    if (tname === 'tank') { c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, r * 0.5, 0, Math.PI * 2); c.stroke(); }
    // 目（進む向き＝+x）
    c.fillStyle = '#fff'; c.shadowColor = color; c.shadowBlur = 4;
    c.beginPath(); c.arc(r * 0.45, 0, Math.max(1.4, r * 0.16), 0, Math.PI * 2); c.fill();
    return (this._enm[key] = { cv, h });
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
      // 足元の影（回さない）
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(1.5, e.r * 0.55, e.r * 0.95, e.r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(e.ang || 0);
      // **体は作り置きの絵**（グラデーション・つや・輪郭・目）。数百体でも貼るだけ
      //   輪郭は、押し合って重なったときに何体いるか読めるようにするため（以前からの理由）
      const col = e.hitFlash > 0 ? '#ffffff' : e.chill > 0 ? '#7fd8ff' : e.burnT > 0 ? '#ff9a4a' : e.color;
      const spr = this.enemySprite(e.tname, col, e.r);
      ctx.drawImage(spr.cv, -spr.h, -spr.h, spr.h * 2, spr.h * 2);
      // 湧き口のバリアに弾かれた（combat.js の damage）
      if (e.shieldT > 0) {
        ctx.strokeStyle = 'rgba(130,215,255,' + Math.min(1, e.shieldT * 6).toFixed(2) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 4, 0, Math.PI * 2); ctx.stroke();
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
      // **燃えている敵。**（ユーザー要望5・2026-09-22）
      //   > 「火炎放射器で焼いたら**燃えてるエフェクト**」
      //   前は塗りが橙になるだけだった。**炎の舌を3本、揺らして立てる**
      //   （敵は同時に100体を超えるので、1体あたりは3本まで）
      if (e.burnT > 0) {
        const t = run.time * 9 + e.x * 0.11;
        ctx.globalAlpha = 0.85;
        for (let i = 0; i < 3; i++) {
          const ox = (i - 1) * e.r * 0.55;
          const h = e.r * (1.1 + 0.45 * Math.sin(t + i * 2.1));
          const sw = Math.sin(t * 1.7 + i) * e.r * 0.3;
          ctx.beginPath();
          ctx.moveTo(e.x + ox - e.r * 0.26, e.y - e.r * 0.2);
          ctx.quadraticCurveTo(e.x + ox + sw, e.y - e.r * 0.2 - h * 0.6,
                               e.x + ox + sw * 0.6, e.y - e.r * 0.2 - h);
          ctx.quadraticCurveTo(e.x + ox + sw, e.y - e.r * 0.2 - h * 0.5,
                               e.x + ox + e.r * 0.26, e.y - e.r * 0.2);
          ctx.closePath();
          ctx.fillStyle = i === 1 ? '#ffd27a' : '#ff8a3a';
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // **毒を受けている敵。**（ユーザー要望6・2026-09-22）
      //   泡が立ちのぼる。`poisonT` は雲を出たあとも続く（BAL.poisonDur）
      if (e.poisonT > 0) {
        const t = run.time * 2.2 + e.y * 0.07;
        ctx.fillStyle = 'rgba(198,255,122,0.8)';
        for (let i = 0; i < 3; i++) {
          const q = (t + i * 0.37) % 1;
          const bx = e.x + Math.sin((t + i) * 3.1) * e.r * 0.6;
          const by = e.y - q * (e.r * 2.2);
          ctx.globalAlpha = (1 - q) * 0.8;
          ctx.beginPath(); ctx.arc(bx, by, 1.6 + (1 - q) * 1.6, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // **加速・減速しているのが見える。**（ユーザー要望4・2026-09-22）
      //   > 「加速する時に敵が加速してそうな軽いエフェクト、減速も同様に」
      //   前はマスの色が変わるだけで、**敵の側には何も出ていなかった**。
      //   加速＝進む向きの後ろへ速度線、減速＝進む向きの前に止める線
      if (e.zfx) {
        const a = e.ang || 0;
        ctx.lineWidth = 1.4;
        if (e.zfx > 0) {
          ctx.strokeStyle = 'rgba(215,140,255,0.8)';
          ctx.beginPath();
          for (let i = -1; i <= 1; i++) {
            const ox = -Math.sin(a) * i * e.r * 0.6, oy = Math.cos(a) * i * e.r * 0.6;
            ctx.moveTo(e.x + ox - Math.cos(a) * e.r * 1.0, e.y + oy - Math.sin(a) * e.r * 1.0);
            ctx.lineTo(e.x + ox - Math.cos(a) * e.r * 2.1, e.y + oy - Math.sin(a) * e.r * 2.1);
          }
          ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(110,230,170,0.85)';
          ctx.beginPath();
          for (let i = -1; i <= 1; i++) {
            const ox = -Math.sin(a) * i * e.r * 0.5, oy = Math.cos(a) * i * e.r * 0.5;
            ctx.moveTo(e.x + ox + Math.cos(a) * e.r * 1.0, e.y + oy + Math.sin(a) * e.r * 1.0);
            ctx.lineTo(e.x + ox + Math.cos(a) * e.r * 1.5, e.y + oy + Math.sin(a) * e.r * 1.5);
          }
          ctx.stroke();
        }
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
      // **太い弾を、太い棒で描かない。**（2026-09-22）
      //   スナイパーの当たり半径を 4 → 20 にしたので、素直に太さへ回すと
      //   32px の団子が飛ぶ。狙撃の弾には見えない。
      //   **長さへ回して、当たり幅は薄い帯で示す**（レールガンの光条）。
      //   帯を出すのは、当たり判定を絵で嘘にしないため
      if (b.long && b.r > 6) {
        const ux = b.vx / sp, uy = b.vy / sp;
        const L = 26 + b.r * 2.6;
        const x2 = b.x - ux * L, y2 = b.y - uy * L;
        ctx.globalAlpha = 0.13;                    // 当たる幅ぶんの帯
        ctx.strokeStyle = b.color; ctx.lineWidth = b.r * 2;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.globalAlpha = 0.95;                    // 光条
        ctx.lineWidth = 3.2;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.globalAlpha = 0.85;                    // 白い芯
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
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

  // **加算合成が重なると画面が白飛びする。**（ユーザー報告 2026-09-22・写真あり）
  //   > 「まともにゲームが出来ないフラッシュになります」
  //
  //   範囲を広げるカード／スキルを消して原因そのものは断ったが、
  //   **点滅は目に障る事故なので、描画側にも歯止めを置く。**
  //   1フレームに出ている加算のエフェクトの数で、明るさを割る。
  //   3枚までは等倍、それ以上は枚数の平方根で薄める（重ねても総量が増えない）
  glareScale(run) {
    let n = 0;
    for (const f of run.fx) if (f.type === 'cone') n++;
    for (const f of run.fields) if (f.kind === 'fire') n++;
    return n <= 3 ? 1 : Math.sqrt(3 / n);
  },

  effects(ctx, run) {
    const glare = this.glareScale(run);
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
        this.flameCone(ctx, f, k, glare);
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
      } else if (f.type === 'splat') {
        // **血飛沫。**（ユーザー要望1・2026-09-22）
        //   > 「撃破すると**侵攻方向と逆に**、血飛沫に見えるようなものが弾け飛ぶ、
        //   >   赤でなくていい、**敵の色遵守**で」
        //   進んでいた向きの逆へ、扇の中に散らす。**飛ぶほど細くなって落ちる**
        //   （まっすぐ伸びるだけだと「線が出た」にしか見えない）
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.fillStyle = f.color;
        const n = f.n || 6;
        for (let i = 0; i < n; i++) {
          // `i` だけで散らす＝毎フレーム同じ飛び方になる（乱数を持たない）
          const t = (i / n) * 2 - 1;
          const a = f.a + t * 0.75 + Math.sin(i * 12.9898) * 0.12;
          const sp = f.sp * (0.45 + ((i * 7919) % 100) / 180);
          const d = sp * (k * (1.6 - k * 0.6));            // 最初速く、だんだん止まる
          const x = f.x + Math.cos(a) * d;
          const y = f.y + Math.sin(a) * d + k * k * 10;    // 少し落ちる
          const r = (2.6 - k * 1.8) * (0.7 + ((i * 104729) % 60) / 100);
          if (r <= 0.2) continue;
          ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (f.type === 'coin') {
        // **弾け出てから、キラキラと右上へ集まる。**（ユーザー要望2・3・2026-09-22）
        //   > 「撃破した時にコインが弾け出てくるエフェクト」
        //   > 「それが**キラキラ**と右上に集まっていくエフェクト」
        //   前は撃破地点からいきなり吸われていた（弾け出る段が無く、単色の丸だった）。
        //   **前半は弾け出て、後半で吸われる。** 境目は `POP`
        const st = this.stage;
        const ex = st.w - 26, ey = 18;
        const POP = 0.32;
        const sd = (f.seed || 0);
        const a0 = (sd % 31) / 31 * Math.PI * 2;
        const pop = Math.min(1, k / POP);
        // 弾け出る：斜め上へ跳ねて、重力で落ちる
        const px = f.x + Math.cos(a0) * 16 * pop;
        const py = f.y - 20 * pop + 26 * pop * pop;
        let x = px, y = py;
        if (k > POP) {
          const q = (k - POP) / (1 - POP);
          const e2 = q * q;                    // 最初ゆっくり、あとで速く
          x = px + (ex - px) * e2;
          y = py + (ey - py) * e2 - Math.sin(q * Math.PI) * 14;
        }
        const r = f.big ? 5 : 3.2;
        ctx.globalAlpha = 1 - k * 0.45;
        // 歯車のコインを、回しながら飛ばす
        const cs = r * 2.4;
        ctx.save(); ctx.translate(x, y); ctx.rotate(k * 9 + sd);
        ctx.drawImage(this.coinSprite(), -cs / 2, -cs / 2, cs, cs);
        ctx.restore();
        // **キラキラ。** 十字の光を、回しながら明滅させる
        const tw = 0.5 + 0.5 * Math.sin(k * 26 + sd);
        ctx.globalAlpha = (1 - k * 0.45) * tw;
        ctx.strokeStyle = '#fff1c2'; ctx.lineWidth = 1.2;
        const s = r * (1.5 + tw);
        const rot = k * 5 + sd;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(rot) * s, y - Math.sin(rot) * s);
        ctx.lineTo(x + Math.cos(rot) * s, y + Math.sin(rot) * s);
        ctx.moveTo(x - Math.cos(rot + 1.5708) * s, y - Math.sin(rot + 1.5708) * s);
        ctx.lineTo(x + Math.cos(rot + 1.5708) * s, y + Math.sin(rot + 1.5708) * s);
        ctx.stroke();
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

  // ダメージの数字。**画面の上での大きさを一定にする**（2026-09-26・オタクくんのテストプレイ）
  //   前は盤の座標で 11px（会心 15px）だった。スマホでは盤全体を約0.42倍に縮めて映すので、画面では約4.6pxになり読めなかった。
  //   盤の縮み（this.scale）で割って、画面で 12px（会心 16px）にする。重なっても読めるように暗い縁を付ける
  numbers(ctx, run) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const s = Math.max(0.2, this.scale || 1);
    const fn = Math.round(12 / s), fc = Math.round(16 / s);
    ctx.lineJoin = 'round';
    for (const n of run.nums) {
      const k = n.t / n.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = (n.crit ? 'bold ' + fc + 'px ' : '600 ' + fn + 'px ') + 'system-ui,sans-serif';
      ctx.lineWidth = 3 / s;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(n.txt, n.x, n.y);
      ctx.fillStyle = n.crit ? '#ffb43c' : n.color;
      ctx.fillText(n.txt, n.x, n.y);
    }
    ctx.globalAlpha = 1;
  },
};
