// 合成武器の札（A：fp_* 24枚・B：fl_* 8枚）の確認（2026-10-12）。
//   node tools/simnode.js --file tools/measure/fusion-cards.js
//   1. 3択に出る条件：その合成武器を盤に置いているときだけ／札を持っているときだけ／置いていない合成武器の札は出ない／連携の札は2つそろったときだけ
//   2. 札を取ったときに、1基ずつ値が乗る（組み直し applyMods のあとも残る）。凸（所持枚数）で主な軸が伸びる
//   3. 挙動が起きている：動かない的6体の前で約10秒撃たせ、札あり・なしで、その札の挙動を数える（札なしで0、または札ありのほうが多い）
REAL_MS = 600000;
const bad = [];
const out = { rules: {}, behavior: {} };
function ok(c, m) { if (!c) bad.push(m); }

const A_IDS = FUSION_IDS.map(f => 'fp_' + f);
const B_IDS = CARD_IDS.filter(id => CARDS[id].flink);
ok(A_IDS.every(id => CARDS[id] && CARDS[id].rarity === 'epic' && CARDS[id].fpick), 'A の札が24枚そろっていない／エピックでない');
ok(B_IDS.length === 8 && B_IDS.every(id => CARDS[id].rarity === 'legendary'), 'B の札が8枚そろっていない／レジェンドでない ' + B_IDS.length);
out.rules.counts = { A: A_IDS.length, B: B_IDS.length };

// ---------- 1・2 3択の条件と、札が乗ること ----------
function board(ch) {
  Game.newSave(); seedRng(3); unlockTo(ch);
  Game.perm.deepest = 40; Game.perm.legacyDeep = 40; Game.perm.prestiges = 2; Relic.invalidate();
  Game.perm.loadout = ['wc_gatling'];
  Game.perm.placements = {}; Game.perm.lastPlace = {};
  return Game.startPrep(ch);
}
function freeHexes(run, n) {
  const out = [];
  for (const h of run.stage.hexCells()) {
    if (!Game.canPlaceAt(h.c, h.r)) continue;
    if (out.every(o => Math.hypot(o.c - h.c, o.r - h.r) > 3)) out.push({ c: h.c, r: h.r });
    if (out.length >= n) break;
  }
  return out;
}
const eligible = () => Draft.eligible();
for (const fid of FUSION_IDS) {
  const f = FUSIONS[fid], id = 'fp_' + fid;
  const run = board('ch20');
  run.stageIdx = MAIN_CHAPTERS;                         // アセンションの章（上位パックの札は第30章までの3択に出ない）
  Game.perm.loadout = ['wc_' + f.a, 'wc_' + f.b];
  for (const w of [f.a, f.b]) Game.grant('wc_' + w, 1);
  Game.costCap = () => 200;
  const hx = freeHexes(run, 1)[0];
  // 合成していない（A を置いただけ）→ 札を持っていても出ない
  Game.grant(id, 1);
  const a0 = Game.placeUnit(f.a, hx.c, hx.r);
  ok(a0, fid + ' A が置けない');
  ok(!eligible().includes(id), fid + ' 合成していないのに札が3択に出る');
  Game.removeUnit(a0);
  // 合成武器を置く：持っていれば出る。持っていなければ出ない
  const u = Game.placeFusedUnit(fid, hx.c, hx.r);
  ok(u && u.fuse === fid, fid + ' 合成武器が置けない');
  const el = eligible();
  ok(el.includes(id), fid + ' 置いていて持っているのに札が3択に出ない');
  for (const other of FUSION_IDS) if (other !== fid) ok(!el.includes('fp_' + other), fid + ' が置いてあるのに ' + other + ' の札が出る');
  for (const b of B_IDS) ok(!el.includes(b), fid + ' 1つだけなのに連携の札 ' + b + ' が出る');
  Game.perm.collection[id] = 0;
  ok(!eligible().includes(id), fid + ' 札を持っていないのに出る');
  Game.perm.collection[id] = 1;
  // 第30章までの3択には出ない（アセンション専用）
  run.stageIdx = 5;
  ok(!eligible().includes(id), fid + ' 第30章までの3択に出る');
  run.stageIdx = MAIN_CHAPTERS;
  // 取る：A の札の値が乗る。組み直しても残る。B の札は乗らない（その合成武器の分だけ）
  const s0 = JSON.stringify(u.flags.fc || {}), chain0 = u.s.chain, refl0 = u.s.reflect || 0;
  run.cards[id] = 1; Game.applyCard(id, run);
  const F = u.flags.fc || {};
  const changed = JSON.stringify(F) !== s0 || u.s.chain !== chain0 || (u.s.reflect || 0) !== refl0;
  ok(changed, fid + ' 札を取っても何も乗らない');
  Game.applyMods();
  const F2 = u.flags.fc || {};
  ok(JSON.stringify(F2) === JSON.stringify(F) || fid === 'x', fid + ' 組み直しで札の値が変わった ' + JSON.stringify(F) + ' → ' + JSON.stringify(F2));
  ok(changed && (Object.keys(F2).length > 0 || u.s.chain !== chain0 || (u.s.reflect || 0) !== refl0), fid + ' 組み直しで札の値が消えた');
  ok(Game.stackLimit(id) === 1, fid + ' 重ね取りの上限');
  run.cards[id] = 1;
  ok(!eligible().includes(id), fid + ' 1回取ったのにまた出る（maxStack 1）');
  // 凸：所持枚数を増やすと主な軸が伸びる
  const axisOf = () => { Game.applyMods(); const g = u.flags.fc || {}; return Object.values(g).filter(v => typeof v === 'number').concat([u.s.chain, u.s.reflect || 0]); };
  Game.perm.collection[id] = 1; const v1 = axisOf();
  Game.perm.collection[id] = 100; const v14 = axisOf();
  ok(v14.some((v, i) => v > v1[i]), fid + ' 凸（100枚＝5凸）で主な軸が伸びない ' + JSON.stringify(v1) + ' → ' + JSON.stringify(v14));
  Game.perm.collection[id] = 1;
  out.rules[fid] = { flags: F, rank14: v14 };
}

// B：2つの合成武器がそろっているときだけ
for (const id of B_IDS) {
  const c = CARDS[id], [fa, fb] = c.flink;
  const run = board('ch20');
  run.stageIdx = MAIN_CHAPTERS;
  Game.costCap = () => 200;
  for (const f of [fa, fb]) { Game.perm.loadout.push('wc_' + FUSIONS[f].a); Game.grant('wc_' + FUSIONS[f].a, 1); }
  Game.grant(id, 1);
  const hs = freeHexes(run, 2);
  ok(!eligible().includes(id), id + ' 何も置いていないのに出る');
  const ua = Game.placeFusedUnit(fa, hs[0].c, hs[0].r);
  ok(ua && !eligible().includes(id), id + ' 片方だけなのに出る');
  const ub = Game.placeFusedUnit(fb, hs[1].c, hs[1].r);
  ok(ub, id + ' もう片方が置けない ' + fa + ' ' + fb);
  ok(eligible().includes(id), id + ' 2つそろっているのに出ない');
  for (const o of B_IDS) if (o !== id) ok(!eligible().includes(o), id + ' の盤で別の連携の札 ' + o + ' が出る');
  Game.perm.collection[id] = 0;
  ok(!eligible().includes(id), id + ' 持っていないのに出る');
  Game.perm.collection[id] = 1;
  run.cards[id] = 1; Game.applyCard(id, run);
  const key = Object.keys(ua.flags.fl || {})[0];
  ok(key && ua.flags.fl[key] > 0 && ub.flags.fl && ub.flags.fl[key] > 0, id + ' 札を取っても両方に乗らない');
  Game.applyMods();
  ok(ua.flags.fl && ub.flags.fl && ua.flags.fl[key] > 0, id + ' 組み直しで札の値が消えた');
  // 片方をどける → 連携は効かない（Fusion.link が 0）
  Game.removeUnit(ub);
  ok(Fusion.link(ua, run, key, fb) === 0, id + ' 相手が居ないのに連携が効く');
  out.rules[id] = { key, v: ua.flags.fl && ua.flags.fl[key] };
}

// ---------- 3 挙動が起きているか ----------
const Cn = {};
const inc = (k, n) => { Cn[k] = (Cn[k] || 0) + (n === undefined ? 1 : n); };
function wrap(obj, name, f) { const o = obj[name]; obj[name] = function (...a) { const r = o.apply(this, a); f(a, r); return r; }; }
wrap(Combat, 'explode', (a) => { inc('explode'); inc('explode:' + (a[5] && a[5].color)); inc('explodeR:' + Math.round(a[3])); });
wrap(Combat, 'lineHit', (a) => { inc('lineHit'); inc('lineHit:' + (a[6] && a[6].color)); });
wrap(Combat, 'spawnLob', () => inc('lob'));
wrap(Combat, 'spawnField', (a) => inc('field:' + (a[3] && a[3].kind)));
wrap(Combat, 'spotImpact', () => inc('spot'));
wrap(Combat, 'spawnBullet', () => inc('bullet'));
wrap(Combat, 'laser', (a, r) => { if (r) { inc('laser'); inc('laserPts', r.pts.length); Cn.laserMax = Math.max(Cn.laserMax || 0, r.pts.length); } });
wrap(Combat, 'fx', (a) => { if (a[1] && a[1].type === 'tentacle') inc('tentacleFx'); });
wrap(Fusion, 'zone', (a) => inc('zone:' + a[1].kind));
wrap(Fusion, 'chainFrom', (a) => { inc('chain'); inc('chain:' + (a[6] && a[6].color)); inc('chainN', a[3]); });
wrap(Fusion, 'bulletAt', () => inc('bulletAt'));

function geom(run) {
  const st = run.stage, hx = (st.vec && st.vec.hexes) || [];
  let best = null;
  for (const h of hx) {
    if (h.y > st.h * 0.5 || h.y < 80) continue;
    for (const a of Game.FACES) {
      let len = 0;
      for (let d = 10; d <= 220; d += 10) {
        if (!st.walkable(((h.x + Math.cos(a) * d) / TILE) | 0, ((h.y + Math.sin(a) * d) / TILE) | 0)) break;
        len = d;
      }
      const sc = len - Math.abs(h.x - st.w / 2) * 0.05;
      if (!best || sc > best.sc) best = { sc, h, a, len };
    }
  }
  return best;
}
function trial(fids, cards, secs, o) {
  o = o || {};
  const run = board('ch20');
  const best = geom(run), st = run.stage, hx = (st.vec && st.vec.hexes) || [];
  const units = [];
  fids.forEach((fid, i) => {
    let h = best.h;
    if (i > 0) {
      let h2 = null, bd = 1e9;
      for (const q of hx) {
        const dx = q.x - best.h.x, dy = q.y - best.h.y, d = Math.hypot(dx, dy);
        if (d < 20 || d > 150 || units.some(u => Math.hypot(u.x - q.x, u.y - q.y) < 20)) continue;
        const perp = Math.abs(-Math.sin(best.a) * dx + Math.cos(best.a) * dy);
        const sc = perp * 3 + d * 0.2;
        if (sc < bd) { bd = sc; h2 = q; }
      }
      h = h2;
    }
    const u = Game.newUnit(FUSIONS[fid].a, h.c, h.r, best.a);
    u.fuse = fid;
    u.s = Object.assign({}, u.def.base, BAL.fusion[fid].stat);
    u.s.arc = u.arc;
    units.push(u);
  });
  run.units = units;
  const t = ENEMY_TYPES.grunt, g = Math.max(Combat.gw(run), 1);
  const enemies = [], L = Math.max(90, best.len), N = o.n || 6;
  for (let i = 0; i < N; i++) {
    const dd = 45 + (L - 60) * i / (N - 1);
    const ex = best.h.x + Math.cos(best.a) * dd + Math.sin(best.a) * (i % 2 ? 7 : -7), ey = best.h.y + Math.sin(best.a) * dd - Math.cos(best.a) * (i % 2 ? 7 : -7);
    const en = Combat.makeEnemy(run, t, g, ex, ey, 0, 1e12);
    en.spd = 0; en.lane = null;
    run.enemies.push(en); enemies.push(en);
  }
  for (const u of units) if (u.def.aimPoint) { const m = enemies[(N / 2) | 0]; u.ax = m.x; u.ay = m.y; u.aim = { x: m.x, y: m.y }; }
  for (const c of cards) { run.cards[c] = 1; Game.applyCard(c, run); }
  for (const k of Object.keys(Cn)) delete Cn[k];
  let markSeen = 0, fvulnLeft = 0;
  for (let i = 0; i < secs * 30; i++) {
    Combat.update(run, 1 / 30);
    if (enemies.some(e => e.fmarkT > 0)) markSeen++;
  }
  const res = Object.assign({}, Cn, { markSeen, dealt: run.dealt });
  run.units = []; run.enemies = []; run.fzones && (run.fzones.length = 0); run.later && (run.later.length = 0);
  return res;
}

// 札ごとの「その挙動が起きた」数え方。札なし（off）と札あり（on）を3回ずつ回して合計を比べる
const M = {
  fp_starassault: C => C.explode || 0,
  fp_plasmachain: C => C.chainN || 0,
  fp_chakram: C => C.bulletAt || 0,
  fp_toxblade: C => C['field:gas'] || 0,
  fp_voidblade: C => C.tentacleFx || 0,
  fp_flameblade: C => C.lineHit || 0,
  fp_abyssnet: C => C.explode || 0,
  fp_thunderwhip: C => C['zone:twister'] || 0,
  fp_hellmist: C => C.explode || 0,
  fp_napalm: C => C.lob || 0,
  fp_vortex: C => C['explodeR:38'] || 0,
  fp_icefoam: C => C.explode || 0,
  fp_cryobeam: C => C['zone:spikes'] || 0,
  fp_convergence: C => C.laserMax || 0,
  fp_carpet: C => C['zone:firewhirl'] || 0,
  fp_chainstrike: C => C.chain || 0,
  fp_stormcloud: C => C.chain || 0,
  fp_resonator: C => C.chain || 0,
  fp_acidfoam: null,
  fp_toxmortar: C => C.lob || 0,
  fp_bubblegun: C => C.explode || 0,
  fp_scattergun: C => C.spot || 0,
  fp_bubbleblade: C => C.lineHit || 0,
  fp_icebomb: C => C['zone:blizzard'] || 0,
};
const REPS = 3, SECS = 10;
for (const fid of FUSION_IDS) {
  const id = 'fp_' + fid, m = M[id];
  if (!m) continue;
  let off = 0, on = 0;
  for (let k = 0; k < REPS; k++) {
    seedRng(100 + k); off += m(trial([fid], [], SECS));
    seedRng(100 + k); on += m(trial([fid], [id], SECS));
  }
  ok(on > off, id + ' 挙動が増えていない（札なし ' + off + ' / 札あり ' + on + '）');
  out.behavior[id] = { off, on };
}

// 王水：場を出たあとも脆弱と装甲ダウンが残る（札あり／なしで、場の外へ出した敵の fvulnT）
{
  const res = {};
  for (const withCard of [false, true]) {
    const run = board('ch20');
    const best = geom(run);
    const u = Game.newUnit('gas', best.h.c, best.h.r, best.a); u.fuse = 'acidfoam';
    u.s = Object.assign({}, u.def.base, BAL.fusion.acidfoam.stat); u.s.arc = u.arc;
    run.units = [u];
    if (withCard) { run.cards.fp_acidfoam = 1; Game.applyCard('fp_acidfoam', run); }
    const e = Combat.makeEnemy(run, ENEMY_TYPES.grunt, Math.max(Combat.gw(run), 1), best.h.x + Math.cos(best.a) * 100, best.h.y + Math.sin(best.a) * 100, 0, 1e12);
    e.spd = 0; e.lane = null; run.enemies.push(e);
    u.target = e;
    Fusion.as(u.id, u, () => FUSIONS.acidfoam.fire(Object.assign(u, { target: e, n: 1, group: 1, shots: 1, angle: best.a }), run));
    const z = run.fzones[run.fzones.length - 1];
    ok(z && z.kind === 'aquaregia', 'acidfoam 場が出ない');
    Combat.update(run, 1 / 30);          // 敵を空間の索引（Grid）に載せる
    Fusion.zoneHit(run, z, 0.25);
    const inside = e.fvulnT;
    e.x += 1000;                       // 場の外へ
    for (let i = 0; i < 30; i++) Combat.update(run, 1 / 30);   // 1秒
    res[withCard ? 'on' : 'off'] = { inside: +inside.toFixed(2), after1s: +(e.fvulnT > 0 ? e.fvulnT : 0).toFixed(2), armorT: +(e.armorT > 0 ? e.armorT : 0).toFixed(2) };
    run.units = []; run.enemies = []; run.fzones.length = 0;
  }
  ok(res.off.after1s === 0 && res.on.after1s > 0, '黄金の残滓：場を出たあとに脆弱が残らない ' + JSON.stringify(res));
  out.behavior.fp_acidfoam = res;
}

// B：札なしで0・札ありで>0 になる数え方
const MB = {
  fl_mark: { fids: ['starassault', 'scattergun'], m: C => C.markSeen || 0 },
  fl_rift: { fids: ['voidblade', 'abyssnet'], m: C => C.tentacleFx || 0 },
  fl_shatter: { fids: ['vortex', 'icefoam'], m: C => C['explodeR:56'] || 0 },
  fl_arc: { fids: ['stormcloud', 'resonator'], m: C => C.chain || 0 },
  fl_boom: { fids: ['hellmist', 'napalm'], m: C => C['explode:#ffd84a'] || 0 },
  fl_bolt: { fids: ['convergence', 'chainstrike'], m: C => (C['chain:#fff0b0'] || 0) + (C['lineHit:#b58bff'] || 0) },
  fl_trail: { fids: ['flameblade', 'chakram'], m: C => C['field:fire'] || 0 },
  fl_acid: { fids: ['toxmortar', 'acidfoam'], m: C => C['explode:#ffd24a'] || 0 },
};
for (const id of B_IDS) {
  const { fids, m } = MB[id];
  let off = 0, on = 0, onHalf = 0, offHalf = 0;
  for (let k = 0; k < REPS; k++) {
    seedRng(200 + k); off += m(trial(fids, [], SECS));
    seedRng(200 + k); on += m(trial(fids, [id], SECS));
    // 片方だけのとき（相手が居ない）は効かない
    seedRng(200 + k); onHalf += m(trial([fids[0]], [id], SECS));
    seedRng(200 + k); offHalf += m(trial([fids[0]], [], SECS));
  }
  ok(on > off && on > 0, id + ' 挙動が起きていない（札なし ' + off + ' / 札あり ' + on + '）');
  ok(onHalf <= offHalf * 1.1 + 1, id + ' 相手が居ないのに効いている（札なし ' + offHalf + ' / 片方だけ ' + onHalf + '）');
  out.behavior[id] = { off, on, offHalf, onHalf };
}

out.bad = bad;
out.n = { A: A_IDS.length, B: B_IDS.length };
out
