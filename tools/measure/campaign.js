// 通し1本（progressAsync・laps 12・REAL_MS 600000）。周ごとの到達章・分・章ごとの挑戦回数と、ツリーの節を「何周目の何章で」買ったかを返す
//   置き換え：__SEED__（シード）
REAL_MS = 600000;
const SEED = __SEED__;
const buyLog = {};
const _buy = Skill.buy;
Skill.buy = function (meta, perm, id) {
  const ok = _buy.call(this, meta, perm, id);
  if (ok && /^(short|mid|long|area|target|support)_|^units|^coin|^picks|^choices/.test(id)) {
    const key = id.replace(/^(short|mid|long|area|target|support)_/, 'cat_');
    (buyLog[key] = buyLog[key] || []).push((Game.perm.prestiges||0) + ':' + (Game.clearedCount()+1));
  }
  return ok;
};
const rows = await progressAsync([SEED], { laps: 12 });
const r = rows[0];
({ seed: SEED, line: r.line, cap: r.cap, mins: r.mins, total: +r.mins.reduce((a,b)=>a+b,0).toFixed(1), tries: r.tries, notes: r.notes, slots: r.slots,
   buy: Object.fromEntries(Object.entries(buyLog).map(([k,v]) => [k, v.slice(0,3).join(' ')])) })
