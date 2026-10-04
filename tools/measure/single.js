// 単独の武器を1章で12本（武器を比べる標準の設定・CLAUDE.md）。漏れの中央値を返す
//   置き換え：__CH__（章の番号）・__WPN__（武器の id）・__D__（深さ。標準は 章＋2）
REAL_MS = 600000;
const out = [];
for (let sd = 1; sd <= 12; sd++) {
  Game.newSave(); seedRng(sd);
  const r = runStage('ch__CH__', ['__WPN__'], 60, { coins: 1e12, deep: { prestiges: 2, deepest: __D__ }, lives: 1e6 });
  out.push({ sd, leaked: r.leaked, kills: r.kills, res: r.res, wave: r.wave });
}
unseedRng();
const L = out.map(o => o.leaked).sort((a, b) => a - b);
({ median: (L[5] + L[6]) / 2, leaked: out.map(o => o.leaked), kills: out.map(o => o.kills), res: out.map(o => o.res).join('') })
