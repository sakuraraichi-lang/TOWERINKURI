// 合成武器の「id で決まる耐性」の確認（2026-10-13・ユーザー「単一の耐性に引っかからない複数属性」）
//   node tools/simnode.js --file tools/measure/fusion-res.js
//   耐火・耐電・耐寒（第30章までの敵の耐性）／ボスの防壁（bossWallMul）／ラスボスの耐性（finalResMul）は、いままで攻撃を出した武器の id（合成武器は A）で判定していた。
//   合成武器は **A と B の両方が当てはまるときだけ**かかる（Combat.hitsRes）。A≠B なので、A か B のどちらか一方の種類だけが耐性・防壁に入っていても、合成武器は半分にならない。
//   ・普通の武器：今までどおり（半分になる）
//   ・合成武器：A の種類だけ／B の種類だけが入っている → 半分にならない　／ A と B の両方が入っている（ラスボスの耐性は複数入りうる）→ 半分
//   ・直近の削り（e.rec）は、合成武器なら A と B の両方に数える
REAL_MS = 600000;
const bad = [], rows = [];
function ok(c, m) { if (!c) bad.push(m); }
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
function freeSpot(run) {
  const st = run.stage;
  for (const h of st.hexCells()) if (Game.canPlaceAt(h.c, h.r)) {
    const p = st.hexCenter(h.c, h.r);
    const q = { x: p.x + 60, y: p.y };       // 的を置く点：歩けて、湧き口のバリアの外
    if (!(run.towers || []).some(T => Math.hypot(p.x - T.x, p.y - T.y) <= T.r + 80) && st.walkable((q.x / TILE) | 0, (q.y / TILE) | 0) && !Combat.inShield(run, q)) return { c: h.c, r: h.r, x: p.x, y: p.y };
  }
  throw new Error('置ける六角が無い');
}
const run = board();
const sp = freeSpot(run);
function enemy(extra) {
  const e = Combat.makeEnemy(run, ENEMY_TYPES.grunt, globalWave(run.stageIdx, 5), sp.x + 60, sp.y, 0, 1e300);
  e.spd = 0; e.lane = null; e.res = {}; e.armor = 0; e.regen = 0; e.split = 0; e.nest = 0; e.maxHp = 1e300; e.hp = 1e300;
  Object.assign(e, extra || {});
  return e;
}
// 1発のダメージ（run.dealt の増え）。by・src は攻撃を出した武器（src＝盤の上の1基）
function hit(e, by, src, opts) {
  const d0 = run.dealt;
  Combat.damage(run, e, 1000, Object.assign({ by, src }, opts || {}));
  return run.dealt - d0;
}
// 同じ六角に何度でも置く（置くたびに前の1基と置き場の記録を消す）
const clear = () => { run.units = []; run.enemies = []; Game.perm.placements = {}; };
const plainUnit = (wid) => { clear(); const u = Game.placeUnit(wid, sp.c, sp.r); if (!u) throw new Error('置けない ' + wid); return u; };
const fusedUnit = (fid) => { clear(); const u = Game.placeFusedUnit(fid, sp.c, sp.r); if (!u) throw new Error('置けない ' + fid); return u; };
const half = BAL.resMul;
const near = (a, b) => Math.abs(a - b) <= Math.abs(b) * 1e-9;

// ---- 単体：hitsRes / partsOf ----
{
  const u = fusedUnit('napalm');       // 火炎＋迫撃砲（A＝flame）
  ok(JSON.stringify(Combat.partsOf(u.id, u)) === '["flame","mortar"]', 'partsOf 合成武器は [A, B] ' + JSON.stringify(Combat.partsOf(u.id, u)));
  ok(JSON.stringify(Combat.partsOf('flame', null)) === '["flame"]', 'partsOf 普通の武器は [id]');
  ok(Combat.hitsRes(u.id, u, k => k === 'flame') === false, 'hitsRes A だけ当てはまる → かからない');
  ok(Combat.hitsRes(u.id, u, k => k === 'mortar') === false, 'hitsRes B だけ当てはまる → かからない');
  ok(Combat.hitsRes(u.id, u, k => k === 'flame' || k === 'mortar') === true, 'hitsRes 両方当てはまる → かかる');
  ok(Combat.hitsRes('flame', null, k => k === 'flame') === true, 'hitsRes 普通の武器は今までどおり');
  clear();
}

// ---- 敵の耐性（耐火・耐電・耐寒）。flame・tesla・cryo が A または B の合成武器で確かめる ----
const RES = [['fire', 'flame', ['napalm', 'hellmist', 'flameblade', 'vortex']], ['elec', 'tesla', ['stormcloud', 'resonator', 'plasmachain', 'thunderwhip', 'chainstrike']], ['cold', 'cryo', ['icebomb', 'cryobeam', 'icefoam', 'vortex']]];
for (const [rk, wid, fids] of RES) {
  // 普通の武器は半分（cold は凍らせる hit か cryo のとき・ダメージそのものは半分にならない＝減速の強さで見る）
  if (rk !== 'cold') {
    const pu = plainUnit(wid), e = enemy({ res: { [rk]: true } }), e0 = enemy();
    const a = hit(e, wid, pu), b = hit(e0, wid, pu);
    ok(near(a, b * half), rk + ' 普通の ' + wid + ' が半分にならない ' + a + ' / ' + b);
    rows.push(rk + ' 普通の ' + wid + ' ×' + (a / b).toFixed(3));
    clear();
  } else {
    const pu = plainUnit('cryo'), e = enemy({ res: { cold: true } }), e0 = enemy();
    hit(e, 'cryo', pu, { slow: 0.5, slowDur: 2, chill: true }); hit(e0, 'cryo', pu, { slow: 0.5, slowDur: 2, chill: true });
    ok(e.chill === 0 && e0.chill > 0 && near(e.slow, e0.slow * half), 'cold 普通の cryo が凍らない/半分 chill=' + e.chill + ' slow=' + e.slow + '/' + e0.slow);
    rows.push('cold 普通の cryo 凍らない=' + (e.chill === 0) + ' 減速 ×' + (e.slow / e0.slow).toFixed(3));
    clear();
  }
  for (const fid of fids) {
    const f = FUSIONS[fid];
    if (f.a !== wid && f.b !== wid) continue;
    const u = fusedUnit(fid);
    const e = enemy({ res: { [rk]: true } }), e0 = enemy();
    if (rk !== 'cold') {
      const a = hit(e, u.id, u), b = hit(e0, u.id, u);
      ok(near(a, b), rk + ' 合成 ' + fid + '（' + f.a + '+' + f.b + '）が ' + wid + ' の耐性で半分になった ' + a + ' / ' + b);
      rows.push(rk + ' ' + fid + ' ×' + (a / b).toFixed(3));
    } else {
      hit(e, u.id, u, { slow: 0.5, slowDur: 2 }); hit(e0, u.id, u, { slow: 0.5, slowDur: 2 });
      ok(near(e.slow, e0.slow), 'cold 合成 ' + fid + ' の減速が半分になった ' + e.slow + '/' + e0.slow);
      rows.push('cold ' + fid + ' 減速 ×' + (e.slow / e0.slow).toFixed(3));
    }
    clear();
  }
}

// ---- 耐電：連鎖が止まるか（普通のテスラ＝止まる／合成武器＝止まらない） ----
{
  const mk = () => { const l = []; for (let i = 0; i < 4; i++) { const e = enemy({ res: { elec: true } }); e.x = sp.x + 60 + i * 24; e.y = sp.y; run.enemies.push(e); l.push(e); } Grid.build(run.enemies); return l; };
  let seen = new Set();       // 1e300 からは引いても減らないので、ダメージを受けた敵を数える
  const od = Combat.damage;
  Combat.damage = function (r, e) { seen.add(e); return od.apply(this, arguments); };
  const count = (l) => l.filter(e => seen.has(e)).length;
  let l = mk(), tu = plainUnit('tesla');
  Combat.chainLightning(tu, run, l[0], 3, 10);
  const nPlain = count(l); clear(); seen = new Set();
  l = mk(); const fu = fusedUnit('stormcloud');
  Fusion.chainFrom(fu, run, l[0], 3, 10, 1, { direct: true });
  const nFused = count(l);
  Combat.damage = od;
  ok(nPlain === 1, '耐電：普通のテスラの連鎖が止まらない n=' + nPlain);
  ok(nFused === 4, '耐電：合成武器の連鎖が止まった n=' + nFused);
  rows.push('耐電の連鎖 普通のテスラ=' + nPlain + '体 / 雷雲=' + nFused + '体');
  clear();
}

// ---- ボスの防壁（ルートキット）----
function boss(bk, extra) { return enemy(Object.assign({ boss: true, bk, rec: {}, wallT: 0, wallBy: null }, extra || {})); }
{
  const pu = plainUnit('flame'), fu = fusedUnit('napalm'), fu2 = fusedUnit('hellmist');
  // 防壁が flame のとき：普通の flame は半分、flame を含む合成武器は半分にならない
  let e = boss('rootkit', { wallT: 4, wallBy: 'flame' }), e0 = boss('rootkit');
  const a = hit(e, 'flame', pu), b = hit(e0, 'flame', pu);
  ok(near(a, b * BAL.bossWallMul), '防壁：普通の flame が半分にならない ' + a + '/' + b);
  e = boss('rootkit', { wallT: 4, wallBy: 'flame' }); e0 = boss('rootkit');
  const c = hit(e, fu.id, fu), d = hit(e0, fu.id, fu);
  ok(near(c, d), '防壁：flame を含む合成 napalm が半分になった ' + c + '/' + d);
  e = boss('rootkit', { wallT: 4, wallBy: 'mortar' }); e0 = boss('rootkit');
  const c2 = hit(e, fu.id, fu), d2 = hit(e0, fu.id, fu);
  ok(near(c2, d2), '防壁：mortar（B）だけが防壁の napalm が半分になった ' + c2 + '/' + d2);
  rows.push('防壁 flame: 普通 ×' + (a / b).toFixed(3) + ' / napalm（flame+mortar）×' + (c / d).toFixed(3) + ' / 防壁 mortar: napalm ×' + (c2 / d2).toFixed(3));
  // 直近の削りは A と B の両方に数える
  e = boss('rootkit'); hit(e, fu.id, fu);
  ok(e.rec.flame > 0 && e.rec.mortar > 0 && near(e.rec.flame, e.rec.mortar), '直近の削り：合成武器は A と B の両方に数える ' + JSON.stringify(e.rec));
  e = boss('rootkit'); hit(e, 'flame', pu);
  ok(e.rec.flame > 0 && e.rec.mortar === undefined, '直近の削り：普通の武器は自分だけ ' + JSON.stringify(e.rec));
  rows.push('直近の削り：napalm の1発 → flame と mortar の両方に数えた／普通の flame の1発 → flame だけ');
  clear();
}

// ---- ラスボスの耐性（run.finalRes・複数入りうる）----
{
  const fu = fusedUnit('napalm'), pu = plainUnit('flame');
  const ref = hit(enemy({ boss: true, bk: 'final', rec: {} }), 'flame', pu);
  const t = (res, by, src) => { run.finalRes = res; const v = hit(enemy({ boss: true, bk: 'final', rec: {} }), by, src); run.finalRes = {}; return v; };
  const pA = t({ flame: true }, 'flame', pu);
  ok(near(pA, ref * BAL.finalResMul), 'ラスボス耐性：普通の flame が半分にならない ' + pA + '/' + ref);
  const fA = t({ flame: true }, fu.id, fu), fB = t({ mortar: true }, fu.id, fu), fAB = t({ flame: true, mortar: true }, fu.id, fu), f0 = t({}, fu.id, fu);
  ok(near(fA, f0), 'ラスボス耐性：A（flame）だけの napalm が半分になった ' + fA + '/' + f0);
  ok(near(fB, f0), 'ラスボス耐性：B（mortar）だけの napalm が半分になった ' + fB + '/' + f0);
  ok(near(fAB, f0 * BAL.finalResMul), 'ラスボス耐性：A と B の両方が入っているのに napalm が半分にならない ' + fAB + '/' + f0);
  rows.push('ラスボス耐性 普通 flame ×' + (pA / ref).toFixed(3) + ' / napalm: flame だけ ×' + (fA / f0).toFixed(3) + ' mortar だけ ×' + (fB / f0).toFixed(3) + ' 両方 ×' + (fAB / f0).toFixed(3));
  clear();
}

({ nBad: bad.length, bad, rows })
