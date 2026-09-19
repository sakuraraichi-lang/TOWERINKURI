// ---------------------------------------------------------------
// INKURIMENT 参考画像プロトタイプ
//
// **これは実験用です。src/ を一切読み込まず、localStorage も触りません。**
//
// 操作の流れ（実プレイの指摘を反映）
//   ① 上の「武器」から選ぶ → 盤面が少し暗くなり、**置ける場所が光る**
//   ② 置きたいところをタップ → 置かれて、そのまま調整パネルが出る
//   ③ 向きと射界を**バーで**決める（自動旋回は無い。準備フェーズで決めるもの）
//   ④ 置いてあるものをタップ → 同じ調整パネル。「配置を変える」でまた光る
// ---------------------------------------------------------------
'use strict';

const BUILD = '09/19 21:50';

// ===== 実験用のつまみ =====
const P = {
  CELL: 15,
  enemyR: 7,
  enemySpd: 26,
  enemyHp: 40,
  spawnPerSec: 160,
  target: 400,

  method: 'bucket',
  dCell: 14,
  jamFloor: 0.30,
  jamK: 0.5,
  spreadK: 1.5,
  bCell: 16,

  speed: 1,
  fx: true,
  field: 'small',
};

// ===== フィールド =====
// small … 画面に収まる広さ
// wide  … 参考画像のような広大な場。**カメラで一部を切り取って見る**
//         （縮小して全部映すと敵が小さくなり、密度が見えなくなるため）
const FIELDS = {
  small: { W: 390, H: 690 },
  wide:  { W: 900, H: 1500 },
};
let FW = 0, FH = 0, GW = 0, GH = 0;
let solid = null, dist = null;
let CORE = { x: 0, y: 0, r: 15 };
let SPAWN_BAND = { y0: 18, y1: 40 };

const gi = (cx, cy) => cy * GW + cx;
const rnd = (a, b) => a + Math.random() * (b - a);

function blob(cx, cy, rx, ry) {
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy <= 1) solid[gi(x, y)] = 1;
  }
}

function buildField(kind) {
  const f = FIELDS[kind];
  FW = f.W; FH = f.H;
  GW = Math.ceil(FW / P.CELL); GH = Math.ceil(FH / P.CELL);
  solid = new Uint8Array(GW * GH);
  dist = new Int32Array(GW * GH);
  // 外周の壁。**ここにも武器を置けるので、厚みを持たせる**
  const B = 2;
  for (let x = 0; x < GW; x++) for (let k = 0; k < B; k++) { solid[gi(x, k)] = 1; solid[gi(x, GH - 1 - k)] = 1; }
  for (let y = 0; y < GH; y++) for (let k = 0; k < B; k++) { solid[gi(k, y)] = 1; solid[gi(GW - 1 - k, y)] = 1; }

  // 島を置いて流れを作る。**通路は作らない**（開けた場のまま）
  const rx = GW / 26, ry = GH / 46;
  const K = 0.62;                                  // 島の大きさ。**上げると通り道が細くなる**
  const put = (c, r, a, b) => blob(c * rx, r * ry, a * K * rx, b * K * ry);
  put(6, 11, 4.0, 3.0);  put(20, 9, 3.4, 4.4);
  put(13, 20, 5.2, 2.6); put(4, 29, 3.2, 3.6);
  put(21, 31, 3.8, 3.0); put(12, 38, 4.6, 2.4);
  put(6, 44, 2.6, 2.8);  put(20, 43, 2.8, 2.4);
  put(17, 26, 2.4, 2.2); put(9, 33, 2.2, 2.0);     // 中盤にも足場を散らす
  if (kind === 'wide') {
    put(3, 18, 2.2, 2.6);  put(23, 20, 2.4, 2.8);
    put(9, 27, 2.0, 2.2);  put(17, 15, 2.0, 2.4);
    put(14, 33, 2.6, 2.0); put(2, 38, 2.0, 2.6);
    put(6, 22, 1.8, 2.0);  put(20, 36, 1.8, 2.2);
  }

  CORE = { x: FW * 0.5, y: FH - Math.max(56, FH * 0.066), r: 15 };
  SPAWN_BAND = { y0: P.CELL * 2.6, y1: P.CELL * 4.2 };
  // コアの周りは通れるようにしておく（壁に埋まると経路が作れない）
  const ccx = (CORE.x / P.CELL) | 0, ccy = (CORE.y / P.CELL) | 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = ccx + dx, ny = ccy + dy;
    if (nx > 0 && ny > 0 && nx < GW - 1 && ny < GH - 1) solid[gi(nx, ny)] = 0;
  }
  buildFlow();
  bakeTerrain();
}

function buildFlow() {
  dist.fill(1 << 29);
  const scx = Math.min(GW - 1, Math.max(0, (CORE.x / P.CELL) | 0));
  const scy = Math.min(GH - 1, Math.max(0, (CORE.y / P.CELL) | 0));
  const q = new Int32Array(GW * GH); let qa = 0, qb = 0;
  dist[gi(scx, scy)] = 0; q[qb++] = gi(scx, scy);
  while (qa < qb) {
    const k = q[qa++], cx = k % GW, cy = (k / GW) | 0, d = dist[k];
    for (let i = 0; i < 4; i++) {
      const nx = cx + [1, -1, 0, 0][i], ny = cy + [0, 0, 1, -1][i];
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const nk = gi(nx, ny);
      if (solid[nk] || dist[nk] <= d + 1) continue;
      dist[nk] = d + 1; q[qb++] = nk;
    }
  }
}

function flowDir(x, y, out) {
  const cx = Math.min(GW - 1, Math.max(0, (x / P.CELL) | 0));
  const cy = Math.min(GH - 1, Math.max(0, (y / P.CELL) | 0));
  let bd = dist[gi(cx, cy)], bx = 0, by = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
    const nk = gi(nx, ny);
    if (solid[nk]) continue;
    if (dist[nk] < bd) { bd = dist[nk]; bx = dx; by = dy; }
  }
  if (!bx && !by) { const a = Math.atan2(CORE.y - y, CORE.x - x); out.x = Math.cos(a); out.y = Math.sin(a); return; }
  const m = Math.hypot(bx, by); out.x = bx / m; out.y = by / m;
}
const walkableAt = (x, y) => {
  const cx = (x / P.CELL) | 0, cy = (y / P.CELL) | 0;
  return cx >= 0 && cy >= 0 && cx < GW && cy < GH && !solid[gi(cx, cy)];
};

// ===== 状態 =====
const S = {
  enemies: [], units: [], bullets: [], fx: [], nums: [], coins: [],
  coin: 0, kills: 0, spawnAcc: 0, t: 0, moveMs: 0,
};
function mkEnemy(x, y) {
  return { x, y, hp: P.enemyHp, max: P.enemyHp, r: P.enemyR,
    jam: 1, slow: 0, slowT: 0, px: 0, py: 0, hit: 0, dead: false, tint: rnd(-0.12, 0.12) };
}
function spawnEnemy() {
  for (let t = 0; t < 24; t++) {
    const x = rnd(14, FW - 14), y = rnd(SPAWN_BAND.y0, SPAWN_BAND.y1);
    if (walkableAt(x, y)) { S.enemies.push(mkEnemy(x, y)); return; }
  }
}
function fillTo(n) {
  if (S.enemies.length > n) S.enemies.length = n;
  let guard = 0;
  while (S.enemies.length < n && guard++ < n * 6) {
    const x = rnd(14, FW - 14), y = rnd(SPAWN_BAND.y0, FH * 0.72);
    if (walkableAt(x, y)) S.enemies.push(mkEnemy(x, y));
  }
}

// ===== 密集（3方式。ボタンで切り替えて見比べる）=====
let dCount = null, DW = 0, DH = 0;
function crowdDensity(dt) {
  DW = Math.ceil(FW / P.dCell); DH = Math.ceil(FH / P.dCell);
  if (!dCount || dCount.length !== DW * DH) dCount = new Float32Array(DW * DH);
  dCount.fill(0);
  const es = S.enemies;
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    let cx = (e.x / P.dCell) | 0, cy = (e.y / P.dCell) | 0;
    if (cx < 0) cx = 0; if (cy < 0) cy = 0; if (cx >= DW) cx = DW - 1; if (cy >= DH) cy = DH - 1;
    dCount[cy * DW + cx] += 1;
  }
  const at = (cx, cy) => (cx < 0 || cy < 0 || cx >= DW || cy >= DH) ? 40 : dCount[cy * DW + cx];
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    let cx = (e.x / P.dCell) | 0, cy = (e.y / P.dCell) | 0;
    if (cx < 0) cx = 0; if (cy < 0) cy = 0; if (cx >= DW) cx = DW - 1; if (cy >= DH) cy = DH - 1;
    const here = dCount[cy * DW + cx];
    e.jam = here > 1 ? Math.max(P.jamFloor, 1 / (1 + P.jamK * (here - 1))) : 1;
    if (here <= 1) continue;
    const gx = at(cx - 1, cy) - at(cx + 1, cy), gy = at(cx, cy - 1) - at(cx, cy + 1);
    const m = Math.hypot(gx, gy);
    if (m < 0.01) continue;
    const s = Math.min(P.enemySpd * dt * 1.1, (here - 1) * P.spreadK);
    const nx = e.x + gx / m * s, ny = e.y + gy / m * s;
    if (walkableAt(nx, ny)) { e.x = nx; e.y = ny; }
  }
}
let bHead = null, bNext = null, BW = 0, BH = 0;
function crowdBucket(dt) {
  const es = S.enemies, n = es.length;
  BW = Math.ceil(FW / P.bCell); BH = Math.ceil(FH / P.bCell);
  if (!bHead || bHead.length !== BW * BH) bHead = new Int32Array(BW * BH);
  bHead.fill(-1);
  if (!bNext || bNext.length < n) bNext = new Int32Array(Math.max(n * 2, 4096));
  for (let i = 0; i < n; i++) {
    const e = es[i]; e.px = 0; e.py = 0;
    let cx = (e.x / P.bCell) | 0, cy = (e.y / P.bCell) | 0;
    if (cx < 0) cx = 0; if (cy < 0) cy = 0; if (cx >= BW) cx = BW - 1; if (cy >= BH) cy = BH - 1;
    const k = cy * BW + cx; bNext[i] = bHead[k]; bHead[k] = i;
  }
  const push = (a, b) => {
    const dx = a.x - b.x, dy = a.y - b.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 < 0.01) return;
    const d = Math.sqrt(d2), f = (rr - d) * 0.5, ix = dx / d * f, iy = dy / d * f;
    a.px += ix; a.py += iy; b.px -= ix; b.py -= iy;
  };
  for (let cy = 0; cy < BH; cy++) for (let cx = 0; cx < BW; cx++) {
    for (let i = bHead[cy * BW + cx]; i !== -1; i = bNext[i]) {
      const a = es[i];
      for (let j = bNext[i]; j !== -1; j = bNext[j]) push(a, es[j]);
      if (cx + 1 < BW) for (let j = bHead[cy * BW + cx + 1]; j !== -1; j = bNext[j]) push(a, es[j]);
      if (cy + 1 < BH) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx; if (nx < 0 || nx >= BW) continue;
        for (let j = bHead[(cy + 1) * BW + nx]; j !== -1; j = bNext[j]) push(a, es[j]);
      }
    }
  }
  const cap = P.enemySpd * dt * 1.4;
  for (let i = 0; i < n; i++) {
    const e = es[i];
    if (!e.px && !e.py) continue;
    let px = e.px, py = e.py;
    const m = Math.hypot(px, py);
    if (m > cap) { px = px / m * cap; py = py / m * cap; }
    if (walkableAt(e.x + px, e.y + py)) { e.x += px; e.y += py; }
  }
}

// ===== 武器 =====
// arc = 扇の半角(rad)。**狭いほど集弾が上がり、広いほど守備範囲が増える**
const WEAPONS = {
  gatling: { name: 'ガトリング', color: '#ffd24a', range: 108, rate: 13, dmg: 7,
    speed: 380, pierce: 0, kind: 'bullet', arc: 0.45, arcMin: 0.10, arcMax: 1.20 },
  sniper:  { name: 'スナイパー', color: '#6fe3ff', range: 250, rate: 0.9, dmg: 34,
    speed: 0, pierce: 99, kind: 'beam', arc: 0.22, arcMin: 0.06, arcMax: 0.90 },
  cryo:    { name: '凍結',       color: '#8fd8ff', range: 92, rate: 4, dmg: 1.5,
    speed: 0, pierce: 0, kind: 'field', slow: 0.72, slowT: 1.1,
    arc: 0.70, arcMin: 0.18, arcMax: 1.40 },
};
function grouping(u) {
  const d = u.d;
  const t = (u.arc - d.arcMin) / Math.max(0.001, d.arcMax - d.arcMin);
  return 1 - 0.55 * Math.max(0, Math.min(1, t));
}
function inArc(u, x, y) {
  let da = Math.atan2(y - u.y, x - u.x) - u.face;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  return Math.abs(da) <= u.arc;
}

const UNIT_GAP = 18;
// **武器は壁（地形）の上にしか置けない。** 敵が通る地面には置けない。
// 外周の壁も「壁」なので置ける
const buildableAt = (x, y) => {
  const cx = (x / P.CELL) | 0, cy = (y / P.CELL) | 0;
  return cx >= 0 && cy >= 0 && cx < GW && cy < GH && !!solid[gi(cx, cy)];
};
const canPutAt = (x, y, ignore) => {
  if (!buildableAt(x, y)) return false;
  for (const o of S.units) if (o !== ignore && Math.hypot(o.x - x, o.y - y) < UNIT_GAP) return false;
  return true;
};

// 置いた瞬間の向きを決めるためだけに使う。**そのあとは回らない**
function bestFacing(u) {
  const N = 16, w = new Float64Array(N);
  const R2 = u.d.range * u.d.range;
  for (let i = 0; i < S.enemies.length; i++) {
    const e = S.enemies[i];
    const dx = e.x - u.x, dy = e.y - u.y, d2 = dx * dx + dy * dy;
    if (d2 > R2) continue;
    const a = Math.atan2(dy, dx) + Math.PI;
    w[(((a / (Math.PI * 2)) * N) | 0) % N] += 1;
  }
  const half = Math.max(1, Math.round(u.arc / (Math.PI * 2 / N)));
  let bi = -1, bw = 0;
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let j = -half; j <= half; j++) sum += w[(i + j + N * 2) % N];
    if (sum > bw) { bw = sum; bi = i; }
  }
  return bi < 0 ? null : (bi + 0.5) / N * Math.PI * 2 - Math.PI;
}

function placeUnit(type, x, y) {
  if (!canPutAt(x, y, null)) return null;
  const d = WEAPONS[type];
  const u = { type, d, x, y, cd: 0, face: -Math.PI / 2, arc: d.arc, flash: 0 };
  const g = bestFacing(u);
  if (g !== null) u.face = g;
  S.units.push(u);
  return u;
}

function pickTarget(u) {
  let best = null, bs = -1;
  const R2 = u.d.range * u.d.range;
  for (let i = 0; i < S.enemies.length; i++) {
    const e = S.enemies[i];
    const dx = e.x - u.x, dy = e.y - u.y, d2 = dx * dx + dy * dy;
    if (d2 > R2 || !inArc(u, e.x, e.y)) continue;
    let score = 1 - Math.sqrt(d2) / u.d.range;
    if (u.d.kind === 'beam') {
      const a = Math.atan2(dy, dx), ca = Math.cos(a), sa = Math.sin(a);
      let line = 0;
      for (let j = 0; j < S.enemies.length; j += 2) {
        const o = S.enemies[j], ox = o.x - u.x, oy = o.y - u.y;
        const t = ox * ca + oy * sa;
        if (t < 0 || t > u.d.range) continue;
        if (Math.abs(-ox * sa + oy * ca) < 9) line++;
      }
      score += line * 0.5;
    }
    if (score > bs) { bs = score; best = e; }
  }
  return best;
}

function fire(u) {
  const t = pickTarget(u);
  if (!t) return;
  const g = grouping(u);
  const a = Math.atan2(t.y - u.y, t.x - u.x);
  u.flash = 0.06;
  if (u.d.kind === 'beam') {
    const ca = Math.cos(a), sa = Math.sin(a);
    let hits = 0, far = 0;
    for (const e of S.enemies) {
      const ox = e.x - u.x, oy = e.y - u.y, tt = ox * ca + oy * sa;
      if (tt < 0 || tt > u.d.range) continue;
      if (Math.abs(-ox * sa + oy * ca) > e.r + 2) continue;
      hurt(e, u.d.dmg * g, u.d.color);
      hits++; if (tt > far) far = tt;
    }
    if (P.fx) S.fx.push({ k: 'beam', x: u.x, y: u.y, a, len: Math.max(far, 30), n: hits, t: 0, life: 0.18 });
  } else if (u.d.kind === 'field') {
    let n = 0;
    for (const e of S.enemies) {
      const dx = e.x - u.x, dy = e.y - u.y;
      if (dx * dx + dy * dy > u.d.range * u.d.range || !inArc(u, e.x, e.y)) continue;
      e.slow = Math.max(e.slow, u.d.slow * g);
      e.slowT = Math.max(e.slowT, u.d.slowT);
      hurt(e, u.d.dmg, u.d.color);
      n++;
    }
    if (P.fx && n) S.fx.push({ k: 'chill', x: u.x, y: u.y, a: u.face, arc: u.arc, r: u.d.range, t: 0, life: 0.22 });
  } else {
    const spread = (1 - g) * u.arc * 0.9;
    const aa = a + rnd(-spread, spread);
    S.bullets.push({ x: u.x, y: u.y, vx: Math.cos(aa) * u.d.speed, vy: Math.sin(aa) * u.d.speed,
      dmg: u.d.dmg, life: u.d.range / u.d.speed, color: u.d.color, pierce: u.d.pierce, hit: null });
  }
}

function hurt(e, dmg, color) {
  if (e.dead) return;
  e.hp -= dmg; e.hit = 0.09;
  if (P.fx && S.nums.length < 55) S.nums.push({ x: e.x + rnd(-3, 3), y: e.y - e.r, v: dmg, t: 0, life: 0.5, color });
  if (e.hp <= 0) {
    e.dead = true; S.kills++; S.coin++;
    if (P.fx) {
      S.fx.push({ k: 'pop', x: e.x, y: e.y, r: e.r, t: 0, life: 0.22 });
      if (S.coins.length < 40) S.coins.push({ x: e.x, y: e.y, t: 0, life: 0.45 });
    }
  }
}

// ===== 更新 =====
const _d = { x: 0, y: 0 };
function update(dt) {
  S.t += dt;
  S.spawnAcc += P.spawnPerSec * dt;
  let budget = 0;
  while (S.spawnAcc >= 1) { S.spawnAcc -= 1; budget++; }
  const need = P.target - S.enemies.length;
  for (let i = 0; i < Math.min(budget, need); i++) spawnEnemy();

  const t0 = performance.now();
  for (let i = 0; i < S.enemies.length; i++) {
    const e = S.enemies[i];
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
    flowDir(e.x, e.y, _d);
    const v = P.enemySpd * e.jam * (1 - e.slow) * dt;
    const nx = e.x + _d.x * v, ny = e.y + _d.y * v;
    if (walkableAt(nx, ny)) { e.x = nx; e.y = ny; }
    else if (walkableAt(nx, e.y)) e.x = nx;
    else if (walkableAt(e.x, ny)) e.y = ny;
    if (e.hit > 0) e.hit -= dt;
  }
  if (P.method === 'density' || P.method === 'both') crowdDensity(dt);
  if (P.method === 'bucket' || P.method === 'both') crowdBucket(dt);
  if (P.method === 'none') for (const e of S.enemies) e.jam = 1;
  S.moveMs = S.moveMs * 0.9 + (performance.now() - t0) * 0.1;

  for (let i = S.enemies.length - 1; i >= 0; i--) {
    const e = S.enemies[i];
    if (e.dead) { S.enemies.splice(i, 1); continue; }
    if (Math.hypot(e.x - CORE.x, e.y - CORE.y) <= CORE.r + e.r) {
      if (P.fx) S.fx.push({ k: 'leak', x: e.x, y: e.y, t: 0, life: 0.25 });
      S.enemies.splice(i, 1);
    }
  }
  for (const u of S.units) {
    u.cd -= dt;
    if (u.flash > 0) u.flash -= dt;
    while (u.cd <= 0) { fire(u); u.cd += 1 / u.d.rate; }
  }
  for (let i = S.bullets.length - 1; i >= 0; i--) {
    const b = S.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let gone = b.life <= 0;        // **壁の上から撃つので、壁では消さない**
    if (!gone) for (const e of S.enemies) {
      if (e.dead) continue;
      const dx = e.x - b.x, dy = e.y - b.y;
      if (dx * dx + dy * dy > (e.r + 2) * (e.r + 2)) continue;
      if (b.hit && b.hit.has(e)) continue;
      hurt(e, b.dmg, b.color);
      if (b.pierce > 0) { b.pierce--; (b.hit || (b.hit = new Set())).add(e); }
      else gone = true;
      break;
    }
    if (gone) S.bullets.splice(i, 1);
  }
  for (let i = S.fx.length - 1; i >= 0; i--) { const f = S.fx[i]; f.t += dt; if (f.t >= f.life) S.fx.splice(i, 1); }
  for (let i = S.nums.length - 1; i >= 0; i--) { const n = S.nums[i]; n.t += dt; n.y -= dt * 26; if (n.t >= n.life) S.nums.splice(i, 1); }
  for (let i = S.coins.length - 1; i >= 0; i--) { const c = S.coins[i]; c.t += dt; if (c.t >= c.life) S.coins.splice(i, 1); }
}

// ===== 見る範囲（カメラ）=====
const cam = { x: 0, y: 0, w: 390, h: 690 };
function clampCam() {
  // **一度でも NaN が入ると、以後ずっと NaN のままになる**ので、ここで必ず戻す
  if (!Number.isFinite(cam.w) || cam.w <= 0) cam.w = Math.min(FW, 390);
  if (!Number.isFinite(cam.h) || cam.h <= 0) cam.h = Math.min(FH, 690);
  if (!Number.isFinite(cam.x)) cam.x = 0;
  if (!Number.isFinite(cam.y)) cam.y = 0;
  cam.x = Math.max(0, Math.min(Math.max(0, FW - cam.w), cam.x));
  cam.y = Math.max(0, Math.min(Math.max(0, FH - cam.h), cam.y));
}
const canPan = () => (FW > cam.w + 1 || FH > cam.h + 1);

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let scale = 1, offX = 0, offY = 0;

function resize() {
  const tools = document.getElementById('tools');
  const hud = document.getElementById('hud');
  const away = tools.classList.contains('away');
  const th = away ? 12 : tools.getBoundingClientRect().height + 10;
  const hh = hud.getBoundingClientRect().height + 8;
  const vw = window.innerWidth;
  const vh = Math.max(220, window.innerHeight - th - hh);

  // 標準の見え方（1タイルの大きさ）を、広い場でも変えない
  scale = Math.min(vw / FIELDS.small.W, vh / FIELDS.small.H);
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  cam.w = Math.min(FW, vw / scale);
  cam.h = Math.min(FH, vh / scale);
  clampCam();

  const w = Math.round(cam.w * scale), h = Math.round(cam.h * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.position = 'absolute';
  cv.style.left = Math.round((vw - w) / 2) + 'px';
  cv.style.top = Math.round(hh) + 'px';
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  const r = cv.getBoundingClientRect(); offX = r.left; offY = r.top;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ===== 地形を焼く（升目を見せない）=====
let terrain = null;
function bakeTerrain() {
  const c = document.createElement('canvas');
  c.width = FW; c.height = FH;
  const g = c.getContext('2d');
  g.fillStyle = '#1b2733'; g.fillRect(0, 0, FW, FH);
  for (let i = 0; i < FW * FH / 300; i++) {
    const x = Math.random() * FW, y = Math.random() * FH;
    if (!walkableAt(x, y)) continue;
    g.fillStyle = 'rgba(255,255,255,' + (0.008 + Math.random() * 0.016).toFixed(3) + ')';
    g.beginPath(); g.arc(x, y, 2 + Math.random() * 7, 0, 7); g.fill();
  }
  const mass = (col, rad) => {
    g.fillStyle = col;
    for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
      if (!solid[gi(cx, cy)]) continue;
      g.beginPath();
      g.arc(cx * P.CELL + P.CELL / 2, cy * P.CELL + P.CELL / 2, P.CELL * rad, 0, 7);
      g.fill();
    }
  };
  mass('#2f5138', 0.80);
  mass('#24402c', 0.62);
  g.save();
  g.beginPath();
  for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
    if (!solid[gi(cx, cy)]) continue;
    g.moveTo(cx * P.CELL + P.CELL, cy * P.CELL + P.CELL / 2);
    g.arc(cx * P.CELL + P.CELL / 2, cy * P.CELL + P.CELL / 2, P.CELL * 0.80, 0, 7);
  }
  g.clip();
  for (let i = 0; i < FW * FH / 100; i++) {
    const x = Math.random() * FW, y = Math.random() * FH;
    g.fillStyle = Math.random() < 0.5 ? 'rgba(58,94,64,.55)' : 'rgba(26,48,32,.5)';
    g.beginPath(); g.arc(x, y, 1.6 + Math.random() * 3.2, 0, 7); g.fill();
  }
  g.restore();
  terrain = c;
}

// ===== 置ける場所の下地 =====
// 「置ける場所がどこか分からない」への対応。
// 武器を選んだら盤面を落として、置けるところだけ光らせる
let spotCache = null, spotKey = '';
function spots() {
  const key = P.field + '|' + S.units.length + '|' + mode + '|' + (sel ? Math.round(sel.x) + ',' + Math.round(sel.y) : '');
  if (spotCache && spotKey === key) return spotCache;
  const out = [];
  const step = P.CELL;
  for (let y = step * 0.5; y < FH; y += step) for (let x = step * 0.5; x < FW; x += step) {
    if (canPutAt(x, y, mode === 'move' ? sel : null)) out.push(x, y);
  }
  spotCache = out; spotKey = key;
  return out;
}

function draw() {
  ctx.clearRect(0, 0, cam.w, cam.h);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  const L = cam.x - 20, R = cam.x + cam.w + 20, T = cam.y - 20, B = cam.y + cam.h + 20;

  if (terrain) ctx.drawImage(terrain, 0, 0);

  if (mode !== 'idle') {
    ctx.fillStyle = 'rgba(4,8,13,.55)';
    ctx.fillRect(0, 0, FW, FH);
    const sp = spots();
    ctx.fillStyle = 'rgba(255,210,74,' + (0.16 + 0.07 * Math.sin(S.t * 5)).toFixed(3) + ')';
    for (let i = 0; i < sp.length; i += 2) {
      const x = sp[i], y = sp[i + 1];
      if (x < L || x > R || y < T || y > B) continue;
      ctx.beginPath(); ctx.arc(x, y, 4.4, 0, 7); ctx.fill();
    }
  }

  for (const f of S.fx) {
    if (f.x < L || f.x > R || f.y < T || f.y > B) continue;
    const k = f.t / f.life;
    if (f.k === 'beam') {
      ctx.strokeStyle = 'rgba(150,240,255,' + (0.85 * (1 - k)).toFixed(3) + ')';
      ctx.lineWidth = (1.4 + Math.min(f.n, 12) * 0.55) * (1 - k * 0.5);
      ctx.beginPath(); ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x + Math.cos(f.a) * f.len, f.y + Math.sin(f.a) * f.len); ctx.stroke();
    } else if (f.k === 'pop') {
      ctx.strokeStyle = 'rgba(255,150,120,' + (0.7 * (1 - k)).toFixed(3) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 + k * 2.2), 0, 7); ctx.stroke();
    } else if (f.k === 'chill') {
      ctx.fillStyle = 'rgba(143,216,255,' + (0.20 * (1 - k)).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(f.x, f.y);
      ctx.arc(f.x, f.y, f.r, f.a - f.arc, f.a + f.arc); ctx.closePath(); ctx.fill();
    } else if (f.k === 'no') {
      ctx.strokeStyle = 'rgba(255,90,110,' + (0.8 * (1 - k)).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * 8, 0, 7); ctx.stroke();
    } else if (f.k === 'leak') {
      ctx.fillStyle = 'rgba(255,70,90,' + (0.5 * (1 - k)).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * 14, 0, 7); ctx.fill();
    }
  }

  ctx.strokeStyle = '#7fb6ff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(CORE.x, CORE.y, CORE.r + Math.sin(S.t * 2) * 1.5, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(80,150,255,.18)'; ctx.fill();

  for (const e of S.enemies) {
    if (e.x < L || e.x > R || e.y < T || e.y > B) continue;
    ctx.fillStyle = e.hit > 0 ? '#ffffff' : e.slow > 0 ? '#7fc4e8' : (e.tint > 0 ? '#ff6f7e' : '#ef5568');
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill();
    if (e.hp < e.max) {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(e.x - e.r, e.y - e.r - 3.5, e.r * 2, 2);
      ctx.fillStyle = '#7ee3a0'; ctx.fillRect(e.x - e.r, e.y - e.r - 3.5, e.r * 2 * (e.hp / e.max), 2);
    }
  }

  ctx.lineWidth = 1.6;
  for (const b of S.bullets) {
    ctx.strokeStyle = b.color;
    ctx.beginPath(); ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012); ctx.stroke();
  }

  for (const u of S.units) {
    const on = (u === sel);
    ctx.beginPath(); ctx.moveTo(u.x, u.y);
    ctx.arc(u.x, u.y, u.d.range, u.face - u.arc, u.face + u.arc); ctx.closePath();
    ctx.fillStyle = on ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.045)';
    ctx.fill();
    ctx.strokeStyle = on ? u.d.color : 'rgba(255,255,255,.14)';
    ctx.lineWidth = on ? 1.5 : 0.8; ctx.stroke();
    ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(u.face);
    ctx.fillStyle = u.d.color;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#0b1016'; ctx.fillRect(2, -2.2, 10, 4.4);
    if (u.flash > 0) { ctx.fillStyle = 'rgba(255,240,180,.9)'; ctx.beginPath(); ctx.arc(13, 0, 4, 0, 7); ctx.fill(); }
    ctx.restore();
    if (on) {
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(u.x, u.y, 15 + Math.sin(S.t * 6) * 1.2, 0, 7); ctx.stroke();
    }
  }

  ctx.font = '600 9px system-ui,sans-serif'; ctx.textAlign = 'center';
  for (const n of S.nums) {
    if (n.x < L || n.x > R || n.y < T || n.y > B) continue;
    ctx.fillStyle = 'rgba(255,255,255,' + (1 - n.t / n.life).toFixed(2) + ')';
    ctx.fillText(Math.round(n.v), n.x, n.y);
  }
  for (const c of S.coins) {
    const k = c.t / c.life, ex = cam.x + 26, ey = cam.y + 14;
    const x = c.x + (ex - c.x) * k * k, y = c.y + (ey - c.y) * k * k;
    ctx.fillStyle = 'rgba(255,210,74,' + (1 - k * 0.7).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill();
  }
  ctx.restore();

  // 広い場では、今どこを見ているかを小さく出す
  if (canPan()) {
    const mw = 40, mh = mw * FH / FW, mx = cam.w - mw - 8, my = 8;
    ctx.fillStyle = 'rgba(8,13,20,.6)'; ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1; ctx.strokeRect(mx, my, mw, mh);
    ctx.strokeStyle = '#ffd24a';
    ctx.strokeRect(mx + cam.x / FW * mw, my + cam.y / FH * mh, cam.w / FW * mw, cam.h / FH * mh);
  }
}

// ===== 入力 =====
// idle  … タップで選択。空きをなぞると見る場所が動く（広い場のみ）
// place … 武器を置く場所を選んでいる
// move  … 置いてあるものの移動先を選んでいる
let mode = 'idle';
let placing = null;
let sel = null;

const el = (id) => document.getElementById(id);
const toField = (cx, cy) => ({ x: (cx - offX) / scale + cam.x, y: (cy - offY) / scale + cam.y });
const unitAt = (x, y) => S.units.find(u => Math.hypot(u.x - x, u.y - y) <= 15) || null;

function setMode(m, what) {
  mode = m; spotCache = null;
  placing = (m === 'place') ? what : null;
  el('banner').classList.toggle('show', m !== 'idle');
  if (m === 'place') el('bannerTxt').textContent = WEAPONS[what].name + 'を置く場所を選ぶ';
  if (m === 'move') el('bannerTxt').textContent = '移動先を選ぶ';
  if (m !== 'idle') {
    el('adjust').classList.remove('show');
    el('tools').classList.add('away');
  } else {
    showAdjust();
  }
  setTimeout(resize, 0);
}

function showAdjust() {
  const u = sel;
  const show = !!u && mode === 'idle';
  el('adjust').classList.toggle('show', show);
  el('tools').classList.toggle('away', show);
  if (!u) { setTimeout(resize, 0); return; }
  el('aName').textContent = u.d.name;
  el('aInfo').textContent = '集弾 ' + Math.round(grouping(u) * 100) + '%';
  let deg = Math.round(u.face * 180 / Math.PI); if (deg < 0) deg += 360;
  el('bFace').value = deg;
  el('vFace').textContent = deg + '°';
  const t = (u.arc - u.d.arcMin) / (u.d.arcMax - u.d.arcMin);
  el('bArc').value = Math.round(t * 100);
  el('vArc').textContent = Math.round(u.arc * 2 * 180 / Math.PI) + '°';
  setTimeout(resize, 0);
}
function setSel(u) { sel = u; showAdjust(); }

let down = null;
cv.addEventListener('pointerdown', (ev) => {
  down = { x: ev.clientX, y: ev.clientY, cx: cam.x, cy: cam.y, moved: false };
  try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 無視 */ }
  ev.preventDefault();
});
cv.addEventListener('pointermove', (ev) => {
  if (!down) return;
  const dx = ev.clientX - down.x, dy = ev.clientY - down.y;
  if (!down.moved && Math.hypot(dx, dy) < 9) return;
  down.moved = true;
  if (canPan()) { cam.x = down.cx - dx / scale; cam.y = down.cy - dy / scale; clampCam(); }
  ev.preventDefault();
});
cv.addEventListener('pointerup', (ev) => {
  if (!down) return;
  const wasDrag = down.moved; down = null;
  if (wasDrag) return;                       // なぞったときは選ばない
  const p = toField(ev.clientX, ev.clientY);
  el('hint').classList.add('gone');

  if (mode === 'place') {
    const nu = placeUnit(placing, p.x, p.y);
    if (nu) { sel = nu; setMode('idle'); }
    else S.fx.push({ k: 'no', x: p.x, y: p.y, t: 0, life: 0.3 });
    return;
  }
  if (mode === 'move') {
    if (sel && canPutAt(p.x, p.y, sel)) { sel.x = p.x; sel.y = p.y; setMode('idle'); }
    else S.fx.push({ k: 'no', x: p.x, y: p.y, t: 0, life: 0.3 });
    return;
  }
  const hit = unitAt(p.x, p.y);
  setSel(hit === sel ? null : hit);
});
cv.addEventListener('pointercancel', () => { down = null; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());

// ===== ボタンとバー =====
function group(q, fn) {
  const bs = document.querySelectorAll(q);
  bs.forEach(b => b.addEventListener('click', () => {
    bs.forEach(o => o.classList.remove('on'));
    b.classList.add('on');
    fn(b);
  }));
}
group('#tools .w', b => { sel = null; setMode('place', b.dataset.w); });
group('#tools .n', b => { P.target = +b.dataset.n; fillTo(P.target); });
group('#tools .m', b => { P.method = b.dataset.m; });
group('#tools .s', b => { P.speed = +b.dataset.s; });
group('#tools .f', b => {
  P.field = b.dataset.f;
  S.enemies.length = 0; S.units.length = 0; S.bullets.length = 0;
  S.fx.length = 0; S.nums.length = 0; S.coins.length = 0;
  sel = null; spotCache = null;
  buildField(P.field);
  resize();
  cam.x = (FW - cam.w) / 2; cam.y = FH; clampCam();
  fillTo(P.target);
  seedUnits();
  setMode('idle');
});
el('clear').addEventListener('click', () => { S.units.length = 0; sel = null; setMode('idle'); });
el('fx').addEventListener('click', (e) => {
  P.fx = !P.fx; e.currentTarget.classList.toggle('on', P.fx);
  if (!P.fx) { S.fx.length = 0; S.nums.length = 0; S.coins.length = 0; }
});
el('panel').addEventListener('click', (e) => {
  const t = el('tools');
  t.classList.toggle('hide');
  e.currentTarget.textContent = t.classList.contains('hide') ? '▲' : '▼';
  setTimeout(resize, 0);
});
el('bannerCancel').addEventListener('click', () => { setMode('idle'); });

// バー。**触ったその場で扇が動く**
el('bFace').addEventListener('input', (e) => {
  if (!sel) return;
  sel.face = (+e.target.value) * Math.PI / 180;
  el('vFace').textContent = e.target.value + '°';
});
el('bArc').addEventListener('input', (e) => {
  if (!sel) return;
  const t = (+e.target.value) / 100;
  sel.arc = sel.d.arcMin + (sel.d.arcMax - sel.d.arcMin) * t;
  el('vArc').textContent = Math.round(sel.arc * 2 * 180 / Math.PI) + '°';
  el('aInfo').textContent = '集弾 ' + Math.round(grouping(sel) * 100) + '%';
});
el('aMove').addEventListener('click', () => { if (sel) setMode('move'); });
el('aRemove').addEventListener('click', () => {
  if (!sel) return;
  const i = S.units.indexOf(sel);
  if (i >= 0) S.units.splice(i, 1);
  setSel(null);
});
el('aClose').addEventListener('click', () => setSel(null));

// ===== HUD =====
let fpsAcc = 0, fpsN = 0, lastHud = 0;
function hud(dtReal) {
  fpsAcc += dtReal; fpsN++;
  if (S.t - lastHud < 0.25) return;
  lastHud = S.t;
  el('hEn').textContent = S.enemies.length;
  el('hFps').textContent = Math.round(fpsN / Math.max(0.0001, fpsAcc));
  el('hCoin').textContent = S.coin;
  el('hKill').textContent = S.kills;
  fpsAcc = 0; fpsN = 0;
}

// ===== ループ =====
let last = performance.now();
function loop(t) {
  requestAnimationFrame(loop);
  let dtReal = (t - last) / 1000; last = t;
  if (dtReal > 0.1) dtReal = 0.1;
  const steps = P.speed >= 2 ? 2 : 1;
  for (let i = 0; i < steps; i++) update(dtReal * P.speed / steps);
  draw();
  hud(dtReal);
}

// 壁の上の、コアに近いあたりから順に置く
function seedUnits() {
  const cand = [];
  for (let y = P.CELL * 0.5; y < FH; y += P.CELL) for (let x = P.CELL * 0.5; x < FW; x += P.CELL) {
    if (!buildableAt(x, y)) continue;
    // 外周のいちばん外側は見えづらいので避ける
    if (x < P.CELL || y < P.CELL || x > FW - P.CELL || y > FH - P.CELL) continue;
    cand.push({ x, y, d: Math.hypot(x - CORE.x, y - CORE.y) });
  }
  cand.sort((a, b) => a.d - b.d);
  const want = ['cryo', 'sniper', 'gatling', 'gatling'];
  for (const w of want) {
    for (const c of cand) { if (placeUnit(w, c.x, c.y)) break; }
  }
}

el('hBuild').textContent = BUILD;
buildField(P.field);
resize();
cam.y = FH; clampCam();
fillTo(P.target);
seedUnits();
requestAnimationFrame(loop);
