// アセンションの最前線の重さ（2026-10-14・asc-root）。レベル L のプレイヤーが初めて挑む第31+L章を、同じ元手の新しいセーブで回す。
//   置き換え：__SEED__・__LV__（アセンションのレベル）・__ROUNDS__（本数）・__FUSE__（1＝編成に合う合成武器3種）・__BAL__（BAL の差し替え・キーごと丸ごと。無ければ 0）
//   別の版と並べるときは run.js の --dir（同じ種で回る）。ライフは厚くして最後まで回し、失ったライフを数える（24以内＝ライフ24で越えられた）
//   出力：本数ぶんの { lost・res・cap・used・placedOk・fz・ms }
REAL_MS = 600000;
const SEED = __SEED__, LV = __LV__, ROUNDS = __ROUNDS__, FUSE = __FUSE__, CH = 31 + LV;
const OV = (typeof __BAL__ === 'object') ? __BAL__ : {}, keep = {};
for (const k in OV) { keep[k] = JSON.parse(JSON.stringify(BAL[k])); BAL[k] = OV[k]; BAL_PRISTINE[k] = JSON.parse(JSON.stringify(OV[k])); }
const was = BAL.ascEnabled, wasT = TIME_MIN;
BAL.ascEnabled = true; BAL_PRISTINE.ascEnabled = true; TIME_MIN = 30;
const out = [];
for (let rd = 0; rd < ROUNDS; rd++) {
  Game.newSave(); seedRng(SEED * 31 + rd);
  ensureStages(CH + 1);
  Game.perm.asc = { lv: LV, exp: 0, total: 0 };
  Game.perm.prestiges = 2; Game.perm.legacyDeep = 30; Game.perm.deepest = 30;
  Relic.invalidate();
  const lo = LOADOUTS['ch' + CH];
  const fz = FUSE ? Object.keys(FUSIONS).filter(k => lo.includes(FUSIONS[k].a) && lo.includes(FUSIONS[k].b)).slice(0, 3) : [];
  const t0 = Date.now();
  const oo = { coins: 1e12, deep: { prestiges: 2, deepest: 30 }, lives: 1e6 }; if (fz.length) oo.fusions = fz;
  const r = runStage('ch' + CH, lo, 60, oo);
  out.push({ lost: r.livesLost, by: r.leakBy, res: r.res, wave: r.wave, cap: r.cap, used: r.used, placedOk: r.used >= r.cap - 2, fz: fz.join(','), sec: +r.sec.toFixed(0), ms: Date.now() - t0 });
}
for (const k in keep) { BAL[k] = keep[k]; BAL_PRISTINE[k] = JSON.parse(JSON.stringify(keep[k])); }
BAL.ascEnabled = was; BAL_PRISTINE.ascEnabled = was; TIME_MIN = wasT; unseedRng();
out
