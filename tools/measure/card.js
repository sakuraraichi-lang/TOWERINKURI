// 札の測定（単独・12本）。**札なし／その武器の札を全部積む／札を1枚だけ**の漏れの中央値を返す（0929zs・段3b で足した）
//   node tools/measure/run.js card --WPN gatling --MODE all --CH 25 --D 22 --MIX - --BAL '{}'
//   置き換え：
//     __WPN__  … 武器の id。カンマで複数（編成）。**札はいちばん最初の武器の札**（例 cryo,katana ＝凍結の札を刀と組んで見る。支援の札はこれで見る）
//     __MODE__ … none（札なし）／all（その武器の mod 札を、上位札を除いて maxStack まで）／札の id（その札だけ maxStack まで）
//     __CH__・__D__ … 章と深さ（標準は 25・22。D26 以上は床で、札の差が見えない）
//     __MIX__  … 敵の出やすさを一時的に変える。例 shield:150（装甲を多く）・swarm:150（耐火を多く）。無ければ -
//     __BAL__  … BAL の差し替え（JSON）。BAL.cardFx は混ぜて渡せる。例 '{"cardFx":{"sweepCount":1}}'。無ければ {}
//   **測定ごとに Game.newSave()。**札は戦闘の最初に掛ける（3択は止める）。漏れ＝res が dead でも数える（ライフを 1e6 にして5ウェーブ最後まで回す）
REAL_MS = 600000;
const WL = '__WPN__'.split(','), W = WL[0], MODE = '__MODE__';
const MIX = '__MIX__', B = JSON.parse('__BAL__');
if (B.cardFx) B.cardFx = Object.assign({}, BAL.cardFx, B.cardFx);
for (const kv of (MIX === '-' ? '' : MIX).split(',').filter(Boolean)) { const [k, v] = kv.split(':'); ENEMY_TYPES[k].weight = +v; }
const pre = {};
if (MODE === 'all') { for (const id of CARD_IDS) { const c = CARDS[id]; if (c.kind === 'mod' && c.weapon === W && !c.upper) pre[id] = c.maxStack; } }
else if (MODE !== 'none') pre[MODE] = CARDS[MODE].maxStack;
const out = [];
for (let sd = 1; sd <= 12; sd++) {
  Game.newSave(); seedRng(sd);
  const r = runStage('ch__CH__', WL, 60, { coins: 1e12, deep: { prestiges: 2, deepest: __D__ }, lives: 1e6, noDraft: true, preCards: pre, bal: B });
  out.push({ sd, leaked: r.leaked, kills: r.kills, res: r.res });
}
unseedRng();
const L = out.map(o => o.leaked).sort((x, y) => x - y);
({ wpn: WL.join(','), mode: MODE, mix: MIX, pre, median: (L[5] + L[6]) / 2, leaked: out.map(o => o.leaked), res: out.map(o => o.res).join('') })
