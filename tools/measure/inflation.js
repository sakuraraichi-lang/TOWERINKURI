// 1出撃の中で、置いた武器のレート・火力・数が素の値の何倍まで伸びたかを、出撃が終わるたびに記録する（通し1本）
//   火力は Legacy（転生の土台）とアセンションを除いた倍率。置き換え：__SEED__（シード）
REAL_MS = 600000;
const rec = {};
const _end = Game.endRun.bind(Game);
Game.endRun = function (ok) {
  const run = Game.run;
  try {
    if (run && run.units && run.units.length) {
      const ch = run.stageIdx + 1;
      const rm = Relic.mods(Game.perm);
      const L = (rm.legacy || 1) * (rm.asc || 1);
      const byW = {};
      for (const u of run.units) {
        const b = u.def.base;
        const r = byW[u.id] || (byW[u.id] = { n: 0, rate: 0, dmg: 0, cnt: 0 });
        r.n++; r.rate = Math.max(r.rate, u.s.rate / b.rate); r.dmg = Math.max(r.dmg, u.s.dmg / b.dmg / L);
        r.cnt = Math.max(r.cnt, (u.s.count || 1) / (b.count || 1));
      }
      const picks = Object.values(run.cards || {}).reduce((a, x) => a + x, 0);
      rec[(Game.perm.prestiges || 0) + ':' + ch] = { ok: !!ok, wave: run.wave, picks, relicDmg: +rm.dmg.toExponential(2), relicRate: +rm.rate.toFixed(2), L: +L.toExponential(2),
        w: Object.fromEntries(Object.entries(byW).map(([k, v]) => [k, [v.n, +v.rate.toFixed(2), +v.dmg.toExponential(2), +v.cnt.toFixed(1)]])) };
    }
  } catch (e) { rec.err = String(e); }
  return _end(ok);
};
const rows = await progressAsync([__SEED__], { laps: 12 });
({ line: rows[0].line, rec })
