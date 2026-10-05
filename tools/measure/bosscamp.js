// 通し1本（campaign.js と同じ）＋ ボス3体の計測。章ごとに「ボスがコアに届いて負けた回数（初めて倒すまで／全部）」と、届いた個体の内訳・仕掛けの発動数を返す
//   置き換え：__SEED__（シード）。--dir で入れる前の版（git worktree）と交互に比べる（入れる前の版には bk が無いので内訳は空）
REAL_MS = 600000;
const SEED = __SEED__;
const lossFirst = {}, lossAll = {}, cleared = {}, byKind = {}, ph = { jump: 0, wall: 0, jam: 0 };
if (Combat.bossPhaseDo) {
  const _pd = Combat.bossPhaseDo;
  Combat.bossPhaseDo = function (run, e, t) { ph[t.kind]++; return _pd.apply(this, arguments); };
}
const _up = Combat.update;
Combat.update = function (run, dt) {
  const bs = run.hasBoss ? run.enemies.filter(e => e.boss) : null;
  const before = (run.leakBy && run.leakBy.boss) || 0;
  const r = _up.call(this, run, dt);
  const ch = run.stageIdx + 1;
  if (bs && ((run.leakBy && run.leakBy.boss) || 0) > before) {
    const gone = bs.find(e => e.dead && e.hp > 0);
    const k = (gone && gone.bk) || '-';
    byKind[ch + k] = (byKind[ch + k] || 0) + 1;
  }
  if (r === 'dead' && run.leakBy && run.leakBy.boss > 0) {
    lossAll[ch] = (lossAll[ch] || 0) + 1;
    if (!cleared[ch]) lossFirst[ch] = (lossFirst[ch] || 0) + 1;
  }
  if (r === 'stageclear' && BAL.bossChapters.indexOf(ch) >= 0) cleared[ch] = true;
  return r;
};
const rows = await progressAsync([SEED], { laps: 12 });
const r = rows[0];
({ seed: SEED, line: r.line, total: +r.mins.reduce((a,b)=>a+b,0).toFixed(1), tries: r.tries, notes: r.notes, lossFirst, lossAll, byKind, ph })
