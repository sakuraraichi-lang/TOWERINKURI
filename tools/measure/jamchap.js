// 妨害の軸の測定（upperchap.js に合成武器の有無 __FUSE__=1/0 を足したもの・2026-10-13）。条件 on/off を交互に。
//   endless の通し（upper.js）は、どの条件でも漏れ0・1回で突破で差が出なかったので、こちらは**章を決めて、同じ元手の新しいセーブ**で出撃する（条件の順は交互）。
//   置き換え：__SEED__・__CH__（章の番号）・__LVD__（アセンションのレベル）・__LOAD__（編成名：mix|phys|elem|nophys|field|optic）・__CONDS__（条件の配列）・__ROUNDS__（交互の回数）
//   出力：条件ごとに { 漏れ・数・秒・実時間ms・撃破 } の配列
REAL_MS = 600000;
const SEED = __SEED__, CH = __CH__, LVD = __LVD__, ROUNDS = __ROUNDS__, FUSE = __FUSE__;
const CONDS = __CONDS__;
const SETS = {
  phys: ['katana', 'shuriken', 'gatling', 'mortar', 'missile'],
  elem: ['tesla', 'flame', 'cryo'],
  field: ['gas', 'bubble'],
  optic: ['sniper'],
  nophys: ['sniper', 'tesla', 'cryo', 'gas', 'bubble', 'tentacle'],
  all: ['katana', 'sniper', 'tesla', 'gas', 'tentacle', 'shuriken'],
};
const LOAD = '__LOAD__';
const setBal = (o) => { for (const k in o) { BAL[k] = JSON.parse(JSON.stringify(o[k])); BAL_PRISTINE[k] = JSON.parse(JSON.stringify(o[k])); } };
const keep = {};
CONDS.forEach(c => Object.keys(c.bal || {}).forEach(k => { if (!(k in keep)) keep[k] = JSON.parse(JSON.stringify(BAL[k])); }));
const was = BAL.ascEnabled, wasT = TIME_MIN;
BAL.ascEnabled = true; BAL_PRISTINE.ascEnabled = true; TIME_MIN = 30;
const out = {};
CONDS.forEach(c => { out[c.name] = []; });
for (let rd = 0; rd < ROUNDS; rd++) {
  const ord = (rd % 2) ? CONDS.slice().reverse() : CONDS;
  for (const c of ord) {
    setBal(keep); setBal(c.bal || {});
    Game.newSave(); seedRng(SEED * 31 + rd);
    ensureStages(CH + 1);
    Game.perm.asc = { lv: LVD, exp: 0, total: 0 };
    Game.perm.prestiges = 2; Game.perm.legacyDeep = 30; Game.perm.deepest = 30;
    Relic.invalidate();
    const lo = (LOAD === "mix") ? LOADOUTS["ch" + CH] : SETS[LOAD];
    const fz = FUSE ? Object.keys(FUSIONS).filter(k => lo.includes(FUSIONS[k].a) && lo.includes(FUSIONS[k].b)).slice(0, 3) : [];
    const t0 = Date.now();
    const oo = { coins: 1e12, deep: { prestiges: 2, deepest: 30 }, lives: 1e6 }; if (fz.length) oo.fusions = fz;
    const r = runStage('ch' + CH, lo, 60, oo);
    out[c.name].push({ res: r.res, leak: r.leaked, lost: r.livesLost, by: r.leakBy, cnt: r.waves[0] ? r.waves[0].count : 0, sec: +r.sec.toFixed(0), ms: Date.now() - t0, kills: r.kills, wave: r.wave, cap: r.cap, used: r.used, placedOk: r.used >= r.cap - 2, fz: fz.join(",") });
  }
}
setBal(keep); BAL.ascEnabled = was; BAL_PRISTINE.ascEnabled = was; TIME_MIN = wasT; unseedRng();
out
