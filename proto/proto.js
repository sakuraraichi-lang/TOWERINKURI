// ---------------------------------------------------------------
// INKURIMENT 参考画像プロトタイプ
//
// **これは実験用です。src/ を一切読み込まず、localStorage も触りません。**
// 既存ゲームのバランス・ステージ・カード・転生には影響しません。
//
// 確かめたいこと（数値ではなく、見た目と手触り）
//   ・大量の敵がフィールドを埋め尽くすように見えるか
//   ・敵が細い一本の帯にならず、幅を持った集団として進むか
//   ・連射と貫通が、集団に対して視覚的に機能しているか
//   ・倒すことが気持ちいいか
//
// 密集の方式は画面のボタンで切り替えられます。**どれも最終仕様ではありません。**
// ---------------------------------------------------------------
'use strict';

// ===== 実験用のつまみ（ここだけ見れば全部変えられる）=====
const BUILD = '09/19 20:52';   // 画面右下に出る。届いている版がこれで分かる

const P = {
  // フィールド（縦持ちのスマホに合わせた比率。画面いっぱいに拡大される）
  W: 390, H: 690,
  CELL: 15,              // 経路計算に使う内部グリッド。**プレイヤーには見せない**

  enemyR: 7,             // 画面上で見える大きさ。小さすぎると密度が見えない
  enemySpd: 26,          // px/秒
  enemyHp: 40,
  enemyCoin: 1,

  spawnPerSec: 120,       // 湧く速さ。詰まりを作るには「倒す速さ」より速いこと
  target: 400,           // 同時に居させたい数（ボタンで変更）

  // --- 密集 ---
  method: 'density',     // none / density / bucket / both
  dCell: 14,             // 密度グリッドのセル
  jamFloor: 0.30,        // 混雑しても、この倍率より遅くはならない（永久停止を防ぐ）
  jamK: 0.5,             // 混雑1体につきどれだけ遅くするか
  spreadK: 1.5,          // 薄いほうへ押す強さ
  bCell: 16,             // バケットのセル

  speed: 1,
  fx: true,
};

// ===== フィールド =====
// 参考画像に寄せて、**広いオープンな場**にする。
// 細い通路ではなく、障害物で流れをつくる
const GW = Math.ceil(P.W / P.CELL), GH = Math.ceil(P.H / P.CELL);
const solid = new Uint8Array(GW * GH);      // 1 = 通れない
const gi = (cx, cy) => cy * GW + cx;

function blob(cx, cy, rx, ry) {
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy <= 1) solid[gi(x, y)] = 1;
  }
}
function buildField() {
  solid.fill(0);
  for (let x = 0; x < GW; x++) { solid[gi(x, 0)] = 1; solid[gi(x, GH - 1)] = 1; }
  for (let y = 0; y < GH; y++) { solid[gi(0, y)] = 1; solid[gi(GW - 1, y)] = 1; }
  // 障害物。**通路を作るのではなく、開けた場に島を置く**
  blob(6, 11, 4.0, 3.0);
  blob(20, 9, 3.4, 4.4);
  blob(13, 20, 5.2, 2.6);
  blob(4, 29, 3.2, 3.6);
  blob(21, 31, 3.8, 3.0);
  blob(12, 38, 4.6, 2.4);
  blob(6, 44, 2.6, 2.8);
  blob(20, 43, 2.8, 2.4);
}
buildField();

const CORE = { x: P.W * 0.5, y: P.H - 46, r: 15 };
// 出現は**上辺の帯**。3点から出すと、そこから細い筋になって画面が埋まらない
//（参考画像も、敵はマップの縁から面で入ってくる）
const SPAWN_BAND = { y0: 18, y1: 40 };

// --- 流れ場（内部グリッドで計算。見せない） ---
const dist = new Int32Array(GW * GH);
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
buildFlow();

// その地点から見て、コアへ向かう向き。斜めも使うので滑らかに進む
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
  coin: 0, kills: 0, spawnAcc: 0, t: 0,
  moveMs: 0, overlap: 0,
};
const rnd = (a, b) => a + Math.random() * (b - a);

function mkEnemy(x, y) {
  return { x, y, hp: P.enemyHp, max: P.enemyHp, r: P.enemyR,
    jam: 1, slow: 0, slowT: 0, px: 0, py: 0, hit: 0, dead: false, tint: rnd(-0.12, 0.12) };
}
function spawnEnemy() {
  for (let t = 0; t < 24; t++) {
    const x = rnd(14, P.W - 14), y = rnd(SPAWN_BAND.y0, SPAWN_BAND.y1);
    if (walkableAt(x, y)) { S.enemies.push(mkEnemy(x, y)); return; }
  }
}

// ===== 密集の方式（どれも暫定。ボタンで切り替えて見比べる）=====
// --- 密度グリッド：ペアを見ない。混んでいるところは遅く、薄いほうへ押す ---
let dCount = null, DW = 0, DH = 0;
function crowdDensity(dt) {
  DW = Math.ceil(P.W / P.dCell); DH = Math.ceil(P.H / P.dCell);
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
    // 混雑で減速。**下限があるので止まらない**
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

// --- バケット：近いペアだけを1回ずつ見て、重なりを押し離す ---
let bHead = null, bNext = null, BW = 0, BH = 0;
function crowdBucket(dt) {
  const es = S.enemies, n = es.length;
  BW = Math.ceil(P.W / P.bCell); BH = Math.ceil(P.H / P.bCell);
  if (!bHead || bHead.length !== BW * BH) bHead = new Int32Array(BW * BH);
  bHead.fill(-1);
  if (!bNext || bNext.length < n) bNext = new Int32Array(Math.max(n * 2, 2048));
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
  gatling: {
    name: 'ガトリング', color: '#ffd24a', range: 108, rate: 13, dmg: 7,
    speed: 380, pierce: 0, kind: 'bullet',
    arc: 0.45, arcMin: 0.14, arcMax: 1.05, turn: 4.5,
  },
  sniper: {
    name: 'スナイパー', color: '#6fe3ff', range: 250, rate: 0.9, dmg: 34,
    speed: 0, pierce: 99, kind: 'beam',
    arc: 0.22, arcMin: 0.10, arcMax: 0.75, turn: 2.4,
  },
  // 凍結：足を止める。**バケットと組み合わせると、止まった敵の後ろが詰まって団子になる**
  cryo: {
    name: '凍結', color: '#8fd8ff', range: 92, rate: 4, dmg: 1.5,
    speed: 0, pierce: 0, kind: 'field', slow: 0.72, slowT: 1.1,
    arc: 0.70, arcMin: 0.22, arcMax: 1.25, turn: 5.5,
  },
};

// 集弾率：扇を絞るほど1に近づき、広げるほど落ちる。
// 弾はばらけ、瞬間当たりの武器は威力が落ちる
function grouping(u) {
  const d = u.d;
  const t = (u.arc - d.arcMin) / Math.max(0.001, d.arcMax - d.arcMin);
  return 1 - 0.55 * Math.max(0, Math.min(1, t));
}
// その角度が扇の中か
function inArc(u, x, y) {
  let da = Math.atan2(y - u.y, x - u.x) - u.face;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  return Math.abs(da) <= u.arc;
}

function placeUnit(type, x, y) {
  if (!walkableAt(x, y)) return null;
  for (const u of S.units) if (Math.hypot(u.x - x, u.y - y) < 18) return null;
  const d = WEAPONS[type];
  const u = { type, d, x, y, cd: 0, face: -Math.PI / 2, arc: d.arc, flash: 0 };
  S.units.push(u);
  return u;
}

// 扇をどちらへ向けるか。**敵がいちばん濃い方向**を探す（自動で回る）
function bestFacing(u) {
  const N = 16, w = new Float64Array(N);
  const R2 = u.d.range * u.d.range;
  for (let i = 0; i < S.enemies.length; i++) {
    const e = S.enemies[i];
    const dx = e.x - u.x, dy = e.y - u.y, d2 = dx * dx + dy * dy;
    if (d2 > R2) continue;
    let a = Math.atan2(dy, dx) + Math.PI;
    const k = ((a / (Math.PI * 2)) * N) | 0;
    w[k % N] += 1 - Math.sqrt(d2) / u.d.range * 0.5;
  }
  // 扇の幅ぶんをまとめて見る（広い扇なら広く見渡す）
  const half = Math.max(1, Math.round(u.arc / (Math.PI * 2 / N)));
  let bi = -1, bw = 0;
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let j = -half; j <= half; j++) sum += w[(i + j + N * 2) % N];
    if (sum > bw) { bw = sum; bi = i; }
  }
  if (bi < 0) return null;
  return (bi + 0.5) / N * Math.PI * 2 - Math.PI;
}

// 扇の中から狙う相手を選ぶ
function pickTarget(u) {
  let best = null, bs = -1;
  const R2 = u.d.range * u.d.range;
  for (let i = 0; i < S.enemies.length; i++) {
    const e = S.enemies[i];
    const dx = e.x - u.x, dy = e.y - u.y, d2 = dx * dx + dy * dy;
    if (d2 > R2) continue;
    if (!inArc(u, e.x, e.y)) continue;          // **扇の外は撃たない**
    let score = 1 - Math.sqrt(d2) / u.d.range;
    if (u.d.kind === 'beam') {
      const a = Math.atan2(dy, dx), ca = Math.cos(a), sa = Math.sin(a);
      let line = 0;
      for (let j = 0; j < S.enemies.length; j += 2) {
        const o = S.enemies[j];
        const ox = o.x - u.x, oy = o.y - u.y;
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
    // 貫通：線上の敵に全部当てる。**当たった数が線の太さになる**
    const ca = Math.cos(a), sa = Math.sin(a);
    let hits = 0, far = 0;
    for (const e of S.enemies) {
      const ox = e.x - u.x, oy = e.y - u.y;
      const tt = ox * ca + oy * sa;
      if (tt < 0 || tt > u.d.range) continue;
      if (Math.abs(-ox * sa + oy * ca) > e.r + 2) continue;
      hurt(e, u.d.dmg * g, u.d.color);          // 散ると威力が落ちる
      hits++; if (tt > far) far = tt;
    }
    if (P.fx) S.fx.push({ k: 'beam', x: u.x, y: u.y, a, len: Math.max(far, 30), n: hits, t: 0, life: 0.18 });

  } else if (u.d.kind === 'field') {
    // 凍結：扇の中を丸ごと鈍らせる。**足が止まると後ろが詰まる**
    let n = 0;
    for (const e of S.enemies) {
      const dx = e.x - u.x, dy = e.y - u.y;
      if (dx * dx + dy * dy > u.d.range * u.d.range) continue;
      if (!inArc(u, e.x, e.y)) continue;
      e.slow = Math.max(e.slow, u.d.slow * g);
      e.slowT = Math.max(e.slowT, u.d.slowT);
      hurt(e, u.d.dmg, u.d.color);
      n++;
    }
    if (P.fx && n) S.fx.push({ k: 'chill', x: u.x, y: u.y, a, arc: u.arc, r: u.d.range, t: 0, life: 0.22 });

  } else {
    // 弾：集弾が悪いほどばらける
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
  if (e.hp <= 0) kill(e);
}
function kill(e) {
  e.dead = true; S.kills++; S.coin += P.enemyCoin;
  if (P.fx) {
    S.fx.push({ k: 'pop', x: e.x, y: e.y, r: e.r, t: 0, life: 0.22 });
    if (S.coins.length < 40) S.coins.push({ x: e.x, y: e.y, t: 0, life: 0.45 });
  }
}

// ===== 更新 =====
const _d = { x: 0, y: 0 };
function update(dt) {
  S.t += dt;

  // 湧き。**倒された分を上辺から補充し続ける**ので、画面の密度が保たれる
  S.spawnAcc += P.spawnPerSec * dt;
  let budget = 0;
  while (S.spawnAcc >= 1) { S.spawnAcc -= 1; budget++; }
  const need = P.target - S.enemies.length;
  for (let i = 0; i < Math.min(budget, need); i++) spawnEnemy();

  const t0 = performance.now();

  // 進む
  for (let i = 0; i < S.enemies.length; i++) {
    const e = S.enemies[i];
    flowDir(e.x, e.y, _d);
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
    const v = P.enemySpd * e.jam * (1 - e.slow) * dt;
    const nx = e.x + _d.x * v, ny = e.y + _d.y * v;
    if (walkableAt(nx, ny)) { e.x = nx; e.y = ny; }
    else if (walkableAt(nx, e.y)) e.x = nx;
    else if (walkableAt(e.x, ny)) e.y = ny;
    if (e.hit > 0) e.hit -= dt;
  }

  // 密集
  if (P.method === 'density' || P.method === 'both') crowdDensity(dt);
  if (P.method === 'bucket' || P.method === 'both') crowdBucket(dt);
  if (P.method === 'none') for (const e of S.enemies) e.jam = 1;

  S.moveMs = S.moveMs * 0.9 + (performance.now() - t0) * 0.1;

  // コアに触れたら消える（プロトタイプなのでライフは数えない）
  for (let i = S.enemies.length - 1; i >= 0; i--) {
    const e = S.enemies[i];
    if (e.dead) { S.enemies.splice(i, 1); continue; }
    if (Math.hypot(e.x - CORE.x, e.y - CORE.y) <= CORE.r + e.r) {
      if (P.fx) S.fx.push({ k: 'leak', x: e.x, y: e.y, t: 0, life: 0.25 });
      S.enemies.splice(i, 1);
    }
  }

  // 武器。**向きは敵がいちばん濃いほうへ、ゆっくり回る**
  for (const u of S.units) {
    u.cd -= dt;
    if (u.flash > 0) u.flash -= dt;
    const want = bestFacing(u);
    if (want !== null) {
      let da = want - u.face;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const step = u.d.turn * dt;
      u.face += Math.abs(da) < step ? da : Math.sign(da) * step;
    }
    while (u.cd <= 0) { fire(u); u.cd += 1 / u.d.rate; }
  }

  // 弾
  for (let i = S.bullets.length - 1; i >= 0; i--) {
    const b = S.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let gone = b.life <= 0 || !walkableAt(b.x, b.y);
    if (!gone) {
      for (const e of S.enemies) {
        if (e.dead) continue;
        const dx = e.x - b.x, dy = e.y - b.y;
        if (dx * dx + dy * dy > (e.r + 2) * (e.r + 2)) continue;
        if (b.hit && b.hit.has(e)) continue;
        hurt(e, b.dmg, b.color);
        if (b.pierce > 0) { b.pierce--; (b.hit || (b.hit = new Set())).add(e); }
        else { gone = true; }
        break;
      }
    }
    if (gone) S.bullets.splice(i, 1);
  }

  // 演出
  for (let i = S.fx.length - 1; i >= 0; i--) { const f = S.fx[i]; f.t += dt; if (f.t >= f.life) S.fx.splice(i, 1); }
  for (let i = S.nums.length - 1; i >= 0; i--) { const n = S.nums[i]; n.t += dt; n.y -= dt * 26; if (n.t >= n.life) S.nums.splice(i, 1); }
  for (let i = S.coins.length - 1; i >= 0; i--) { const c = S.coins[i]; c.t += dt; if (c.t >= c.life) S.coins.splice(i, 1); }
}

// ===== 描画 =====
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let scale = 1, offX = 0, offY = 0;

function resize() {
  const tools = document.getElementById('tools');
  const hud = document.getElementById('hud');
  const th = tools ? tools.getBoundingClientRect().height + 10 : 0;
  const hh = hud ? hud.getBoundingClientRect().height + 8 : 0;
  const vw = window.innerWidth;
  // **盤面をパネルの下に潜らせない。** コアが見えないと何も分からない
  const vh = Math.max(200, window.innerHeight - th - hh);
  scale = Math.min(vw / P.W, vh / P.H);
  const w = Math.round(P.W * scale), h = Math.round(P.H * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  // HUDのぶん下げて、下のパネルとぶつからない位置に置く
  cv.style.position = 'absolute';
  cv.style.left = Math.round((window.innerWidth - w) / 2) + 'px';
  cv.style.top = Math.round(hh) + 'px';
  const r = cv.getBoundingClientRect(); offX = r.left; offY = r.top;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// 地形。**升目は描かない。** 塗りと境界線で「地面」に見せる
let terrain = null;
function bakeTerrain() {
  const c = document.createElement('canvas');
  c.width = P.W; c.height = P.H;
  const g = c.getContext('2d');
  g.fillStyle = '#1b2733'; g.fillRect(0, 0, P.W, P.H);
  // 地面のムラ
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * P.W, y = Math.random() * P.H;
    if (!walkableAt(x, y)) continue;
    g.fillStyle = 'rgba(255,255,255,' + (0.008 + Math.random() * 0.016).toFixed(3) + ')';
    g.beginPath(); g.arc(x, y, 2 + Math.random() * 7, 0, 7); g.fill();
  }
  // 障害物は**地形の塊**として塗る（穴に見せない・セルの角を見せない）
  const mass = (col, rad) => {
    g.fillStyle = col;
    for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
      if (!solid[gi(cx, cy)]) continue;
      g.beginPath();
      g.arc(cx * P.CELL + P.CELL / 2, cy * P.CELL + P.CELL / 2, P.CELL * rad, 0, 7);
      g.fill();
    }
  };
  mass('#2f5138', 0.95);      // 外側のふち（明るい緑）
  mass('#24402c', 0.78);      // 本体
  // 葉のムラ。塊の上だけに散らす
  g.save();
  g.beginPath();
  for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
    if (!solid[gi(cx, cy)]) continue;
    g.moveTo(cx * P.CELL + P.CELL, cy * P.CELL + P.CELL / 2);
    g.arc(cx * P.CELL + P.CELL / 2, cy * P.CELL + P.CELL / 2, P.CELL * 0.95, 0, 7);
  }
  g.clip();
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * P.W, y = Math.random() * P.H;
    g.fillStyle = Math.random() < 0.5 ? 'rgba(58,94,64,.55)' : 'rgba(26,48,32,.5)';
    g.beginPath(); g.arc(x, y, 1.6 + Math.random() * 3.2, 0, 7); g.fill();
  }
  g.restore();
  terrain = c;
}

function draw() {
  ctx.clearRect(0, 0, P.W, P.H);
  if (terrain) ctx.drawImage(terrain, 0, 0);

  // 演出は敵より下に描く（敵とボタンを隠さないため）
  for (const f of S.fx) {
    const k = f.t / f.life;
    if (f.k === 'beam') {
      const w = 1.4 + Math.min(f.n, 12) * 0.55;
      ctx.strokeStyle = 'rgba(150,240,255,' + (0.85 * (1 - k)).toFixed(3) + ')';
      ctx.lineWidth = w * (1 - k * 0.5);
      ctx.beginPath(); ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x + Math.cos(f.a) * f.len, f.y + Math.sin(f.a) * f.len);
      ctx.stroke();
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

  // コア
  ctx.save();
  ctx.strokeStyle = '#7fb6ff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(CORE.x, CORE.y, CORE.r + Math.sin(S.t * 2) * 1.5, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(80,150,255,.18)'; ctx.fill();
  ctx.restore();

  // 敵
  for (const e of S.enemies) {
    ctx.fillStyle = e.hit > 0 ? '#ffffff'
                  : e.slow > 0 ? '#7fc4e8'
                  : (e.tint > 0 ? '#ff6f7e' : '#ef5568');
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill();
    if (e.hp < e.max) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(e.x - e.r, e.y - e.r - 3.5, e.r * 2, 2);
      ctx.fillStyle = '#7ee3a0';
      ctx.fillRect(e.x - e.r, e.y - e.r - 3.5, e.r * 2 * (e.hp / e.max), 2);
    }
  }

  // 弾
  ctx.lineWidth = 1.6;
  for (const b of S.bullets) {
    ctx.strokeStyle = b.color;
    ctx.beginPath(); ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012); ctx.stroke();
  }

  // ユニットと扇の射界
  for (const u of S.units) {
    const on = (u === sel);
    // 扇。選択中は濃く
    ctx.fillStyle = u.d.color.replace(')', '') ;
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.arc(u.x, u.y, u.d.range, u.face - u.arc, u.face + u.arc);
    ctx.closePath();
    ctx.fillStyle = on ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.045)';
    ctx.fill();
    ctx.strokeStyle = on ? u.d.color : 'rgba(255,255,255,.14)';
    ctx.lineWidth = on ? 1.4 : 0.8;
    ctx.stroke();

    ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(u.face);
    ctx.fillStyle = u.d.color;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#0b1016';
    ctx.fillRect(2, -2.2, 10, 4.4);
    if (u.flash > 0) {
      ctx.fillStyle = 'rgba(255,240,180,.9)';
      ctx.beginPath(); ctx.arc(13, 0, 4, 0, 7); ctx.fill();
    }
    ctx.restore();
    if (on) {
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(u.x, u.y, 15 + Math.sin(S.t * 6) * 1.2, 0, 7); ctx.stroke();
    }
  }

  // ダメージ数字
  ctx.font = '600 9px system-ui,sans-serif'; ctx.textAlign = 'center';
  for (const n of S.nums) {
    ctx.fillStyle = 'rgba(255,255,255,' + (1 - n.t / n.life).toFixed(2) + ')';
    ctx.fillText(Math.round(n.v), n.x, n.y);
  }
  // コイン（HUDのほうへ飛ぶ）
  for (const c of S.coins) {
    const k = c.t / c.life, ex = 26, ey = 14;
    const x = c.x + (ex - c.x) * k * k, y = c.y + (ey - c.y) * k * k;
    ctx.fillStyle = 'rgba(255,210,74,' + (1 - k * 0.7).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill();
  }
}

// ===== 入力 =====
// **ドラッグはやめた。** 置ける場所に吸い付く仕組みなので、
// 「選んで、置きたい場所をタップ」のほうがスマホでは確実で速い。
//   何も選んでいない → タップした場所に、トレイで選んだ武器を置く
//   ユニットを選択中 → タップした場所へ、そのユニットを動かす
//   選択中のユニットをもう一度タップ → 選択を外す
let placing = 'gatling';
let sel = null;                       // 選択中のユニット

const toField = (cx, cy) => ({ x: (cx - offX) / scale, y: (cy - offY) / scale });
const unitAt = (x, y) => S.units.find(u => Math.hypot(u.x - x, u.y - y) <= 15) || null;
const canPutAt = (x, y, ignore) => {
  if (!walkableAt(x, y)) return false;
  for (const o of S.units) if (o !== ignore && Math.hypot(o.x - x, o.y - y) < 18) return false;
  return true;
};

function setSel(u) {
  sel = u;
  document.getElementById('selbar').classList.toggle('show', !!u);
  if (u) document.getElementById('selName').textContent =
    u.d.name + '　射界 ' + Math.round(u.arc * 2 * 180 / Math.PI) + '°　集弾 ' + Math.round(grouping(u) * 100) + '%';
}

cv.addEventListener('pointerdown', (ev) => {
  const p = toField(ev.clientX, ev.clientY);
  const hit = unitAt(p.x, p.y);
  document.getElementById('hint').classList.add('gone');

  if (hit) { setSel(hit === sel ? null : hit); ev.preventDefault(); return; }

  if (sel) {
    // 選択中：そこへ動かす。置けない場所なら何もしない（誤爆で増やさない）
    if (canPutAt(p.x, p.y, sel)) { sel.x = p.x; sel.y = p.y; setSel(sel); }
    else flashNo(p.x, p.y);
  } else {
    const nu = placeUnit(placing, p.x, p.y);
    if (nu) setSel(nu); else flashNo(p.x, p.y);
  }
  ev.preventDefault();
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());

// 置けないことを、押した場所で知らせる
function flashNo(x, y) {
  if (P.fx) S.fx.push({ k: 'no', x, y, t: 0, life: 0.3 });
}

// ===== ボタン =====
function group(sel, fn) {
  const bs = document.querySelectorAll(sel);
  bs.forEach(b => b.addEventListener('click', () => {
    bs.forEach(o => o.classList.remove('on'));
    b.classList.add('on');
    fn(b);
  }));
}
group('#tools .w', b => { placing = b.dataset.w; setSel(null); });
group('#tools .n', b => {
  P.target = +b.dataset.n;
  // 減らすときは即座に間引く。増やすときは湧きに任せず一気に撒く
  if (S.enemies.length > P.target) S.enemies.length = P.target;
  while (S.enemies.length < P.target) {
    let x, y, tries = 0;
    do { x = rnd(20, P.W - 20); y = rnd(20, P.H * 0.62); tries++; } while (!walkableAt(x, y) && tries < 40);
    if (!walkableAt(x, y)) break;
    S.enemies.push(mkEnemy(x, y));
  }
});
group('#tools .m', b => {
  P.method = b.dataset.m;
  document.getElementById('hMethod').textContent = '密集: ' + b.textContent;
});
group('#tools .s', b => { P.speed = +b.dataset.s; });
document.getElementById('clear').addEventListener('click', () => { S.units.length = 0; setSel(null); });
document.getElementById('fx').addEventListener('click', (e) => {
  P.fx = !P.fx; e.currentTarget.classList.toggle('on', P.fx);
  e.currentTarget.textContent = '演出 ' + (P.fx ? 'ON' : 'OFF');
  if (!P.fx) { S.fx.length = 0; S.nums.length = 0; S.coins.length = 0; }
});
// 選択中のユニットの調整
const setArc = (d) => {
  if (!sel) return;
  sel.arc = Math.max(sel.d.arcMin, Math.min(sel.d.arcMax, sel.arc + d));
  setSel(sel);
};
document.getElementById('narrow').addEventListener('click', () => setArc(-0.12));
document.getElementById('wide').addEventListener('click', () => setArc(0.12));
document.getElementById('remove').addEventListener('click', () => {
  if (!sel) return;
  const i = S.units.indexOf(sel);
  if (i >= 0) S.units.splice(i, 1);
  setSel(null);
});
document.getElementById('deselect').addEventListener('click', () => setSel(null));

document.getElementById('panel').addEventListener('click', (e) => {
  const t = document.getElementById('tools');
  t.classList.toggle('hide');
  e.currentTarget.textContent = t.classList.contains('hide') ? '▲' : '▼';
});

// ===== HUD =====
let fpsAcc = 0, fpsN = 0, lastHud = 0;
function hud(dtReal) {
  fpsAcc += dtReal; fpsN++;
  if (S.t - lastHud < 0.25) return;
  lastHud = S.t;
  const fps = fpsN / Math.max(0.0001, fpsAcc);
  fpsAcc = 0; fpsN = 0;
  document.getElementById('hEn').textContent = S.enemies.length;
  document.getElementById('hFps').textContent = Math.round(fps);
  document.getElementById('hCoin').textContent = S.coin;
  document.getElementById('hKill').textContent = S.kills;
  document.getElementById('hCost').textContent = '移動 ' + S.moveMs.toFixed(2) + ' ms';
  // 重なり率は**参考値**。目的ではない
  const es = S.enemies; let hit = 0, tries = 240;
  for (let i = 0; i < tries && es.length > 1; i++) {
    const a = es[(Math.random() * es.length) | 0], b = es[(Math.random() * es.length) | 0];
    if (a === b) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) hit++;
  }
  S.overlap = 100 * hit / tries;
  document.getElementById('hOverlap').textContent = '重なり ' + S.overlap.toFixed(0) + '%（参考）';
}

// ===== ループ =====
let last = performance.now();
function loop(t) {
  requestAnimationFrame(loop);
  let dtReal = (t - last) / 1000; last = t;
  if (dtReal > 0.1) dtReal = 0.1;
  const steps = P.speed >= 2 ? 2 : 1;
  const dt = dtReal * P.speed / steps;
  for (let i = 0; i < steps; i++) update(dt);
  draw();
  hud(dtReal);
}

document.getElementById('hBuild').textContent = BUILD;
resize();
bakeTerrain();
// 最初から敵を撒いておく。**空の画面から始めると密度の判断ができない**
for (let i = 0; i < P.target; i++) {
  let x, y, tries = 0;
  do { x = rnd(20, P.W - 20); y = rnd(20, P.H * 0.62); tries++; } while (!walkableAt(x, y) && tries < 40);
  if (!walkableAt(x, y)) continue;
  S.enemies.push(mkEnemy(x, y));
}
// 最初から少し置いておく（何もない画面を見せない）
placeUnit('gatling', P.W * 0.30, P.H * 0.60);
placeUnit('gatling', P.W * 0.70, P.H * 0.60);
placeUnit('sniper', P.W * 0.50, P.H * 0.78);
placeUnit('cryo', P.W * 0.50, P.H * 0.50);
requestAnimationFrame(loop);
