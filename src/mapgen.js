// ---------------------------------------------------------------
// mapgen.js : マップを「部品の組み合わせ」から作る
//
//   **なぜ作ったか**（ユーザー 2026-09-21）
//   > 「マップがコピペすぎるのがよくないね。マップの形状とかで難易度も調節していく
//   >   予定だから、早めにグリッド式のマップは脱却したい。あと、敵の出方も、
//   >   一マスからってよりこの入り口からゾロゾロと出てくる感じがいい。
//   >   グリッドじゃなくて1000組み合わせで作れない？」
//
//   30章ぶんのマップは tools/gen30.py が「型（幕ごとに固定）＋乱数」で作っていた。
//   同じ型の章は通路の数まで一致していて（第15〜20章はどれも通路94・地面206）、
//   乱数が効いているのは端の数タイルだけだった。
//
//   **やり方：通路を「折れ線＋幅」で持ち、出撃するときにタイルへ焼く。**
//     1. 出現口からコアへ向かう**折れ線**を、部品（曲がり方と走る長さの組）を
//        つないで作る。角度は自由なので、45度の縛りが無くなる
//     2. Catmull-Rom で滑らかにしてから、タイルの中心が通路の幅に入るかで焼く
//     3. 焼いた結果はこれまでとまったく同じ「#/./S/C」の文字列
//
//   **3が肝。** 経路探索（BFS）・押し合い（Crowd）・設置（buildable）・当たり判定は
//   ぜんぶタイル前提のまま動く。ユーザーの指定「設置はタイルのまま」もそのまま守れる。
//   絵だけは vec（折れ線と幅）を見て滑らかに描ける。
//
//   **出現口は「壁に開いた穴」。** 1タイルではなく数タイルぶんの幅を持たせて、
//   敵がそこからゾロゾロ出てくる形にする（`holeW`）。
//
//   組み合わせの数：出現口の数と位置 × コアの位置 × 部品列 × 幅。
//   実測は tools/mapcheck.html（何通りできるか、詰まりが無いか）
// ---------------------------------------------------------------
'use strict';

const MapGen = {
  // **盤を広くした。**（2026-09-22・プレイヤー報告）
  //   > 「全体的には、置けすぎ、というのが率直な感想です。20基はやりすぎですが、
  //   >   仮に20基置けるなら広大なマップを用意するなり、
  //   >   ステージに多少のギミックを入れるのがいいです」
  //   置ける数を 52 → 11 に絞った（Game.slotsTotal）うえで、盤も広げる。
  //   15×21 → 21×27（面積で1.8倍）。**画面に収まらないぶんは見渡せる**
  //   （Render.canPan と小地図が既にある）。
  //   手で書いた第1〜2章は 15×21 のまま（あそこは狭いほうが教えやすい）
  //   **【2026-09-22】21×27 から戻した。**
  //   広げると画面に収まらず、指で見渡す必要が出る。
  //   ユーザー「マップを動かすのはもう少し後にしましょう」。
  //   **盤は1画面に収まる大きさに保つ。**広げるのは、見渡す仕組みを入れてから
  COLS: 15,
  ROWS: 21,

  // ---- 種から作る乱数（同じ種なら必ず同じマップ）----
  //   章ごとに違い、転生で作り直せるように、種は「盤面の種 × 章」で決める
  rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  // ---- 部品 ----
  //   1つの部品＝「どれだけ曲がって、どれだけ走るか」。
  //   これをつなぐと通路の"癖"になる。**タイルに縛られないので角度は自由。**
  //   bend は1歩あたりの曲がり（rad）、run は走る長さ（px）、steps は刻む回数
  PARTS: {
    straight: { bend: 0.00, run: 150, steps: 3, w: 1.00 },
    easyL:    { bend: -0.22, run: 130, steps: 4, w: 1.00 },
    easyR:    { bend: 0.22, run: 130, steps: 4, w: 1.00 },
    hardL:    { bend: -0.46, run: 95, steps: 4, w: 0.92 },
    hardR:    { bend: 0.46, run: 95, steps: 4, w: 0.92 },
    chicane:  { bend: 0.38, run: 80, steps: 3, w: 0.95, flip: true },
    switchbk: { bend: 0.62, run: 70, steps: 5, w: 0.88 },
    wide:     { bend: -0.12, run: 140, steps: 3, w: 1.35 },
    pinch:    { bend: 0.14, run: 110, steps: 3, w: 0.70 },
  },

  PART_IDS: ['straight', 'easyL', 'easyR', 'hardL', 'hardR', 'chicane', 'switchbk', 'wide', 'pinch'],

  // 出現口を置ける辺と、そのときの進入方向
  SIDES: [
    { id: 'top',    ang: Math.PI / 2 },
    { id: 'bottom', ang: -Math.PI / 2 },
    { id: 'left',   ang: 0 },
    { id: 'right',  ang: Math.PI },
  ],

  // ---- 1本の通路（出現口 → 経由点… → コア）----
  //
  //   **経由点が要る。** 最初は出現口からコアへ直接引いていたが、
  //   引きが働くぶん必ず「角からコアへの太い斜め1本」になり、
  //   1000枚作っても topology が1種類しかなかった（経路長も下限20〜25に張り付き、
  //   454枚が「経路が短すぎる」で作れなかった）。
  //   **遠回りさせる先を先に決めると、L字・S字・ぐるり、が自然に出る。**
  //
  //   部品は「経由点のあいだをどう走るか」を決める。曲がり方に癖が出るのはここ
  path(rnd, from, ang, targets, parts, W, H) {
    const pts = [{ x: from.x, y: from.y }];
    let x = from.x, y = from.y, a = ang, ti = 0, guard = 0;
    const M = 46;                                  // 壁からの余白（px）
    let pi = 0, ps = 0;
    while (ti < targets.length && guard++ < 260) {
      const p = this.PARTS[parts[pi % parts.length]];
      let bend = p.bend;
      if (p.flip && ps >= (p.steps >> 1)) bend = -bend;
      a += bend;
      const t = targets[ti];
      const d = Math.hypot(t.x - x, t.y - y);
      // 最後（コア）だけは強く引く。途中の経由点はゆるく寄るだけにして癖を残す
      const last = ti === targets.length - 1;
      const pull = last ? Math.min(0.42, 0.06 + 170 / Math.max(140, d))
                        : Math.min(0.20, 0.03 + 70 / Math.max(160, d));
      let da = Math.atan2(t.y - y, t.x - x) - a;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      a += da * pull;
      const step = p.run / p.steps;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      x = Math.max(M, Math.min(W - M, x));
      y = Math.max(M, Math.min(H - M, y));
      pts.push({ x, y });
      if (Math.hypot(t.x - x, t.y - y) < (last ? 44 : 90)) {
        if (last) { pts.push({ x: t.x, y: t.y }); return pts; }
        ti++;
      }
      if (++ps >= p.steps) { ps = 0; pi++; }
    }
    const t = targets[targets.length - 1];
    pts.push({ x: t.x, y: t.y });
    return pts;
  },

  // Catmull-Rom で折れ線を滑らかにする。**これで「45度しかない」が消える**
  smooth(pts, per) {
    if (pts.length < 3) return pts.slice();
    const out = [];
    const at = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      for (let s = 0; s < per; s++) {
        const t = s / per, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  },

  // コア手前で通路を絞る。**最後の直線は広場ではなく関所にする。**
  //   絞らないと、通路がコアの周りで扇状に開いて4〜5タイル幅の広場になり、
  //   そこへ敵が横並びで着く。ガトリング4基では覆いきれず、
  //   第1章が突破できない種が出ていた（12個中1個）。
  //   入口側は広いまま（そこは通しても構わない）
  halfAt(lane, i) {
    const n = Math.max(1, lane.pts.length - 1);
    const t = i / n;                                   // 0=入口 1=コア
    const k = t > 0.72 ? 1 - ((t - 0.72) / 0.28) * 0.45 : 1;
    return lane.w * k / 2;
  },

  // ---- 六角セル（ハニカム）----
  //
  //   **通路は六角形の集まりで作る。**（ユーザー 2026-09-21）
  //   > 「なんかキモいから6角形の道とかにしよう、ハニカムで道とかカーブを再現して」
  //
  //   折れ線をそのまま太い帯で描くと、曲がりが丸い管になって
  //   有機的（キモい）に見えた。**折れ線の近くにある六角セルを拾う**形にすると、
  //   同じ曲線を六角の階段で辿るので、曲がりが構造物として読める。
  //
  //   横並びの六角（flat-top）。中心は x = 1.5R·列、y = √3R·(行 + 列が奇数なら½)
  //   大きさは実測で選んだ（40枚・中盤）。**どの大きさでも「道なのに六角の外」は0。**
  //   食い違うのは盤の縁だけ（edge() が縁の通路を壁に戻すため）で、内側は0。
  //     R=24 セル150 ／ R=26 セル129 ／ **R=30 セル97** ／ R=34 セル78 ／ R=38 セル61
  //   30 だと通路（幅92〜140px）に2〜3個ぶん並ぶので、六角として読める
  HEX_R: 30,

  // 線分のまわりにある六角セルだけを見る。
  //   **総当たりにしたら測定器が返ってこなくなった**（六角600個 × 線分200本 × 地図300枚）。
  //   中心の式を逆に解けば、線分の外接矩形にかかる列・行だけに絞れる
  hexRange(x0, y0, x1, y1, pad) {
    const R = this.HEX_R, dx = R * 1.5, dy = Math.sqrt(3) * R;
    return {
      c0: Math.floor((Math.min(x0, x1) - pad - R) / dx) - 1,
      c1: Math.ceil((Math.max(x0, x1) + pad + R) / dx) + 1,
      r0: Math.floor((Math.min(y0, y1) - pad - dy) / dy) - 1,
      r1: Math.ceil((Math.max(y0, y1) + pad + dy) / dy) + 1,
    };
  },

  hexAt(c, r) {
    const R = this.HEX_R, dx = R * 1.5, dy = Math.sqrt(3) * R;
    return { x: c * dx, y: r * dy + (c & 1 ? dy / 2 : 0), c, r };
  },

  // 点が六角の中にあるか（flat-top・中心からのずれで見る）
  inHex(dx, dy, R) {
    dx = Math.abs(dx); dy = Math.abs(dy);
    const h = Math.sqrt(3) / 2 * R;
    if (dx > R || dy > h) return false;
    return R * h - (R / 2) * dy - h * dx >= 0;
  },

  // 六角どうしの隣（flat-top・列が奇数かどうかでずれる）
  // 画素の位置から、そこに乗っている六角セルを返す。
  //   **設置がハニカムになったので要る。**（ユーザー 2026-09-23）
  //   > 「ハニカムの壁の中のデザインをハニカムにしろという指示、これは同じく
  //   >   **武器設置時の置ける場所もハニカムにする**という、システム面での変更でもあります」
  //   中心の式（`hexAt`）を逆に解いて列の当たりを付け、
  //   前後の列と上下の行の候補だけを `inHex` で試す（総当たりにしない）
  hexPick(x, y) {
    const R = this.HEX_R, dx = R * 1.5, dy = Math.sqrt(3) * R;
    const c0 = Math.round(x / dx);
    let best = null, bestD = Infinity;
    for (let c = c0 - 1; c <= c0 + 1; c++) {
      const off = (c & 1) ? dy / 2 : 0;
      const r0 = Math.round((y - off) / dy);
      for (let r = r0 - 1; r <= r0 + 1; r++) {
        const h = this.hexAt(c, r);
        const d = (x - h.x) * (x - h.x) + (y - h.y) * (y - h.y);
        if (d < bestD && this.inHex(x - h.x, y - h.y, R)) { bestD = d; best = { c, r }; }
      }
    }
    // **縁で取りこぼさない。** `inHex` は境界ちょうどで falsy になることがあるので、
    //   どれにも入らなかったときは一番近い中心の六角を返す
    if (!best) {
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        const off = (c & 1) ? dy / 2 : 0;
        const r0 = Math.round((y - off) / dy);
        for (let r = r0 - 1; r <= r0 + 1; r++) {
          const h = this.hexAt(c, r);
          const d = (x - h.x) * (x - h.x) + (y - h.y) * (y - h.y);
          if (d < bestD) { bestD = d; best = { c, r }; }
        }
      }
    }
    return best;
  },

  hexNbr(c, r) {
    return (c & 1)
      ? [[c, r - 1], [c, r + 1], [c - 1, r], [c - 1, r + 1], [c + 1, r], [c + 1, r + 1]]
      : [[c, r - 1], [c, r + 1], [c - 1, r - 1], [c - 1, r], [c + 1, r - 1], [c + 1, r]];
  },

  // **通路の中に取り残された穴を埋める。**
  //   六角セルは「中心が通路の幅に入るか」で拾うので、通路の縁でセルが飛び飛びになり、
  //   道の真ん中に1タイルの柱が残る（`##...#.#.#....#` のような形）。
  //   柱は buildable（置ける地面）なのに、絵では六角に囲まれて道に見えるので、
  //   **絵と規則が食い違う。**
  //   **タイルではなく六角の側で埋める。** タイルを埋めると、こんどは
  //   「通路なのに六角が無い＝絵では地面」という逆のずれが出る
  //   minN … 隣が何個そろったら埋めるか（既定4）。
  //     **放射状（spokes）の盤では6にする。**4のままだと、
  //     中央へ集まってくる扇と扇の「あいだ」が埋まって、
  //     盤ぜんぶが一枚の広間になる（実測：通路175〜249タイル）。
  //     6＝完全に囲まれた穴だけ埋める、なら道は分かれたまま
  fillHexGaps(hexes, W, H, minN) {
    minN = minN || 4;
    const R = this.HEX_R;
    const key = (c, r) => c + ',' + r;
    const set = {};
    for (const h of hexes) set[key(h.c, h.r)] = 1;
    for (let pass = 0; pass < 2; pass++) {
      const add = [];
      const seen = {};
      for (const h of hexes) {
        for (const [c, r] of this.hexNbr(h.c, h.r)) {
          const k = key(c, r);
          if (set[k] || seen[k]) continue;
          seen[k] = 1;
          let n = 0;
          for (const [c2, r2] of this.hexNbr(c, r)) if (set[key(c2, r2)]) n++;
          if (n < minN) continue;
          const hx = this.hexAt(c, r);
          if (hx.x < -R || hx.y < -R || hx.x > W + R || hx.y > H + R) continue;
          add.push(hx);
        }
      }
      if (!add.length) break;
      for (const h of add) { set[key(h.c, h.r)] = 1; hexes.push(h); }
    }
    return hexes;
  },

  // 通路にかかる六角セルを拾う
  hexesFor(lanes, W, H) {
    const R = this.HEX_R, seen = {}, out = [];
    for (const lane of lanes) {
      const pts = lane.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const half = this.halfAt(lane, i);
        const g = this.hexRange(a.x, a.y, b.x, b.y, half);
        for (let c = g.c0; c <= g.c1; c++) {
          for (let r = g.r0; r <= g.r1; r++) {
            const k = c + ',' + r;
            if (seen[k]) continue;
            const hx = this.hexAt(c, r);
            if (hx.x < -R || hx.y < -R || hx.x > W + R || hx.y > H + R) continue;
            if (Util.segDist2(a.x, a.y, b.x, b.y, hx.x, hx.y) > half * half) continue;
            seen[k] = 1; out.push(hx);
          }
        }
      }
    }
    return out;
  },

  // ---- ギミック（地形の仕掛け）----
  //
  //   **六角セルに「性質」を持たせる。**（ユーザー承認 2026-09-22）
  //   > 「仮に20基置けるなら広大なマップを用意するなり、
  //   >   ステージに多少のギミックを入れるのがいいです」
  //   > 「（六角マップの上に作って）はい、それで構いません」
  //
  //   数値ではなく**地形で難易度を作る**ための最初の一歩。
  //     減速 … 通る敵が遅くなる。置いた武器が長く撃てる ＝ 守りやすい場所
  //     加速 … 通る敵が速くなる。抜けられやすい ＝ 守りにくい場所
  //   章が深いほど加速が増え、減速が減る。**形で難易度が動く**
  //   （名前はユーザー指定 2026-09-22：「幾何学的模様に泥と坂はやや変な印象が
  //     あるため、加速と減速で良いでしょう」）
  ZONE: { none: 0, mud: 1, slope: 2 },

  tagZones(hexes, rnd, d) {
    // **いったん切ってある。**（ユーザー 2026-09-22）
    //   > 「ハニカムマップに緑やピンクの謎のマス目がありますが、
    //   >   装飾なら混乱を招くため一旦やめておきましょう」
    //   装飾ではなく仕掛け（泥＝敵が遅くなる／坂＝速くなる）だったが、
    //   **見て意味が分からない時点で仕掛けとして成立していない。**
    //   凡例を出すなど「何のマスか」が伝わる形にしてから戻す。
    //   BAL.zoneOn を true にすれば、そのまま復活する
    if (!BAL.zoneOn) return hexes;
    // 出入口とコアの近くには置かない（置いた瞬間に詰む形を避ける）
    const n = hexes.length;
    const mudN = Math.round(n * (0.16 - 0.10 * d));     // 序盤ほど減速が多い
    const slpN = Math.round(n * (0.02 + 0.12 * d));     // 終盤ほど加速が多い
    const idx = hexes.map((_, i) => i).sort(() => rnd() - 0.5);
    let k = 0;
    for (let i = 0; i < mudN && k < idx.length; i++, k++) hexes[idx[k]].zone = this.ZONE.mud;
    for (let i = 0; i < slpN && k < idx.length; i++, k++) hexes[idx[k]].zone = this.ZONE.slope;
    return hexes;
  },

  // ---- 焼く ----
  //   タイルの中心が、拾った六角セルのどれかの中にあれば通路。
  //   **ここでタイルへ落とすので、この先（BFS・Crowd・設置）は何も変わらない**
  bake(lanes, core, holes, W, H, hexes) {
    const cols = Math.round(W / TILE), rows = Math.round(H / TILE);
    const g = [];
    for (let r = 0; r < rows; r++) g.push(new Array(cols).fill('#'));

    const R = this.HEX_R;
    const zone = new Array(cols * rows).fill(0);
    for (const hx of hexes) {
      const minc = Math.max(0, Math.floor((hx.x - R) / TILE));
      const maxc = Math.min(cols - 1, Math.ceil((hx.x + R) / TILE));
      const minr = Math.max(0, Math.floor((hx.y - R) / TILE));
      const maxr = Math.min(rows - 1, Math.ceil((hx.y + R) / TILE));
      for (let r = minr; r <= maxr; r++) {
        for (let c = minc; c <= maxc; c++) {
          const cx = c * TILE + TILE / 2, cy = r * TILE + TILE / 2;
          // **タイル1枚につき5点で見る。**（2026-09-23・実測で作り直した）
          //   中心1点だけで判定すると、**通路が砕ける**。
          //   六角は幅60・高さ52、タイルは40なので、**六角1つが覆うタイルは約1.5枚**。
          //   隣り合う六角でも、覆うタイルが上下左右で繋がらない組み合わせが出て、
          //   焼いたあとの通路が断片に割れていた
          //   （実測：19×27 の1枚で、通路202タイルが**8個の島**になっていた。
          //     コア63・口58・口42・小片5個で、どの口からもコアへ届かない）。
          //   中心＋四隅（内側に寄せた点）のどれか2点が六角に入っていれば通路にする。
          //   **2点にするのは、絵とのずれを半タイル未満に抑えるため**
          //   （1点だと、壁として描いた六角の縁を歩けてしまう）
          const q = TILE * 0.3;
          let hit = 0;
          if (this.inHex(cx - hx.x, cy - hx.y, R)) hit++;
          if (this.inHex(cx - q - hx.x, cy - q - hx.y, R)) hit++;
          if (this.inHex(cx + q - hx.x, cy - q - hx.y, R)) hit++;
          if (this.inHex(cx - q - hx.x, cy + q - hx.y, R)) hit++;
          if (this.inHex(cx + q - hx.x, cy + q - hx.y, R)) hit++;
          if (hit < 2) continue;
          g[r][c] = '.';
          if (hx.zone) zone[r * cols + c] = hx.zone;      // 地形の仕掛け
        }
      }
    }
    this._zone = zone;

    // コア
    const cc = Math.max(0, Math.min(cols - 1, Math.floor(core.x / TILE)));
    const cr = Math.max(0, Math.min(rows - 1, Math.floor(core.y / TILE)));
    g[cr][cc] = 'C';

    // **出現口は「壁に開いた穴」。** 1タイルではなく、辺に沿って holeW タイルぶん開ける
    for (const h of holes) {
      for (const t of h.tiles) {
        if (t.c < 0 || t.r < 0 || t.c >= cols || t.r >= rows) continue;
        g[t.r][t.c] = 'S';
      }
    }
    return g;
  },

  // 盤の縁を障害物にして、通路が画面外に触れないようにする。
  // ただし**出現口のある縁は残す**（そこが穴なので）
  edge(g) {
    const rows = g.length, cols = g[0].length;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r !== 0 && r !== rows - 1 && c !== 0 && c !== cols - 1) continue;
        if (g[r][c] === '.') g[r][c] = '#';
      }
    }
    return g;
  },

  // 深さから湧き口の数を決める。表は BAL.holesByDepth（[深さの上限, 口の数] の並び）
  //   ゆらぎは ±0 か +1 だけ。**深いほど必ず増える**形は崩さない
  //   **【2026-09-22・測って戻した】いまの盤（15×21）では口を増やせない。**
  //   表を [[0.18,1],[0.38,2],[0.58,3],[0.78,4],[1.01,5]] にして測ったら、
  //   **第7章以降は1枚も作れず、全部手書きマップに落ちた**（4枚ずつ×10章で全滅）。
  //   道が2本3本になると互いに近道を作ってしまい、最短経路が下限を割る。
  //   盤が狭いので、長い道を何本も通せない。
  //
  //   **口を増やすには、先に盤を広げる必要がある。**
  //   （ユーザーの順番どおり：広い盤 → 口を増やす → 基数の上限を上げる →
  //     そのうえで火力が足りないと抜かれるところまで敵を上げる）
  //   表は残してあるが、**いまは深さに応じた上限を超えないように抑えてある**
  holesFor(d, rnd) {
    const tbl = (typeof BAL !== 'undefined' && BAL.holesByDepth) || [[1, 1]];
    let n = tbl[tbl.length - 1][1];
    for (const [lim, k] of tbl) { if (d < lim) { n = k; break; } }
    return Math.max(1, Math.min(6, n));
  },


  // ---- ブロック式（指を放射状に並べる）----
  //
  //   **ユーザーの手書きの案をそのまま形にしたもの。**（2026-09-22）
  //   > 「こういうステージだと実質的に分断を実現できるよね？黄色がコア、赤が敵口」
  //   > 「今はブロック式で作ってますよね、それをハニカム式で再現してみてください」
  //
  //   **折れ線（lanes）と発想が逆。** 折れ線は「壁を彫って道を作る」ので、
  //   彫り残しが広場として残る。実測でそこが致命傷だった：
  //   > 「なんかデッドスペース多くない？ゲームに関与してない広場がほとんどを占めている」
  //
  //   こちらは**先に「置ける塊（指）」を撒いて、残り全部を道にする。**
  //   塊どうしの隙間が道になるので、**道から遠い地面が構造上できない。**
  //   実測（4枚・各1シード）：通路まで2マス以内の地面が **99〜100%**
  //   （折れ線の盤は 62〜76%）。
  //
  //   **指はコアを向ける。** 塊の長い辺を「コアから見た主な方角」に合わせると、
  //   隙間＝道がコアへ向かう放射状になり、**方角ごとに別の道**になる。
  //   実測：地面の 42〜54% が「ちょうど1本の道だけを見張れる場所」
  //   （折れ線の盤は 60% が「どの道も見張れない場所」だった）。
  //   ＝ 火力を1か所に集めても他の方角が素通りになる ＝ 置き方を問う形
  //
  //   shape で効くもの
  //     cols/rows   … 盤の大きさ
  //     holes       … 口の数（省くと holesFor(d)）
  //     gap         … 塊どうしの隙間＝道の太さ（タイル・既定2）
  //     fingerMin/Max … 指の長さの帯（タイル・既定4〜9）
  //     chamber     … コアの周りに空ける半径（タイル・既定3）

  // ---- 六角そのものを単位にして掘る（ブロック式の置き換え）----
  //
  //   **ユーザー 2026-09-23**
  //   > 「全てブロック式は廃止、六角形で固定」
  //
  //   ブロック式は**軸に沿った長方形の塊**を撒いて、その隙間を道にしていた。
  //   絵も設置も六角になった以上、**作るときだけ四角い**のは筋が通らない。
  //   斜めの塊を長方形で近似する都合で置けない、という無駄も出ていた。
  //
  //   **こちらは最初から六角で掘る。**
  //     1. 盤ぜんぶを壁の六角で埋める
  //     2. 中央にコアの部屋を開ける
  //     3. 縁に口を開け、**六角の隣づたい**にコアまで掘る
  //     4. 同心の囲いを立て、入り口を層ごとにずらす（道を伸ばすのはこれ）
  //     5. 最後にタイルへ焼く（経路探索と押し合いはタイルのまま）
  //
  //   **掘るので、連結は作り方から保証される**（口からコアへ必ず道がある）。
  //   ブロック式は「撒いた隙間がたまたま繋がる」形だったので、
  //   作り直しが31〜33回かかる盤があった
  //
  //   shape で効くもの
  //     cols/rows   … 盤の大きさ
  //     holes       … 口の数（省くと holesFor(d)）
  //     roadW       … 道の太さ（1＝掘った筋だけ／2＝隣も掘る）
  //     wander      … 道の蛇行の強さ（0〜1・既定0.45）
  //     chamber     … コアの周りに開ける半径（六角・既定2）
  //     ringStep    … 同心の囲いの間隔（六角・既定3）
  //     doorN       … 囲い1層あたりの入り口の数（既定2）
  makeHex(seed, d, shape) {
    const rnd = this.rng(seed);
    const cols = (shape.cols | 0) || 23, rows = (shape.rows | 0) || 31;
    const W = cols * TILE, H = rows * TILE;
    const R = this.HEX_R;

    // ---- 1. 盤に乗る六角を全部ならべる ----
    const cells = {}, list = [];
    const g0 = this.hexRange(0, 0, W, H, 0);
    for (let c = g0.c0; c <= g0.c1; c++) {
      for (let r = g0.r0; r <= g0.r1; r++) {
        const h = this.hexAt(c, r);
        // **縁の六角も掘る対象に入れる。**（実測 2026-09-23）
        //   ここを内側に寄せていたら、**口のタイルに乗る六角が掘れず、
        //   どの口からもコアへ届かなかった**（経路0で全部落ちた）。
        //   「縁の六角には置かせない」のは設置側（stages.js の hexBuildable）の仕事で、
        //   作るときに除いてはいけない
        if (h.x < 0 || h.y < 0 || h.x > W || h.y > H) continue;
        cells[c + ',' + r] = h;
        list.push(h);
      }
    }
    if (!list.length) return null;

    // 中央に一番近い六角＝コア
    const cx = W / 2, cy = H / 2;
    let core = list[0], cd = Infinity;
    for (const h of list) {
      const dd = (h.x - cx) * (h.x - cx) + (h.y - cy) * (h.y - cy);
      if (dd < cd) { cd = dd; core = h; }
    }

    const key = (c, r) => c + ',' + r;

    // コアからの歩数。掘るときの「近づいているか」に使う
    const step = {};
    {
      const q = [core]; step[key(core.c, core.r)] = 0;
      for (let i = 0; i < q.length; i++) {
        const cur = q[i], s = step[key(cur.c, cur.r)];
        for (const nb of this.hexNbr(cur.c, cur.r)) {
          const k = key(nb[0], nb[1]);
          if (!cells[k] || step[k] !== undefined) continue;
          step[k] = s + 1; q.push(cells[k]);
        }
      }
    }

    // ---- 2. コアの部屋を開ける ----
    const open = {};
    const dig = (c, r) => { const k = key(c, r); if (cells[k]) open[k] = 1; };

    // **道は「六角とその隣ぜんぶ」で掘る。**（ユーザー 2026-09-23）
    //   > 「**ハニカムを無理やり切り貼りした直線通路がある**」
    //   そのとおりで、ここには「タイルを1マスずつ辿って掘る」処理があった。
    //   六角1つが覆うタイルは1〜2枚しかなく、隣り合う六角でも
    //   タイルでは4近傍にならない組み合わせが出るため、
    //   **タイルの直線で継ぎ足して**繋げていた。**盤の上でそこだけ直線に見える。**
    //
    //   **太さで解く。** 六角とその隣6つをまとめて掘れば、
    //   覆うタイルが十分に重なって、焼いたあとも自然に繋がる。
    //   継ぎ足しが要らないので、**通路の形が最後まで六角のまま**になる
    const digHex = (c, r) => {
      dig(c, r);
      for (const nb of this.hexNbr(c, r)) dig(nb[0], nb[1]);
    };
    const chamber = shape.chamber === undefined ? 2 : shape.chamber;
    {
      const q = [{ c: core.c, r: core.r, d: 0 }];
      const seen = {};
      seen[key(core.c, core.r)] = 1;
      for (let i = 0; i < q.length; i++) {
        const cur = q[i];
        dig(cur.c, cur.r);
        if (cur.d >= chamber) continue;
        for (const nb of this.hexNbr(cur.c, cur.r)) {
          const k = key(nb[0], nb[1]);
          if (!cells[k] || seen[k]) continue;
          seen[k] = 1; q.push({ c: nb[0], r: nb[1], d: cur.d + 1 });
        }
      }
    }

    // ---- 3. 同心の囲い（入り口を層ごとにずらす）----
    //   **道を伸ばしているのはこれ。** 掘っただけだと縁からコアまで直進できる
    const ring = {};
    {
      const stepR = shape.ringStep || 3;
      const doorN = shape.doorN || 2;
      let maxS = 0;
      for (const k in step) if (step[k] > maxS) maxS = step[k];
      let turn = rnd() * Math.PI * 2;
      for (let s = chamber + 2; s < maxS - 1; s += stepR) {
        turn += Math.PI / 2 + (rnd() - 0.5) * 0.6;   // 層ごとに四半周ずらす
        const doors = [];
        for (let q = 0; q < doorN; q++) doors.push(turn + (q * 2 * Math.PI) / doorN);
        for (const k in step) {
          if (step[k] !== s) continue;
          const h = cells[k];
          const a = Math.atan2(h.y - core.y, h.x - core.x);
          let near = false;
          for (const da of doors) {
            const t = Math.abs(((a - da + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            if (t < 0.34) { near = true; break; }     // 入り口の幅（角度）
          }
          if (!near) ring[k] = 1;
        }
      }
    }

    // ---- 4. 口を開けて、コアまで掘る ----
    const nHole = Math.max(1, shape.holes ? shape.holes : this.holesFor(d, rnd));
    const holeW = 2 + ((rnd() * 3) | 0);
    const holes = [];
    const a0 = rnd() * Math.PI * 2;
    const wander = shape.wander === undefined ? 0.45 : shape.wander;
    const roadW = shape.roadW || 1;

    for (let k = 0; k < nHole; k++) {
      const want = a0 + (k * 2 * Math.PI) / nHole;
      // その方角で、コアから一番遠い六角＝縁の口
      let mouth = null, best = -1;
      for (const kk in cells) {
        const h = cells[kk];
        const a = Math.atan2(h.y - core.y, h.x - core.x);
        const da = Math.abs(((a - want + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (da > 0.45) continue;
        const s = step[kk];
        if (s === undefined || s <= best) continue;
        let bad = false;
        for (const o of holes) { if (Math.hypot(h.x - o.x, h.y - o.y) < R * 4) { bad = true; break; } }
        if (bad) continue;
        best = s; mouth = h;
      }
      if (!mouth) continue;

      // 縁のタイルを口にする（敵はここから出る）
      const tc = Math.max(0, Math.min(cols - 1, (mouth.x / TILE) | 0));
      const tr = Math.max(0, Math.min(rows - 1, (mouth.y / TILE) | 0));
      const dl = tc, dr2 = cols - 1 - tc, dt = tr, db = rows - 1 - tr;
      const m = Math.min(dl, dr2, dt, db);
      const tiles = [];
      if (m === dt || m === db) {
        const c0 = Math.max(0, Math.min(cols - holeW, tc - (holeW >> 1)));
        for (let q = 0; q < holeW; q++) tiles.push({ c: c0 + q, r: (m === dt) ? 0 : rows - 1 });
      } else {
        const r0 = Math.max(0, Math.min(rows - holeW, tr - (holeW >> 1)));
        for (let q = 0; q < holeW; q++) tiles.push({ c: (m === dl) ? 0 : cols - 1, r: r0 + q });
      }
      const mx = (tiles[0].c + tiles[tiles.length - 1].c) / 2 * TILE + TILE / 2;
      const my = (tiles[0].r + tiles[tiles.length - 1].r) / 2 * TILE + TILE / 2;
      holes.push({ side: 'hex' + k, tiles: tiles, x: mx, y: my, w: holeW });

      // **口のタイルと、掘った道を必ず繋ぐ。**（実測 2026-09-23 でここが抜けていた）
      //   口は盤の縁のタイル、掘り始めは縁に一番近い六角。
      //   その間が壁のままだと、**どの口からもコアへ届かない**（経路0で全部落ちる）。
      //   口のタイルに乗る六角を掘り、そこから掘り始めの六角まで繋ぐ
      //   **タイルを1マスずつ内側へ辿り、そのタイルの中心に乗る六角を掘る。**
      //   タイルの中心は必ずどれか1つの六角の中にあるので、
      //   その六角を掘れば**焼いたあとそのタイルが必ず通路になる**。
      //   六角を「口の近く」で選ぶだけでは、その六角が内側のタイルを覆っておらず
      //   壁のままになることがあった（実測：口が角にかかると `S###` で塞がる）
      const inward = (t) => {
        if (t.r === 0) return { dc: 0, dr: 1 };
        if (t.r === rows - 1) return { dc: 0, dr: -1 };
        if (t.c === 0) return { dc: 1, dr: 0 };
        return { dc: -1, dr: 0 };
      };
      let tipKey = null;
      for (const t of tiles) {
        const v = inward(t);
        for (let s = 0; s < 6; s++) {
          const tc2 = t.c + v.dc * s, tr2 = t.r + v.dr * s;
          if (tc2 < 0 || tr2 < 0 || tc2 >= cols || tr2 >= rows) break;
          const p = this.hexPick(tc2 * TILE + TILE / 2, tr2 * TILE + TILE / 2);
          if (!p) break;
          const kk = key(p.c, p.r);
          digHex(p.c, p.r);          // 隣ぜんぶ。継ぎ足しなしで繋がる太さにする
          if (cells[kk]) tipKey = kk;
          if (s > 0 && open[kk] && s >= 2) break;   // 既にある道に届いたら終わり
        }
      }
      // **掘り始めは、いま掘ったトンネルの先端にする。**
      //   `mouth`（方角で選んだ縁の六角）から掘り始めると、
      //   トンネルと繋がらないまま別の筋ができることがある
      if (tipKey && cells[tipKey]) mouth = cells[tipKey];

      // **口からコアへ、六角の隣づたいに掘る。**
      //   毎歩「コアに近づく隣」を選ぶが、`wander` の割合で横にそれる。
      //   囲い（ring）は避ける＝入り口を回り込むので、道が伸びる
      let cur = mouth, guard = 0;
      while (step[key(cur.c, cur.r)] > 0 && guard++ < 4000) {
        dig(cur.c, cur.r);
        if (roadW > 1) for (const nb of this.hexNbr(cur.c, cur.r)) dig(nb[0], nb[1]);
        const here = step[key(cur.c, cur.r)];
        const near = [], side = [], thru = [];
        for (const nb of this.hexNbr(cur.c, cur.r)) {
          const kk = key(nb[0], nb[1]);
          if (!cells[kk]) continue;
          const s = step[kk], isRing = !!ring[kk];
          if (s < here) thru.push(cells[kk]);
          if (isRing) continue;
          if (s < here) near.push(cells[kk]);
          else if (s === here) side.push(cells[kk]);
        }
        let pick = null;
        if (near.length && (!side.length || rnd() > wander)) pick = near[(rnd() * near.length) | 0];
        else if (side.length) pick = side[(rnd() * side.length) | 0];
        else if (near.length) pick = near[(rnd() * near.length) | 0];
        else if (thru.length) pick = thru[(rnd() * thru.length) | 0];
        if (!pick) break;
        digHex(cur.c, cur.r);          // 六角とその隣ぜんぶ。継ぎ足さずに繋がる
        cur = pick;
      }
      dig(core.c, core.r);
    }

    // ---- 5. 行き止まりの枝を掘って、死にマスを消す ----
    //
    //   **掘っただけだと、道から遠い地面が大量に残る。**（実測 2026-09-23）
    //   23×31 で「通路まで2マス以内の地面」が36%しかなかった
    //   （ユーザーの積年の指摘「ゲームに関与してない広場がほとんどを占めている」）。
    //
    //   **行き止まりの枝なので、近道を作らない**＝経路の長さを縮めない。
    //   道から遠い壁を選び、一番近い道まで掘って繋ぐ、を繰り返す
    {
      const want = shape.cover === undefined ? 0.55 : shape.cover;
      const far = () => {
        // 道からの歩数（六角）
        const dist = {};
        const q = [];
        for (const k in open) { dist[k] = 0; q.push(k); }
        for (let i = 0; i < q.length; i++) {
          const p = q[i].split(','), c = +p[0], r = +p[1], s = dist[q[i]];
          for (const nb of this.hexNbr(c, r)) {
            const k = key(nb[0], nb[1]);
            if (!cells[k] || dist[k] !== undefined) continue;
            dist[k] = s + 1; q.push(k);
          }
        }
        const out = [];
        let near = 0, wall = 0;
        for (const k in cells) {
          if (open[k]) continue;
          wall++;
          if (dist[k] !== undefined && dist[k] <= 1) near++;
          else out.push(k);
        }
        return { list: out, ratio: wall ? near / wall : 1 };
      };
      for (let pass = 0; pass < 40; pass++) {
        const f = far();
        if (f.ratio >= want || !f.list.length) break;
        const k = f.list[(rnd() * f.list.length) | 0];
        const p = k.split(',');
        let cur = cells[key(+p[0], +p[1])], guard = 0;
        // 一番近い道へ向かって掘る
        while (cur && !open[key(cur.c, cur.r)] && guard++ < 60) {
          dig(cur.c, cur.r);
          let best = null, bd = Infinity;
          for (const nb of this.hexNbr(cur.c, cur.r)) {
            const kk = key(nb[0], nb[1]);
            if (!cells[kk]) continue;
            let dd = Infinity;
            for (const ok2 in open) {
              const h2 = cells[ok2];
              const q2 = cells[kk];
              const e = (h2.x - q2.x) * (h2.x - q2.x) + (h2.y - q2.y) * (h2.y - q2.y);
              if (e < dd) dd = e;
            }
            if (dd < bd) { bd = dd; best = cells[kk]; }
          }
          if (!best) break;
          digHex(cur.c, cur.r);        // 六角とその隣ぜんぶ
          cur = best;
        }
      }
    }

    // ---- 5b. 掘った六角がバラバラなら、六角のまま繋ぐ ----
    //
    //   **【訂正 2026-09-23】断片化はタイルへの変換ではなく、掘る側で起きていた。**
    //   一度「六角をタイルに焼くと1.5枚しか覆えないので割れる」と結論して
    //   タイルの直線で継ぎ足したが、**それは誤りだった**。
    //   六角空間で数え直すと、掘った169個が**8つの島**（51/42/40/12/7/7/5/5）に
    //   割れていた。焼き方を多点サンプリングに変えても島の数は8個のままで、
    //   **タイル側の問題ではない**ことがはっきりした。
    //
    //   掘り進みが途中で行き止まる（`pick` が見つからず break する）と、
    //   口の側とコアの側が別の島になる。
    //   **島どうしを六角の隣づたいに繋ぐ。** タイルの直線は使わないので、
    //   ユーザーの言う「ハニカムを無理やり切り貼りした直線通路」にならない
    for (let pass = 0; pass < 12; pass++) {
      // いまの島を数える
      const cid = {}; const groups = [];
      for (const k in open) {
        if (cid[k] !== undefined) continue;
        const gi = groups.length, q = [k]; cid[k] = gi;
        for (let i = 0; i < q.length; i++) {
          const p = q[i].split(','), c = +p[0], r = +p[1];
          for (const nb of this.hexNbr(c, r)) {
            const kk = key(nb[0], nb[1]);
            if (open[kk] && cid[kk] === undefined) { cid[kk] = gi; q.push(kk); }
          }
        }
        groups.push(q);
      }
      if (groups.length <= 1) break;
      // コアのいる島を本体にする
      const home = cid[key(core.c, core.r)] === undefined ? 0 : cid[key(core.c, core.r)];
      // 本体に一番近い島を探して、一番近い2点を繋ぐ
      let bestA = null, bestB = null, bd = Infinity;
      for (let gi = 0; gi < groups.length; gi++) {
        if (gi === home) continue;
        for (const ka of groups[gi]) {
          const a = cells[ka];
          if (!a) continue;
          for (const kb of groups[home]) {
            const b = cells[kb];
            if (!b) continue;
            const e = (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
            if (e < bd) { bd = e; bestA = a; bestB = b; }
          }
        }
      }
      if (!bestA || !bestB) break;
      // 六角の隣づたいに、近いほうへ歩きながら掘る
      let cur = bestA, guard = 0;
      while (cur && (cur.c !== bestB.c || cur.r !== bestB.r) && guard++ < 200) {
        digHex(cur.c, cur.r);
        let nx = null, nd = Infinity;
        for (const nb of this.hexNbr(cur.c, cur.r)) {
          const kk = key(nb[0], nb[1]);
          const q2 = cells[kk];
          if (!q2) continue;
          const e = (q2.x - bestB.x) * (q2.x - bestB.x) + (q2.y - bestB.y) * (q2.y - bestB.y);
          if (e < nd) { nd = e; nx = q2; }
        }
        if (!nx) break;
        cur = nx;
      }
      digHex(bestB.c, bestB.r);
    }

    // ---- 6. タイルへ焼く ----
    //
    //   **タイル側での継ぎ足しはしない。**（ユーザー 2026-09-23）
    //   > 「ハニカムを無理やり切り貼りした直線通路がある」
    //   ここには「焼いたあと、届かない口までタイルを1マスずつ掘って繋ぐ」処理があった。
    //   連結は保証できたが、**その部分だけ盤の上で直線に見える**。
    //   いまは道を「六角とその隣ぜんぶ」で掘っている（`digHex`）ので、
    //   覆うタイルが十分に重なり、継ぎ足さなくても繋がる。
    //   **それでも繋がらない盤は、直さずに捨てる**（`build` が作り直す）
    let hexes = [];
    for (const k in open) hexes.push(cells[k]);
    if (!hexes.length) return null;
    hexes = this.tagZones(hexes, rnd, d);
    const g = this.edge(this.bake([], { x: core.x, y: core.y }, holes, W, H, hexes));

    return {
      rows: g.map(function (r) { return r.join(''); }),
      vec: { lanes: [], holes: holes, core: { x: core.x, y: core.y }, w: W, h: H, hexes: hexes, hexR: R },
      zone: this._zone,
      shape: shape, seed: seed, style: 'hex',
    };
  },
  // ---- 1枚作る ----
  //
  //   `d` は 0（第1章）〜1（第30章）の難しさ。**マップの形で難易度を付けるのはここ。**
  //   （ユーザー 2026-09-21「マップの形状とかで難易度も調節していく予定」）
  //
  //   **最初は d が無く、全章を同じ分布で作っていた。ゲームが壊れた**
  //   （3シードの実測：第1章すら突破できず 3→1 / 0 / 0）。
  //   第1章に「3つの口から入る広い洞窟」が出れば、ガトリング4基では当然届かない。
  //   旧マップは「難しさの順に並べてある」とわざわざ書いてあったのに、
  //   生成に置き換えたときその並びを捨ててしまっていた。
  //
  //   何が難しさを作るか
  //     口の数   … 増えると守りを割られる（一番効く）
  //     経路長   … 短いほど撃てる時間が減る
  //     通路の幅 … 広いほど1基の扇が覆う割合が下がる
  // shape … 章ごとに形を指定する差し込み口（省くと今までどおり d だけで決まる）
  //   holes     … 出現口の数を固定する
  //   widthMul  … 通路の基準幅の倍率
  //   partPool  … 使う部品を絞る（'straight' だけ＝一直線、'switchbk' だけ＝つづら折り…）
  //   routeMin/routeMax … 最短経路の帯（タイル）
  //   spokes    … **中央のコアへ、N方向から別々の道が来る。**（ユーザー 2026-09-22）
  //                > 「広大なマップで自分が真ん中にいて、6方向くらいから
  //                >   分断された敵に襲われるから武器の置き方を考える必要がある」
  //                道どうしの間は地面（＝壁）なので、**0922q で弾が壁を抜けなく
  //                なった以上、別の方角の道は別の砲でしか守れない。**
  //                ＝ 火力ではなく「置き方」を要求する
  //   waveMul   … その章だけ敵の数を掛ける（道が N 方向に分かれるぶんの埋め合わせ）
  //   laneW     … 道ごとの太さの倍率の配列（例 [0.7, 1.4, 0.7, 1.4]）。
  //                細い道は足止めが効き、太い道は火力を集めないと抜けられない
  //   roadMin/roadMax … 通路の総量の帯を上書きする
  make(seed, d, shape) {
    shape = shape || {};
    d = Math.max(0, Math.min(1, d === undefined ? 0.5 : d));
    // **ブロック式はここで分岐する。** 通路の作り方が逆（塊を撒いて残りを道にする）ので、
    //   この先の折れ線の組み立てとは共有できない。焼いたあとの形は同じ
    // **六角式が本線。**（ユーザー 2026-09-23「全てブロック式は廃止、六角形で固定」）
    if (shape.style === 'hex') return this.makeHex(seed, d, shape);
    const rnd = this.rng(seed);
    // **盤の大きさも章ごとに変えられる。**（ユーザー 2026-09-22
    //   「ボス章や後半ステージ、ラスボスは広いマップ…を意識して」）
    //   **タイルは小さくならない。** Render.fit は 15×21 より大きい盤を
    //   縮小せず、切り取ってパンする（実測：27×37 の盤でも1タイル25px）
    const cols = (shape.cols | 0) || this.COLS, rows = (shape.rows | 0) || this.ROWS;
    const W = cols * TILE, H = rows * TILE;
    const pick = (arr) => arr[(rnd() * arr.length) | 0];

    // **放射状の盤は、コアを真ん中に置く。**（そこへ N 方向から別々の道が来る）
    const spokes = (shape.spokes | 0) >= 2 ? (shape.spokes | 0) : 0;
    const core = spokes ? {
      x: ((cols >> 1) + (rnd() < 0.5 ? 0 : (rnd() < 0.5 ? -1 : 1))) * TILE + TILE / 2,
      y: ((rows >> 1) + (rnd() < 0.5 ? 0 : (rnd() < 0.5 ? -1 : 1))) * TILE + TILE / 2,
    } : {
      // コアの位置。**中央に寄せすぎない**（寄せると全部同じ形になる）
      x: (3 + Math.floor(rnd() * (cols - 6))) * TILE + TILE / 2,
      y: (4 + Math.floor(rnd() * (rows - 8))) * TILE + TILE / 2,
    };

    // 出現口 1〜3。辺は重複させない。
    //
    //   **コアから遠い辺・遠い位置を選ぶ。** 最初はどちらも一様に選んでいたが、
    //   コアに近いところに開くと経路が下限（20タイル）に届かず検査で落ちる。
    //   生成時点では1個/2個/3個が 129/145/126 と均等なのに、
    //   **通ったのは1個が368・2個が23・3個はゼロ**だった。
    //   遠い側に寄せると、口を増やしても経路が足りる
    //   口の数：序盤は1つだけ。中盤で2つ、終盤でようやく3つ目が出る
    // **湧き口の数は、深さで決める。**（ユーザー 2026-09-22・中優先）
    //   > 「バランス調整する時に、敵の数を増やしたい時は**素直に湧き口を増やして**
    //   >   ください、**一つから出る数にはかなり限度がある**事に
    //   >   すでに気がついているはずです」
    //   そのとおりで、1ウェーブの数は BAL.waveCountMax（900）で頭打ちになる。
    //   実際、放射状の盤で敵の数を ×2 ×3 しても総数が 6391→6793→6887 と
    //   ほとんど増えなかった（上限に当たっていた）。
    //   **量を増やす手は「口を増やす」ほうに寄せる。**
    //   前はここが `1 + rnd()*maxHole` で、深さに対して口の数が運だった
    const nHole = spokes ? spokes
      : (shape.holes ? shape.holes : this.holesFor(d, rnd));
    const sideFar = (sd) => {
      if (sd.id === 'top') return core.y;
      if (sd.id === 'bottom') return H - core.y;
      if (sd.id === 'left') return core.x;
      return W - core.x;
    };
    //   **辺も散らす。** 上と下、左と右のように向かい合う辺を選ぶと、
    //   通路が盤の反対側から来るので途中で交わりにくい
    const OPP = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    const pool = this.SIDES.slice()
      .sort((a, b) => (sideFar(b) * (0.7 + rnd() * 0.6)) - (sideFar(a) * (0.7 + rnd() * 0.6)));
    const sides = [pool[0]];
    while (!spokes && sides.length < nHole) {
      const want = OPP[sides[sides.length - 1].id];
      const nxt = pool.find(x => x.id === want && !sides.includes(x))
               || pool.find(x => !sides.includes(x));
      if (!nxt) break;
      sides.push(nxt);
    }
    const holeW = 2 + ((rnd() * 3) | 0);          // 穴の幅（タイル）
    const holes = [], lanes = [];

    // ---- 放射状（spokes）----
    //   コアから N 方向へ等間隔に向きを取り、盤の縁まで伸ばしたところを口にする。
    //   経由点はその方角の扇の中だけ。**だから道どうしが混ざらない**
    if (spokes) {
      const a0 = rnd() * Math.PI * 2;
      const halfSec = Math.PI / spokes;
      for (let k = 0; k < spokes; k++) {
        const ang = a0 + (k * 2 * Math.PI) / spokes;
        // コアから外へ伸ばして、先に当たった縁を口にする
        const ex = Math.cos(ang), ey = Math.sin(ang);
        let t = 1e9;
        if (ex > 1e-6) t = Math.min(t, (W - TILE / 2 - core.x) / ex);
        if (ex < -1e-6) t = Math.min(t, (TILE / 2 - core.x) / ex);
        if (ey > 1e-6) t = Math.min(t, (H - TILE / 2 - core.y) / ey);
        if (ey < -1e-6) t = Math.min(t, (TILE / 2 - core.y) / ey);
        const hx = core.x + ex * t, hy = core.y + ey * t;
        let hc = Math.max(0, Math.min(cols - 1, Math.floor(hx / TILE)));
        let hr = Math.max(0, Math.min(rows - 1, Math.floor(hy / TILE)));
        // どの縁に着いたか（口のタイルはその縁に沿って holeW 枚）
        const onL = hc === 0, onR = hc === cols - 1, onT = hr === 0, onB = hr === rows - 1;
        const tiles = [];
        if (onT || onB) {
          const c0 = Math.max(0, Math.min(cols - holeW, hc - (holeW >> 1)));
          for (let q = 0; q < holeW; q++) tiles.push({ c: c0 + q, r: onT ? 0 : rows - 1 });
          hc = c0 + (holeW >> 1);
        } else {
          const r0 = Math.max(0, Math.min(rows - holeW, hr - (holeW >> 1)));
          for (let q = 0; q < holeW; q++) tiles.push({ c: onL ? 0 : cols - 1, r: r0 + q });
          hr = r0 + (holeW >> 1);
        }
        const sx = hc * TILE + TILE / 2, sy = hr * TILE + TILE / 2;
        holes.push({ side: 'spoke' + k, tiles, x: sx, y: sy, w: holeW });

        // 経由点は自分の扇の中だけ。**混ざらないので、別の砲が要る**
        //   **外から内へ、扇の中で振りながら降りてくる。**
        //   まっすぐ入れると道が10タイル前後にしかならず、撃つ時間が無い
        const wps = [];
        const nWp = 2 + ((rnd() * 2) | 0);
        const R0 = Math.hypot(sx - core.x, sy - core.y);
        let swing = rnd() < 0.5 ? 1 : -1;
        for (let q = 0; q < nWp; q++) {
          const f = 1 - (q + 1) / (nWp + 1);            // 外 → 内
          const aa = ang + swing * halfSec * (0.55 + rnd() * 0.35);
          swing = -swing;                                 // 左右に振る＝道が伸びる
          const rr = R0 * (0.30 + f * 0.62);
          wps.push({
            x: Math.max(TILE, Math.min(W - TILE, core.x + Math.cos(aa) * rr)),
            y: Math.max(TILE, Math.min(H - TILE, core.y + Math.sin(aa) * rr)),
          });
        }
        const n = 3 + ((rnd() * 3) | 0);
        const pool = shape.partPool && shape.partPool.length ? shape.partPool : this.PART_IDS;
        const parts = [];
        for (let q = 0; q < n; q++) parts.push(pool[(rnd() * pool.length) | 0]);
        // **道ごとに太さを変えられる。**細い道は足止めが効き、太い道は火力が要る
        const lw = (shape.laneW && shape.laneW.length)
          ? shape.laneW[k % shape.laneW.length] : 1;
        // **放射状の道は細い。**太いと隣の扇とくっついて、盤がただの広間になる
        //   （実測：ふつうの太さ 90〜120px で作ったら通路236タイル＝盤の大半が道）
        const base = (44 + rnd() * 16 + d * 12) * (shape.widthMul || 1) * lw;
        const wMul = parts.reduce((a, pp) => a + this.PARTS[pp].w, 0) / parts.length;
        const raw = this.path(rnd, { x: sx, y: sy }, ang + Math.PI, wps.concat([core]), parts, W, H);
        lanes.push({ pts: this.smooth(raw, 6), w: base * wMul, parts, side: 'spoke' + k });
      }
    }

    for (const side of (spokes ? [] : sides)) {
      const tiles = [];
      let sx, sy;
      // 辺の上の位置。**コアから遠く、かつ「先に置いた口」からも遠いところを採る。**
      //
      //   口を2つ3つにすると、太い通路どうしが途中で交わって近道ができ、
      //   最短経路が下限（20タイル）を割って検査に落ちていた。
      //   その結果、800枚作っても口は 685/111/4 と1つに偏っていた。
      //   **下限を緩めるのは筋が悪い**（17タイルのマップで8回挑戦して
      //   全部ウェーブ1で撃沈した実測から置いた線）。
      //   代わりに**口どうしを引き離して、通路が交わらないようにする。**
      //   12回引いて「コアからの距離＋既にある口からの距離」が最大の場所を採る
      const farther = (span, fixed, horiz) => {
        let best = 1, bestD = -1;
        for (let k = 0; k < 12; k++) {
          const v = 1 + Math.floor(rnd() * span);
          const px = horiz ? (v + holeW / 2) * TILE : fixed;
          const py = horiz ? fixed : (v + holeW / 2) * TILE;
          let d = Math.hypot(px - core.x, py - core.y);
          for (const h of holes) d += Math.hypot(px - h.x, py - h.y) * 1.4;
          if (d > bestD) { bestD = d; best = v; }
        }
        return best;
      };
      if (side.id === 'top' || side.id === 'bottom') {
        const r = side.id === 'top' ? 0 : rows - 1;
        const c0 = farther(cols - holeW - 2, r * TILE + TILE / 2, true);
        for (let k = 0; k < holeW; k++) tiles.push({ c: c0 + k, r });
        sx = (c0 + holeW / 2) * TILE; sy = r * TILE + TILE / 2;
      } else {
        const c = side.id === 'left' ? 0 : cols - 1;
        const r0 = farther(rows - holeW - 2, c * TILE + TILE / 2, false);
        for (let k = 0; k < holeW; k++) tiles.push({ c, r: r0 + k });
        sx = c * TILE + TILE / 2; sy = (r0 + holeW / 2) * TILE;
      }
      holes.push({ side: side.id, tiles, x: sx, y: sy, w: holeW });

      // **経由点。** 盤を9分割して、出現口からもコアからも遠い区画を選ぶ。
      //   ここを通らせることで、L字・S字・ぐるりが出る
      // **コアに近い口ほど、経由点を増やして遠回りさせる。**
      //   近い口は経路が下限（20タイル）に届かず検査で落ちるので、
      //   出現口が2〜3個のマップがほとんど通らなかった（1000枚中 884/113/2）
      //   経路：序盤ほど遠回りさせる（撃てる時間を長く取る）
      const near = Math.hypot(sx - core.x, sy - core.y) < 12 * TILE;
      // **経由点を増やすのは逆効果だった。**（2026-09-22 実測）
      //   深い章で道が短くなるのは経由点が足りないからだと考えて
      //   `+1 + round(d*1.6)` を足したら、**手書き落ちが7章から17章に増えた。**
      //   経由点が増えると道が自分と交差して近道ができ、最短経路はむしろ縮む
      const nWp = (near ? 2 : 1) + ((rnd() * 2) | 0) + (d < 0.35 ? 1 : 0);
      const wps = [];
      for (let k = 0; k < nWp; k++) {
        let best = null, bestD = -1;
        for (let tries = 0; tries < 14; tries++) {
          const q = { x: (1.5 + rnd() * (cols - 3)) * TILE, y: (1.5 + rnd() * (rows - 3)) * TILE };
          const prev = wps.length ? wps[wps.length - 1] : { x: sx, y: sy };
          const d = Math.min(Math.hypot(q.x - prev.x, q.y - prev.y),
                             Math.hypot(q.x - core.x, q.y - core.y));
          if (d > bestD) { bestD = d; best = q; }
        }
        wps.push(best);
      }
      const n = 4 + ((rnd() * 4) | 0);
      const pool = shape.partPool && shape.partPool.length ? shape.partPool : this.PART_IDS;
      const parts = [];
      for (let i = 0; i < n; i++) parts.push(pool[(rnd() * pool.length) | 0]);
      // **通路の基準幅（px）。** 旧マップの平均幅 3.6〜5.6タイル（144〜224px）に合わせる。
      //   最初 62〜96px（1.5〜2.4タイル）で作ったら、通路が23〜67タイルしかなく
      //   盤の95%が地面になった（旧マップは通路94・地面206）
      //   **太くしすぎると「通路」ではなく「洞窟」に見える。**
      //   旧マップの平均幅 3.6〜5.6タイルは枝分かれした網全体の平均であって、
      //   1本の太い管の幅ではなかった。経由点を入れて経路が長くなったので、
      //   2.3〜3.5タイルでも通路の総量は足りる
      //   幅：序盤は細く（覆いやすい）、終盤は広く（覆いにくい）。
      //   （第1〜2章だけ細く作る案は外した。こんどは通路の量が下限を割って、
      //     かえって作り直しが増えた：手書き落ち 5/16 → 11/20）
      //   深さで太さをどれだけ増やすかは BAL.roadWidthDepth（既定46）。
      //   **太いほど道が自分と近づいて近道ができ、最短経路が縮む**ので、
      //   ここは「生成が通るか」に直結する
      const dw = (typeof BAL !== 'undefined' && BAL.roadWidthDepth !== undefined)
        ? BAL.roadWidthDepth : 46;
      const base = ((74 + rnd() * 34) + d * dw) * (shape.widthMul || 1);
      const wMul = parts.reduce((a, p) => a + this.PARTS[p].w, 0) / parts.length;
      const raw = this.path(rnd, { x: sx, y: sy }, side.ang, wps.concat([core]), parts, W, H);
      lanes.push({ pts: this.smooth(raw, 6), w: base * wMul, parts, side: side.id });
    }

    const hexes = this.tagZones(
      this.fillHexGaps(this.hexesFor(lanes, W, H), W, H, spokes ? 6 : 4), rnd, d);
    const g = this.edge(this.bake(lanes, core, holes, W, H, hexes));

    return {
      rows: g.map(r => r.join('')),
      // 絵は六角セルをそのまま描く（Render.tilesVec）
      vec: { lanes, holes, core, w: W, h: H, hexes, hexR: this.HEX_R },
      zone: this._zone,                 // タイルごとの仕掛け（0=なし 1=泥 2=坂）
      shape,
      seed,
    };
  },

  // ---- 通るか調べる（作り直しの判定に使う）----
  //   ここで落とす条件は Stage.validateAll と同じ意味にしてある。
  //   **経路が短いマップは「どう置いても撃つ時間が足りず必ず漏れる」**
  //   （実測：経路17タイルで8回挑戦して全部ウェーブ1で撃沈）
  check(rowsArr, d, shape) {
    shape = shape || {};
    const dd = (d === undefined ? 0.5 : d);
    const rows = rowsArr.length, cols = rowsArr[0].length;
    const area = (cols * rows) / (15 * 21);            // 15×21 を 1 とした広さ
    const at = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? ' ' : rowsArr[r][c];
    const walk = (c, r) => { const ch = at(c, r); return ch === '.' || ch === 'S' || ch === 'C'; };
    let core = null; const spawns = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (at(c, r) === 'C') core = { c, r };
      if (at(c, r) === 'S') spawns.push({ c, r });
    }
    if (!core || !spawns.length) return null;
    const INF = 1e9, dist = new Array(cols * rows).fill(INF), idx = (c, r) => r * cols + c;
    const q = [core]; dist[idx(core.c, core.r)] = 0;
    for (let h = 0; h < q.length; h++) {
      const cur = q[h], d = dist[idx(cur.c, cur.r)];
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = cur.c + dc, nr = cur.r + dr;
        if (!walk(nc, nr) || dist[idx(nc, nr)] <= d + 1) continue;
        dist[idx(nc, nr)] = d + 1; q.push({ c: nc, r: nr });
      }
    }
    const lens = spawns.map(s => dist[idx(s.c, s.r)]).filter(d => d < INF);
    let ground = 0, road = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (at(c, r) === '#') ground++; else if (at(c, r) !== ' ') road++;
    }

    // **通路から近い地面（＝実際に使える置き場所）の割合。**
    //   通路のタイルを全部起点にして、地面の上を幅優先で広げる。
    //   武器の射程はおおむね5タイル前後なので、そこまでを「使える」とする。
    //   射線までは見ない（検査は160回走るので、そこまでやると重すぎる）
    const NEAR = (BAL.mapLiveDist !== undefined ? BAL.mapLiveDist : 5);
    let live = 0;
    {
      const d2 = new Array(cols * rows).fill(-1);
      const q = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (walk(c, r)) { d2[idx(c, r)] = 0; q.push({ c, r }); }
      }
      for (let h = 0; h < q.length; h++) {
        const cur = q[h], dd2 = d2[idx(cur.c, cur.r)];
        if (dd2 >= NEAR) continue;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = cur.c + dc, nr = cur.r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          if (at(nc, nr) !== '#') continue;
          if (d2[idx(nc, nr)] >= 0) continue;
          d2[idx(nc, nr)] = dd2 + 1; live++; q.push({ c: nc, r: nr });
        }
      }
    }
    const liveRatio = ground > 0 ? live / ground : 0;
    // **通路の平均の太さ。**（§8-3「平均通路幅 ≦ 4タイル」・ここまで未実装だった）
    //   **「道の総量 ÷ 経路長」では測れない。** 行き止まりの枝まで数えてしまい、
    //   太さではなく「道の多さ」を見ることになる（実測で第13章が 7.75 と出たが、
    //   実際に太いのではなく枝が多いだけだった）。
    //   **壁までの距離で測る。** 通路タイルごとに一番近い壁までの歩数を求め、
    //   その平均を2倍する（＝両側ぶん）。これが素直な「太さ」
    let widthAvg = 0;
    {
      const dw = new Array(cols * rows).fill(-1);
      const q3 = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (!walk(c, r)) { dw[idx(c, r)] = 0; q3.push({ c, r }); }
      }
      for (let i = 0; i < q3.length; i++) {
        const cur = q3[i], dd3 = dw[idx(cur.c, cur.r)];
        for (const dd of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = cur.c + dd[0], nr = cur.r + dd[1];
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          if (dw[idx(nc, nr)] >= 0) continue;
          dw[idx(nc, nr)] = dd3 + 1; q3.push({ c: nc, r: nr });
        }
      }
      let sum = 0, n3 = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (!walk(c, r)) continue;
        const v = dw[idx(c, r)];
        if (v > 0) { sum += v; n3++; }
      }
      widthAvg = n3 ? (sum / n3) * 2 : 0;
    }
    // **穴の数を数える。**（`spawns` は S タイルの数で、口の数ではない。1つの口が2〜4タイル）
    //   隣り合う S をまとめて1つの穴とする（`Stage.build` の `mouths` と同じ数え方）
    let mouthN = 0;
    {
      const seenS = {};
      for (const s of spawns) {
        const k0 = s.c + ',' + s.r;
        if (seenS[k0]) continue;
        mouthN++;
        const st2 = [s]; seenS[k0] = 1;
        while (st2.length) {
          const t = st2.pop();
          for (const dd of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = t.c + dd[0], nr = t.r + dd[1];
            const k2 = nc + ',' + nr;
            if (seenS[k2] || at(nc, nr) !== 'S') continue;
            seenS[k2] = 1; st2.push({ c: nc, r: nr });
          }
        }
      }
    }
    return {
      // **序盤は検査を厳しくする。** BAL.minRouteLen(20) は「これを割ると必ず漏れる」線であって、
      //   第1章に出していい長さではない。序盤ほど余裕を積む。
      //
      //   通路の総量にも上限を置く。**広いマップは1基の扇が覆う割合が下がる。**
      //   置かないと、第1章に通路130タイルの広間が出て
      //   ガトリング4基では突破できない種が1割ほど混じっていた（実測 14/16）。
      //   **下限も置く。**スカスカのマップは逆に楽すぎて、周ごとの所要時間が
      //   91分〜125分まで散っていた。帯に収めて振れを縮める
      // **通路の量は盤の広さに比例させる。** 帯は 15×21 の盤で決めた値なので、
      //   盤を広げたらそのぶん伸ばさないと、序盤の2割が作れなくなる（実測 13/60 が失敗）
      // **最初の2章だけ、さらに厳しく見る。**（2026-09-22）
      //   第1〜2章はガトリング1種・設置6基でできることがほとんど無い。
      //   ふつうの帯で通すと、**20種のうち4種が10回挑戦しても突破できなかった**
      //   （しかも2章に届かないと転生もできないので、そこで詰む）。
      //   口は1つだけ、通路は細め、経路は長め、に絞る
      // **章ごとの形（shape）が来ていれば、そちらの帯で見る。**（2026-09-22）
      //   通路を太くする／口を増やす、を指定しても、帯が元のままだと
      //   作った端から検査で落ちて、黙って別の形になる
      ok: lens.length === spawns.length && lens.length > 0
          // **口の数はここで見ない。**（2026-09-22）
          //   `spawns` は S タイルの数で、口の数ではない（1つの口が2〜4タイル）。
          //   比べると必ず不成立になり、**口を減らして作り直す道が塞がっていた。**
          //   口の数は make() が守っているので、検査で確かめる必要はない
          // **経路の長さを難易度に結びつけるのはやめた。**（ユーザー 2026-09-22）
          //   > 「口を増やすって解決策が見つかったから、
          //   >   **敵の出現位置からコアまでの距離を直接難易度と結びつけるのをやめよう**、
          //   >   口を増やしたらどうにかなる」
          //   残すのは「短すぎると撃つ時間が無くて必ず漏れる」という**遊べる下限だけ**
          //   （深さで上乗せしていた `+ round(10*(1-dd))` を外した）
          //   **第1〜2章だけは、遊べる下限が別にある（BAL.earlyRouteMin = 30）。**
          //   0922ac で「経路長を難易度に結びつけない」ようにしたとき、
          //   深さで上乗せしていた `+ round(10*(1-dd))` を外した。
          //   **その式が序盤の下限も兼ねていたので、一緒に消えていた**
          //   （実測：第1章の地図が経路20でも通るようになり、
          //     新規セーブの2/20 が6回挑戦しても第1章を突破できない）。
          //   序盤はガトリング1種・設置6基しか無いので、撃つ時間が足りない。
          //   **難易度カーブではなく、序盤2章の遊べる下限として戻す**
          && Math.min.apply(null, lens) >= (shape.routeMin !== undefined
               ? shape.routeMin
               : (dd < 0.08 ? (BAL.earlyRouteMin || BAL.minRouteLen) : BAL.minRouteLen))
          && (shape.routeMax === undefined
               || Math.min.apply(null, lens) <= shape.routeMax)
          && road >= Math.round((shape.roadMin !== undefined ? shape.roadMin
               : (dd < 0.08 ? BAL.earlyRoadMin : (52 + 70 * dd))) * area)
          && road <= Math.round((shape.roadMax !== undefined ? shape.roadMax
               : (88 + 140 * dd)) * area)
          && ground >= 40
          // **通路が広すぎないこと。**（§8-3 で「追加する予定」と書いたまま未実装だった）
          //   広いと1基の扇が覆う割合が下がり、**置ける数だけが効く盤**になる。
          //   幅は「通路の総タイル数 ÷ 最短経路の長さ」で見る
          //   （通路を1本の帯とみなしたときの平均の太さ）。
          //   盤が広いほど道の本数も増えるので、口の数で割って1本ぶんに直す
          && (shape.widthMax === undefined || widthAvg <= shape.widthMax)
          // **章が進むほど口を増やす。**（§8-3 の「幕IV以降は出現口3以上」）
          //   口が1つだと支援や指定攻撃の置き場所が1か所に決まってしまう
          && (shape.mouthMin === undefined || mouthN >= shape.mouthMin)
          && (dd >= 0.08 || shape.roadMax !== undefined
              || road <= Math.round(BAL.earlyRoadMax * area))
          // **遊びに関わらない広場を作らない。**（ユーザー 2026-09-22）
          //   > 「なんかデッドスペース多くない？ってのが率直な感想、
          //   >   **ゲームに関与してない広場がほとんどを占めている**マップとかさ」
          //   通路から遠い地面は、置いても撃てないので盤の面積を食っているだけ。
          //   実測（2026-09-22）：通路が見える地面は全体の **32〜63%** しかなかった
          && liveRatio >= (BAL.mapLiveMin !== undefined ? BAL.mapLiveMin : 0),
      spawns: spawns.length, holes: spawns.length, mouths: mouthN, lens, ground, road,
      width: +widthAvg.toFixed(2),
      live, liveRatio: +liveRatio.toFixed(3),
      shortest: lens.length ? Math.min.apply(null, lens) : 0,
    };
  },

  // ---- 使う側の入口 ----
  //   通らないマップが出たら種をずらして作り直す。**何回で通ったかも返す**
  //   （作り直しが多いなら、部品か引きの強さが悪いということ）
  build(seed, tries, d, shape) {
    // **序盤は条件が厳しいので、作り直しの回数を多く取る。**
    //   40回だと第1章の3割が作れず、黙って固定マップに落ちていた
    tries = tries || 40;
    // **形の指定は、届かなければ段階的に緩める。**（2026-09-22）
    //   前は「指定どおりに作れなければ null」で、呼び出し側（Stage.mapRowsFor）が
    //   **黙って手書きマップに落ちていた。**
    //   経路 40〜46 を頼んだのに実際の経路が22（手書きの第15章）になっていて、
    //   帯を変えても漏れが動かない、という測定結果になっていた。
    //   **効きの強い順に残す。** 経路の下限がいちばん難易度を動かすので最後まで残し、
    //   上限・通路量・口の数・部品・幅の順に落とす
    // **口の数は、作れなければ減らす。**（2026-09-22・実測で見つけた回帰）
    //   0922v で「口の数を深さで固定」にしたところ、
    //   **第10章以降は160回作り直しても1枚も通らず、手書きマップに落ちていた**
    //   （30章中7章）。口が2つあると道どうしが近道を作り、
    //   最短経路が中央12まで潰れる（要求は24〜27）。
    //   **以前はランダムだったので「次の試行で1口を引き直す」逃げ道があった。**
    //   固定にしてそれを塞いでいたので、ここで段階的に減らす
    const steps = [shape];
    if (!shape) {
      const want = this.holesFor(d === undefined ? 0.5 : d, null);
      for (let h = want - 1; h >= 1; h--) steps.push({ holes: h });
    }
    if (shape) {
      const drop = (o, keys) => { const c = Object.assign({}, o); for (const k of keys) delete c[k]; return c; };
      steps.push(drop(shape, ['routeMax']));
      steps.push(drop(shape, ['routeMax', 'roadMin', 'roadMax']));
      steps.push(drop(shape, ['routeMax', 'roadMin', 'roadMax', 'holes']));
      steps.push(drop(shape, ['routeMax', 'roadMin', 'roadMax', 'holes', 'partPool', 'widthMul']));
      // **最後まで盤の大きさだけは残す。**（2026-09-22・実測で見つけた回帰）
      //   ここが直接 null に落ちていたので、指定が1つでも通らないと
      //   **盤が 15×21 に戻っていた**（第12〜24章がそうなっていた）。
      //   口の数も通路の量も盤の広さで決まるので、ここを捨てると別物のマップになる
      if (shape.cols || shape.rows) steps.push({ cols: shape.cols, rows: shape.rows });
      steps.push(null);
    }
    for (let sI = 0; sI < steps.length; sI++) {
      const sh = steps[sI];
      for (let i = 0; i < tries; i++) {
        const m = this.make((seed + i * 7919) >>> 0, d, sh);
        const st = this.check(m.rows, d, sh);
        if (st && st.ok) {
          m.stat = st; m.retries = i;
          m.relaxed = sI;              // 0 なら指定どおり。大きいほど緩めた
          return m;
        }
      }
    }
    return null;
  },
};
