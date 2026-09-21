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
  fillHexGaps(hexes, W, H) {
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
          if (n < 4) continue;
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

  // ---- 焼く ----
  //   タイルの中心が、拾った六角セルのどれかの中にあれば通路。
  //   **ここでタイルへ落とすので、この先（BFS・Crowd・設置）は何も変わらない**
  bake(lanes, core, holes, W, H, hexes) {
    const cols = this.COLS, rows = this.ROWS;
    const g = [];
    for (let r = 0; r < rows; r++) g.push(new Array(cols).fill('#'));

    const R = this.HEX_R;
    for (const hx of hexes) {
      const minc = Math.max(0, Math.floor((hx.x - R) / TILE));
      const maxc = Math.min(cols - 1, Math.ceil((hx.x + R) / TILE));
      const minr = Math.max(0, Math.floor((hx.y - R) / TILE));
      const maxr = Math.min(rows - 1, Math.ceil((hx.y + R) / TILE));
      for (let r = minr; r <= maxr; r++) {
        for (let c = minc; c <= maxc; c++) {
          const cx = c * TILE + TILE / 2, cy = r * TILE + TILE / 2;
          if (this.inHex(cx - hx.x, cy - hx.y, R)) g[r][c] = '.';
        }
      }
    }

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
    const cols = this.COLS, rows = this.ROWS;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r !== 0 && r !== rows - 1 && c !== 0 && c !== cols - 1) continue;
        if (g[r][c] === '.') g[r][c] = '#';
      }
    }
    return g;
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
  make(seed, d) {
    d = Math.max(0, Math.min(1, d === undefined ? 0.5 : d));
    const rnd = this.rng(seed);
    const cols = this.COLS, rows = this.ROWS;
    const W = cols * TILE, H = rows * TILE;
    const pick = (arr) => arr[(rnd() * arr.length) | 0];

    // コアの位置。**中央に寄せすぎない**（寄せると全部同じ形になる）
    const core = {
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
    const maxHole = d < 0.30 ? 1 : d < 0.62 ? 2 : 3;
    const nHole = 1 + ((rnd() * maxHole) | 0);
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
    while (sides.length < nHole) {
      const want = OPP[sides[sides.length - 1].id];
      const nxt = pool.find(x => x.id === want && !sides.includes(x))
               || pool.find(x => !sides.includes(x));
      if (!nxt) break;
      sides.push(nxt);
    }
    const holeW = 2 + ((rnd() * 3) | 0);          // 穴の幅（タイル）
    const holes = [], lanes = [];

    for (const side of sides) {
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
      const parts = [];
      for (let i = 0; i < n; i++) parts.push(pick(this.PART_IDS));
      // **通路の基準幅（px）。** 旧マップの平均幅 3.6〜5.6タイル（144〜224px）に合わせる。
      //   最初 62〜96px（1.5〜2.4タイル）で作ったら、通路が23〜67タイルしかなく
      //   盤の95%が地面になった（旧マップは通路94・地面206）
      //   **太くしすぎると「通路」ではなく「洞窟」に見える。**
      //   旧マップの平均幅 3.6〜5.6タイルは枝分かれした網全体の平均であって、
      //   1本の太い管の幅ではなかった。経由点を入れて経路が長くなったので、
      //   2.3〜3.5タイルでも通路の総量は足りる
      //   幅：序盤は細く（覆いやすい）、終盤は広く（覆いにくい）
      const base = (74 + rnd() * 34) + d * 46;
      const wMul = parts.reduce((a, p) => a + this.PARTS[p].w, 0) / parts.length;
      const raw = this.path(rnd, { x: sx, y: sy }, side.ang, wps.concat([core]), parts, W, H);
      lanes.push({ pts: this.smooth(raw, 6), w: base * wMul, parts, side: side.id });
    }

    const hexes = this.fillHexGaps(this.hexesFor(lanes, W, H), W, H);
    const g = this.edge(this.bake(lanes, core, holes, W, H, hexes));
    return {
      rows: g.map(r => r.join('')),
      // 絵は六角セルをそのまま描く（Render.tilesVec）
      vec: { lanes, holes, core, w: W, h: H, hexes, hexR: this.HEX_R },
      seed,
    };
  },

  // ---- 通るか調べる（作り直しの判定に使う）----
  //   ここで落とす条件は Stage.validateAll と同じ意味にしてある。
  //   **経路が短いマップは「どう置いても撃つ時間が足りず必ず漏れる」**
  //   （実測：経路17タイルで8回挑戦して全部ウェーブ1で撃沈）
  check(rowsArr, d) {
    const dd = (d === undefined ? 0.5 : d);
    const rows = rowsArr.length, cols = rowsArr[0].length;
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
    return {
      // **序盤は検査を厳しくする。** BAL.minRouteLen(20) は「これを割ると必ず漏れる」線であって、
      //   第1章に出していい長さではない。序盤ほど余裕を積む。
      //
      //   通路の総量にも上限を置く。**広いマップは1基の扇が覆う割合が下がる。**
      //   置かないと、第1章に通路130タイルの広間が出て
      //   ガトリング4基では突破できない種が1割ほど混じっていた（実測 14/16）。
      //   **下限も置く。**スカスカのマップは逆に楽すぎて、周ごとの所要時間が
      //   91分〜125分まで散っていた。帯に収めて振れを縮める
      ok: lens.length === spawns.length && lens.length > 0
          && Math.min.apply(null, lens) >= BAL.minRouteLen + Math.round(10 * (1 - dd))
          && road >= Math.round(52 + 70 * dd)
          && road <= Math.round(88 + 140 * dd)
          && ground >= 40,
      spawns: spawns.length, holes: spawns.length, lens, ground, road,
      shortest: lens.length ? Math.min.apply(null, lens) : 0,
    };
  },

  // ---- 使う側の入口 ----
  //   通らないマップが出たら種をずらして作り直す。**何回で通ったかも返す**
  //   （作り直しが多いなら、部品か引きの強さが悪いということ）
  build(seed, tries, d) {
    // **序盤は条件が厳しいので、作り直しの回数を多く取る。**
    //   40回だと第1章の3割が作れず、黙って固定マップに落ちていた
    tries = tries || 40;
    for (let i = 0; i < tries; i++) {
      const m = this.make((seed + i * 7919) >>> 0, d);
      const st = this.check(m.rows, d);
      if (st && st.ok) { m.stat = st; m.retries = i; return m; }
    }
    return null;
  },
};
