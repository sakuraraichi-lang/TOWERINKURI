// 改造ラン（MOD）：全部の改造・進化・起動条件について「取ると挙動が変わる」を1つずつ数える（死に改造の検査・2026-10-13）
//   node tools/simnode.js --file tools/measure/modrun-mods.js
//   それぞれ、同じ盤・同じ置き方で「取っていない」「取った」を作り、本体の関数（置く・合成・Combat.damage・Combat.update・waveCount・報酬）を通して値を比べる。
//   出力：rows（名前・取らない・取る・変わったか）／changed（変わった数）／total／bad（変わらなかったもの）／clean（本編のセーブを汚していないか）
REAL_MS = 600000;
const rows = [];
function rec(name, off, on, changed) { rows.push({ name, off, on, ok: changed === undefined ? JSON.stringify(off) !== JSON.stringify(on) : !!changed }); }
const r3 = (x) => typeof x === 'number' ? Math.round(x * 1000) / 1000 : x;

function save() {
  Game.newSave(); ensureStages(32); seedRng(11);
  for (let i = 1; i <= MAIN_CHAPTERS; i++) Game.stageRec('ch' + i).cleared = true;
  Game.perm.deepest = MAIN_CHAPTERS; Game.perm.legacyDeep = MAIN_CHAPTERS; Game.perm.prestiges = 2;
  Game.perm.asc = { lv: 1, exp: 0, total: 0 };
  for (const w of WEAPON_IDS) Game.grant('wc_' + w, 1);
  Relic.invalidate();
}
// 改造 mods を持った第1章（盤 ch12・口3つ）の準備フェーズ
function prep(mods, o) {
  o = o || {};
  save();
  const mr = ModRun.start(Game.perm, 5);
  mr.cond = o.cond || 'fast'; mr.weapons = WEAPON_IDS.slice(); mr.boards[0] = o.board || 'ch12';
  mr.mods = mods.slice();
  if (o.lives) mr.lives = o.lives;
  const run = Game.startPrep(mr.boards[0], mr);
  return { mr, run };
}
// 置ける六角で、隣が k 個空いている所
function cluster(run, k) {
  for (const h of run.stage.hexCells()) {
    if (!Game.canPlaceAt(h.c, h.r)) continue;
    const nb = MapGen.hexNbr(h.c, h.r).filter(q => Game.canPlaceAt(q[0], q[1]));
    if (nb.length >= k) return { c: h.c, r: h.r, nb };
  }
  return null;
}
function nearSpawnHex(run) {
  const st = run.stage, sp = st.spawns.map(s => st.center(s.c, s.r));
  let best = null, bd = 1e9;
  for (const h of st.hexCells()) {
    if (!Game.canPlaceAt(h.c, h.r)) continue;
    const p = st.hexCenter(h.c, h.r), d = Math.min(...sp.map(q => Math.hypot(q.x - p.x, q.y - p.y)));
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
const capKeep = Game.costCap;
function big() { Game.costCap = function () { return capKeep.call(Game) + 200; }; }
function unbig() { Game.costCap = capKeep; }
function enemyAt(run, x, y) { const e = Combat.makeEnemy(run, ENEMY_TYPES.grunt, 1, x, y, 0); e.hp = e.maxHp = 1e12; run.enemies.push(e); return e; }
function battle(run) { Game.beginBattle(); run.toSpawn = 0; run.enemies.length = 0; return run; }

// ---- 隣接 ----
for (const on of [false, true]) {
  big();
  const { run } = prep(on ? ['backtoback'] : []);
  const cl = cluster(run, 3);
  const a = Game.placeUnit('gatling', cl.c, cl.r);
  Game.placeUnit('sniper', cl.nb[0][0], cl.nb[0][1]);
  const same = Game.placeUnit('gatling', cl.nb[1][0], cl.nb[1][1]);
  if (!on) var bbOff = { adj: r3(a.adjAdd), sameAdjacent: !!same };
  else rec('背中合わせ', bbOff, { adj: r3(a.adjAdd), sameAdjacent: !!same });
  unbig();
}
for (const on of [false, true]) {
  big();
  const { run } = prep(on ? ['family'] : []);
  const cl = cluster(run, 5);
  const a = Game.placeUnit('gatling', cl.c, cl.r);
  ['sniper', 'tesla', 'gas', 'flame', 'katana'].forEach((w, i) => cl.nb[i] && Game.placeUnit(w, cl.nb[i][0], cl.nb[i][1]));
  if (!on) var faOff = { kinds: a.adjTypes.length, adj: r3(a.adjAdd) };
  else rec('大家族', faOff, { kinds: a.adjTypes.length, adj: r3(a.adjAdd) });
  unbig();
}
// ---- 合成 ----
const FID = FUSION_IDS[0], FF = FUSIONS[FID];
for (const on of [false, true]) {
  big();
  const { run } = prep(on ? ['premonition'] : []);
  const cl = cluster(run, 2);
  const a = Game.placeUnit(FF.a, cl.c, cl.r), b = Game.placeUnit(FF.b, cl.nb[0][0], cl.nb[0][1]);
  const p = Game.placeUnit('sniper', cl.nb[1][0], cl.nb[1][1]);
  const pd = p.s.dmg;
  const c0 = Game.costUsed();
  const r = Game.fuseUnits(a, b, FID);
  const v = { fuseOk: r.ok, fuseCost: Game.costUsed() - c0, plainDmg: r3(pd / (WEAPONS.sniper.base.dmg)) };
  if (!on) var prOff = v; else rec('合の予感', prOff, v, prOff.fuseCost !== v.fuseCost && prOff.plainDmg !== v.plainDmg);
  unbig();
}
for (const on of [false, true]) {
  big();
  const { run } = prep(on ? ['inherit'] : []);
  const cl = cluster(run, 3);
  const a = Game.placeUnit(FF.a, cl.c, cl.r), b = Game.placeUnit(FF.b, cl.nb[0][0], cl.nb[0][1]);
  Game.fuseUnits(a, b, FID);
  const other = WEAPON_IDS.find(w => WEAPONS[w].sys !== WEAPONS[FF.b].sys && w !== FF.a);
  const u = Game.placeUnit(other, cl.nb[1][0], cl.nb[1][1]);
  const v = { sys: JSON.stringify(Combat.sysOf(u.id, u)) };
  if (!on) var inOff = v; else rec('継承', inOff, v);
  unbig();
}
// ---- ヒット ----
for (const on of [false, true]) {
  const { run } = prep(on ? ['shatter'] : []);
  battle(run);
  const e = enemyAt(run, run.tower.x, run.tower.y - 200);
  Combat.damage(run, e, 1, { by: 'debug' });
  const v = { barrier: r3(e.barrier) };
  if (!on) var shOff = v; else rec('一撃必砕', shOff, v);
}
for (const on of [false, true]) {
  const { run } = prep(on ? ['breakparty'] : []);
  battle(run);
  Grid.build(run.enemies);
  const e1 = enemyAt(run, run.tower.x, run.tower.y - 300), e2 = enemyAt(run, run.tower.x + 30, run.tower.y - 300);
  Grid.build(run.enemies);
  e1.barrier = 0.01; e2.barrier = 1;
  Combat.damage(run, e1, 1, { by: 'debug' });
  const v = { neighborBarrier: r3(e2.barrier), bursts: run.mrBursts || 0 };
  if (!on) var bpOff = v; else rec('ブレイク祝い', bpOff, v);
}
for (const on of [false, true]) {
  const { run } = prep(on ? ['shatter', 'breakparty', 'cascade'] : ['shatter', 'breakparty']);
  battle(run);
  const y = run.tower.y - 300, x0 = run.tower.x - 100;
  const es = [0, 1, 2, 3].map(i => enemyAt(run, x0 + i * 70, y));
  Grid.build(run.enemies);
  es[0].barrier = 0.01; es[1].barrier = 0.2; es[2].barrier = 0.2; es[3].barrier = 0.2;
  Combat.damage(run, es[0], 1, { by: 'debug' });
  const v = { chain: run.mrChain || 0, far: r3(es[3].barrier) };
  if (!on) var caOff = v; else rec('連鎖崩壊', caOff, v);
}
// ---- 賭け ----
for (const on of [false, true]) {
  const { run } = prep(on ? ['glass'] : []);
  const st = run.stage;
  const hs = [...st.hexCells()].filter(h => Game.canPlaceAt(h.c, h.r)).slice(0, 6);
  const us = hs.map(h => Game.placeUnit('gatling', h.c, h.r)).filter(Boolean);
  const d = us[0].s.dmg;
  battle(run);
  const e = enemyAt(run, run.tower.x, run.tower.y);
  Combat.update(run, 1 / 60);
  const v = { dmg: r3(d), stopped: run.units.filter(u => u.jamT > 1000).length + '/' + run.units.length, leaked: run.leaked };
  if (!on) var glOff = v; else rec('ガラスの大砲', glOff, v);
}
for (const on of [false, true]) {
  const { run } = prep(on ? ['backwater'] : []);
  const h = cluster(run, 0);
  const u = Game.placeUnit('sniper', h.c, h.r);
  const v = { livesMax: run.livesMax, range: r3(u.s.range) };
  if (!on) var bwOff = v; else rec('背水', bwOff, v);
}
for (const on of [false, true]) {
  const { run } = prep(on ? ['debt'] : []);
  const cap = Game.costCap(), l0 = run.lives;
  const h = cluster(run, 0);
  Game.placeUnit('gatling', h.c, h.r);
  const v = { cap, lifeLost: l0 - run.lives };
  if (!on) var dbOff = v; else rec('借金', dbOff, v);
}
for (const on of [false, true]) {
  const p = prep(on ? ['glass', 'backwater', 'kamikaze'] : ['glass', 'backwater']);
  const run = p.run;
  run.lives = Math.round(run.livesMax / 4);
  battle(run); run.lives = Math.round(run.livesMax / 4);
  const e = enemyAt(run, run.tower.x, run.tower.y - 300);
  e.barrier = 0;
  const hp0 = e.hp;
  Combat.damage(run, e, 1000, { by: 'debug' });
  const v = { dealt: r3(hp0 - e.hp) };
  if (!on) var kaOff = v; else rec('捨て身', kaOff, v);
}
// ---- 配置 ----
for (const on of [false, true]) {
  const { run } = prep(on ? ['zero'] : []);
  const h = nearSpawnHex(run);
  const u = Game.placeUnit('sniper', h.c, h.r);
  const v = { dmg: r3(u.s.dmg) };
  if (!on) var zeOff = v; else rec('ゼロ距離', zeOff, v);
}
for (const on of [false, true]) {
  big();
  const { run } = prep(on ? ['solo'] : []);
  const cl = cluster(run, 2);
  const a = Game.placeUnit('sniper', cl.c, cl.r);
  const b = Game.placeUnit('gatling', cl.nb[0][0], cl.nb[0][1]);
  battle(run);
  const e = enemyAt(run, run.tower.x, run.tower.y - 300);
  Combat.damage(run, e, 1, { by: 'sniper', src: a });
  const v = { otherType: !!b, dmg: r3(a.s.dmg), barrier: r3(e.barrier), tray: Game.loadoutWeapons().length };
  if (!on) var soOff = v; else rec('一点豪華', soOff, v);
  unbig();
}
for (const on of [false, true]) {
  const { run } = prep(on ? ['free'] : []);
  const cl = cluster(run, 1);
  const u = Game.placeUnit('sniper', cl.c, cl.r);
  Game.beginBattle(); run.wave = 1; run.phase = 'build'; run.enemies.length = 0;
  const v = { moveBetweenWaves: Game.moveUnit(u, cl.nb[0][0], cl.nb[0][1]), removeBetweenWaves: Game.removeUnit(u) };
  if (!on) var frOff = v; else rec('組み替え自由', frOff, v);
}
// ---- 欲張り ----
for (const on of [false, true]) {
  save();
  const mr = ModRun.start(Game.perm, 9); mr.mods = on ? ['gacha'] : [];
  ModRun.makeOffer(mr);
  const n = mr.offer.ids.length;
  ModRun.take(mr, mr.offer.ids[0]);
  const v = { choices: n, banned: mr.banned.length };
  if (!on) var gaOff = v; else rec('ガチャ師', gaOff, v);
}
for (const on of [false, true]) {
  const { run, mr } = prep(on ? ['blockade'] : [], { board: 'ch12' });
  battle(run);
  run.wave = 1; Combat.startWave(run);
  const cnt = run.toSpawn;
  const bm = ModRun.blockedMouth(run), mouth0 = new Set(run.stage.mouths[0]);
  let from0 = 0;
  for (let i = 0; i < 60; i++) { run.enemies.length = 0; Combat.spawnEnemy(run); for (const e of run.enemies) if (mouth0.has(e.si)) from0++; }
  mr.cleared = 3;
  const pk = Object.values(ModRun.reward(mr)).reduce((a, b) => a + b, 0);
  const v = { count: cnt, fromMouth0: from0, packs3ch: pk };
  if (!on) var blOff = v; else rec('封鎖', blOff, v);
}
for (const on of [false, true]) {
  save();
  const mr = ModRun.start(Game.perm, 9); mr.mods = on ? ['passer'] : [];
  ModRun.makeOffer(mr);
  const got = ModRun.skip(mr);
  mr.cleared = 1;
  const v = { got, packs: Object.values(ModRun.reward(mr)).reduce((a, b) => a + b, 0) };
  if (!on) var paOff = v; else rec('見送り上手', paOff, v);
}
// ---- 連携（融合回廊） ----
for (const on of [false, true]) {
  big();
  const { run } = prep(on ? ['backtoback', 'premonition', 'corridor'] : ['backtoback', 'premonition']);
  const cl = cluster(run, 3);
  const a = Game.placeUnit(FF.a, cl.c, cl.r), b = Game.placeUnit(FF.b, cl.nb[0][0], cl.nb[0][1]);
  Game.fuseUnits(a, b, FID);
  const other = WEAPON_IDS.find(w => w !== FF.a && w !== FF.b);
  const u = Game.placeUnit(other, cl.nb[1][0], cl.nb[1][1]);
  const v = { kinds: u.adjTypes.length, adj: r3(u.adjAdd) };
  if (!on) var coOff = v; else rec('融合回廊', coOff, v);
  unbig();
}
// ---- 代償つき ----
for (const on of [false, true]) {
  const { run } = prep(on ? ['overclock'] : []);
  const h = cluster(run, 0); const u = Game.placeUnit('sniper', h.c, h.r);
  const v = { rate: r3(u.s.rate), cap: Game.costCap() };
  if (!on) var ocOff = v; else rec('オーバークロック', ocOff, v);
}
for (const on of [false, true]) {
  const { run } = prep(on ? ['nova'] : []);
  const h = cluster(run, 0); const u = Game.placeUnit('sniper', h.c, h.r);
  const e = Combat.makeEnemy(run, ENEMY_TYPES.grunt, 1, 0, 0, 0);
  const v = { dmg: r3(u.s.dmg), enemySpd: r3(e.spd) };
  if (!on) var noOff = v; else rec('臨界', noOff, v);
}
for (const on of [false, true]) {
  big();
  const { run } = prep(on ? ['hive'] : []);
  const cl = cluster(run, 1);
  const a = Game.placeUnit('gatling', cl.c, cl.r); Game.placeUnit('sniper', cl.nb[0][0], cl.nb[0][1]);
  unbig();
  const v = { adj: r3(a.adjAdd), cap: Game.costCap() };
  if (!on) var hvOff = v; else rec('群体', hvOff, v);
}
// ---- 進化（同じ系統3つ） ----
const EVO_SETS = {
  adj: [['backtoback', 'family'], ['backtoback', 'family', 'corridor']],
  fuse: [['premonition', 'inherit'], ['premonition', 'inherit', 'corridor']],
  hit: [['shatter', 'breakparty'], ['shatter', 'breakparty', 'cascade']],
  bet: [['glass', 'debt'], ['glass', 'debt', 'backwater']],
  pos: [['zero', 'free'], ['zero', 'free', 'solo']],
  greed: [['gacha', 'passer'], ['gacha', 'passer', 'blockade']],
};
for (const s in EVO_SETS) {
  const vals = EVO_SETS[s].map(mods => {
    big();
    const { run, mr } = prep(mods);
    const cl = cluster(run, 2);
    let v;
    if (s === 'fuse') {
      const a = Game.placeUnit(FF.a, cl.c, cl.r), b = Game.placeUnit(FF.b, cl.nb[0][0], cl.nb[0][1]);
      Game.fuseUnits(a, b, FID); v = { fusedDmg: r3(a.s.dmg) };
    } else if (s === 'hit') {
      battle(run); const e = enemyAt(run, run.tower.x, run.tower.y - 300); Combat.damage(run, e, 1, { by: 'debug' }); v = { barrierAfter1: r3(e.barrier) };
    } else if (s === 'greed') {
      mr.cleared = 4; v = { packs: Object.values(ModRun.reward(mr)).reduce((a, b) => a + b, 0) };
    } else {
      const a = Game.placeUnit('sniper', cl.c, cl.r); Game.placeUnit('gatling', cl.nb[0][0], cl.nb[0][1]);
      v = { dmg: r3(a.s.dmg), range: r3(a.s.range) };
    }
    unbig();
    return v;
  });
  rec('進化：' + MOD_SYS[s].jp, vals[0], vals[1]);
}
// ---- 起動条件（条件なしの代わりに「早足」と比べる。早足は「大群」と比べる） ----
{
  const base = (cond) => { const { run, mr } = prep([], { cond }); const h = cluster(run, 0); Game.placeUnit('gatling', h.c, h.r);
    battle(run); run.wave = 1; Combat.startWave(run); const e = Combat.makeEnemy(run, ENEMY_TYPES.grunt, 1, 0, 0, 0);
    return { cap: Game.costCap(), count: run.toSpawn, spd: r3(e.spd), weapons: mr.weapons.length }; };
  const lean = base('lean'), fast = base('fast'), horde = base('horde');
  save(); const m6 = ModRun.start(Game.perm, 1); m6.cond = 'six';
  let w6 = WEAPON_IDS.length; { for (let sd = 1; sd < 60; sd++) { save(); const m = ModRun.start(Game.perm, sd); if (m.cond === 'six') { w6 = m.weapons.length; break; } } }
  rec('条件：六種', { weapons: WEAPON_IDS.length }, { weapons: w6 });
  rec('条件：早足', { spd: horde.spd }, { spd: fast.spd });
  rec('条件：薄給', { cap: fast.cap }, { cap: lean.cap });
  rec('条件：大群', { count: fast.count }, { count: horde.count });
}
// ---- 本編を汚さない：1章ぶん回したあと、本編の配置・章の記録・出撃数・ヒートマップが変わっていないか ----
let clean;
{
  save();
  const before = JSON.stringify({ pl: Game.perm.placements, st: Game.perm.stages, tr: Game.perm.totalRuns, heat: Object.keys(Game.perm.heat), last: Game.perm.lastPlace, cur: Game.perm.currentStage });
  const mr = ModRun.start(Game.perm, 3);
  const run = Game.startPrep(mr.boards[0], mr);
  autoPlace(run);
  Game.beginBattle();
  for (let t = 0; t < 600; t++) Combat.update(run, 1 / 60);
  Game.endRun(false);
  const after = JSON.stringify({ pl: Game.perm.placements, st: Game.perm.stages, tr: Game.perm.totalRuns, heat: Object.keys(Game.perm.heat), last: Game.perm.lastPlace, cur: Game.perm.currentStage });
  // 本編に戻ったとき：合成の札なしでは合成の選択肢が出ない
  Game.startPrep('ch12');
  const cl = cluster(Game.run, 1);
  Game.placeUnit(FF.a, cl.c, cl.r); Game.placeUnit(FF.b, cl.nb[0][0], cl.nb[0][1]);
  clean = { mainUntouched: before === after, mainFuseWithoutCard: Fusion.options(Game.run).length, modrunEnded: Game.perm.modrun === null };
}
unseedRng();
({ changed: rows.filter(r => r.ok).length, total: rows.length, bad: rows.filter(r => !r.ok).map(r => r.name), clean, rows: rows.map(r => r.name + '　' + JSON.stringify(r.off) + ' → ' + JSON.stringify(r.on) + (r.ok ? '' : '　★変わらない')) })
