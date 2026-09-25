// ---------------------------------------------------------------
// stages.js : ステージ定義とフローフィールド
//
//   **盤は MapGen がその場で作る**（Stage.mapRowsFor）。六角で掘った通路を
//   最後にタイル（TILE=40）へ焼き直し、経路探索（BFS）と押し合いはタイルのまま回す。
//   **武器を置く場所は六角**（stage.hexBuildable / hexCells）。
//   盤の文字列の凡例（MapGen が返す rows）  # 壁  . 通路  S 出現口  C コア
// ---------------------------------------------------------------
'use strict';

const TILE = 40;

// 章の並びと、初回突破の報酬。**盤は持たない**（Stage.mapRowsFor が MapGen でその場で作る）。
//   以前はここに30章ぶんの手書きの盤（約800行・tools/gen30.py が作っていた）があり、
//   生成が失敗したときの落とし先にしていたが、実際には一度も使われていなかった
//   （2026-09-24 実測：6種×30章＝180枚で落とし先に回った盤は0）。ユーザー指示で削除
//   報酬の武器カード（wc_*）は突破したときにもらうので、使えるのは次の章から
const STAGES = [
  { id: 'ch1',  name: '第1章',  act: 'I 導入',      reward: {} },
  { id: 'ch2',  name: '第2章',  act: 'I 導入',      reward: { cards: ['wc_sniper'] } },
  { id: 'ch3',  name: '第3章',  act: 'I 導入',      reward: { packs: { basic: 1 } } },
  { id: 'ch4',  name: '第4章',  act: 'I 導入',      reward: {} },
  { id: 'ch5',  name: '第5章',  act: 'II 最初の壁', reward: { cards: ['wc_missile'] } },
  { id: 'ch6',  name: '第6章',  act: 'II 最初の壁', reward: { packs: { basic: 1 } } },
  { id: 'ch7',  name: '第7章',  act: 'II 最初の壁', reward: {} },
  { id: 'ch8',  name: '第8章',  act: 'II 最初の壁', reward: { cards: ['wc_tesla'] } },
  { id: 'ch9',  name: '第9章',  act: 'III 恒久層',  reward: { packs: { basic: 1 } } },
  { id: 'ch10', name: '第10章', act: 'III 恒久層',  reward: {} },
  { id: 'ch11', name: '第11章', act: 'III 恒久層',  reward: { cards: ['wc_flame'] } },
  { id: 'ch12', name: '第12章', act: 'III 恒久層',  reward: { packs: { basic: 1 } } },
  { id: 'ch13', name: '第13章', act: 'III 恒久層',  reward: { cards: ['ky_skip'] } },
  { id: 'ch14', name: '第14章', act: 'III 恒久層',  reward: { cards: ['wc_gas'] } },
  { id: 'ch15', name: '第15章', act: 'IV 自動化',   reward: { packs: { basic: 1 } } },
  { id: 'ch16', name: '第16章', act: 'IV 自動化',   reward: {} },
  { id: 'ch17', name: '第17章', act: 'IV 自動化',   reward: { cards: ['wc_cryo'] } },
  { id: 'ch18', name: '第18章', act: 'IV 自動化',   reward: { packs: { basic: 1 } } },
  { id: 'ch19', name: '第19章', act: 'IV 自動化',   reward: {} },
  { id: 'ch20', name: '第20章', act: 'IV 自動化',   reward: { cards: ['wc_mortar'] } },
  { id: 'ch21', name: '第21章', act: 'V 特化',      reward: { packs: { basic: 1 } } },
  { id: 'ch22', name: '第22章', act: 'V 特化',      reward: {} },
  { id: 'ch23', name: '第23章', act: 'V 特化',      reward: {} },
  { id: 'ch24', name: '第24章', act: 'V 特化',      reward: { packs: { basic: 1 } } },
  { id: 'ch25', name: '第25章', act: 'V 特化',      reward: {} },
  { id: 'ch26', name: '第26章', act: 'V 特化',      reward: {} },
  { id: 'ch27', name: '第27章', act: 'V 特化',      reward: { packs: { basic: 1 } } },
  { id: 'ch28', name: '第28章', act: 'VI 決着',     reward: {} },
  { id: 'ch29', name: '第29章', act: 'VI 決着',     reward: {} },
  { id: 'ch30', name: '第30章', act: 'VI 決着',     reward: { packs: { basic: 1 } } },
];



const STAGE_BY_ID = {};
STAGES.forEach((s, i) => { s.idx = i; STAGE_BY_ID[s.id] = s; });

// 通算ウェーブ番号。ステージ1のW1が1、ステージ2のW1が6。敵の強さはこれで決まる
function globalWave(stageIdx, wave) { return stageIdx * BAL.wavesPerStage + wave; }

// ---------------------------------------------------------------
// マップ文字列から、当たり判定とフローフィールドを作る
// ---------------------------------------------------------------
// ============ 「そこまで進んだか」と「実際に突破したか」を分ける ============
//
//   **ユーザー指示（2026-09-22）**
//   > 「スキップについて重大な不具合があります、**もらえる金額が多すぎて**
//   >   もう30章を完全クリアされました」
//   > 「スキップではなく、**クリアフラグのチェックマークを与えるだけ**、
//   >   実際にはクリアした事にはなってないし、**報酬を一切もらえない**、
//   >   しかし**初回クリア報酬は取りに行ける**し、**クリアしてないけど次の章にはいける**」
//
//   `cleared` … 実際に5ウェーブ凌いだ。**報酬はこれだけを見る**
//   `skipped` … 飛ばして通過した。チェックマークだけ。**何ももらえない**
//
//   進行（次の章へ行けるか）・値段の桁・転生の条件・到達の深さは、
//   **どちらでも「進んだ」として数える。**
//   そうしないと、20章まで飛ばしたのに値段が1章のままになる
function stagePassedRec(rec) { return !!(rec && (rec.cleared || rec.skipped)); }
function stageProgressCount(perm) {
  if (!perm || !perm.stages) return 0;
  return STAGES.filter(s => stagePassedRec(perm.stages[s.id])).length;
}

const Stage = {
  _cache: {},

  // **盤面の種があれば、マップはその場で作る**（src/mapgen.js）。
  //   種は新しいセーブを作るときに1回だけ引く。**転生では作り直さない**
  //   （全部作り直すと周が後退した）。まだ届いていない章だけ、下の mapRoll で引き直す
  //   （ユーザー決定 2026-09-21：「配置は転生で消える」「1000組み合わせで作れない？」）。
  //   種が無い（セーブを読む前）ときは 1 で作る。手書きの盤はもう無い（2026-09-24 削除）
  mapRowsFor(stageId) {
    const seed = (typeof Game !== 'undefined' && Game.perm && Game.perm.mapSeed) || 1;
    const idx = STAGE_BY_ID[stageId].idx;
    // 章が進むほど難しい形にする（口が増え、通路が広がり、経路が短くなる）
    const d = STAGES.length > 1 ? idx / (STAGES.length - 1) : 0.5;
    // **踏んだ章の地形は変えない。まだ届いていない章だけ、転生のたびに引き直す。**
    //
    //   転生のたびに30章ぶん作り直していたら**周が後退した**
    //   （実測：26章の次の周が22章、20章の次が16章）。
    //   かといって全部固定にすると、**最前線に苦手な地形が出たとき永久に詰む**
    //   （実測：第14章で3周ぶん足踏み 14→14→14）。
    //   **後ろは固定、前だけ引き直す。**積み上げたものは返ってくるし、
    //   壁に当たっても次の周で別の地形を引ける
    //   **どの引きを使ったかは章ごとに覚えておく。**
    //   「到達より手前なら固定」と条件で出し分けたら、到達が伸びた瞬間に
    //   その章の地形が別物に変わって、**3章で何周も足踏みした**
    //   （実測 3→6→4→4→4→4）。覚えておけば後から変わらない
    const rolls = Game.perm.mapRoll || (Game.perm.mapRoll = {});
    if (rolls[stageId] === undefined) rolls[stageId] = (Game.perm.prestiges || 0);
    const roll = rolls[stageId];
    // **章ごとの形。**（2026-09-22）
    //   数値（敵のHP）では拍が作れないことが実測で分かったので、
    //   難易度は**マップの形**でも付ける。表は BAL.mapShape、無い章は今までどおり
    // **盤の大きさは深さで決める。**章ごとの指定（mapShape）があればそちらが勝つ
    let base = null;
    if (BAL.boardByDepth) {
      let b = BAL.boardByDepth[BAL.boardByDepth.length - 1];
      for (const row of BAL.boardByDepth) { if (d < row[0]) { b = row; break; } }
      if (b[1] !== MapGen.COLS || b[2] !== MapGen.ROWS) base = { cols: b[1], rows: b[2] };
    }
    // **六角式で作る。**（ユーザー 2026-09-23「全てブロック式は廃止、六角形で固定」）
    //   六角そのものを単位にして掘る。絵も設置も六角になったので、
    //   **作るときだけ四角い**ブロック式はやめた
    // **第1〜3章は往復の生成器。**（ユーザー 2026-09-24。折れ線では序盤の検査がほぼ通らなかった）
    if (BAL.serpUntilDepth !== undefined && d < BAL.serpUntilDepth) {
      base = Object.assign({ cols: MapGen.COLS, rows: MapGen.ROWS }, base, { style: 'serp', routeMin: BAL.serpRouteMin,
        width: BAL.serpWidth, roadMax: BAL.serpRoadMax });
    }
    // **第4〜11章は分岐式。**（ユーザー 2026-09-25「5章、6章は左右から分かれてきたら面白い」。第8〜11章は口2つ）
    //   口から出た道が左右に分かれ、盤の両端を回って合流する（MapGen.makeFork）
    if (BAL.forkUntilDepth !== undefined && d >= (BAL.serpUntilDepth || 0) && d < BAL.forkUntilDepth) {
      base = Object.assign({ cols: MapGen.COLS, rows: MapGen.ROWS }, base, { style: 'fork' });
    }
    if (BAL.hexFromDepth !== undefined && d >= BAL.hexFromDepth) {
      base = Object.assign({ cols: MapGen.COLS, rows: MapGen.ROWS }, base, {
        style: 'hex',
        chamber: BAL.hexChamber, ringStep: BAL.hexRingStep,
        doorN: BAL.hexDoorN, wander: BAL.hexWander, roadW: BAL.hexRoadW,
        // **通路の量の帯。** 既定の帯（折れ線用）は「道は彫るもの＝盤の3〜5割」の前提。
        //   六角式は筋を掘るだけなので道が細く、下限に当たりやすい。
        //   単位は「15×21 の盤あたりのタイル数」なので、315 × 割合
        roadMin: BAL.hexRoadMin, roadMax: BAL.hexRoadMax,
        // **§8-3 の2つの検査。**（設計書に「追加する予定」と書いたまま未実装だった）
        //   通路が広すぎると1基の扇が覆う割合が下がり、**置ける数だけが効く盤**になる。
        //   口が1つだと支援や指定攻撃の置き場所が1か所に決まる。
        //   実測（2026-09-23・10章）では太さ 2.2〜4.3 で、ほぼ目標どおりだった
        widthMax: BAL.mapWidthMax,
        mouthMin: (function () {
          const t = BAL.mouthMinByDepth;
          if (!t) return undefined;
          let v = t[t.length - 1][1];
          for (const row of t) { if (d < row[0]) { v = row[1]; break; } }
          return v;
        }()),
      });
    }
    const own = (BAL.mapShape && BAL.mapShape[idx + 1]) || null;
    const shape = (base || own) ? Object.assign({}, base, own) : null;
    // **作れなかったら種をずらして作り直す。**落とし先の手書きの盤は無い。
    //   2026-09-24 実測：6種×30章＝180枚で、1回目で作れなかった盤は0
    let m = null;
    for (let k = 0; k < 8 && !m; k++) {
      m = MapGen.build(((seed * 2654435761) ^ ((idx + 1) * 40503) ^ ((roll + k * 7919) * 2246822519)) >>> 0, 160, d, shape);
    }
    if (!m) throw new Error(stageId + ' の盤を作れなかった（種 ' + seed + '）');
    this._vec[stageId] = m.vec;
    this._zone[stageId] = m.zone;
    return m.rows;
  },

  _vec: {},
  _zone: {},
  _rows: {},        // 行き止まりを外して焼き直した盤（章ごと）
  _pruned: {},      // 外した六角の数（{ before, after }）
  _detour: {},      // 迂回路を足した回数
  _before: {},      // 迂回路を足す前の盤（最短経路が縮んだら戻す）
  vecOf(stageId) { return this._vec[stageId] || null; },

  // 種が変わったら作り直す（転生のとき）
  invalidate() { this._cache = {}; this._vec = {}; this._zone = {}; this._rows = {}; this._pruned = {}; this._detour = {}; this._before = {}; },

  build(stageId) {
    if (this._cache[stageId]) return this._cache[stageId];
    const def = STAGE_BY_ID[stageId];
    // 行き止まりを外して焼き直した盤があれば、そちらを使う（下の pruneDead）
    const map = this._rows[stageId] || this.mapRowsFor(stageId);
    const rows = map.length;
    const cols = Math.max.apply(null, map.map(r => r.length));

    const grid = [];
    const spawns = [];
    let core = null;
    for (let r = 0; r < rows; r++) {
      const line = map[r];
      const row = [];
      for (let c = 0; c < cols; c++) {
        const ch = line[c] || ' ';
        row.push(ch);
        if (ch === 'S') spawns.push({ c, r });
        if (ch === 'C') core = { c, r };
      }
      grid.push(row);
    }

    // **出現口を「穴」ごとにまとめる。**（ユーザー 2026-09-21）
    //   > 「この入り口（数マス分…壁に開いた穴）からゾロゾロと出てくる感じがいい」
    //
    //   S タイルは既に数マスぶん開いているが、`spawns` は平らな配列なので、
    //   敵は全部の穴を1体ずつ順に使っていた。**どの穴からも等間隔に1体ずつ**出るので、
    //   「点から湧いている」のと見え方が変わらない。
    //   隣り合う S を1つの穴としてまとめ、穴の単位で流せるようにする
    const mouths = [];
    {
      const at = {};
      spawns.forEach((s, i) => { at[s.c + ',' + s.r] = i; });
      const seen = {};
      for (let i = 0; i < spawns.length; i++) {
        if (seen[i]) continue;
        const grp = [], stack = [i];
        seen[i] = 1;
        while (stack.length) {
          const j = stack.pop(); grp.push(j);
          const s = spawns[j];
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const k = at[(s.c + dc) + ',' + (s.r + dr)];
            if (k === undefined || seen[k]) continue;
            seen[k] = 1; stack.push(k);
          }
        }
        // 穴の中では端から端へ順に並べる（真ん中から飛び飛びに出ないように）
        grp.sort((a, b) => (spawns[a].c - spawns[b].c) || (spawns[a].r - spawns[b].r));
        mouths.push(grp);
      }
    }

    const walkable = (c, r) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
      const ch = grid[r][c];
      return ch === '.' || ch === 'S' || ch === 'C';
    };

    // コアからの幅優先探索。各通路タイルに「次に進むタイル」を持たせる
    const INF = 1e9;
    const dist = new Array(cols * rows).fill(INF);
    const next = new Array(cols * rows).fill(null);
    const idx = (c, r) => r * cols + c;
    const q = [core];
    dist[idx(core.c, core.r)] = 0;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let head = 0; head < q.length; head++) {
      const cur = q[head];
      const d = dist[idx(cur.c, cur.r)];
      for (const [dc, dr] of DIRS) {
        const nc = cur.c + dc, nr = cur.r + dr;
        if (!walkable(nc, nr)) continue;
        if (dist[idx(nc, nr)] <= d + 1) continue;
        dist[idx(nc, nr)] = d + 1;
        next[idx(nc, nr)] = { c: cur.c, r: cur.r };
        q.push({ c: nc, r: nr });
      }
    }

    // 各出現口からコアまでの経路タイル。「どのルートから漏れたか」を塗るのに使う
    const routes = spawns.map(sp => {
      const out = [];
      let cur = sp, guard = 0;
      while (cur && guard++ < cols * rows) {
        out.push(idx(cur.c, cur.r));
        if (cur.c === core.c && cur.r === core.r) break;
        cur = next[idx(cur.c, cur.r)];
      }
      return out;
    });

    // ---- レーン：同じ口から、互いに離れた別の道筋を何本か用意する ----
    //   （ユーザー 2026-09-25「左下が迂回路のようになっているのにも関わらず、右に直通しており、
    //    敵が利用しないデッドスペースが多数あります…不要なスペースを除くと1本道の虚無みたいなタワーディフェンス」）
    //   前は幅優先探索の「次のタイル」1つを全員がなぞるだけで、**迂回路は構造上一度も使われなかった**
    //   （実測：第4章から先は通路の4割前後に敵が来ない。種3つ×30章）。
    //   口ごとに、最短の道のほかに「前の道から離れた道」を探し（重み付きの最短経路で、前の道の近くを高くする）、
    //   長さが最短の BAL.laneMaxRatio 倍以内・前のレーンから離れた区間がひと続きで BAL.laneMinSplit タイル以上あれば採る。
    //   敵は出るときにその口のレーンへ順番に振り分けられ、レーンに沿って進む（combat.js の flowTo）
    const N = cols * rows;
    const nbr = (i) => {
      const c = i % cols, r = (i / cols) | 0, out = [];
      for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr; if (walkable(nc, nr)) out.push(idx(nc, nr)); }
      return out;
    };
    // コアからの重み付き最短距離（cost(i) … そのタイルに入る重さ）。小さな二分ヒープで回す
    const dijkstra = (cost) => {
      const d = new Float64Array(N).fill(INF);
      const hp = [];
      const push = (v, i) => { hp.push([v, i]); let k = hp.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hp[p][0] <= hp[k][0]) break; [hp[p], hp[k]] = [hp[k], hp[p]]; k = p; } };
      const pop = () => { const top = hp[0], last = hp.pop(); if (hp.length) { hp[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r2 = l + 1; let m = k; if (l < hp.length && hp[l][0] < hp[m][0]) m = l; if (r2 < hp.length && hp[r2][0] < hp[m][0]) m = r2; if (m === k) break; [hp[m], hp[k]] = [hp[k], hp[m]]; k = m; } } return top; };
      const ci = idx(core.c, core.r);
      d[ci] = 0; push(0, ci);
      while (hp.length) {
        const [v, i] = pop();
        if (v > d[i]) continue;
        for (const j of nbr(i)) { const nv = v + cost(j); if (nv < d[j]) { d[j] = nv; push(nv, j); } }
      }
      return d;
    };
    // 距離の場から、そのタイルの次に進むタイル（一番小さい隣）
    const nextOf = (d) => {
      const nx = new Array(N).fill(null);
      for (let i = 0; i < N; i++) {
        if (d[i] >= INF || d[i] === 0) continue;
        let best = d[i], bj = -1;
        for (const j of nbr(i)) if (d[j] < best) { best = d[j]; bj = j; }
        if (bj >= 0) nx[i] = { c: bj % cols, r: (bj / cols) | 0 };
      }
      return nx;
    };
    const walk = (nx, s) => {
      const out = [];
      let cur = s, guard = 0;
      while (cur && guard++ < N) {
        const i = idx(cur.c, cur.r);
        out.push(i);
        if (cur.c === core.c && cur.r === core.r) break;
        cur = nx[i];
      }
      return out;
    };
    // 道のまわり（±rad タイル。省くと1）の印
    const around = (list, rad) => {
      const m = new Uint8Array(N);
      const k = rad || 1;
      for (const i of list) {
        const c = i % cols, r = (i / cols) | 0;
        for (let dc = -k; dc <= k; dc++) for (let dr = -k; dr <= k; dr++) {
          const cc = c + dc, rr = r + dr;
          if (cc >= 0 && rr >= 0 && cc < cols && rr < rows) m[idx(cc, rr)] = 1;
        }
      }
      return m;
    };
    // **通路を歩いて rad 歩以内**の印。壁を挟んだ隣の通路は、歩くと遠回りなので入らない
    //   （直線距離の ±2 だと、壁1枚向こうの別の通路まで「同じ道」とみなしていた）
    const roadNear = (list, rad) => {
      const m = new Uint8Array(N), step = new Int16Array(N).fill(-1), q = [];
      for (const i of list) if (step[i] < 0) { step[i] = 0; m[i] = 1; q.push(i); }
      for (let h = 0; h < q.length; h++) {
        const i = q[h];
        if (step[i] >= rad) continue;
        for (const j of nbr(i)) if (step[j] < 0) { step[j] = step[i] + 1; m[j] = 1; q.push(j); }
      }
      return m;
    };
    const lanes = [];                       // { mouth, route, next }
    const mouthLanes = [];                  // 口ごとのレーン番号
    const mouthOf = new Array(spawns.length).fill(0);
    const mouthList = mouths.length ? mouths : spawns.map((s, i) => [i]);
    mouthList.forEach((g, mi) => {
      for (const si of g) mouthOf[si] = mi;
      const src = spawns[g[0]];
      if (!src || dist[idx(src.c, src.r)] >= INF) { mouthLanes.push([]); return; }
      const mine = [];
      const taken = [];                     // これまでのレーンのタイル
      const L1 = dist[idx(src.c, src.r)];
      for (let k = 0; k < (BAL.laneMax || 1); k++) {
        let route;
        if (k === 0) route = walk(next, src);
        else {
          // **同じ太い通路の中で並んで走るだけの道は「別の道」にしない**（±BAL.laneSep タイルを前のレーンの近くとみなす）
          const near = roadNear(taken, BAL.laneSep);
          const d = dijkstra((j) => 1 + (near[j] ? BAL.lanePenalty : 0));
          route = walk(nextOf(d), src);
          if (route.length > L1 * BAL.laneMaxRatio + 1) break;
          // **前のレーンから離れた区間が、ひと続きで BAL.laneMinSplit タイル以上あるか。**
          //   口のすぐ先とコアの手前で重なるのは自然（そこは同じ幹）なので、重なりの割合では見ない
          let run = 0, best = 0;
          for (const i of route) { if (near[i]) run = 0; else { run++; if (run > best) best = run; } }
          if (best < BAL.laneMinSplit) break;
        }
        // レーンに沿って進む場：レーンのまわりは安く、外は高い（押し出されてもレーンに戻る）
        const band = around(route);
        const lf = dijkstra((j) => band[j] ? 1 : BAL.laneOffCost);
        lanes.push({ mouth: mi, route, next: nextOf(lf) });
        mine.push(lanes.length - 1);
        for (const i of route) taken.push(i);
      }
      mouthLanes.push(mine);
    });

    const vec0 = this._vec[stageId];
    // ---- 迂回路の検査：足したことで最短経路が下限（BAL.minRouteLen）を割るか、元の BAL.detourMinKeep 倍より縮んだら、
    //      足す前の盤に戻して、もう足さない（少し縮むのは許す。分かれ道のほうが大事）----
    const bf = this._before[stageId];
    if (bf) {
      delete this._before[stageId];
      const minNow = Math.min.apply(null, spawns.map(s => dist[idx(s.c, s.r)]));
      if (minNow < BAL.minRouteLen || minNow < bf.minRoute * BAL.detourMinKeep) {
        this._rows[stageId] = bf.rows;
        this._vec[stageId] = bf.vec;
        this._zone[stageId] = bf.zone;
        this._detour[stageId] = 99;
        return this.build(stageId);
      }
    }
    // ---- レーンが1本しか取れない口には、迂回路を足して焼き直す（2回まで）----
    //   （ユーザー 2026-09-25「5章、6章は左右から分かれてきたら面白いのですが、やはり最短距離です」）
    //   第1〜3章（往復式）は1本の長い道として作っているので足さない
    const d0 = STAGES.length > 1 ? STAGE_BY_ID[stageId].idx / (STAGES.length - 1) : 0;
    if (BAL.laneMin > 1 && vec0 && vec0.hexes && (this._detour[stageId] || 0) < 2 && d0 >= (BAL.serpUntilDepth || 0)) {
      const need = mouthLanes.filter(L => L.length && L.length < BAL.laneMin).map(L => lanes[L[0]].route);
      this._detour[stageId] = (this._detour[stageId] || 0) + 1;
      const hx = need.length ? MapGen.addDetours(vec0, need, cols) : null;
      if (hx) {
        // 足す前の盤と最短経路を覚えておく（縮んだら戻す。下の「迂回路の検査」）
        this._before[stageId] = { rows: map, vec: vec0, zone: this._zone[stageId], minRoute: Math.min.apply(null, spawns.map(s => dist[idx(s.c, s.r)])) };
        const g2 = MapGen.bake([], vec0.core, vec0.holes, vec0.w, vec0.h, hx);
        this._rows[stageId] = g2.map(r => r.join(''));
        this._vec[stageId] = Object.assign({}, vec0, { hexes: hx });
        this._zone[stageId] = MapGen._zone;
        return this.build(stageId);
      }
    }

    // ---- どのレーンも通らない六角は壁に戻して、焼き直す（1回だけ）----
    //   レーンを入れても、別の道として成り立たない行き止まりや膨らみは残る
    //   （実測：第6・7章で通路の4割強、第13〜17章で3割前後）。**六角の単位で**外すので、通路が直線で切られることはない
    if (BAL.pruneDead && vec0 && vec0.hexes && !this._pruned[stageId]) {
      const band = new Uint8Array(N);
      for (const l of lanes) { const m = around(l.route); for (let i = 0; i < N; i++) if (m[i]) band[i] = 1; }
      const keepTile = (i) => band[i] || grid[(i / cols) | 0][i % cols] === 'S' || grid[(i / cols) | 0][i % cols] === 'C';
      const R = MapGen.HEX_R, q = TILE * 0.3;
      const kept = vec0.hexes.filter(hx => {
        // この六角が焼いたタイル（bake と同じ5点の判定）のどれかがレーンのまわりなら残す
        const c0 = Math.max(0, Math.floor((hx.x - R) / TILE)), c1 = Math.min(cols - 1, Math.ceil((hx.x + R) / TILE));
        const r0 = Math.max(0, Math.floor((hx.y - R) / TILE)), r1 = Math.min(rows - 1, Math.ceil((hx.y + R) / TILE));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const cx = c * TILE + TILE / 2 - hx.x, cy = r * TILE + TILE / 2 - hx.y;
          let hit = 0;
          for (const [ox, oy] of [[0, 0], [-q, -q], [q, -q], [-q, q], [q, q]]) if (MapGen.inHex(cx + ox, cy + oy, R)) hit++;
          if (hit >= 2 && keepTile(idx(c, r))) return true;
        }
        return false;
      });
      this._pruned[stageId] = { before: vec0.hexes.length, after: kept.length };
      if (kept.length < vec0.hexes.length) {
        const g2 = MapGen.bake([], vec0.core, vec0.holes, vec0.w, vec0.h, kept);
        this._rows[stageId] = g2.map(r => r.join(''));
        this._vec[stageId] = Object.assign({}, vec0, { hexes: kept });
        this._zone[stageId] = MapGen._zone;
        return this.build(stageId);
      }
    }

    const built = {
      lanes, mouthLanes, mouthOf,
      // 章ごとのマップの形（BAL.mapShape）。**戦闘側もここを読む**
      //   （道が N 方向に分かれるぶん、敵の数も増やさないと1本あたりが薄くなる）
      shape: (BAL.mapShape && BAL.mapShape[STAGE_BY_ID[stageId].idx + 1]) || null,
      def, id: stageId, cols, rows, grid, spawns, mouths, core, dist, next, idx, walkable, routes,
      vec: this._vec[stageId] || null,        // 折れ線と幅。絵を滑らかに描くのに使う
      // 地形の仕掛け（0=なし 1=減速 2=加速。内部の名前は mud/slope のまま）。手で書いたマップには無い
      zone: this._zone[stageId] || null,
      zoneAt(c, r) { return this.zone ? (this.zone[r * cols + c] || 0) : 0; },
      w: cols * TILE, h: rows * TILE,
      center: (c, r) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 }),

      // ---------- 設置は六角（ハニカム）----------
      //
      //   **ユーザー 2026-09-23**
      //   > 「ハニカムの壁の中のデザインをハニカムにしろという指示、これは同じく
      //   >   **武器設置時の置ける場所もハニカムにする**という、
      //   >   システム面での変更でもあります、必ず着手するように」
      //
      //   絵は六角なのに**置ける場所だけ四角のタイル**だったので、
      //   ハニカムの壁の上に四角い光が並ぶ食い違いが出ていた。
      //   **セルの座標系を六角に差し替える。**
      //   経路探索（BFS）と押し合いはタイルのまま。触るのは「どこに置けるか」だけ
      //
      //   **置ける六角＝盤の六角から、通路の六角（`vec.hexes`）を抜いた残り。**
      //   `Render.wallHexes` と同じ引き算なので、絵に出ている壁の六角と必ず一致する
      hexCenter: (c, r) => MapGen.hexAt(c, r),
      hexBuildable(c, r) {
        if (!this._hexOk) {
          const ok = {}, R = MapGen.HEX_R;
          // **絵に出ている壁の六角と、まったく同じ集合を使う。**（2026-09-23）
          //   最初は「中心が `#` タイルに乗っている」で判定したが、
          //   **描く壁とずれた**（第20章で37セル、第30章で21セルが
          //   「通路として描かれているのに置ける」状態になった）。
          //   原因は焼き方で、六角は「タイルの中心が六角に入るか」でタイルを塗るので、
          //   **六角の中心タイルが塗られないことがある。**
          //   通路の六角（`vec.hexes`）を除いた残り、という
          //   `Render.wallHexes` と同じ引き算にすれば、必ず一致する
          const used = {};
          const v = this.vec;
          if (v) for (const h of v.hexes) used[h.c + ',' + h.r] = 1;
          const g = MapGen.hexRange(0, 0, cols * TILE, rows * TILE, 0);
          for (let cc = g.c0; cc <= g.c1; cc++) {
            for (let rr = g.r0; rr <= g.r1; rr++) {
              const h = MapGen.hexAt(cc, rr);
              // **盤の縁で切れている六角には置かせない。**
              //   中心が盤の中にあるだけだと、角の六角（中心が 0,0）が通ってしまい、
              //   置いた武器が半分はみ出して描かれる
              const m = R * 0.5;
              if (h.x < m || h.y < m || h.x > cols * TILE - m || h.y > rows * TILE - m) continue;
              if (v) {
                if (used[cc + ',' + rr]) continue;            // 通路の六角には置けない
              } else {
                // 手で書いたマップには六角の情報が無いので、中心のタイルで見る
                const tc = (h.x / TILE) | 0, tr = (h.y / TILE) | 0;
                if (grid[tr][tc] !== '#') continue;
              }
              // コアと出現口の上には置かせない（六角がまたいでいることがある）
              const tc2 = (h.x / TILE) | 0, tr2 = (h.y / TILE) | 0;
              const ch = grid[tr2][tc2];
              if (ch === 'C' || ch === 'S') continue;
              ok[cc + ',' + rr] = 1;
            }
          }
          this._hexOk = ok;
        }
        return !!this._hexOk[c + ',' + r];
      },
      // 置ける六角を全部返す（設置の光と、測定器の自動配置が使う）
      hexCells() {
        this.hexBuildable(0, 0);            // 作らせる
        const out = [];
        for (const k in this._hexOk) {
          const p = k.split(',');
          out.push({ c: +p[0], r: +p[1] });
        }
        return out;
      },
      hexPick: (x, y) => MapGen.hexPick(x, y),
      // このタイルから次に向かうべきタイルの中心（無ければコア）。lane を渡すとそのレーンに沿う
      flowTo(c, r, lane) {
        const L = (lane !== undefined && lane !== null) ? lanes[lane] : null;
        const n = (L && L.next[idx(c, r)]) || next[idx(c, r)];
        if (!n) return this.center(core.c, core.r);
        return this.center(n.c, n.r);
      },
      reachable: spawns.every(s => dist[idx(s.c, s.r)] < INF),
      unreachableSpawns: spawns.filter(s => dist[idx(s.c, s.r)] >= INF),
      // 出現口ごとの経路長（タイル数）。短いと撃てる時間が足りず、必ず漏れる
      routeLens: spawns.map(s => dist[idx(s.c, s.r)]).filter(d => d < INF),
    };

    this._cache[stageId] = built;
    return built;
  },

  // いまのセーブの種で、全30章の盤が壊れていないか調べる（**開発用・手で呼ぶ**）。
  //   30枚ぶん生成するので1枚0.2秒×30＝数秒かかる。**起動時には呼ばない**（2026-09-22 に画面が固まった）。
  //   MapGen.check が作る時点で同じ条件を見ているので、ここは作り終えた盤の念押し
  // **盤が活かされているか。**（2026-09-25・ユーザー「マップの広さに対して敵はどう動くか、作ったマップは活かせてるか？」）
  //   通路のうち、どれかのレーンのまわり（±1タイル）に入る割合と、口ごとのレーン数を返す。
  //   レーンを入れる前は、第4章から先で通路の4割前後に敵が一度も来なかった
  usage(st) {
    const N = st.cols * st.rows, on = new Uint8Array(N);
    for (const l of st.lanes) for (const i of l.route) {
      const c = i % st.cols, r = (i / st.cols) | 0;
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
        const cc = c + dc, rr = r + dr;
        if (cc >= 0 && rr >= 0 && cc < st.cols && rr < st.rows) on[st.idx(cc, rr)] = 1;
      }
    }
    let road = 0, used = 0;
    for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
      if (!st.walkable(c, r)) continue;
      road++;
      if (on[st.idx(c, r)]) used++;
    }
    return { road, used, pct: road ? Math.round(100 * used / road) : 0, lanes: st.mouthLanes.map(a => a.length) };
  },

  validateAll() {
    const bad = [];
    for (const s of STAGES) {
      const b = this.build(s.id);
      const u = this.usage(b);
      if (u.pct < BAL.usageMin) bad.push(s.id + ': 敵が通らない通路が多い（通る割合 ' + u.pct + '%）');
      if (!b.core) bad.push(s.id + ': コア(C)が無い');
      if (!b.spawns.length) bad.push(s.id + ': 出現口(S)が無い');
      if (!b.reachable) bad.push(s.id + ': コアへ到達できない出現口 ' + JSON.stringify(b.unreachableSpawns));
      const walls = b.grid.reduce((n, row) => n + row.filter(ch => ch === '#').length, 0);
      if (walls < 12) bad.push(s.id + ': 設置できる壁が少なすぎる (' + walls + ')');
      // 経路が短すぎると、どう置いても撃つ時間が足りずに漏れる。
      // 実際に経路17タイルのマップで「8回挑戦して全部ウェーブ1で撃沈」になった
      const shortest = b.routeLens.length ? Math.min.apply(null, b.routeLens) : 0;
      if (shortest < BAL.minRouteLen) {
        bad.push(s.id + ': 経路が短すぎる (' + shortest + ' < ' + BAL.minRouteLen + ') 経路長=' + b.routeLens.join('/'));
      }
    }
    return bad;
  },
};
