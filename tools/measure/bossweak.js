// ボス1個体の「弱点」の効き：同じ編成・同じシードで、弱点あり（ふつう）と弱点なし（ABL）を交互に12本ずつ回す
//   置き換え：__CH__（章の番号。ボスが出る章でなくてもよい。5章ごとに最後のウェーブがボス）・__KIND__（worm|rootkit|jammer）・
//             __LOAD__（武器の id の配列。例 ["sniper","tentacle","bubble","gatling"]）・__D__（深さ）
//   弱点を外す手：ワーム＝節の貫通を無くす（wormSegs 1・wormLaserHits 1）＋足止め・掴みを無効（ccUsed=Infinity）／ルートキット＝rootCcK 0（凍結・足止め・引き寄せが無効）／
//                 ジャマー＝沈黙の数の上限を外す（bossJamMax 99）
//   返すもの：配列の中身は 12本ぶんの { ボスが届いた(負け)か, ボスを倒すまでの秒数, 漏れ }
REAL_MS = 600000;
const KIND = '__KIND__';
Combat.bossKindFor = () => KIND;
const bossLog = [], jamLog = [];   // jamLog：[止めた基数, 全基数]
const _pd = Combat.bossPhaseDo;
Combat.bossPhaseDo = function (run, e, tele) {
  if (tele.kind === 'jam') { jamLog.push([Math.min(run.units.length, BAL.bossJamMax), run.units.length]); }
  return _pd.apply(this, arguments);
};
const _sp = Combat.spawnBoss;
Combat.spawnBoss = function (run) {
  _sp.apply(this, arguments);
  run._bt0 = run.time;
  if (globalThis.__ABL && KIND === 'worm') for (const e of run.enemies) if (e.boss) e.ccUsed = Infinity;
};
const _kill = Combat.kill;
Combat.kill = function (run, e, o) { if (e.boss) bossLog.push(+(run.time - (run._bt0 || 0)).toFixed(1)); return _kill.apply(this, arguments); };
const res = { weak: [], noweak: [] };
for (let sd = 1; sd <= 12; sd++) {
  for (const abl of [0, 1]) {
    globalThis.__ABL = abl;
    const bal = abl ? (KIND === 'worm' ? { wormSegs: 1, wormLaserHits: 1 } : KIND === 'rootkit' ? { rootCcK: 0 } : { bossJamMax: __JMAX__ }) : (KIND === 'rootkit' ? { rootCcK: __RP__ } : {});
    Game.newSave(); seedRng(sd);
    bossLog.length = 0;
    const r = runStage('ch__CH__', __LOAD__, 60, { coins: 1e12, deep: { prestiges: 2, deepest: __D__ }, lives: 1e6, bal });
    (abl ? res.noweak : res.weak).push({ sd, reach: r.res === 'dead' ? 1 : 0, kill: bossLog.slice(), leaked: r.leaked });
  }
}
unseedRng();
const med = a => { a = a.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
const sum = L => ({ 届いた本: L.reduce((a, o) => a + o.reach, 0), 倒すまでの秒中央値: med([].concat(...L.map(o => o.kill))), 倒した体数: L.reduce((a, o) => a + o.kill.length, 0), 漏れ中央値: med(L.map(o => o.leaked)) });
const jl = jamLog.length ? { 発動数: jamLog.length, 止めた基数の平均: +(jamLog.reduce((a, x) => a + x[0], 0) / jamLog.length).toFixed(2), 全基数の平均: +(jamLog.reduce((a, x) => a + x[1], 0) / jamLog.length).toFixed(1) } : null;
({ kind: KIND, jam: jl, ch: __CH__, load: __LOAD__, 弱点あり: sum(res.weak), 弱点なし: sum(res.noweak) })
