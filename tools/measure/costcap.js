// コストの上限を決めて、編成ごとに漏れを測る（コストあたりの価値の精査・設計書 DESIGN-STAGE3 §15）
//   置き換え：__CH__（章の番号）・__D__（深さ。標準は 章＋2）・__CAP__（コストの上限）・__JOBS__（編成の配列。例 [['gatling'],['katana','flame']]）・
//             __SEEDS__（シードの配列。例 [1,2,3,4,5,6]）・__PRE__（取った札 { 札id: 枚数 }。無ければ {}）
//   ライフ 1e6（5ウェーブ最後まで回す）・測定ごとに Game.newSave()・置き方は測定器の 'range'
//   返すもの：編成ごとの 漏れの中央値・漏れ全部・ボスまで倒しきった本数・置いた基数の中央値
REAL_MS = 600000;
const CH = '__CH__', D = __D__, CAP = __CAP__, JOBS = __JOBS__, SEEDS = __SEEDS__, PRE = __PRE__;
Game.costCap = function () { return CAP; };
const med = (a) => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const out = [];
for (const ws of JOBS) {
  const rows = [];
  for (const sd of SEEDS) {
    Game.newSave(); seedRng(sd);
    const o = { coins: 1e12, deep: { prestiges: 2, deepest: D }, lives: 1e6 };
    if (Object.keys(PRE).length) o.preCards = PRE;
    const r = runStage('ch' + CH, ws, 60, o);
    rows.push({ sd, leaked: r.leaked, kills: r.kills, res: r.res, wave: r.wave, units: r.units, cost: r.cost });
  }
  unseedRng();
  out.push({ ws: ws.join('+'), median: med(rows.map(x => x.leaked)), leaked: rows.map(x => x.leaked), units: med(rows.map(x => x.units)),
             cost: med(rows.map(x => x.cost)), res: rows.map(x => x.res).join(','), killsMed: med(rows.map(x => x.kills)) });
}
out
