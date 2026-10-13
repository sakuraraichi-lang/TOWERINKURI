// 合成武器の複数属性の確認（2026-10-13・ユーザー「合成武器は A と B の両方の系統を持ち、無効も耐性も、両方が当てはまるときだけ効く」）
//   node tools/simnode.js --file tools/measure/fusion-sys.js
//   合成武器を1基置き、動かない上位の敵（HP 1e300）に6秒撃たせて、入ったダメージ（run.dealt）を数える。
//     ・A だけ無効 / B だけ無効 → 当たる（dealt > 0）　・A も B も無効 → 当たらない（dealt = 0・状態異常も付かない）
//     ・A と B が同じ系統の合成 → その系統が無効なら当たらない　・ゼロデイ：片方が弱点の系統なら半分にならない
//   OLD=true; を先頭に付けると、直す前の判定（A の系統だけ）で回して差を見られる（Combat.sysOf が src を無視する）
REAL_MS = 600000;
const bad = [], rows = [];
function ok(c, m) { if (!c) bad.push(m); }
const OLD_MODE = (typeof OLD !== 'undefined') && OLD;
if (OLD_MODE) { const o = Combat.sysOf; Combat.sysOf = function (by) { return o.call(this, by); }; }

function board() {
  Game.newSave(); unlockTo('ch20');
  Game.perm.deepest = 40; Game.perm.legacyDeep = 40; Game.perm.prestiges = 2; Relic.invalidate();
  Game.perm.loadout = Object.keys(WEAPONS).map(w => 'wc_' + w);
  for (const w of Object.keys(WEAPONS)) Game.grant('wc_' + w, 1);
  Game.perm.placements = {}; Game.perm.lastPlace = {};
  const run = Game.startPrep('ch20');
  Game.costCap = () => 200;
  return run;
}
// 置き場所：コアから離れ、前方 60〜140px が見通せて歩ける六角と向き（全部同じ）
function spot(run) {
  const st = run.stage;
  let best = null;
  for (const h of st.hexCells()) {
    if (!Game.canPlaceAt(h.c, h.r)) continue;
    const p = st.hexCenter(h.c, h.r);
    for (const a of Game.FACES) {
      let n = 0, g = 0, near = false;
      for (let d = 60; d <= 140; d += 20) for (let w = -30; w <= 30; w += 30) {
        const x = p.x + Math.cos(a) * d - Math.sin(a) * w, y = p.y + Math.sin(a) * d + Math.cos(a) * w;
        n++; if (!Combat.losBlocked(st, p.x, p.y, x, y) && st.walkable((x / TILE) | 0, (y / TILE) | 0)) g++;
        if ((run.towers || []).some(T => Math.hypot(x - T.x, y - T.y) <= T.r + 50)) near = true;
      }
      if (near) continue;
      if (!best || g / n > best.f + 1e-9) best = { f: g / n, c: h.c, r: h.r, x: p.x, y: p.y, a };
    }
  }
  return best;
}
const sp = spot(board());

// imm＝無効の系統の一覧、weak＝ゼロデイの弱点（無ければ null）。返り値＝入ったダメージと、付いた状態異常の数
function shoot(fid, imm, weak) {
  seedRng(7);
  const run = board();
  const u = Game.placeFusedUnit(fid, sp.c, sp.r);
  u.face = u.angle = sp.a;
  const ca = Math.cos(sp.a), sa = Math.sin(sp.a);
  if (Game.usesAimPoint(u.def)) Game.setAimPoint(u, sp.x + ca * 100, sp.y + sa * 100);
  const T = { name: 'sysprobe', up: true, k: 1, hp: 1, spd: 0, r: 17, coin: 0, color: '#fff', imm: imm || [] };
  const es = [];
  for (let d = 70; d <= 130; d += 20) for (let w = -20; w <= 20; w += 20) {
    const e = Combat.makeEnemy(run, T, globalWave(run.stageIdx, 5), sp.x + ca * d - sa * w, sp.y + sa * d + ca * w, 0, 1e300);
    e.spd = 0; e.lane = null; e.res = {}; e.armor = 0; e.regen = 0; e.split = 0; e.nest = 0;
    if (weak) e.weak = weak;
    run.enemies.push(e); es.push(e);
  }
  for (let i = 0; i < 360; i++) Combat.update(run, 1 / 60);
  const out = { dealt: run.dealt, states: es.reduce((a, e) => a + (e.burnT > 0 ? 1 : 0) + (e.shock > 0 ? 1 : 0) + (e.slowT > 0 ? 1 : 0) + (e.stun > 0 ? 1 : 0) + (e.poisonT > 0 ? 1 : 0), 0) };
  run.units = []; run.enemies = []; run.fzones && (run.fzones.length = 0); run.later && (run.later.length = 0);
  unseedRng();
  return out;
}

// 単体の判定（immune / upperMul）
{
  const e = { upper: 'x', imm: { phys: true } };
  ok(Combat.immune(e, 'phys') === true && Combat.immune(e, 'field') === false, 'immune 文字列');
  ok(Combat.immune(e, ['phys', 'field']) === false, 'immune 配列：片方だけ無効なら通る');
  e.imm = { phys: true, field: true };
  ok(Combat.immune(e, ['phys', 'field']) === true, 'immune 配列：両方無効なら無効');
  ok(Combat.immune({ imm: {} }, ['phys']) === false, 'immune 上位でない敵');
  ok(Combat.upperMul({ upper: 'x', weak: 'optic' }, ['phys', 'optic'], null) === 1, 'upperMul 片方が弱点なら半分にならない');
  ok(Combat.upperMul({ upper: 'x', weak: 'optic' }, ['phys', 'field'], null) === BAL.ascZdOther, 'upperMul 両方弱点以外なら半分');
}

let pairs = 0, same = 0;
for (const fid of FUSION_IDS) {
  const f = FUSIONS[fid], sa = WEAPONS[f.a].sys, sb = WEAPONS[f.b].sys;
  const none = shoot(fid, []);
  ok(none.dealt > 0, fid + ' 無効なしで当たらない（測定の置き方の問題）');
  const row = { fid, a: f.a + ':' + sa, b: f.b + ':' + sb };
  if (sa !== sb) {
    pairs++;
    const onlyA = shoot(fid, [sa]), onlyB = shoot(fid, [sb]), both = shoot(fid, [sa, sb]);
    row.onlyA = onlyA.dealt > 0; row.onlyB = onlyB.dealt > 0; row.both = both.dealt;
    ok(onlyA.dealt > 0, fid + ' A（' + sa + '）だけ無効の敵に当たらない');
    ok(onlyB.dealt > 0, fid + ' B（' + sb + '）だけ無効の敵に当たらない');
    ok(both.dealt === 0 && both.states === 0, fid + ' 両方無効なのに当たった/状態異常が付いた dealt=' + both.dealt + ' states=' + both.states);
  } else {
    same++;
    const imm = shoot(fid, [sa]);
    row.imm = imm.dealt; row.states = imm.states;
    ok(imm.dealt === 0 && imm.states === 0, fid + ' A も B も ' + sa + ' なのに、無効の敵に当たった dealt=' + imm.dealt);
  }
  rows.push(row);
}
({ mode: OLD_MODE ? '旧（A の系統だけ）' : '新（A と B の両方）', nBad: bad.length, bad, pairs, same, fusions: FUSION_IDS.length,
  rows: rows.map(r => r.fid + ' ' + r.a + ' ' + r.b + (r.onlyA !== undefined ? '  Aだけ無効=' + (r.onlyA ? '当たる' : '当たらない') + ' Bだけ無効=' + (r.onlyB ? '当たる' : '当たらない') + ' 両方無効=' + r.both : '  同じ系統で無効=' + r.imm + ' 状態=' + r.states)) })
