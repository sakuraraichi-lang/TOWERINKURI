// 隣り合う異種で強め合う（0929zy・BAL.adjBonus・adjMax）の前後測定（docs/DESIGN-IDEAS-2026-10-05.md §2）
//   使い方：node tools/measure/run.js adjm --place both --CH 25 --D 27 --SD 3 --CAP 60
//   1本の呼び出し＝1章・1シード。型3つ（mono 泡15基／cheap ガトリング・手裏剣・毒ガス・テスラ／mix m2p＝刀・迫撃砲・ミサイル・凍結・火炎・毒ガス＋札）
//   × 条件4つ（adjBonus 0／0.15 × 置き方 range／adj）を、型ごとに 4条件を順に回す（シードごとに交互）
//   BAL と BAL_PRISTINE の両方に adjBonus を入れる。測定ごとに Game.newSave()・ライフ 1e6・5ウェーブ最後まで・AIM_SMART
//   返すもの：条件ごとの 漏れ・結果(res)・置いた基数・隣の異種の数の分布（置いた直後・adjTypesAt）・u.adjAdd の分布（戦闘開始後の最初の1回）
REAL_MS = 600000;
const CH = '__CH__', D = __D__, CAP = __CAP__, SD = __SD__;
Game.costCap = function () { return CAP; };
AIM_SMART = true;
const RANGE_PLACE = globalThis.ORIG_PLACE, ADJ_PLACE = autoPlace;
const MIXP = { syn_iceshell: 3, syn_shatterblade: 3, gen_ap: 3, gas_toxic: 2, syn_backdraft: 3 };
const TYPES = [
  { t: 'mono', ws: ['bubble'], pre: {} },
  { t: 'cheap', ws: ['gatling', 'shuriken', 'gas', 'tesla'], pre: {} },
  { t: 'mix', ws: ['katana', 'mortar', 'missile', 'cryo', 'flame', 'gas'], pre: MIXP },
];
const CONDS = [[0, 'range'], [0.15, 'range'], [0, 'adj'], [0.15, 'adj']];
let lastDist = null, lastAdjMul = null;
function wrap(f) {
  return function (run) {
    f(run);
    const d = [0, 0, 0, 0];
    for (const u of run.units) d[Math.min(3, Game.adjTypesAt(u.c, u.r, u.id, run.units, u).length)]++;
    lastDist = d;
    const m = {}; for (const u of run.units) { const k = (u.adjAdd || 0).toFixed(2); m[k] = (m[k] || 0) + 1; }
    lastAdjMul = m;
  };
}
const out = [];
for (const T of TYPES) for (const [bonus, place] of CONDS) {
  BAL.adjBonus = bonus; BAL_PRISTINE.adjBonus = bonus;
  autoPlace = wrap(place === 'adj' ? ADJ_PLACE : RANGE_PLACE);
  Game.newSave(); seedRng(SD);
  lastDist = null; lastAdjMul = null;
  const o = { coins: 1e12, deep: { prestiges: 2, deepest: D }, lives: 1e6 };
  if (Object.keys(T.pre).length) o.preCards = T.pre;
  const r = runStage('ch' + CH, T.ws, 60, o);
  out.push({ ch: CH, sd: SD, type: T.t, bonus, place, leaked: r.leaked, res: r.res, wave: r.wave, units: r.units, cost: r.cost, dist: lastDist, mul: lastAdjMul, adjBonusNow: BAL.adjBonus });
}
unseedRng();
out
