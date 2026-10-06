// ラスボス（第30章）で、編成ごとにどこまで行けるか。12本（シード1〜12）。新しいセーブから・コインは十分・深さは第30章（最前線の条件）
//   置き換え：__WPNS__（武器の id をカンマで・例 sniper,gatling）・__HPMUL__（BAL.finalHpMul）・__PR__（転生回数・Legacy の土台。2 で最前線に近い）
//   返すもの：到達ウェーブ（1〜5・5で負けたら4まで撃退して5で負け）・撃退した数・負けたときの頭の残りHP・勝った本数・壊された数・仕掛けの数
REAL_MS = 600000;
BAL.finalHpMul = __HPMUL__; BAL_PRISTINE.finalHpMul = __HPMUL__;
const W = '__WPNS__'.split(',');
const out = [];
const _up = Combat.update;
let st = null;
Combat.update = function (run, dt) {
  if (st) {
    if (run.finalHead && !run.finalHead.dead) st.hp = run.finalHead.hp / run.finalHead.maxHp;
    st.wave = Math.max(st.wave, run.wave);
  }
  const r = _up.call(this, run, dt);
  if (st) { st.ret = run.retreatCut ? run.retreatCut.n : 0; st.broken = run.broken || 0; }
  return r;
};
for (let sd = 1; sd <= 12; sd++) {
  Game.newSave(); seedRng(sd);
  st = { wave: 0, ret: 0, hp: 1, broken: 0 };
  const r = runStage('ch30', W, 60, { coins: 1e12, deep: { prestiges: __PR__, deepest: 30 }, lives: 400 });
  out.push({ sd, res: r.res, wave: st.wave, ret: st.ret, hp: +st.hp.toFixed(3), broken: st.broken });
}
Combat.update = _up; unseedRng();
({ W: W.join('+'), clear: out.filter(o => o.res === 'clear' || o.res === 'win').length, res: out.map(o => o.res).join(','), wave: out.map(o => o.wave).join(''), ret: out.map(o => o.ret).join(''),
   hp: out.map(o => o.hp).join(' '), broken: out.map(o => o.broken).join('') })
