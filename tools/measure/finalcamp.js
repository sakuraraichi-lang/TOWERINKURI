// 通し1本＋ラスボス（第30章）の計測。第30章に入った出撃ごとに、到達ウェーブ・負けたときの頭の残りHP・仕掛けの発動・壊された武器の数を返す
//   置き換え：__SEED__（シード）・__HPMUL__（BAL.finalHpMul）・__FON__（true=ラスボス・false=前の第30章）。--dir で別の版と交互に比べる
REAL_MS = 600000;
const SEED = __SEED__;
BAL.finalHpMul = __HPMUL__; BAL_PRISTINE.finalHpMul = __HPMUL__;
BAL.finalOn = __FON__; BAL_PRISTINE.finalOn = __FON__;   // false なら今までの第30章（口ごとに1体のボス）
const att = [];
let cur = null;
const _fin = Combat.finalPhaseDo;
Combat.finalPhaseDo = function (run, e, t) { if (cur) cur.ph.push('w' + run.wave + t.kind[0]); return _fin.apply(this, arguments); };
const _up = Combat.update;
Combat.update = function (run, dt) {
  const ch = run.stageIdx + 1;
  if (ch === 30 && Combat.isFinalChapter(run)) {
    if (!cur || cur.run !== run) { cur = { run, wave: 0, ret: 0, ph: [], hp: 1, res: '', t: 0 }; att.push(cur); }
    cur.wave = Math.max(cur.wave, run.wave);
    cur.t += dt;
    if (run.finalHead && !run.finalHead.dead) cur.hp = run.finalHead.hp / run.finalHead.maxHp;
  }
  const r = _up.call(this, run, dt);
  if (cur && cur.run === run) {
    cur.ret = run.retreatCut ? run.retreatCut.n : 0;
    cur.broken = run.broken || 0; cur.units = run.units.map(u => u.id[0] + u.id[1]).join(''); cur.dmg = Object.fromEntries(Object.entries(run.dmgBy || {}).map(([k, v]) => [k, +v.toExponential(1)])); cur.hm = run.finalHead ? [run.finalHead.si, run.finalHead.lane, Math.round(run.finalHead.dist)].join('/') : '';
    if (r === 'dead') cur.res = 'dead';
    else if (r === 'stageclear') cur.res = 'clear';
  }
  return r;
};
const rows = await progressAsync([SEED], { laps: 12 });
const r = rows[0];
const asc = Asc.on(Game.perm), ch31 = STAGES.length > MAIN_CHAPTERS ? Game.stageUnlocked(STAGES[MAIN_CHAPTERS].id) : null;   // 第30章を倒したあと、アセンションに入れて第31章が開いているか
({ seed: SEED, asc, ch31, line: r.line, total: +r.mins.reduce((a, b) => a + b, 0).toFixed(1), tries: r.tries, notes: r.notes,
   ch30: att.map(a => ({ res: a.res, wave: a.wave, ret: a.ret, hp: +a.hp.toFixed(3), sec: Math.round(a.t), broken: a.broken || 0, ph: a.ph.join(','), units: a.units, dmg: a.dmg, hm: a.hm })) })
