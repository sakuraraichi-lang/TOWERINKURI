// ---------------------------------------------------------------
// stages.js : ステージ（マップ）定義とフローフィールド
//   マップがステージごとに違うことが攻略のポイント。
//   武器は「壁（#）の上にだけ」置ける。敵は通路（.）を通ってコアへ向かう
//
//   凡例  # 壁（設置可）  . 通路  S 敵の出現口  C コア（拠点）  ' ' 空白（設置も通行も不可）
// ---------------------------------------------------------------
'use strict';

const TILE = 44;

const STAGES = [
  {
    id: 'st1', name: '訓練場', clearWave: 10,
    desc: '一本道の蛇行路。壁が通路に挟まれているので、どこに置いても複数の列を撃てる。',
    reward: { cards: ['wc_missile'], packs: { basic: 1 } },
    map: [
      '#############',
      '#S..........#',
      '###########.#',
      '#...........#',
      '#.###########',
      '#...........#',
      '###########.#',
      '#...........#',
      '#.###########',
      '#...........#',
      '###########.#',
      '#...........#',
      '#.###########',
      '#...........#',
      '###########.#',
      '#...........#',
      '#.###########',
      '#.....C.....#',
      '#############',
    ],
  },
  {
    id: 'st2', name: '十字路', clearWave: 20,
    desc: '出現口が2つ。左右から来て中段で合流するが、合流してからコアまでが短い。手前で削り切りたい。',
    reward: { cards: ['wc_tesla'], packs: { basic: 1 } },
    map: [
      '#############',
      '#S........###',
      '#.#######.###',
      '#.#######.###',
      '#.#######.###',
      '#.##......###',
      '#.##.########',
      '#.##.########',
      '#.##.########',
      '#...........#',
      '######.####.#',
      '######.####.#',
      '######.####.#',
      '######C####.#',
      '###########.#',
      '###########.#',
      '###########.#',
      '###########S#',
      '#############',
    ],
  },
  {
    id: 'st3', name: '螺旋', clearWave: 30,
    desc: '外周から中心へ巻き込む長い一本道。内側ほど敵が密集するので、中心の壁が主戦場になる。',
    reward: { cards: ['wc_flame'], packs: { basic: 1, rare: 1 } },
    map: [
      '#############',
      '#S..........#',
      '###########.#',
      '#.........#.#',
      '#.#######.#.#',
      '#.#.....#.#.#',
      '#.#.###.#.#.#',
      '#.#.#.C.#.#.#',
      '#.#.#.#.#.#.#',
      '#.#.#.#.#.#.#',
      '#.#.#.#.#.#.#',
      '#.#.#.#.#.#.#',
      '#.#.#.#.#.#.#',
      '#.#.#...#.#.#',
      '#.#.#####.#.#',
      '#.#.......#.#',
      '#.#########.#',
      '#...........#',
      '#############',
    ],
  },
  {
    id: 'st4', name: '広間', clearWave: 34,
    desc: '中央の部屋は下からしか入れない。上の広間から外周を大きく回らされるので、長い側面が主戦場になる。',
    reward: { cards: ['wc_gas'], packs: { rare: 1 } },
    map: [
      '#############',
      '#S.........S#',
      '#...........#',
      '#...........#',
      '#.#########.#',
      '#.#########.#',
      '#.#########.#',
      '#.#########.#',
      '#.###...###.#',
      '#.###.C.###.#',
      '#.###...###.#',
      '#.####.####.#',
      '#.####.####.#',
      '#.####.####.#',
      '#.####.####.#',
      '#...........#',
      '#...........#',
      '#...........#',
      '#############',
    ],
  },
  {
    id: 'st5', name: '三叉', clearWave: 44,
    desc: '出現口3つ。合流点の手前に置けば全部を撃てるが、そこは壁が細い。',
    reward: { cards: ['wc_cryo'], packs: { rare: 1, epic: 1 } },
    map: [
      '######S######',
      '######.######',
      '##.....######',
      '##.##########',
      '##.##########',
      '##.#######..S',
      '##.#######.##',
      '##.....###.##',
      '######.###.##',
      '######.###.##',
      'S...##.###.##',
      '###.##.###.##',
      '###....###.##',
      '######.###.##',
      '######.###.##',
      '######.....##',
      '######.######',
      '######C######',
      '#############',
    ],
  },
];

const STAGE_BY_ID = {};
for (const s of STAGES) STAGE_BY_ID[s.id] = s;

// ---------------------------------------------------------------
// マップ文字列から、当たり判定とフローフィールドを作る
// ---------------------------------------------------------------
const Stage = {
  _cache: {},

  build(stageId) {
    if (this._cache[stageId]) return this._cache[stageId];
    const def = STAGE_BY_ID[stageId];
    const rows = def.map.length;
    const cols = Math.max.apply(null, def.map.map(r => r.length));

    const grid = [];
    const spawns = [];
    let core = null;
    for (let r = 0; r < rows; r++) {
      const line = def.map[r];
      const row = [];
      for (let c = 0; c < cols; c++) {
        const ch = line[c] || ' ';
        row.push(ch);
        if (ch === 'S') spawns.push({ c, r });
        if (ch === 'C') core = { c, r };
      }
      grid.push(row);
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

    const built = {
      def, id: stageId, cols, rows, grid, spawns, core, dist, next, idx, walkable,
      w: cols * TILE, h: rows * TILE,
      center: (c, r) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 }),
      isWall: (c, r) => (c >= 0 && r >= 0 && c < cols && r < rows && grid[r][c] === '#'),
      // このタイルから次に向かうべきタイルの中心（無ければコア）
      flowTo(c, r) {
        const n = next[idx(c, r)];
        if (!n) return this.center(core.c, core.r);
        return this.center(n.c, n.r);
      },
      reachable: spawns.every(s => dist[idx(s.c, s.r)] < INF),
      unreachableSpawns: spawns.filter(s => dist[idx(s.c, s.r)] >= INF),
    };

    this._cache[stageId] = built;
    return built;
  },

  // 全ステージのマップが壊れていないか調べる（開発用）
  validateAll() {
    const bad = [];
    for (const s of STAGES) {
      const b = this.build(s.id);
      const widths = {};
      for (const line of s.def ? [] : s.map) widths[line.length] = 1;
      if (Object.keys(widths).length > 1) bad.push(s.id + ': 行の長さが揃っていない ' + Object.keys(widths));
      if (!b.core) bad.push(s.id + ': コア(C)が無い');
      if (!b.spawns.length) bad.push(s.id + ': 出現口(S)が無い');
      if (!b.reachable) bad.push(s.id + ': コアへ到達できない出現口 ' + JSON.stringify(b.unreachableSpawns));
      const walls = b.grid.reduce((n, row) => n + row.filter(ch => ch === '#').length, 0);
      if (walls < 12) bad.push(s.id + ': 設置できる壁が少なすぎる (' + walls + ')');
    }
    return bad;
  },
};
