// ---------------------------------------------------------------
// render.js : Canvas描画。タイルマップ＋敵＋弾＋場＋演出
// ---------------------------------------------------------------
'use strict';

// 線の弾のまとめ先。**毎フレーム作り直さない**（1フレームに何百回も通る）
const _bulGroups = new Map();
// 毒・閉じ込めの印をまとめて塗るための置き場（Render.enemies。毎フレーム使い回して確保を避ける）
const _poisonBuf = [], _stunBuf = [], _fieldBuf = [];
const _armX = new Array(13), _armY = new Array(13), _armW = new Array(13);   // 触手の腕の1本ぶんの作業用（Render.tentArm）

const _spins = [];        // 手裏剣のまとめ描き用（毎フレーム作り直さない）
const _spinPts = new Float32Array(16);

// 武器のドットの絵（企画書 §14「プログラムに、ゲーム的な兵器の皮を貼ったもの」・2026-09-28）
//   敵と同じ描き方（暗い縁取り・色の光・光沢）でそろえる。**+x が砲身の向き**（狙う向きへ回す）。
//   '#' 武器の色（光る）／ 'd' 暗い金属 ／ 'g' 灰色の金属 ／ 'w' 白い光 ／ '.' 空き。
//   p は回す中心（列, 行）。1ドット＝2.4px。砲身の先は barrelLen（発砲の火の位置）にだいたい合わせてある
const WEAPON_PIX = {
  gatling: { p: [5, 4], r: [
    '..ddddd........',
    '.dggggdd#######',
    '.dgggggd.......',
    'ddggwggdd######',
    'ddgwwwgdd######',
    'ddggwggdd######',
    '.dgggggd.......',
    '.dggggdd#######',
    '..ddddd........'] },
  sniper: { p: [5, 3], r: [
    '....dddd..........',
    '.dddd##dd.........',
    'dgggggdddd........',
    'dggwgggg##########',
    'dgggggdddd........',
    '.ddddddd..........',
    '...d...d..........'] },
  missile: { p: [5, 5], r: [
    '.dddddddddd..',
    'dgggggggggd..',
    'dg###g###gdd.',
    'dg#w#g#w#gdd.',
    'dg###g###gdd.',
    'dgggggggggddd',
    'dg###g###gdd.',
    'dg#w#g#w#gdd.',
    'dg###g###gdd.',
    'dgggggggggd..',
    '.dddddddddd..'] },
  tesla: { p: [5, 5], r: [
    '...ddddd....',
    '..d#####d...',
    '.d#ddddd#d..',
    'd#dgggggd#d.',
    'd#dgwwwgd#d.',
    'd#dgwwwgd###',
    'd#dgwwwgd#d.',
    'd#dgggggd#d.',
    '.d#ddddd#d..',
    '..d#####d...',
    '...ddddd....'] },
  flame: { p: [3, 4], r: [
    '.ddddd.......',
    'dgggggd......',
    'dg###gdddd...',
    'dg###gd####d.',
    'dgggggd#####d',
    'dg###gd####d.',
    'dg###gdddd...',
    'dgggggd......',
    '.ddddd.......'] },
  gas: { p: [4, 4], r: [
    '..ddddd......',
    '.d#####d.....',
    'd##www##dddd.',
    'd#wwwww#d###d',
    'd#wwwww#d####',
    'd#wwwww#d###d',
    'd##www##dddd.',
    '.d#####d.....',
    '..ddddd......'] },
  cryo: { p: [5, 5], r: [
    '.....#.....',
    '.#...#...#.',
    '..#.ddd.#..',
    '...dgggd...',
    '..dgwwwgd..',
    '####www####',
    '..dgwwwgd..',
    '...dgggd...',
    '..#.ddd.#..',
    '.#...#...#.',
    '.....#.....'] },
  katana: { p: [3, 2], r: [
    '..g...........',
    'ddgw##########',
    'dddgw#########w',
    'ddgw##########',
    '..g...........'] },
  shuriken: { p: [4, 4], r: [
    '....#....',
    '....#....',
    '...d#d...',
    '..dwww#..',
    '####w####',
    '..#www...',
    '...d#d...',
    '....#....',
    '....#....'] },
  tentacle: { p: [3, 4], r: [
    '..ddd......',
    '.d###d.#...',
    'd##w##d.#..',
    'd#www#d##.#',
    'd#www#d####',
    'd#www#d##.#',
    'd##w##d.#..',
    '.d###d.#...',
    '..ddd......'] },
  bubble: { p: [4, 4], r: [
    '..ddddd..',
    '.d#####d.',
    'd##www##d',
    'd#wwwww#d',
    'd#wwwww##',
    'd#wwwww#d',
    'd##www##d',
    '.d#####d.',
    '..ddddd..'] },
  mortar: { p: [5, 5], r: [
    '...ddddd....',
    '..dgggggd...',
    '.dg#####gd..',
    'dg##ddd##gd.',
    'dg#ddddd#gd.',
    'dg#ddwdd#gdd',
    'dg#ddddd#gd.',
    'dg##ddd##gd.',
    '.dg#####gd..',
    '..dgggggd...',
    '...ddddd....'] },
};

// 敵のドットの絵（企画書 §13「どこか昔のゲームに存在していそうなキャラクター」・2026-09-28）
//   '#' 体（その種類の色）／ 'o' 目（白く光る）／ '.' 空き。種類ごとに2コマ（足踏み）
//   **形で性質が読めるように**：速い＝小さく細い／硬い＝大きく横に広い／盾＝前に板／群れ＝ごく小さい虫／
//   再生＝体に十字／分裂＝真ん中に割れ目／入れ子＝卵の中に卵／ボス＝昔の画面の上を横切った円盤
const ENEMY_PIX = {
  grunt: [[
    '..#.....#..',
    '...#...#...',
    '..#######..',
    '.##o###o##.',
    '###########',
    '#.#######.#',
    '#.#.....#.#',
    '...##.##...'], [
    '..#.....#..',
    '#..#...#..#',
    '#.#######.#',
    '###o###o###',
    '###########',
    '.#########.',
    '..#.....#..',
    '.#.......#.']],
  swift: [[
    '...##...',
    '..####..',
    '.######.',
    '##o##o##',
    '########',
    '..#..#..',
    '.#.##.#.',
    '#.#..#.#'], [
    '...##...',
    '..####..',
    '.######.',
    '##o##o##',
    '########',
    '.#.##.#.',
    '#......#',
    '.#....#.']],
  tank: [[
    '....####....',
    '.##########.',
    '############',
    '###oo##oo###',
    '############',
    '...##..##...',
    '..##.##.##..',
    '##........##'], [
    '....####....',
    '.##########.',
    '############',
    '###oo##oo###',
    '############',
    '..###..###..',
    '.##..##..##.',
    '..##....##..']],
  shield: [[
    '..######.##',
    '.#######.##',
    '##o###o#.##',
    '########.##',
    '.#######.##',
    '..######.##',
    '.##..##..##',
    '.#....#....'], [
    '..######.##',
    '.#######.##',
    '##o###o#.##',
    '########.##',
    '.#######.##',
    '..######.##',
    '..##..##.##',
    '...#..#....']],
  swarm: [[
    '.#.#.',
    '#####',
    '#o#o#',
    '#####',
    '.#.#.'], [
    '#...#',
    '#####',
    '#o#o#',
    '#####',
    '#...#']],
  regen: [[
    '...###...',
    '.#######.',
    '###o#o###',
    '#...#...#',
    '##.....##',
    '#...#...#',
    '#########',
    '.#.#.#.#.'], [
    '...###...',
    '.#######.',
    '###o#o###',
    '#...#...#',
    '##.....##',
    '#...#...#',
    '#########',
    '#.#.#.#.#']],
  split: [[
    '....#....',
    '...###...',
    '..##.##..',
    '.#o#.#o#.',
    '####.####',
    '.###.###.',
    '..##.##..',
    '...###...',
    '....#....'], [
    '....#....',
    '...#.#...',
    '..##.##..',
    '.#o#.#o#.',
    '###...###',
    '.###.###.',
    '..##.##..',
    '...#.#...',
    '....#....']],
  nest: [[
    '...####...',
    '..######..',
    '.###..###.',
    '.##.oo.##.',
    '##.o..o.##',
    '##.o..o.##',
    '.##.oo.##.',
    '.###..###.',
    '..######..',
    '...####...'], [
    '...####...',
    '..######..',
    '.###..###.',
    '.##.oo.##.',
    '##.o..o.##',
    '##.o..o.##',
    '.##.oo.##.',
    '.###..###.',
    '..######..',
    '....##....']],
  boss: [[
    '......####......',
    '...##########...',
    '..############..',
    '.##o##o##o##o##.',
    '################',
    '..###..##..###..',
    '...#........#...'], [
    '......####......',
    '...##########...',
    '..############..',
    '.#o##o##o##o##o.',
    '################',
    '..###..##..###..',
    '..#..........#..']],
};

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

    // 上下の余白は、盤の上に重なる札の高さぶんまで広げる（insets）。**左右は六角1つぶんのまま**
    const I = this.insets(s);
    this.insT = I.t / s; this.insB = I.b / s;
    if (this.camStage !== st.id) { this.cam.x = -M; this.cam.y = st.h; this.camStage = st.id; }
    this.clampCam();

    this.offX = ((st.w + 2 * M) * s <= this.cssW) ? (this.cssW - st.w * s) / 2 : -this.cam.x * s;
    // 収まる盤は真ん中に置く。ただし上下は札の下・札の上に収める（余白が足りるときだけ動く）
    this.offY = ((st.h + this.insT + this.insB) * s <= this.cssH)
      ? Util.clamp((this.cssH - st.h * s) / 2, I.t, this.cssH - I.b - st.h * s)
      : -this.cam.y * s;
  },

  // **盤の上に重なって、押せなくしている札**の高さ。左上の「火力」・残りウェーブ・ライフの帯と、左下の減速・加速の説明。
  //   （2026-09-29・第20〜30章の広い盤で、盤の端の六角がこの札の下になり、置く操作そのものができなかった。
  //    札は押せる（火力の内訳・説明を閉じる）ので、札の側を通り抜けにせず、盤を札の外まで動かせるようにした）
  //   返すのは画面px。**札が無ければ六角1つぶん（margin）のまま**。
  insets(s) {
    const M = this.margin() * s;
    let t = M, b = M;
    if (!this.canvas) return { t, b };
    const cr = this.canvas.getBoundingClientRect();
    const hud = document.querySelector('.bhud');
    if (hud && hud.offsetHeight) t = Math.max(t, hud.getBoundingClientRect().bottom - cr.top + 4);
    const zt = typeof UI !== 'undefined' && UI.el && UI.el.zoneTip;
    if (zt && zt.classList.contains('on') && zt.offsetHeight) b = Math.max(b, cr.bottom - zt.getBoundingClientRect().top + 4);
    return { t, b };
  },
  insT: 0, insB: 0,

  clampCam() {
    const st = this.stage;
    if (!st) return;
    const M = this.margin(), mt = Math.max(M, this.insT || 0), mb = Math.max(M, this.insB || 0);
    if (!Number.isFinite(this.cam.x)) this.cam.x = -M;
    if (!Number.isFinite(this.cam.y)) this.cam.y = -mt;
    this.cam.x = Math.min(Math.max(-M, st.w + M - this.viewW), Math.max(-M, this.cam.x));
    this.cam.y = Math.min(Math.max(-mt, st.h + mb - this.viewH), Math.max(-mt, this.cam.y));
  },

  // なぞって動かせるか（画面に収まっていれば動かす必要が無い）
  canPan() {
    const st = this.stage, M = this.margin();
    return !!st && (st.w + 2 * M > this.viewW + 1 || st.h + Math.max(M, this.insT || 0) + Math.max(M, this.insB || 0) > this.viewH + 1);
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
    this.adjLines(ctx, run);
    this.effects(ctx, run);
    this.numbers(ctx, run);
    this.dirRingDraw(ctx);

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
    // 置く前の影に「+30%」（隣り合う異種で強め合う・Game.adjTypesAt）。隣に違う種類があるところだけ出す
    const adjUnits = Game.run ? Game.run.units : [];
    const adjFs = Math.max(13, 12 / (this.scale || 1));
    if (def) {
      for (const h of st.hexCells()) {
        if (!Game.canPlaceAt(h.c, h.r, UI.moving || null)) continue;
        const ok = !sees || sees[h.c + ',' + h.r];
        ctx.fillStyle = ok ? 'rgba(255,170,50,' + pulse.toFixed(3) + ')'
                           : 'rgba(120,132,152,0.10)';
        const p = st.hexCenter(h.c, h.r);
        hexPath(p.x, p.y); ctx.fill();
        if (ok) {
          const n = Math.min(BAL.adjMax, Game.adjTypesAt(h.c, h.r, def.id, adjUnits, UI.moving || null).length);
          if (n > 0) {
            const t = '+' + Math.round(BAL.adjBonus * n * 100) + '%';
            ctx.font = '900 ' + adjFs + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.lineWidth = 3 / (this.scale || 1) + 1; ctx.strokeStyle = 'rgba(4,8,13,0.95)'; ctx.strokeText(t, p.x, p.y);
            ctx.fillStyle = '#ffe38a'; ctx.fillText(t, p.x, p.y);
          }
        }
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
  // 壁の中の「露出」（2026-09-28・企画書 §9・§10・§31 ／ ユーザー「§3 の表のとおり」）
  //   **壊れていくのではなく、最初から中にあったものが、深く進むほど見えてくる。**
  //     段1 第1〜4章   ハニカムの壁だけ
  //     段2 第5〜10章  継ぎ目から配線と表示灯がのぞく
  //     段3 第11〜19章 基板の配線が壁の中を通る
  //     段4 第20〜30章 基板がはっきり見え、ハニカムは上に被さった装甲板に見える
  //     段5 第31章〜   配線の上をデータが流れ、壁の中にシステムの文字が見える
  //   **下絵（boardImage）に1回だけ焼く**ので毎フレームの重さは変わらない。動くのは段5のデータの光だけ（boardAnim）。
  //   六角1つずつに縁を描くと細かい穴の並びに戻る（2026-09-24「重合体恐怖症を刺激します」）ので、どの段もまばらに置く。
  //   盤は全員同じなので、見えるものも章の番号で決めて全員同じにする（乱数は章の番号から）
  // ---------------------------------------------------------------
  exposeTier(st) {
    const n = parseInt(String(st.id || '').replace(/\D/g, ''), 10) || 1;
    return n <= 4 ? 1 : n <= 10 ? 2 : n <= 19 ? 3 : n <= 30 ? 4 : n <= 45 ? 5 : 6;
  },

  exposeLayer(c, st, R) {
    const tier = this.exposeTier(st);
    st._traces = [];
    if (tier <= 1) return;
    const n = parseInt(String(st.id || '').replace(/\D/g, ''), 10) || 1;
    let s = (n * 2654435761) >>> 0;
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const walls = this.wallHexes(st);
    const LED = ['#ff4a4a', '#ffb43c', '#ff8a1f', '#fff1d6'];
    const led = (x, y, col, r) => {
      c.save(); c.shadowColor = col; c.shadowBlur = 6;
      c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.restore();
    };
    // 段4から：下地が基板の色に寄る（黒に近い暗い緑。企画書 §18 の黒地を崩さない濃さ）
    if (tier >= 4) {
      c.fillStyle = tier >= 5 ? 'rgba(16,26,22,0.55)' : 'rgba(18,28,24,0.45)';
      c.fillRect(-R * 2, -R * 2, st.w + R * 4, st.h + R * 4);
    }
    // 段2：継ぎ目のすき間から、配線と表示灯がのぞく
    if (tier === 2) {
      for (const h of walls) {
        const k = rnd();
        if (k < 0.09) {
          const a = Math.floor(rnd() * 3) * Math.PI / 3 + Math.PI / 6, len = R * (0.5 + rnd() * 0.4);
          const dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;
          c.strokeStyle = 'rgba(0,0,0,0.85)'; c.lineWidth = 8; c.lineCap = 'round';
          c.beginPath(); c.moveTo(h.x - dx, h.y - dy); c.lineTo(h.x + dx, h.y + dy); c.stroke();
          c.strokeStyle = rnd() < 0.5 ? 'rgba(255,138,31,0.6)' : 'rgba(255,90,70,0.5)'; c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(h.x - dx * 0.8, h.y - dy * 0.8); c.lineTo(h.x + dx * 0.8, h.y + dy * 0.8); c.stroke();
          led(h.x + dx, h.y + dy, LED[(rnd() * LED.length) | 0], 2.4);
        } else if (k < 0.14) {
          led(h.x + (rnd() - 0.5) * R, h.y + (rnd() - 0.5) * R, LED[(rnd() * LED.length) | 0], 2.2);
        }
      }
      return;
    }
    // 段3〜：基板の配線（縦・横・斜め45度で折れる。端は丸い穴＝ビア）
    const pTrace = tier === 3 ? 0.16 : 0.3;
    const alpha = tier === 3 ? 0.2 : 0.34;
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const h of walls) {
      if (rnd() >= pTrace) continue;
      let dir = (rnd() * 8) | 0;
      const pts = [{ x: h.x, y: h.y }];
      const segs = 2 + ((rnd() * 3) | 0);
      for (let i = 0; i < segs; i++) {
        const p = pts[pts.length - 1];
        const len = R * (0.5 + rnd() * 0.9) * (dir % 2 ? 1.2 : 1);
        const a = dir * Math.PI / 4;
        pts.push({ x: p.x + Math.cos(a) * len, y: p.y + Math.sin(a) * len });
        dir = (dir + (rnd() < 0.5 ? 1 : 7)) % 8;       // 45度ずつ折れる
      }
      const wide = rnd() < 0.25;
      c.strokeStyle = 'rgba(255,140,50,' + (alpha * 0.45).toFixed(3) + ')'; c.lineWidth = wide ? 5 : 3.4;
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); c.stroke();
      c.strokeStyle = 'rgba(255,170,90,' + alpha.toFixed(3) + ')'; c.lineWidth = wide ? 2 : 1.2;
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); c.stroke();
      for (const e of [pts[0], pts[pts.length - 1]]) {
        c.strokeStyle = 'rgba(255,180,100,' + (alpha * 1.3).toFixed(3) + ')'; c.lineWidth = 1.2;
        c.beginPath(); c.arc(e.x, e.y, 2.4, 0, Math.PI * 2); c.stroke();
      }
      st._traces.push(pts);
    }
    // 段3〜：表示灯
    for (const h of walls) if (rnd() < (tier === 3 ? 0.05 : 0.08)) led(h.x + (rnd() - 0.5) * R, h.y + (rnd() - 0.5) * R, LED[(rnd() * LED.length) | 0], 2.3);
    if (tier < 4) return;
    // 段4〜：部品（黒い本体に足が並ぶ）と、上に被さった装甲板の継ぎ目（まばらに・2辺だけ）
    c.font = '700 8px "Share Tech Mono",ui-monospace,Consolas,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const h of walls) {
      const k = rnd();
      if (k < 0.045) {
        const vert = rnd() < 0.5, w = R * (0.7 + rnd() * 0.4), hh = R * 0.42;
        const W = vert ? hh : w, H = vert ? w : hh;
        c.fillStyle = 'rgba(8,9,12,0.92)'; c.fillRect(h.x - W / 2, h.y - H / 2, W, H);
        c.strokeStyle = 'rgba(255,170,90,0.28)'; c.lineWidth = 1; c.strokeRect(h.x - W / 2, h.y - H / 2, W, H);
        c.strokeStyle = 'rgba(210,200,190,0.35)'; c.lineWidth = 1.1;
        const pins = 4 + ((rnd() * 3) | 0);
        for (let i = 0; i < pins; i++) {
          const f = (i + 0.5) / pins;
          c.beginPath();
          if (vert) { const y = h.y - H / 2 + f * H; c.moveTo(h.x - W / 2 - 3, y); c.lineTo(h.x - W / 2, y); c.moveTo(h.x + W / 2, y); c.lineTo(h.x + W / 2 + 3, y); }
          else { const x = h.x - W / 2 + f * W; c.moveTo(x, h.y - H / 2 - 3); c.lineTo(x, h.y - H / 2); c.moveTo(x, h.y + H / 2); c.lineTo(x, h.y + H / 2 + 3); }
          c.stroke();
        }
        if (!vert) { c.fillStyle = 'rgba(255,190,120,0.4)'; c.fillText('MK-' + (100 + ((rnd() * 900) | 0)), h.x, h.y); }
      } else if (k < 0.2) {
        const i0 = (rnd() * 6) | 0;
        c.strokeStyle = 'rgba(190,200,220,0.09)'; c.lineWidth = 1.2;
        c.beginPath();
        for (let j = 0; j < 3; j++) {
          const a = Math.PI / 3 * (i0 + j), rr = R * 0.96;
          const x = h.x + Math.cos(a) * rr, y = h.y + Math.sin(a) * rr;
          if (j === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke();
      }
    }
    if (tier < 5) return;
    // 段5：壁の中にシステムの文字（16進・ログの断片）
    const WORDS = ['SYS.CORE', 'MAKINA', 'AUTH OK', 'PKT DROP', 'ACK', 'TRACE', 'NODE', 'SEG', 'ROOT', 'HEAP', 'IRQ', 'SYNC'];
    c.font = '700 11px "Share Tech Mono",ui-monospace,Consolas,monospace'; c.textAlign = 'left';
    for (const h of walls) {
      if (rnd() >= 0.07) continue;
      const txt = rnd() < 0.55 ? '0x' + ((rnd() * 65536) | 0).toString(16).toUpperCase().padStart(4, '0') : WORDS[(rnd() * WORDS.length) | 0];
      c.fillStyle = 'rgba(255,170,90,' + (0.22 + rnd() * 0.18).toFixed(3) + ')';
      c.fillText(txt, h.x - R * 0.6, h.y + (rnd() - 0.5) * R * 0.6);
    }
    if (tier < 6) return;
    // 段6（第46章から）：**データの奥に、何かがいる。**（企画書 §31「データの奥にAIがある」・説明はしない）
    //   壁の中に、神経のようにつながった点と線の網。点は boardAnim でゆっくり呼吸するように明滅する
    const nodes = [];
    for (const h of walls) if (rnd() < 0.09) nodes.push({ x: h.x + (rnd() - 0.5) * R, y: h.y + (rnd() - 0.5) * R, ph: rnd() * 6.28 });
    c.lineWidth = 0.9;
    for (let i = 0; i < nodes.length; i++) {
      let k = 0;
      for (let j = i + 1; j < nodes.length && k < 3; j++) {
        const a = nodes[i], b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > R * 3.2) continue;
        k++;
        c.strokeStyle = 'rgba(255,225,190,' + (0.10 * (1 - d / (R * 3.2)) + 0.04).toFixed(3) + ')';
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      }
    }
    for (const nd of nodes) { c.fillStyle = 'rgba(255,230,200,0.35)'; c.beginPath(); c.arc(nd.x, nd.y, 1.8, 0, 7); c.fill(); }
    st._nodes = nodes;
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
    //    壁の中の「露出」（企画書 §9・§10・§31）：章が深いほど、ハニカムの中にあった基板やデータが見えてくる
    c.save(); wallPath(); c.clip();
    this.exposeLayer(c, st, R);
    c.restore();
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
    // 段5（第31章〜）：壁の中の配線をデータの光が流れる（exposeLayer）。**光るのは壁のタイルの上だけ**（通路に漏らさない）
    // 段6：網の点が、ゆっくり呼吸するように明滅する（光るのは壁のタイルの上だけ）
    if (st._nodes && st._nodes.length && this.exposeTier(st) >= 6) {
      if (!st._nodesOk) st._nodesOk = st._nodes.filter(nd => !st.walkable(Math.floor(nd.x / TILE), Math.floor(nd.y / TILE)));
      const breath = 0.5 + 0.5 * Math.sin(t * 0.9);
      for (const nd of st._nodesOk) {
        const a = Math.max(0, 0.25 + 0.55 * breath * (0.5 + 0.5 * Math.sin(t * 1.7 + nd.ph)));
        ctx.fillStyle = 'rgba(255,225,190,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(nd.x, nd.y, 2.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (st._traces && st._traces.length && this.exposeTier(st) >= 5) {
      if (!st._pulse) {
        st._pulse = st._traces.slice(0, 32).map(pts => {
          const out = [];
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y);
            for (let d = 0; d < L; d += 3) {
              const x = a.x + (b.x - a.x) * d / L, y = a.y + (b.y - a.y) * d / L;
              const cc = Math.floor(x / TILE), rr = Math.floor(y / TILE);
              out.push({ x, y, ok: !st.walkable(cc, rr) });
            }
          }
          return out;
        });
      }
      ctx.fillStyle = 'rgba(255,200,120,0.9)';
      st._pulse.forEach((sm, i) => {
        if (!sm.length) return;
        const p = sm[Math.floor((t * 40 + i * 37) % sm.length)];
        if (p.ok) { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 2.8, 0, Math.PI * 2); ctx.fill(); }
      });
    }
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
    // 走査線は引かない（企画書 §19「CRT・走査線は常用しない。タイトルと転生の移り変わりだけ」・2026-09-28）
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
    // **伸びる → 手繰り寄せる**（0929zq）。最初の2割で先が敵まで届き、そのあとは腕に沿って根元へ向かう矢じりが流れる＝「引き寄せ」と読める
    const rch = k < 0.2 ? 1 - Math.pow(1 - k / 0.2, 3) : 1;
    const x0 = f.x1, y0 = f.y1, x1 = f.x1 + (f.e.x - f.x1) * rch, y1 = f.y1 + (f.e.y - f.y1) * rch;
    const dx = x1 - x0, dy = y1 - y0;
    const L = Math.hypot(dx, dy) || 1;
    // 掴んだ直後ほど大きくうねる。根元 7.5px → 先 1.4px。吸盤は根元寄りの太いところにだけ（**腕であることは、ここで決まる**）
    //   前半はそのまま見せ、後半で薄れる（以前は出た瞬間から薄れて、盤の縮んだ画面では細い線にしか見えなかった）
    const al = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
    // 腕の後ろに、引き寄せの印の色の太い光の筋（引く向きが分かる）
    ctx.globalAlpha = al * 0.28; ctx.strokeStyle = '#ff8ae0'; ctx.lineWidth = 15; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.lineCap = 'butt';
    this.tentArm(ctx, x0, y0, x1, y1, { amp: Math.min(26, L * 0.16) * (1 - k * 0.55), ph: f.ph, tw: k * 7, w0: 11 * (1 - k * 0.25), alpha: al, color: f.color, suck: true });
    // 先端は敵に巻き付く：輪と、その外の六角の錠
    ctx.globalAlpha = al * 0.95;
    ctx.strokeStyle = '#ffd0f2'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x1, y1, (f.e.r || 8) + 3, f.ph, f.ph + 4.4); ctx.stroke();
    if (rch >= 1) {
      ctx.strokeStyle = '#ff8ae0'; ctx.lineWidth = 2; ctx.globalAlpha = al * 0.8;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + Math.PI / 3 * i, hr = (f.e.r || 8) + 10; const px = x1 + Math.cos(a) * hr, py = y1 + Math.sin(a) * hr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.closePath(); ctx.stroke();
    }
    // 手繰る矢じり：敵から根元へ向かって3つ流れる（届いたあとだけ）。腕のうねりには乗せず、中心線の上
    if (rch >= 1 && L > 40) {
      ctx.fillStyle = '#ff8ae0';
      const ux = dx / L, uy = dy / L, q = (k - 0.2) / 0.8;
      for (let j = 0; j < 3; j++) {
        const t = 1 - ((q * 1.6 + j / 3) % 1);       // 1（敵）→ 0（根元）
        const px = x0 + dx * t, py = y0 + dy * t, sz = 9 * (1 - k * 0.4);
        ctx.globalAlpha = al * Math.min(1, t * 4, (1 - t) * 4) * 0.95;
        ctx.beginPath();
        ctx.moveTo(px - ux * sz, py - uy * sz);
        ctx.lineTo(px + ux * sz * 0.4 - uy * sz, py + uy * sz * 0.4 + ux * sz);
        ctx.lineTo(px + ux * sz * 0.4 + uy * sz, py + uy * sz * 0.4 - ux * sz);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },

  // ================= 触手の6種の攻撃の絵（0929zq・見た目の仕上げ） =================
  //   形が一目で分かること。1回の攻撃の絵は一度きり・短く（0.34〜0.5秒）。色は 触手のピンクの体 ＋ 攻撃ごとの印の色（Combat.TNT_COL）。
  //   突き刺し（tntStab）＝細く長い槍が伸びて引っ込む ／ 薙ぎ払い（tntSweep）＝扇に払う残像 ／ 一閃（tntCut）＝赤と青に割れる斬線
  //   触手の壁・タコ墨は場なので fields() から（tntWall・tntInk）。引き寄せは tentacle()（伸びて手繰る）。名前の札は tntTag

  // 先細りのうねる腕1本。引き寄せ・薙ぎ払い・触手の壁が同じ描き方を共有する
  //   o: amp うねりの大きさ／ph 位相／tw うねりの進み／w0 根元の太さ／alpha／color／suck 吸盤を付ける／tip 先の太さの割合（既定 0.18）
  tentArm(ctx, x0, y0, x1, y1, o) {
    const dx = x1 - x0, dy = y1 - y0;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const N = 12, tip = o.tip === undefined ? 0.18 : o.tip;
    const ptx = _armX, pty = _armY, wid = _armW;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const sway = Math.sin(t * 5.2 + o.ph + (o.tw || 0)) * o.amp * Math.sin(t * Math.PI);
      ptx[i] = x0 + dx * t + nx * sway;
      pty[i] = y0 + dy * t + ny * sway;
      wid[i] = o.w0 * (1 - t * (1 - tip));
    }
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(N, i + 1);
      const tx = ptx[i1] - ptx[i0], ty = pty[i1] - pty[i0];
      const m = Math.hypot(tx, ty) || 1;
      const px = ptx[i] - ty / m * wid[i], py = pty[i] + tx / m * wid[i];
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    for (let i = N; i >= 0; i--) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(N, i + 1);
      const tx = ptx[i1] - ptx[i0], ty = pty[i1] - pty[i0];
      const m = Math.hypot(tx, ty) || 1;
      ctx.lineTo(ptx[i] + ty / m * wid[i], pty[i] - tx / m * wid[i]);
    }
    ctx.closePath();
    ctx.globalAlpha = o.alpha * 0.92;
    ctx.fillStyle = o.color; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    if (o.suck) {
      ctx.globalAlpha = o.alpha * 0.7;
      ctx.fillStyle = '#ffd0f2';
      for (let i = 1; i < N - 2; i += 2) {
        ctx.beginPath();
        ctx.arc(ptx[i], pty[i], Math.max(0.8, wid[i] * 0.34), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },

  tntStab(ctx, f, k) {
    const dx = f.x2 - f.x1, dy = f.y2 - f.y1, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    // 伸びる（0〜26%）→ 止まる（〜44%）→ 引っ込む
    const p = k < 0.26 ? 1 - Math.pow(1 - k / 0.26, 3) : k < 0.44 ? 1 : 1 - Math.pow((k - 0.44) / 0.56, 2);
    const tx = f.x1 + ux * L * p, ty = f.y1 + uy * L * p;
    ctx.save();
    // 当たりの幅（薄い帯）：ダメージが入る太さを見せる
    if (k > 0.08 && k < 0.5) {
      ctx.globalAlpha = 0.2 * (1 - (k - 0.08) / 0.42);
      ctx.fillStyle = f.acc;
      const h = f.half;
      ctx.beginPath();
      ctx.moveTo(f.x1 + nx * h, f.y1 + ny * h); ctx.lineTo(f.x2 + nx * h, f.y2 + ny * h);
      ctx.lineTo(f.x2 - nx * h, f.y2 - ny * h); ctx.lineTo(f.x1 - nx * h, f.y1 - ny * h);
      ctx.closePath(); ctx.fill();
    }
    // 槍の軸：根元が太く、穂先は尖る（先細りのくさび）
    const W = 13, a = k < 0.44 ? 1 : 1 - (k - 0.44) / 0.56 * 0.5;
    ctx.globalAlpha = a * 0.95;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.moveTo(f.x1 + nx * W, f.y1 + ny * W); ctx.lineTo(tx, ty); ctx.lineTo(f.x1 - nx * W, f.y1 - ny * W);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = f.acc; ctx.lineWidth = 2; ctx.stroke();
    // 節（吸盤の代わりの刻み）：軸を横切る短い線を等間隔に
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
      const t = i / 8 * p, bx = f.x1 + ux * L * t, by = f.y1 + uy * L * t, w = W * (1 - i / 8 * p) * 0.8;
      ctx.moveTo(bx + nx * w, by + ny * w); ctx.lineTo(bx - nx * w, by - ny * w);
    }
    ctx.stroke();
    // 白い芯
    ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(tx, ty); ctx.stroke();
    // 穂先の閃光：伸びきったあたりで十字に光り、輪が広がる
    if (k > 0.18 && k < 0.6) {
      const q = (k - 0.18) / 0.42, sz = 20 * (1 - q);
      ctx.globalAlpha = 1 - q; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(f.x2 - sz, f.y2); ctx.lineTo(f.x2 + sz, f.y2); ctx.moveTo(f.x2, f.y2 - sz); ctx.lineTo(f.x2, f.y2 + sz);
      ctx.stroke();
      ctx.strokeStyle = f.acc; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x2, f.y2, 6 + q * 22, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  },

  tntSweep(ctx, f, k) {
    const a0 = f.a - f.arc, a1 = f.a + f.arc;
    const q = Math.min(1, k / 0.5), phi = a0 + (a1 - a0) * (1 - Math.pow(1 - q, 3));
    const fade = k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5;
    const R = f.r, r0 = R * 0.2;
    ctx.save();
    // 残像：払った跡の扇を9つに分け、先頭に近いほど濃い（払った向きが分かる）
    ctx.fillStyle = f.acc;
    for (let j = 0; j < 9; j++) {
      const s0 = a0 + (phi - a0) * j / 9, s1 = a0 + (phi - a0) * (j + 1) / 9;
      ctx.globalAlpha = fade * (0.04 + 0.055 * (j + 1));
      ctx.beginPath(); ctx.arc(f.x, f.y, R, s0, s1); ctx.arc(f.x, f.y, r0, s1, s0, true); ctx.closePath(); ctx.fill();
    }
    // 外縁の光る弧（払った跡の端）
    ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = f.acc; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(f.x, f.y, R, a0, phi); ctx.stroke();
    ctx.globalAlpha = fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(f.x, f.y, R, Math.max(a0, phi - 0.5), phi); ctx.stroke();
    // 先頭の腕：根元から払う向きへ。先は払う向きと逆へ遅れてしなる
    const hx = f.x + Math.cos(phi) * R * 0.98, hy = f.y + Math.sin(phi) * R * 0.98;
    this.tentArm(ctx, f.x, f.y, hx, hy, { amp: -R * 0.12 * (1 - q * 0.6), ph: 0.8, tw: 0, w0: 10, alpha: fade, color: f.color, suck: true });
    ctx.globalAlpha = fade; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  tntCut(ctx, f, k) {
    const L = f.r * 2.7, ux = Math.cos(f.a), uy = Math.sin(f.a), nx = -uy, ny = ux;
    const head = Math.min(1, k / 0.24), hp = 1 - Math.pow(1 - head, 3);     // 先頭（0〜1・速く走る）
    const tail = k < 0.2 ? 0 : Math.pow(Math.min(1, (k - 0.2) / 0.65), 2);   // 尻尾（遅れて追う＝消えていく）
    ctx.save();
    // 小さな六角の衝撃波（当たりの大きさ）
    {
      const kk = Math.min(1, k / 0.5), hr = f.r * (0.35 + 0.65 * kk);
      ctx.globalAlpha = (1 - kk) * 0.8;
      ctx.strokeStyle = f.acc; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + Math.PI / 3 * i; const x = f.x + Math.cos(a) * hr, y = f.y + Math.sin(a) * hr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath(); ctx.stroke();
    }
    // 斬線：真ん中が太く両端が尖る。赤と青にずれて（結果画面の字と同じ）、芯は白
    const s0 = tail, s1 = hp;
    if (s1 > s0 + 0.01) {
      const N = 10, W = 10;
      const passes = [[-2.6, '#ff3c5a', 0.8, 1], [2.6, '#3cdcff', 0.8, 1], [0, '#ffffff', 1, 0.45]];
      for (const [off, col, al, wm] of passes) {
        ctx.globalAlpha = al * (k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5 * 0.6);
        ctx.fillStyle = col;
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const s = s0 + (s1 - s0) * i / N, w = W * Math.pow(Math.sin(Math.PI * s), 0.8) * wm;
          const c = (s - 0.5) * L, x = f.x + ux * c + nx * (off + w), y = f.y + uy * c + ny * (off + w);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        for (let i = N; i >= 0; i--) {
          const s = s0 + (s1 - s0) * i / N, w = W * Math.pow(Math.sin(Math.PI * s), 0.8) * wm;
          const c = (s - 0.5) * L;
          ctx.lineTo(f.x + ux * c + nx * (off - w), f.y + uy * c + ny * (off - w));
        }
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  },

  // 名前の札：触手の上に、斜めの小さな暗い板。左の太い縁と上の「// STAB」が攻撃の印の色、下の日本語は白の太字。
  //   出る：左から滑り込む（最初の一瞬だけ赤と青にずれる）／残る／薄れる。画面の上の大きさを一定にする（ダメージ数字と同じ）
  tntTag(ctx, f, k) {
    const s = Math.max(0.2, this.scale || 1), u = 1 / s, st = this.stage || { w: 1e9 };
    const MONO = '"Share Tech Mono",ui-monospace,Consolas,monospace', JP = '"Hiragino Kaku Gothic ProN","Noto Sans JP",system-ui,sans-serif';
    const pin = Math.min(1, k / 0.12), pe = 1 - Math.pow(1 - pin, 3);
    const out = k < 0.72 ? 0 : (k - 0.72) / 0.28;
    ctx.save();
    ctx.font = '700 ' + (9 * u) + 'px ' + MONO;
    const ew = ctx.measureText('// ' + f.en).width;
    ctx.font = '900 ' + (13 * u) + 'px ' + JP;
    const jw = ctx.measureText(f.jp).width;
    const w = Math.max(ew, jw) + 20 * u, h = 30 * u;
    let x = f.x, y = f.y - (30 + (f.slot || 0) * 34) * u;
    x = Math.max(w / 2 + 6 * u, Math.min(st.w - w / 2 - 6 * u, x));
    y = Math.max(h / 2 + 46 * u, y);
    ctx.translate(x - (1 - pe) * 18 * u - out * 4 * u, y - out * 6 * u);
    ctx.transform(1, 0, -0.2, 1, 0, 0);                    // 斜体（太い斜めの板）
    const al = pe * (1 - out * out);
    // 板：暗い地・印の色の縁
    ctx.globalAlpha = al * 0.94; ctx.fillStyle = 'rgb(8,8,14)'; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.globalAlpha = al * 0.9; ctx.strokeStyle = f.acc; ctx.lineWidth = 1 * u; ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.globalAlpha = al; ctx.fillStyle = f.acc; ctx.fillRect(-w / 2, -h / 2, 5 * u, h);
    // 字
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const tx = -w / 2 + 11 * u;
    ctx.font = '700 ' + (9 * u) + 'px ' + MONO;
    ctx.fillStyle = f.acc; ctx.fillText('// ' + f.en, tx, -h / 2 + 8.5 * u);
    ctx.font = '900 ' + (13 * u) + 'px ' + JP;
    if (k < 0.16) {                                        // 出た瞬間だけ、赤と青にずれる
      const d = 1.8 * u * (1 - k / 0.16);
      ctx.fillStyle = 'rgba(255,60,90,0.8)'; ctx.fillText(f.jp, tx - d, h / 2 - 9 * u);
      ctx.fillStyle = 'rgba(60,220,255,0.8)'; ctx.fillText(f.jp, tx + d, h / 2 - 9 * u);
    }
    ctx.fillStyle = '#ffffff'; ctx.fillText(f.jp, tx, h / 2 - 9 * u);
    ctx.restore();
  },

  // 触手の壁（場）：進む向きに対して横に、触手の柱が5本立つ。根元から伸び、ゆれて、最後は引っ込む。柱の先どうしを線でつなぐ
  tntWall(ctx, f) {
    const t = f.t, grow = 1 - Math.pow(1 - Math.min(1, t / 0.28), 3), left = Math.min(1, Math.max(0, (f.dur - t) / 0.45));
    const g = grow * left, al = Math.min(1, left * 1.4);
    const a = f.a || 0, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
    const R = f.r;
    ctx.save();
    // 場の足元：薄いピンクの面と、立ち上がりの輪
    ctx.globalAlpha = 0.14 * al; ctx.fillStyle = '#c85ab0';
    ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.fill();
    if (t < 0.3) { ctx.globalAlpha = (1 - t / 0.3) * 0.8; ctx.strokeStyle = '#7ee3a0'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(f.x, f.y, R * (0.4 + 0.8 * t / 0.3), 0, Math.PI * 2); ctx.stroke(); }
    // 柱：根元は壁の線の上、先は敵が来る側へ反りながら伸びる
    const N = 5, tipx = [], tipy = [];
    for (let i = 0; i < N; i++) {
      const o = (i - (N - 1) / 2) / ((N - 1) / 2) * R * 0.78;        // 壁の線の上の位置（-0.78R〜+0.78R）
      const bx = f.x + nx * o - dx * R * 0.3, by = f.y + ny * o - dy * R * 0.3;
      const len = R * (0.85 + 0.2 * Math.cos(o / R * 1.2)) * g;
      const ex = bx + dx * len, ey = by + dy * len;
      tipx[i] = ex; tipy[i] = ey;
      this.tentArm(ctx, bx, by, ex, ey, { amp: R * 0.16, ph: i * 1.7 + t * 3.2, tw: t * 2, w0: 9, alpha: al, color: '#c85ab0', suck: true, tip: 0.3 });
      // 根元の吸盤の輪（地面に張り付いている印）
      ctx.globalAlpha = al * 0.9; ctx.strokeStyle = '#ffd0f2'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(bx, by, 6.5, 0, Math.PI * 2); ctx.stroke();
    }
    // 先どうしをつなぐ線（壁の面）
    ctx.globalAlpha = al * 0.75; ctx.strokeStyle = '#7ee3a0'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < N; i++) i ? ctx.lineTo(tipx[i], tipy[i]) : ctx.moveTo(tipx[i], tipy[i]);
    ctx.stroke();
    ctx.fillStyle = '#e8fff0';
    for (let i = 0; i < N; i++) { ctx.beginPath(); ctx.arc(tipx[i], tipy[i], 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  },

  // タコ墨（場）：着弾でぱっと広がる濃い墨だまり。暗い藍の塊を重ね、縁を明るい紫の線で見せる（暗い盤の上でも見える）。しぶきの点と、最初の一瞬だけ放射状の筋
  tntInk(ctx, f) {
    const t = f.t, k = t / f.dur;
    const sp = 1 - Math.pow(1 - Math.min(1, t / 0.22), 3);                   // 広がる（0.22秒）
    const al = Math.min(1, (1 - k) / 0.12);                                   // 最後の1割で薄れる（塊が重なっているので、薄くしすぎると重なりが透ける）
    const R = f.r * (0.9 + 0.1 * sp) * sp * (k < 0.7 ? 1 : 0.7 + 0.3 * (1 - k) / 0.3);   // 最後の3割は縮んでいく
    const sd = Math.abs(Math.sin(f.x * 12.9898 + f.y * 78.233)) * 6.28;
    ctx.save();
    ctx.globalAlpha = al;
    // 放射状の筋（最初の0.3秒）
    if (t < 0.3) {
      ctx.fillStyle = 'rgba(30,14,64,0.9)';
      for (let i = 0; i < 9; i++) {
        const a = sd + i * 0.698 + Math.sin(i * 7.1) * 0.2, L = f.r * (0.85 + 0.35 * ((i * 37) % 7) / 7) * sp, w = 7 * (1 - t / 0.3);
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(a + 1.5708) * w, f.y + Math.sin(a + 1.5708) * w);
        ctx.lineTo(f.x + Math.cos(a) * L, f.y + Math.sin(a) * L);
        ctx.lineTo(f.x + Math.cos(a - 1.5708) * w, f.y + Math.sin(a - 1.5708) * w);
        ctx.closePath(); ctx.fill();
      }
    }
    // 墨だまり：塊を重ねる（縁の紫 → 内側の暗い藍の順に、同じ塊を2回なぞると塊が溶け合って1つのたまりに見える）
    const blobs = [];
    for (let i = 0; i < 9; i++) {
      const a = sd + i * 2.399, d = R * (i === 0 ? 0 : 0.3 + 0.38 * ((i * 53) % 7) / 7);
      const rad = R * (i === 0 ? 0.5 : 0.24 + 0.2 * ((i * 37) % 11) / 11) * (1 + 0.05 * Math.sin(t * 3 + i));
      blobs.push([f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, rad]);
    }
    ctx.fillStyle = 'rgba(154,124,255,0.85)';
    for (const b of blobs) { ctx.beginPath(); ctx.arc(b[0], b[1], b[2] + 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(20,9,44,0.96)';
    for (const b of blobs) { ctx.beginPath(); ctx.arc(b[0], b[1], b[2], 0, Math.PI * 2); ctx.fill(); }
    // つや：中心の塊の左上に細い明るい弧
    ctx.strokeStyle = 'rgba(200,180,255,0.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(blobs[0][0], blobs[0][1], blobs[0][2] * 0.7, 3.5, 4.5); ctx.stroke();
    // しぶき：外へ飛んだ小さな点
    ctx.fillStyle = 'rgba(30,14,64,0.95)'; ctx.strokeStyle = 'rgba(154,124,255,0.8)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 10; i++) {
      const a = sd + i * 0.628 + 0.3, d = f.r * (0.92 + 0.22 * ((i * 71) % 9) / 9) * sp, r = (2.5 + ((i * 29) % 5)) * Math.min(1, sp * 1.3);
      ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
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
    // **ほぼ同じ場所に重なった同じ種類の場は、1枚にまとめて描く。**（2026-09-28・重さの対策）
    //   酸の泡は同じ着弾円に何度も落ちるので、場70個のほとんどが数か所に積み重なっていた。
    //   同じ所を何十回も半透明で塗るのが重かった（実測：場を描かないと 45.5 → 59.0fps・敵319体を止めた同じ盤）。
    //   **ダメージは1つずつ今までどおり**（描くのをまとめるだけ）。重なった数だけ濃くする
    const drawn = _fieldBuf; drawn.length = 0;
    for (let i = run.fields.length - 1; i >= 0; i--) {     // 新しいものを代表にする
      const f = run.fields[i];
      let host = null;
      for (const d of drawn) {
        if (d.f.kind === f.kind && d.f.color === f.color && Util.dist(d.f.x, d.f.y, f.x, f.y) < Math.min(d.f.r, f.r) * 0.5) { host = d; break; }
      }
      if (host) host.n++; else drawn.push({ f, n: 1 });
    }
    // **雲（火以外）は解像度を落とした別の画面に描いて、1回で盤へ重ねる。**（2026-09-28・重さの対策）
    //   雲はもともとぼけた絵なので、1/3 の解像度でも見た目は変わらない。塗る面積が約1/9になる。
    //   火（加算で重ねる）はこれまでどおり盤へ直接。縁の線は下で盤へ直接（くっきり出す）
    const cv = ctx.canvas, Q = BAL.fxFieldRes || 0.34;
    const L = this._fieldLayer || (this._fieldLayer = document.createElement('canvas'));
    const lw = Math.max(1, Math.round(cv.width * Q)), lh = Math.max(1, Math.round(cv.height * Q));
    if (L.width !== lw) L.width = lw;
    if (L.height !== lh) L.height = lh;
    const lc = L.getContext('2d');
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, lw, lh);
    const m = ctx.getTransform();
    lc.setTransform(m.a * Q, m.b * Q, m.c * Q, m.d * Q, m.e * Q, m.f * Q);
    let layered = 0;
    let tnt = null;   // 触手の壁・タコ墨（専用の絵。雲の層には入れない）
    for (const d of drawn) {
      const f = d.f;
      if (f.kind === 'tentwall' || f.kind === 'ink') { (tnt || (tnt = [])).push(f); continue; }
      const k = f.t / f.dur;
      const fire = f.kind === 'fire';
      const fade = Math.min(1, (1 - k * 0.65) * (fire ? glare : 1) * (1 + 0.25 * (Math.min(d.n, 5) - 1)));
      if (!fire) {
        const FR = Math.min(f.r, RMAX), R = FR * (1 + k * 0.2);
        lc.globalAlpha = Math.max(0, Math.min(1, fade));
        lc.save(); lc.translate(f.x, f.y); lc.rotate(f.t * 0.5);
        lc.drawImage(this.cloudSprite(f.color, false), -R, -R, R * 2, R * 2);
        lc.restore();
        layered++;
        continue;
      }
      ctx.globalCompositeOperation = 'lighter';
      // **雲は作り置きの絵を貼るだけにする。**（2026-09-28・ユーザー「泡と毒ガスが極端に重い…酸泡や泡と毒ガスの連携が地獄のように重い」）
      //   前は場1つにつき、毎フレーム放射グラデーションを6枚作って塗っていた。酸の泡・毒の雲が重なると場は70個（上限）に届き、
      //   1フレームに420枚のグラデーションを塗っていた（実測：泡と毒ガスの盤だけ 10秒で462コマ＝約46fps。ほかの編成は60fps）。
      //   いまは色ごとに6つの塊を描いた絵を1枚作っておき、回す・広げる・薄めるだけ（1つの場につき描画1回）
      const FR = Math.min(f.r, RMAX);   // 半径に天井。**巨大な場が重なると、加算で盤ごと白くなる**
      const spr = this.cloudSprite(f.color, fire);
      const R = FR * (fire ? 1 + 0.06 * Math.sin(f.t * 9) : 1 + k * 0.2);   // 炎はゆらぎ、雲は広がる
      ctx.globalAlpha = Math.max(0, Math.min(1, fade));
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.drawImage(spr, -R, -R, R * 2, R * 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    // 雲の画面を盤へ重ねる（1回）
    if (layered) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(L, 0, 0, cv.width, cv.height);
      ctx.restore();
    }
    if (tnt) for (const f of tnt) { if (f.kind === 'ink') this.tntInk(ctx, f); else this.tntWall(ctx, f); }
    // 縁。**どこまでが場なのかは、遊ぶうえで必要な情報**なので必ず出す（盤へ直接・くっきり）
    //   **実線にした。**前は雲の縁を流れる点線（setLineDash）で描いていて、場が数十あると点線だけで重かった
    //   （実測：敵308・場71を止めた同じ盤で、点線 54.3fps → 実線 59.5fps）
    ctx.lineWidth = 1.5;
    for (const d of drawn) {
      const f = d.f, k = f.t / f.dur;
      ctx.globalAlpha = 0.45 * (1 - k);
      ctx.strokeStyle = f.color;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },

  // 場（雲・炎の海）の絵。色と種類ごとに1枚だけ作る。半径1の場を 128px 四方に描き、貼るときに半径へ伸ばす。
  //   塊の並びは前の描き方（黄金角で散らした6つ）と同じ
  cloudSprite(color, fire) {
    const key = color + (fire ? '|f' : '|g');
    this._clouds = this._clouds || {};
    if (this._clouds[key]) return this._clouds[key];
    const S = 128, h = S / 2;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d');
    const U = h / 1.05;                  // 場の半径1 ＝ U px（塊のはみ出しぶん少し小さく）
    for (let i = 0; i < 6; i++) {
      const a = i * 2.399;
      const rad = U * (0.34 + 0.30 * ((i * 37) % 11) / 11);
      const dist = U * (0.18 + 0.36 * ((i * 53) % 7) / 7);
      const x = h + Math.cos(a) * dist, y = h + Math.sin(a) * dist;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, this.tint(color, fire ? 0.30 : 0.22));
      g.addColorStop(1, this.tint(color, 0));
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
    }
    this._clouds[key] = cv;
    return cv;
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
    ctx.globalCompositeOperation = 'source-over';
    // **Makina / Core は「守るべき装置」**（企画書 §15・2026-09-28）。喋らせず、説明もしない。
    //   台座の各辺に部品の足（ピン）を並べて「基板に載った部品」に見せ、下に小さなシルク印刷の名前を入れる
    ctx.strokeStyle = 'rgba(210,200,180,0.55)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a0 = Math.PI / 3 * i, a1 = Math.PI / 3 * (i + 1), R = t.r * 1.25;
      for (let k = 1; k <= 3; k++) {
        const f = k / 4;
        const x = Math.cos(a0) * R * (1 - f) + Math.cos(a1) * R * f, y = Math.sin(a0) * R * (1 - f) + Math.sin(a1) * R * f;
        const nx = Math.cos((a0 + a1) / 2), ny = Math.sin((a0 + a1) / 2);
        ctx.moveTo(x, y); ctx.lineTo(x + nx * 4, y + ny * 4);
      }
    }
    ctx.stroke();
    const towers = run.towers || [t];
    const name = towers.length > 1 ? 'MAKINA / CORE-0' + (towers.indexOf(t) + 1) : 'MAKINA / CORE';
    ctx.font = '700 7px "Share Tech Mono",ui-monospace,Consolas,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,200,140,0.55)';
    ctx.fillText(name, 0, t.r * 1.25 + 14);
    ctx.restore();


    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 7, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = hpR > 0.5 ? '#48e08a' : hpR > 0.22 ? '#ffc23c' : '#ff4e63';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpR);
    ctx.stroke();
  },

  // 隣り合う異種の線（Game.updateAdj）。準備フェーズ・ウェーブの合間だけ、違う種類の隣どうしを細い線でつなぐ。
  //   選んでいる1基につながる線は太く明るく。全部を濃くすると盤が埋まるので、ほかは細く薄く
  adjLines(ctx, run) {
    if (!Game.canBuild()) return;
    const us = run.units, sel = UI.selected;
    if (us.length < 2) return;
    const at = {};
    for (const u of us) at[u.c + ',' + u.r] = u;
    const s = this.scale || 1;
    ctx.lineCap = 'round';
    // 武器の絵の上に描く（下に描くと、隣どうしの中心を結ぶ線は絵にほとんど隠れて見えなかった・0929zy）。
    //   線は2基の境目のまわりだけ（中心から中心までは引かない）。暗い縁取りの上に明るい線で、盤の色に負けないように
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      for (const q of MapGen.hexNbr(u.c, u.r)) {
        const o = at[q[0] + ',' + q[1]];
        if (!o || o.id === u.id || us.indexOf(o) < i) continue;     // 1組を1回だけ
        const hot = sel === u || sel === o;
        const x1 = u.x + (o.x - u.x) * 0.3, y1 = u.y + (o.y - u.y) * 0.3;
        const x2 = u.x + (o.x - u.x) * 0.7, y2 = u.y + (o.y - u.y) * 0.7;
        ctx.globalAlpha = hot ? 1 : 0.85;
        ctx.strokeStyle = 'rgba(0,0,0,.75)';
        ctx.lineWidth = (hot ? 7 : 5.5) / s;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = hot ? '#ffe38a' : '#ffc24a';
        ctx.lineWidth = (hot ? 3.6 : 2.6) / s;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }
    // 倍率の数字は盤に書かない（全部の基に出すとスマホ幅で札が武器の絵を覆い、選ぶと向きの輪の下に隠れた・0929zy の確認）。
    //   数字は武器の詳細の内訳と、置く前の影の「+30%」で見せる
    ctx.globalAlpha = 1;
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
      if (!Game.usesFace(u.def)) {
        // 全周に効く武器（凍結装置）：向きが攻撃に関係しないので、扇ではなく**射程の円**を出す（0930）。
        //   凍結は全周のパルス（Combat.pulse・角度の判定なし）なので、この円の中に入った敵が、全部同じに効く。円は当たる範囲そのもの
        ctx.beginPath();
        ctx.arc(u.x, u.y, u.s.range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = isSel ? 0.16 : 0.07;
        ctx.fillStyle = c;
        ctx.fill();
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

  // ---------- 向きの指定（花）（0929y・ユーザー「一つのハニカムを中心に、それぞれの面に接するようにハニカムを置くと、直感的に6方向を選べるボタンが出来上がります」） ----------
  //   選んでいるユニット（置いた直後もここ）の六角のまわりに、6つの辺に接する六角のボタンを出す。押した方向がそのまま向き。
  //   ボタンの位置は盤の隣の六角と同じ（平らな頭の六角の隣＝上・右上・右下・下・左下・左上。Game.FACES と同じ並びで、同じ角度）。
  //   **向きの意味・保存・射界の計算は変えない**（選び方と見せ方だけ。Game.aimUnit に FACES の角度を渡す）。
  //   盤が縮んで隣の六角が指より小さいとき（スマホ幅で約28px）は、花ぜんたいを画面上で半径 BAL.dirRingPx 以上に大きくする（角度は同じ）。
  //   盤の端で花が画面からはみ出すときは、全部が入るところまで花ごと内側へずらし、元の六角から細い線でつなぐ。
  //   準備フェーズ・ウェーブの合間のあいだだけ（Game.canBuild）。置く場所・移動先を選んでいる最中は出さない。
  //   **向きが攻撃に関係しない武器（指定攻撃3種・凍結装置。Game.usesFace が偽）には出さない**（0930・ユーザー「方向指定の花をなくしてください」）
  dirRing() {
    const u = UI.selected, run = Game.run;
    if (!u || !run || run.over || !Game.canBuild()) return null;
    if (UI.placingType || UI.moving || !run.units.includes(u)) return null;
    if (!Game.usesFace(u.def)) return null;      // 向きが攻撃に関係しない武器（指定攻撃・凍結）には花を出さない（0930）
    const s = this.scale, R = MapGen.HEX_R, G = BAL.dirRingGap, c30 = Math.sqrt(3) / 2;
    const f = Math.max(1, BAL.dirRingPx / (R * G * s));
    const D = Math.sqrt(3) * R * f, r = R * f * G;
    const hx = c30 * D + r, hy = D + c30 * r;                     // 花の外形の半分（横・縦）
    // 上は左上の「火力」の札を避ける。チュートリアルの帯が出ているあいだ（調整の板が開くと帯は上へ逃げる）は、その下まで
    let topPx = 36;
    const tut = UI.el && UI.el.tut;
    if (tut && tut.classList.contains('on') && tut.offsetHeight) {
      const tr = tut.getBoundingClientRect(), cr = this.canvas.getBoundingClientRect();
      if (tr.top < cr.top + cr.height / 2) topPx = Math.max(topPx, tr.bottom - cr.top + 6);     // 下に出ているとき（板が開く前）は数えない
    }
    const pad = 4 / s, padTop = topPx / s;
    const x0 = -this.offX / s + pad + hx, x1 = (this.cssW - this.offX) / s - pad - hx;
    const y0 = -this.offY / s + padTop + hy, y1 = (this.cssH - this.offY) / s - pad - hy;
    let cx = x0 <= x1 ? Util.clamp(u.x, x0, x1) : (x0 + x1) / 2;
    let cy = y0 <= y1 ? Util.clamp(u.y, y0, y1) : (y0 + y1) / 2;
    // 盤の上に重なって押せなくしている札（減速・加速の説明）があれば、それを避けて花をずらす（覆われたボタンは押せない）
    const zt = UI.el && UI.el.zoneTip;
    if (zt && zt.classList.contains('on') && zt.offsetHeight) {
      const zr = zt.getBoundingClientRect(), a = this.toStage(zr.left, zr.top), z = this.toStage(zr.right, zr.bottom);
      const hit = (X, Y) => X + hx > a.x && X - hx < z.x && Y + hy > a.y && Y - hy < z.y;
      if (hit(cx, cy)) {
        let best = null, bd = 1e18;
        for (const o of [[cx, a.y - hy], [z.x + hx, cy], [a.x - hx, cy], [cx, z.y + hy]]) {
          if (o[0] < x0 || o[0] > x1 || o[1] < y0 || o[1] > y1 || hit(o[0], o[1])) continue;
          const d = Math.hypot(o[0] - u.x, o[1] - u.y);
          if (d < bd) { bd = d; best = o; }
        }
        if (best) { cx = best[0]; cy = best[1]; }
      }
    }
    const face = Game.snapFace(u.face);
    const btns = Game.FACES.map((a) => ({ a, x: cx + Math.cos(a) * D, y: cy + Math.sin(a) * D }));
    return { u, cx, cy, D, r, hx, hy, btns, cur: Game.FACES.indexOf(face), shifted: Math.hypot(cx - u.x, cy - u.y) > 0.5 };
  },
  // 画面の点がどのボタンか（無ければ -1）。**ボタンの六角の外側の隙間も、隣の六角の分まで受ける**（押しそこないを作らない）
  dirHit(clientX, clientY) {
    const g = this.dirRing();
    if (!g) return -1;
    const p = this.toStage(clientX, clientY), Rc = g.r / BAL.dirRingGap, c30 = Math.sqrt(3) / 2;
    for (let i = 0; i < g.btns.length; i++) {
      const dx = Math.abs(p.x - g.btns[i].x), dy = Math.abs(p.y - g.btns[i].y);
      if (dy <= c30 * Rc && dx + dy / Math.sqrt(3) <= Rc) return i;
    }
    return -1;
  },
  dirRingDraw(ctx) {
    const g = this.dirRing();
    if (!g) { this._ringU = null; return; }
    const now = performance.now(), px = 1 / this.scale;
    if (this._ringU !== g.u) { this._ringU = g.u; this._ringT0 = now; }
    const k = Math.min(1, (now - this._ringT0) / 160), e = 1 - (1 - k) * (1 - k);
    ctx.save();
    if (g.shifted) {                                       // ずらしたときは、元の六角から線でつなぐ
      ctx.globalAlpha = 0.85 * e;
      ctx.strokeStyle = '#ff8a1f'; ctx.lineWidth = 1.5 * px; ctx.setLineDash([4 * px, 4 * px]);
      ctx.beginPath(); ctx.moveTo(g.u.x, g.u.y); ctx.lineTo(g.cx, g.cy); ctx.stroke();
      ctx.setLineDash([]);
      this.hexPathOn(ctx, g.cx, g.cy, g.r * 0.42);
      ctx.fillStyle = 'rgba(8,10,15,0.9)'; ctx.fill(); ctx.stroke();
    }
    if (!g.shifted) {                                      // 中心の六角のふち。6つのボタンと合わせて、1つの花に見せる
      this.hexPathOn(ctx, g.cx, g.cy, g.r);
      ctx.globalAlpha = 0.3 * e; ctx.strokeStyle = '#ff8a1f'; ctx.lineWidth = 1 * px; ctx.stroke();
    }
    g.btns.forEach((b, i) => {
      const on = i === g.cur, press = this.dirPress === i;
      const rr = g.r * (0.55 + 0.45 * e) * (press ? 0.9 : 1);
      ctx.save();
      ctx.globalAlpha = e;
      this.hexPathOn(ctx, b.x, b.y, rr);
      if (on) {
        ctx.shadowColor = '#ff8a1f'; ctx.shadowBlur = 14;
        ctx.fillStyle = '#ff8a1f';
      } else ctx.fillStyle = press ? 'rgba(60,32,10,0.95)' : 'rgba(8,10,15,0.9)';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = on ? '#ffe2bd' : 'rgba(255,138,31,0.8)'; ctx.lineWidth = (on ? 2.2 : 1.6) * px;
      ctx.stroke();
      if (!on) {                                            // 内側の細い縁（物理ボタンの面）
        this.hexPathOn(ctx, b.x, b.y, rr - 3.5 * px);
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1 * px; ctx.stroke();
      }
      // 外へ向かう矢じり
      ctx.translate(b.x, b.y); ctx.rotate(b.a);
      const L = rr * 0.5;
      ctx.beginPath();
      ctx.moveTo(L * 0.75, 0); ctx.lineTo(-L * 0.5, -L * 0.78); ctx.lineTo(-L * 0.18, 0); ctx.lineTo(-L * 0.5, L * 0.78);
      ctx.closePath();
      ctx.fillStyle = on ? '#1a0d00' : '#ffb35a';
      ctx.fill();
      ctx.restore();
    });
    ctx.restore();
  },

  // 指定攻撃の着弾円。**砲弾はこの円の中のどこかに落ちる。**
  //   外側の破線 … 円そのもの（大きさは武器ごとの固定値）
  //   内側の薄い円 … 1発ぶんの爆風。この2つの差が「どれだけ散るか」
  aims(ctx, run) {
    for (const w of run.units) {
      // **w.aim ではなく w.ax/ay を見る。** w.aim は戦闘中しか入らないので、
      // これを見ていると「円を置く準備フェーズで円が見えない」ことになる
      if (w.ax === undefined || w.ax === null) continue;
      const ax = w.ax, ay = w.ay;
      const R = Math.max(14, Game.spotR(w));
      const c = w.def.color;
      // 選んでいる指定攻撃（＝いま盤をタップすれば動く円）は、線を太く・塗りを濃くし、砲から円へ細い線を引く（0930・花を無くし、盤のタップで円を動かす形にしたので、動かせる円を見せる）
      const isSel = UI.selected === w && Game.canBuild();
      if (isSel) {
        ctx.globalAlpha = 0.35; ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(ax, ay); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = c + 'cc';
      ctx.lineWidth = isSel ? 2.4 : 1.6;
      ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.arc(ax, ay, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalAlpha = isSel ? 0.2 : 0.10;
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
      // ボスの沈黙：撃てない武器は紫の輪と×（残り秒に応じて薄れる）
      if (u.jamT > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, 0.45 + u.jamT * 0.3) * (0.75 + 0.25 * Math.sin(run.time * 18));
        ctx.strokeStyle = '#d36bff'; ctx.lineWidth = 3;
        this.hexPathOn(ctx, u.x, u.y, MapGen.HEX_R - 4); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(u.x - 11, u.y - 11); ctx.lineTo(u.x + 11, u.y + 11);
        ctx.moveTo(u.x + 11, u.y - 11); ctx.lineTo(u.x - 11, u.y + 11);
        ctx.stroke(); ctx.restore();
      }
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

  // 武器のドットの絵を描く（WEAPON_PIX）。1ドット2px・回す中心は def.p
  turretPix(c, def, color) {
    const P = 2.4, rows = def.r, W = Math.max.apply(null, rows.map(r => r.length));
    const x0 = -def.p[0] * P - P / 2, y0 = -def.p[1] * P - P / 2;
    const each = (fn) => { for (let y = 0; y < rows.length; y++) for (let x = 0; x < W; x++) { const ch = rows[y][x] || '.'; if (ch !== '.') fn(x0 + x * P, y0 + y * P, ch); } };
    // 暗い縁取り
    c.fillStyle = 'rgba(0,0,0,0.85)';
    each((x, y) => c.fillRect(x - 0.7, y - 0.7, P + 1.4, P + 1.4));
    // 金属
    each((x, y, ch) => { if (ch === 'd' || ch === 'g') { c.fillStyle = ch === 'd' ? '#1d2027' : '#5d6370'; c.fillRect(x, y, P + 0.2, P + 0.2); } });
    // 武器の色：光る
    c.save(); c.shadowColor = color; c.shadowBlur = 4;
    c.fillStyle = color;
    each((x, y, ch) => { if (ch === '#') c.fillRect(x, y, P + 0.2, P + 0.2); });
    c.restore();
    // 白い光
    c.save(); c.shadowColor = '#fff'; c.shadowBlur = 3; c.fillStyle = '#ffffff';
    each((x, y, ch) => { if (ch === 'w') c.fillRect(x, y, P + 0.2, P + 0.2); });
    c.restore();
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
    // ドットの絵があれば、それで描く（企画書 §14・敵と同じ描き方にそろえる）。無い武器は前の図形のまま
    if (WEAPON_PIX[id]) this.turretPix(c, WEAPON_PIX[id], color);
    else this.turret(c, { id }, color);
    c.restore();
    c.globalCompositeOperation = 'source-atop';
    const g = c.createLinearGradient(-h * 0.6, -h * 0.6, h * 0.6, h * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.38)'); g.addColorStop(0.45, 'rgba(255,255,255,0.04)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = g; c.fillRect(-h, -h, h * 2, h * 2);
    return (this._tur[key] = { cv, h });
  },

  // 敵：**昔のゲームの敵キャラの皮を貼った侵入プログラム**（企画書 §13「古いデザイン感 × 現代的な描画品質」・2026-09-28）
  //   ドットの絵（下の ENEMY_PIX）を、暗い縁取り・色の光・上から当たる光で描く。**2コマで足踏み**し、同じ種類は揃って動く（昔の画面の行進）。
  //   向きでは回さない（昔のゲームの敵は画面の正面を向いている）。種類・色・大きさ・コマごとに1枚作り置き＝数百体でも貼るだけ
  enemySprite(tname, color, r, frame) {
    const res = this.spriteRes();
    const f = frame ? 1 : 0;
    const key = tname + color + r + '#' + f + '@' + res;
    this._enm = this._enm || {};
    if (this._enm[key]) return this._enm[key];
    const h = r + 6;
    const cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(h * 2 * res);
    const c = cv.getContext('2d'); c.setTransform(res, 0, 0, res, h * res, h * res);
    const pix = ENEMY_PIX[tname] || ENEMY_PIX.grunt;
    const rows = pix[f] || pix[0];
    const W = rows[0].length, H = rows.length;
    const p = (r * 2.15) / Math.max(W, H);          // 1ドットの大きさ
    const x0 = -W * p / 2, y0 = -H * p / 2;
    const each = (fn) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const ch = rows[y][x]; if (ch !== '.') fn(x0 + x * p, y0 + y * p, ch); } };
    // 暗い縁取り（重なったときに何体いるか読めるように・以前からの理由）
    c.fillStyle = 'rgba(0,0,0,0.8)';
    each((x, y) => c.fillRect(x - p * 0.35, y - p * 0.35, p * 1.7, p * 1.7));
    // 体：色の光をまとわせる
    c.save(); c.shadowColor = color; c.shadowBlur = Math.max(3, p * 1.4);
    c.fillStyle = color;
    each((x, y, ch) => { if (ch === '#') c.fillRect(x, y, p + 0.3, p + 0.3); });
    c.restore();
    // 上から当たる光（上ほど明るく、下ほど沈む）
    c.save(); c.globalCompositeOperation = 'source-atop';
    const g = c.createLinearGradient(0, y0, 0, y0 + H * p);
    g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(0.45, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.4)');
    c.fillStyle = g; c.fillRect(x0 - p, y0 - p, W * p + p * 2, H * p + p * 2);
    c.restore();
    // 目（o）：白く光る
    c.save(); c.shadowColor = '#fff'; c.shadowBlur = p * 1.2; c.fillStyle = '#fff';
    each((x, y, ch) => { if (ch === 'o') c.fillRect(x, y, p + 0.3, p + 0.3); });
    c.restore();
    return (this._enm[key] = { cv, h });
  },

  // 砲身の長さ（発砲の火を出す位置）
  barrelLen(u) {
    // ドットの絵（1ドット2.4px）にしたので、前の長さの1.2倍（2026-09-28）
    return this._barrelLen0(u) * 1.2;
  },
  _barrelLen0(u) {
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
    if (e.tname === 'nest') {
      // 入れ子：卵形（前後に長い）。中の層は Render.enemies が輪で描く
      ctx.ellipse(0, 0, r * 1.08, r * 0.86, 0, 0, Math.PI * 2);
      return;
    }
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

  // ボスの節目の仕掛け：予告（縁が光る・仕掛けごとの形）と、防壁の効いている間の六角の板。ボスの座標に平行移動済みで呼ぶ
  bossPhaseMark(ctx, e, run) {
    const T = e.tele, W = e.wallT > 0 ? e.wallBy : null;
    if (!T && !W) return;
    const kind = T ? T.kind : 'wall';
    const col = Combat.BOSS_COL[kind];
    const blink = T ? (0.55 + 0.45 * Math.sin(run.time * 26)) : 0.8;
    ctx.save();
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = blink;
    const hexR = e.r + 20;
    if (kind === 'wall') {
      // 防壁：六角の板が体を囲む（予告では点滅・効いている間は据わる）
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * hexR, Math.sin(a) * hexR); }
      ctx.closePath(); ctx.stroke();
      if (!T) { ctx.globalAlpha = 0.14; ctx.fill(); }
    } else if (kind === 'jump') {
      // 跳躍：進む向きへ矢羽（>>>）が並ぶ。向かう先が分かる
      ctx.rotate(e.ang || 0);
      for (let i = 0; i < 3; i++) {
        const x = e.r + 12 + i * 11;
        ctx.globalAlpha = blink * (1 - i * 0.25);
        ctx.beginPath(); ctx.moveTo(x, -9); ctx.lineTo(x + 8, 0); ctx.lineTo(x, 9); ctx.stroke();
      }
    } else {
      // 沈黙：止められる範囲を点線の輪で見せる（予告のあいだだけ）
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(0, 0, BAL.bossJamR, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.07; ctx.fill();
    }
    ctx.restore();
  },

  // ボス3体の体（1体ずつ線で描く。数は多くても数体なので、作り置きの絵にはしない）。ボスの座標に平行移動済みで呼ぶ。
  //   ワーム＝丸い頭に目と牙・あとに節がつながる（e.trail）／ルートキット＝大きな棘の冠をかぶった暗い体と赤い単眼／
  //   ジャマー＝装甲板の八角・回る歯車・アンテナと電波（機械）。col は体の色（ダメージを受けた瞬間は白）
  bossBody(ctx, e, run, col) {
    const r = e.r, t = run.time || 0, bk = e.bk;
    const flash = col === '#ffffff';
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const disc = (x, y, rr, fill, stroke, lw) => {
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
    };
    const ngon = (n, rr, rot) => { ctx.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i * Math.PI * 2 / n; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); };
    if (bk === 'worm') {
      // 節：頭に近いほど大きい。うねるように少し揺れる
      const T = e.trail || [];
      for (let i = T.length - 1; i >= 0; i--) {
        const rr = r * (0.88 - i * 0.1);
        const wob = Math.sin(t * 5 + i * 1.3) * 2;
        ctx.save(); ctx.translate(T[i].x - e.x, T[i].y - e.y + wob);
        disc(0, 0, rr + 1.5, 'rgba(0,0,0,0.75)');
        disc(0, 0, rr, flash ? '#fff' : (i % 2 ? '#3fae7e' : '#58e0a0'), '#0b3d2a', 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, rr * 0.62, Math.PI * 1.1, Math.PI * 1.8); ctx.stroke();
        ctx.restore();
      }
      const a = e.ang || 0;
      ctx.save(); ctx.rotate(a);
      disc(0, 0, r + 2, 'rgba(0,0,0,0.75)');
      disc(0, 0, r, flash ? '#fff' : '#7bf0b8', '#0b3d2a', 2.5);
      ctx.fillStyle = flash ? '#ddd' : '#2a8a60';        // 頭の背の模様
      ctx.beginPath(); ctx.arc(-r * 0.2, 0, r * 0.55, Math.PI * 0.55, Math.PI * 1.45, true); ctx.fill();
      ctx.fillStyle = '#fff';                            // 目（前向きに2つ）
      disc(r * 0.35, -r * 0.42, r * 0.2, '#fff'); disc(r * 0.35, r * 0.42, r * 0.2, '#fff');
      disc(r * 0.42, -r * 0.42, r * 0.09, '#103a28'); disc(r * 0.42, r * 0.42, r * 0.09, '#103a28');
      ctx.fillStyle = '#fff3c8';                         // 牙
      const open = 0.5 + 0.5 * Math.sin(t * 7);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(r * 0.85, s * r * 0.12); ctx.lineTo(r * 1.45, s * (r * 0.3 + open * 4)); ctx.lineTo(r * 0.95, s * r * 0.45); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    } else if (bk === 'rootkit') {
      // 棘の冠：脈打つ12本。大きい体の中に、赤い単眼
      const beat = 0.5 + 0.5 * Math.sin(t * 4);
      ctx.fillStyle = flash ? '#fff' : '#3a1020';
      ctx.strokeStyle = flash ? '#fff' : col; ctx.lineWidth = 2.5;
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6 + t * 0.15, L = r * (1.22 + (i % 2) * 0.16 + beat * 0.05);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.2) * r * 0.9, Math.sin(a - 0.2) * r * 0.9);
        ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L);
        ctx.lineTo(Math.cos(a + 0.2) * r * 0.9, Math.sin(a + 0.2) * r * 0.9);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      disc(0, 0, r * 0.95, flash ? '#fff' : '#1a0a12', col, 3);
      ctx.strokeStyle = flash ? '#ccc' : 'rgba(255,77,106,0.55)'; ctx.lineWidth = 2;
      ngon(6, r * 0.7, -t * 0.3); ctx.stroke();
      ngon(6, r * 0.45, t * 0.5); ctx.stroke();
      ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 10 + beat * 10;
      disc(0, 0, r * 0.26, flash ? '#fff' : '#ff4d6a');
      ctx.restore();
      disc(0, 0, r * 0.1, '#fff3f3');
    } else {
      // ジャマー：装甲板の八角・四隅のボルト・回る歯車・中央のレンズ・アンテナと電波
      const spin = t * 1.2;
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ngon(8, r * 1.12, Math.PI / 8); ctx.fill();
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, flash ? '#fff' : '#d3dfeb'); g.addColorStop(0.5, flash ? '#fff' : '#8ea3b8'); g.addColorStop(1, flash ? '#ddd' : '#4f6175');
      ctx.fillStyle = g; ctx.strokeStyle = '#1f2a36'; ctx.lineWidth = 2.5;
      ngon(8, r, Math.PI / 8); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(20,30,42,0.55)'; ctx.lineWidth = 1.5;     // 装甲板の継ぎ目
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); ctx.lineTo(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98); ctx.stroke(); }
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) disc(sx * r * 0.62, sy * r * 0.62, 1.8, '#27323f');   // ボルト
      // 歯車
      ctx.save(); ctx.rotate(spin);
      ctx.fillStyle = flash ? '#ccc' : '#364556'; ctx.strokeStyle = '#141c26'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a0 = i * Math.PI / 5, a1 = a0 + Math.PI / 10;
        ctx.lineTo(Math.cos(a0) * r * 0.56, Math.sin(a0) * r * 0.56); ctx.lineTo(Math.cos(a0 + 0.06) * r * 0.7, Math.sin(a0 + 0.06) * r * 0.7);
        ctx.lineTo(Math.cos(a1 - 0.06) * r * 0.7, Math.sin(a1 - 0.06) * r * 0.7); ctx.lineTo(Math.cos(a1) * r * 0.56, Math.sin(a1) * r * 0.56);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 8;
      disc(0, 0, r * 0.26, flash ? '#fff' : '#ffb347', '#3a2208', 2);
      ctx.restore();
      disc(-r * 0.07, -r * 0.08, r * 0.08, 'rgba(255,255,255,0.85)');
      // アンテナ2本と、先の電波（脈打つ）
      ctx.strokeStyle = '#1f2a36'; ctx.lineWidth = 2.5;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * r * 0.4, -r * 0.92); ctx.lineTo(s * r * 0.7, -r * 1.6); ctx.stroke();
        disc(s * r * 0.7, -r * 1.6, 3, flash ? '#fff' : '#ff5a5a');
        const k = (t * 1.6 + (s > 0 ? 0.5 : 0)) % 1;
        ctx.strokeStyle = 'rgba(211,107,255,' + (0.7 * (1 - k)).toFixed(2) + ')'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(s * r * 0.7, -r * 1.6, 5 + k * 12, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        ctx.strokeStyle = '#1f2a36'; ctx.lineWidth = 2.5;
      }
    }
    ctx.restore();
  },

  enemies(ctx, run) {
    // **1体ずつ塗っていたものを、まとめて塗る。**（2026-09-28・ユーザー「泡と毒ガスが極端に重い」）
    //   敵が数百体いると、影・毒の泡・閉じ込めの輪を1体ずつ塗る回数が効いてくる（毒の泡は1体3回・400体で1,200回）。
    //   足元の影は全員ぶんを1回、毒の泡は薄さ3段で3回、閉じ込めの輪は1回で塗る（下の _poison / _stun）
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    for (const e of run.enemies) {
      const cx = e.x + 1.5, cy = e.y + e.r * 0.55;
      ctx.moveTo(cx + e.r * 0.95, cy);
      ctx.ellipse(cx, cy, e.r * 0.95, e.r * 0.42, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    const poison = _poisonBuf, stun = _stunBuf;
    poison.length = 0; stun.length = 0;
    for (const e of run.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      // **体は作り置きのドット絵**（enemySprite・ENEMY_PIX）。数百体でも貼るだけ。
      //   向きでは回さない（昔のゲームの敵は正面を向いている）。同じ種類は揃って2コマで足踏みする（2026-09-28）
      const col = e.hitFlash > 0 ? '#ffffff' : e.chill > 0 ? '#7fd8ff' : e.burnT > 0 ? '#ff9a4a' : e.color;
      if (e.boss && e.bk) this.bossBody(ctx, e, run, e.hitFlash > 0 ? '#ffffff' : e.color);
      else {
        const spr = this.enemySprite(e.boss ? 'boss' : e.tname, col, e.r, (((run.time || 0) * 3.2) | 0) & 1);
        ctx.drawImage(spr.cv, -spr.h, -spr.h, spr.h * 2, spr.h * 2);
      }
      // 湧き口のバリアに弾かれた（combat.js の damage）
      if (e.shieldT > 0) {
        ctx.strokeStyle = 'rgba(130,215,255,' + Math.min(1, e.shieldT * 6).toFixed(2) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 4, 0, Math.PI * 2); ctx.stroke();
      }

      // ボス：残りHPを輪で見せる。**DPSチェックなので、減り方が見えないと意味がない**
      if (e.boss) {
        // **脈打つ赤い気配。コアに近いほど速く・強く。**（2026-09-28・ボスの作り直し。歩いて来る脅威に見せる）
        //   e.dist はコアまでの残りのタイル数。10タイルを切ると急かす
        const near = Util.clamp(1 - (e.dist || 0) / 10, 0, 1);
        const beat = 0.5 + 0.5 * Math.sin(run.time * (3 + near * 9));
        ctx.save();
        ctx.strokeStyle = 'rgba(255,60,80,' + (0.25 + 0.45 * beat * (0.5 + near * 0.5)).toFixed(2) + ')';
        ctx.lineWidth = 3 + near * 3;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 12 + beat * (6 + near * 8), 0, Math.PI * 2); ctx.stroke();
        const f = Math.max(0, e.hp / e.maxHp);
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = f < 0.25 ? '#ff5a5a' : '#ffb347'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); ctx.stroke();
        // 節目の目盛り（HP の輪の上の 75・50・25%。使い終えた仕掛けは消える）
        for (let k = e.ph || 0; k < 3; k++) {
          const ak = -Math.PI / 2 + Math.PI * 2 * BAL.bossPhaseAt[k];
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(Math.cos(ak) * (e.r + 2), Math.sin(ak) * (e.r + 2)); ctx.lineTo(Math.cos(ak) * (e.r + 11), Math.sin(ak) * (e.r + 11)); ctx.stroke();
        }
        this.bossPhaseMark(ctx, e, run);
        ctx.restore();
      }
      // 装甲：厚い縁。**残っている装甲が見えるように**
      if (e.armor > 0) {
        ctx.strokeStyle = 'rgba(180,220,255,0.65)';
        ctx.lineWidth = 2.6;
        ctx.strokeRect(-e.r * 1.2, -e.r * 1.05, e.r * 2.4, e.r * 2.1);
      }
      // 入れ子：中の層を輪で見せる（残りの層 − 1 本。最後の層は輪なし）
      if (e.nest > 1) {
        ctx.strokeStyle = 'rgba(255,240,220,0.7)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let k = 1; k < e.nest; k++) { const rr = e.r * (1 - 0.28 * k); ctx.moveTo(rr, 0); ctx.arc(0, 0, rr, 0, Math.PI * 2); }
        ctx.stroke();
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

      // 耐性（2026-09-30 段3）：縁に耐性の色の短い弧を3本（RESIST_INFO の色）。感電の輪（1周）と見分けられるよう、切れた輪にする
      if (e.res) {
        for (const k in e.res) {
          const ri = RESIST_INFO[k];
          if (!ri) continue;
          // 暗い縁取りの上に色の弧（暗い盤の上でも明るい敵の上でも見える。以前は細い1本で、重量の灰色が特に埋もれていた）
          ctx.beginPath();
          for (let i = 0; i < 3; i++) { const a0 = i * 2.094 + 0.35; ctx.moveTo(e.x + Math.cos(a0) * (e.r + 3), e.y + Math.sin(a0) * (e.r + 3)); ctx.arc(e.x, e.y, e.r + 3, a0, a0 + 1.3); }
          ctx.lineCap = 'round';
          ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = k === 'heavy' ? 5.2 : 4.2; ctx.stroke();
          ctx.strokeStyle = ri.color; ctx.lineWidth = k === 'heavy' ? 3.2 : 2.4; ctx.stroke();
          ctx.lineCap = 'butt';
        }
      }

      if (e.stun > 0) {   // 泡に閉じ込められている（輪はあとでまとめて塗る）
        stun.push(e);
      } else if (e.shock > 0) {
        ctx.strokeStyle = 'rgba(190,160,255,0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2); ctx.stroke();
      }
      // 戦術核の被爆：黄緑の二重の輪（放射のマーク）。残り1秒を切ると点滅する
      if (e.nukeT > 0 && (e.nukeT > 1 || ((run.time * 8) | 0) % 2 === 0)) {
        ctx.strokeStyle = 'rgba(214,255,60,0.9)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 3; i++) { const a0 = i * 2.094 + run.time * 1.5; ctx.moveTo(e.x + Math.cos(a0) * (e.r + 1), e.y + Math.sin(a0) * (e.r + 1)); ctx.arc(e.x, e.y, e.r + 1, a0, a0 + 0.7); }
        ctx.stroke();
      }
      // 触手の印（吊るし上げ・照準固定・焼き印）：ピンクの照準の十字。残り0.7秒を切ると点滅する
      if (e.tntT > 0 && (e.tntT > 0.7 || ((run.time * 8) | 0) % 2 === 0)) {
        const rr = e.r + 7;
        ctx.strokeStyle = 'rgba(255,138,224,0.95)'; ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) { const a0 = i * 1.5708 + 0.785; ctx.moveTo(e.x + Math.cos(a0) * (rr - 4), e.y + Math.sin(a0) * (rr - 4)); ctx.lineTo(e.x + Math.cos(a0) * (rr + 3), e.y + Math.sin(a0) * (rr + 3)); }
        ctx.stroke();
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
      if (e.poisonT > 0) poison.push(e);   // 泡はあとでまとめて塗る
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
    // 泡に閉じ込められている敵の輪（まとめて1回ずつ）
    if (stun.length) {
      ctx.beginPath();
      for (const e of stun) { ctx.moveTo(e.x + e.r + 6, e.y); ctx.arc(e.x, e.y, e.r + 6, 0, Math.PI * 2); }
      ctx.fillStyle = 'rgba(140,216,255,0.16)'; ctx.fill();
      ctx.strokeStyle = 'rgba(160,220,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    }
    // **毒を受けている敵の泡。**（ユーザー要望6・2026-09-22）泡が立ちのぼる。`poisonT` は雲を出たあとも続く（BAL.poisonDur）
    //   前は泡1つごとに薄さを変えて塗っていた。いまは上るほど薄くなるのを3段に分けて、段ごとに全員ぶんを1回で塗る
    if (poison.length) {
      ctx.fillStyle = 'rgba(198,255,122,0.8)';
      for (let band = 0; band < 3; band++) {
        ctx.globalAlpha = 0.8 * (1 - (band + 0.5) / 3);
        ctx.beginPath();
        for (const e of poison) {
          const t = run.time * 2.2 + e.y * 0.07;
          for (let i = 0; i < 3; i++) {
            const q = (t + i * 0.37) % 1;
            if (((q * 3) | 0) !== band) continue;
            const bx = e.x + Math.sin((t + i) * 3.1) * e.r * 0.6;
            const by = e.y - q * (e.r * 2.2);
            const rr = 1.6 + (1 - q) * 1.6;
            ctx.moveTo(bx + rr, by); ctx.arc(bx, by, rr, 0, 7);
          }
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
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
      } else if (f.type === 'bossdown') {
        // **ボスを倒した位置**（0929p・結果画面と同じ金の六角）：白い閃光 → 六角の輪が3重に広がり、六角のデータ片が16個弾ける。1.1秒・一度きり
        const hex = (cx, cy, r, rot) => {
          ctx.beginPath();
          for (let i = 0; i < 6; i++) { const a = rot + Math.PI / 3 * i; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.closePath();
        };
        if (k < 0.22) {
          ctx.globalAlpha = (1 - k / 0.22) * 0.6; ctx.fillStyle = '#fff3c8';
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 3.4, 0, Math.PI * 2); ctx.fill();
        }
        for (let j = 0; j < 3; j++) {
          const q = (k - j * 0.1) / 0.8;
          if (q <= 0 || q >= 1) continue;
          ctx.globalAlpha = (1 - q) * 0.9;
          ctx.strokeStyle = j === 0 ? '#fff3c8' : '#ffc24a';
          ctx.lineWidth = 7 * (1 - q) + 1.6;
          hex(f.x, f.y, f.r * (1.2 + q * 9), Math.PI / 6);
          ctx.stroke();
        }
        const kk = Math.min(1, k / 0.9), dd = 1 - Math.pow(1 - kk, 2);
        ctx.globalAlpha = 1 - k;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.25;
          const d = f.r * (5 + ((i * 7919) % 100) / 100 * 8) * dd;
          const s = (9 - k * 6.5) * (0.7 + ((i * 104729) % 60) / 100);
          if (s <= 0.3) continue;
          ctx.fillStyle = i % 3 === 0 ? '#fff3c8' : '#ffc24a';
          hex(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, s, a);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
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
      } else if (f.type === 'tntStab') {
        this.tntStab(ctx, f, k);
      } else if (f.type === 'tntSweep') {
        this.tntSweep(ctx, f, k);
      } else if (f.type === 'tntCut') {
        this.tntCut(ctx, f, k);
      } else if (f.type === 'tntTag') {
        this.tntTag(ctx, f, k);
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
        //   **2026-09-28：血ではなく、四角いドットの破片が弾ける**（企画書 §13「敵は生き物ではない」§16「パンッと弾け飛ぶ」・ユーザー了承）。
        //   向き・色・量はそのまま。最初の一瞬だけ、四角い光の輪が広がる
        if (k < 0.3) {
          const q = k / 0.3, w = 6 + q * 18;
          ctx.globalAlpha = (1 - q) * 0.8;
          ctx.strokeStyle = f.color; ctx.lineWidth = 2 * (1 - q) + 0.6;
          ctx.strokeRect(f.x - w / 2, f.y - w / 2, w, w);
        }
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
          const y = f.y + Math.sin(a) * d + k * k * 4;     // ほんの少し落ちる（データ片なので重くない）
          const r = (2.6 - k * 1.8) * (0.7 + ((i * 104729) % 60) / 100);
          if (r <= 0.2) continue;
          const q = r * 1.7;
          ctx.fillRect(x - q / 2, y - q / 2, q, q);
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
      } else if (f.type === 'laser') {
        // レーザーライフルの光線（2026-09-30 段3）。**折れ線のまま描く**ので、壁で折り返したのが見える。
        //   外側の光（太い・薄い）→ 色の芯 → 白い芯。貫いた数だけ少し太くなる。消えるときは細くなりながら薄れる
        const pts = f.pts;
        const wd = (f.w || 20) * (1 - k * 0.6) * (1 + Math.min(f.n || 0, 10) * 0.03);
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y);
        ctx.globalAlpha = (1 - k) * 0.22; ctx.strokeStyle = f.color; ctx.lineWidth = wd * 2;   ctx.stroke();
        ctx.globalAlpha = (1 - k) * 0.85; ctx.lineWidth = wd * 0.7; ctx.stroke();
        ctx.globalAlpha = (1 - k);        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, wd * 0.22); ctx.stroke();
        // 折り返した点に小さな火花
        ctx.fillStyle = '#ffffff';
        for (let i = 1; i < pts.length - 1; i++) {
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, wd * 0.45 * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
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
    // ダメージ数字は ⚙ で消せる（企画書 §23「ダメージ数字は最優先ではない。設定で非表示にできてよい」）
    if (Game.perm.hideDmgNum) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const s = Math.max(0.2, this.scale || 1);
    const fn = Math.round(12 / s), fc = Math.round(16 / s);
    ctx.lineJoin = 'round';
    // **文字を動きとして見せる。**（企画書 §17「単純な数字のポップアップではなく、出現・拡散・消失をモーションとして」・2026-09-28）
    //   出る：大きく飛び出してから収まる（最初の一瞬は白く光る。会心は赤と青に色がずれる）
    //   消える：1文字ずつ間が開いていきながら薄れる（文字がほどけていく）
    //   字は等幅（数字の表示器の手触り）。数字は同時に40まで（combat.js）なので、1つずつ変換しても重くならない
    ctx.font = '700 ' + fn + 'px "Share Tech Mono",ui-monospace,Consolas,monospace';
    for (const n of run.nums) {
      const k = n.t / n.life;
      const pop = k < 0.14 ? 1 + 0.7 * Math.pow(1 - k / 0.14, 2) : 1;
      const out = k < 0.62 ? 0 : (k - 0.62) / 0.38;
      ctx.globalAlpha = 1 - out * out;
      ctx.font = '700 ' + (n.crit ? fc : fn) + 'px "Share Tech Mono",ui-monospace,Consolas,monospace';
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.scale(pop, pop);
      ctx.lineWidth = 3 / s;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      const col = k < 0.07 ? '#ffffff' : n.crit ? '#ffb43c' : n.color;
      if (!out) {
        if (n.crit && k < 0.22) {
          const d = 2.2 / s * (1 - k / 0.22);
          ctx.fillStyle = 'rgba(255,60,90,0.7)'; ctx.fillText(n.txt, -d, 0);
          ctx.fillStyle = 'rgba(60,220,255,0.7)'; ctx.fillText(n.txt, d, 0);
        }
        ctx.strokeText(n.txt, 0, 0);
        ctx.fillStyle = col; ctx.fillText(n.txt, 0, 0);
      } else {
        // ほどける：字の間が開いていく
        const gap = out * 5 / s;
        const w = [];
        let total = 0;
        for (const ch of n.txt) { const cw = ctx.measureText(ch).width; w.push(cw); total += cw; }
        total += gap * (w.length - 1);
        let x = -total / 2, i = 0;
        ctx.fillStyle = col;
        for (const ch of n.txt) {
          const cx = x + w[i] / 2;
          ctx.strokeText(ch, cx, -out * i * 0.6 / s);
          ctx.fillText(ch, cx, -out * i * 0.6 / s);
          x += w[i] + gap; i++;
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};
