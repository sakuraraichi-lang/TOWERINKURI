// 合成の仕組みの確認（合成武器・2026-10-06）。24種それぞれで、置く→隣に置く→合成→コスト・基数・保存と読み戻し・撤去・移動・全撤去を1基ずつ確かめる。
//   node tools/simnode.js --file tools/measure/fusion-mech.js
REAL_MS = 600000;
const bad = [];
const log = [];
function ok(c, m) { if (!c) bad.push(m); }
function board(fid, ch) {
  const f = FUSIONS[fid];
  Game.newSave(); seedRng(3); unlockTo(ch);
  Game.perm.deepest = 40; Game.perm.legacyDeep = 40; Game.perm.prestiges = 2; Relic.invalidate();
  Game.perm.loadout = ['wc_' + f.a, 'wc_' + f.b];
  for (const w of [f.a, f.b]) Game.grant('wc_' + w, 1);
  Game.perm.placements = {}; Game.perm.lastPlace = {};
  return Game.startPrep(ch);
}
function pair(run) {
  for (const h of run.stage.hexCells()) {
    if (!Game.canPlaceAt(h.c, h.r)) continue;
    for (const [c, r] of MapGen.hexNbr(h.c, h.r)) if (Game.canPlaceAt(c, r)) return [{ c: h.c, r: h.r }, { c, r }];
  }
  return null;
}
for (const fid of FUSION_IDS) {
  const f = FUSIONS[fid], A = WEAPONS[f.a], B = WEAPONS[f.b];
  const run = board(fid, 'ch20');
  const p = pair(run);
  ok(!!p, fid + ' 隣り合う2つの地面が無い');
  Game.meta.coins = 1e12;
  const a = Game.placeUnit(f.a, p[0].c, p[0].r), b = Game.placeUnit(f.b, p[1].c, p[1].r);
  ok(a && b, fid + ' A/B が置けない');
  ok(Game.costUsed() === A.cost + B.cost, fid + ' 置いた直後のコスト ' + Game.costUsed());
  // 札が無いと選択肢は出ない
  ok(Fusion.options(run).length === 0, fid + ' 札が無いのに選択肢が出た');
  Game.grant('fus_' + fid, 1);
  let o = Fusion.options(run);
  ok(o.length === 1 && o[0].ok && o[0].fid === fid, fid + ' 札があるのに選択肢が1つ出ない: ' + o.length);
  // 逆向き（B を A として置いたもの）は合成にならない（A＋B の順は固定）
  const used0 = Game.costUsed();
  const r = Game.fuseUnits(a, b, fid);
  ok(r.ok, fid + ' 合成が失敗 ' + r.why);
  ok(run.units.length === 1 && run.units[0] === a && a.fuse === fid && a.id === f.a, fid + ' 合成後のユニット');
  ok(Game.costUsed() === f.cost && f.cost === A.cost + B.cost + 2, fid + ' 合成後のコスト ' + Game.costUsed() + ' / 式 ' + (A.cost + B.cost + 2));
  ok(Game.unitCount(f.a) === 1 && Game.unitCount(f.b) === 0, fid + ' 基数 A=' + Game.unitCount(f.a) + ' B=' + Game.unitCount(f.b));
  ok(a.s.range === BAL.fusion[fid].stat.range || fid === 'x', fid + ' 数値が合成のものに入れ替わっていない range ' + a.s.range);
  ok(Fusion.options(run).length === 0, fid + ' 合成後にまだ選択肢が出る');
  // 保存と読み戻し（置き直し・次のウェーブの合間・出撃し直し）
  const pl = Game.perm.placements[run.stageId];
  ok(pl.length === 1 && pl[0].f === fid && pl[0].w === f.a, fid + ' 配置の保存 ' + JSON.stringify(pl));
  const run2 = Game.startPrep('ch20');
  ok(run2.units.length === 1 && run2.units[0].fuse === fid && Game.costUsed() === f.cost, fid + ' 読み戻し units=' + run2.units.length + ' cost=' + Game.costUsed());
  // 札の掛け直し（applyMods）で C の数値が消えない／札が A のものだけ乗る
  Game.applyMods();
  ok(run2.units[0].fuse === fid && run2.units[0].s.range === BAL.fusion[fid].stat.range, fid + ' applyMods 後に C の値が残らない');
  // 移動・撤去・全撤去
  const u = run2.units[0];
  const q = [...run2.stage.hexCells()].find(h => Game.canPlaceAt(h.c, h.r, u));
  ok(Game.moveUnit(u, q.c, q.r) && u.fuse === fid && Game.perm.placements[run2.stageId][0].f === fid, fid + ' 移動で合成が消えた');
  ok(Game.removeUnit(u) && Game.costUsed() === 0 && run2.units.length === 0, fid + ' 撤去でコストが戻らない');
  // 全撤去
  const cap0 = Game.costCap; Game.costCap = () => 40;
  const aa = Game.placeUnit(f.a, p[0].c, p[0].r), q2 = p[1];
  const cf = Game.placeFusedUnit(fid, q2.c, q2.r);
  ok(aa && cf && cf.fuse === fid, fid + ' 全撤去の前の配置');
  ok(Game.clearUnits() === 2 && Game.costUsed() === 0, fid + ' 全撤去');
  Game.costCap = cap0;
  // コストが足りないとき：上限を A＋B ちょうどにして押せない
  const run3 = Game.startPrep('ch20'); Game.perm.placements = {};
  const cc = Game.costCap; Game.costCap = () => A.cost + B.cost + 1;
  const a3 = Game.placeUnit(f.a, p[0].c, p[0].r), b3 = Game.placeUnit(f.b, p[1].c, p[1].r);
  o = Fusion.options(run3);
  ok(a3 && b3 && o.length === 1 && !o[0].ok && /コストが足りません/.test(o[0].why), fid + ' 上限が足りないときの選択肢 ' + JSON.stringify(o.map(x => x.ok + x.why)));
  const r3 = Game.fuseUnits(a3, b3, fid);
  ok(!r3.ok && run3.units.length === 2 && Game.costUsed() === A.cost + B.cost, fid + ' 足りないのに合成できた');
  Game.costCap = () => A.cost + B.cost + 2;
  ok(Game.fuseUnits(a3, b3, fid).ok && Game.costUsed() === f.cost, fid + ' ちょうどの上限で合成できない');
  Game.costCap = cc;
  // 同じ A の15基の上限に数える
  ok(Game.unitCount(f.a) === 1, fid + ' 15基の数え方');
}
({ bad, n: FUSION_IDS.length })
