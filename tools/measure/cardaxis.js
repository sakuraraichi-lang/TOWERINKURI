// 凸の伸び（0929zs・段3b）：全札を T凸に固定して、武器ごとに、その武器の札（上位札・連携を除く）を maxStack まで積んだときの伸びを数える。戦闘は回さない（一瞬で終わる）
//   node tools/measure/run.js cardaxis --T 10
//   置き換え：__T__（凸の数。0 と 10 を比べる）。dmg・rate・count は素の値の何倍か／reach＝到達体数（1＋貫通＋連鎖＋跳ね返り＋反射）の倍率／P1＝dmg×rate×count／P2＝P1×reach
//   **凸は札の「主な1軸」だけに効く**（Game.rk/rka/rki の第2引数・cards.js の rankAxis）。t10 と t0 の P2 の比が、凸で何倍伸びるか
const T = __T__;
const keepTotu = Game.cardTotu;
Game.cardTotu = () => T;
const out = {};
for (const W of WEAPON_IDS) {
  const def = WEAPONS[W];
  const u = { id: W, def, s: Object.assign({}, def.base), flags: {}, dyn: { heat: 0 }, n: 1 };
  const run = { units: [u], wp: (w) => (u.id === w ? u : null), unitsOf: (w) => (u.id === w ? [u] : []),
    livesMax: 0, lives: 0, coinMul: 1, chillVuln: 0, backdraft: 0, cardLog: [] };
  const ids = CARD_IDS.filter(id => CARDS[id].kind === 'mod' && CARDS[id].weapon === W && !CARDS[id].upper);
  for (const id of ids) for (let i = 0; i < CARDS[id].maxStack; i++) Game.applyCardUnit(id, run, u);
  const b = def.base, s = u.s;
  const r = (x) => +x.toPrecision(4);
  const P1 = (s.dmg / b.dmg) * (s.rate / b.rate) * (s.count / b.count);
  const reach = (1 + s.pierce + s.chain + s.bounce + s.reflect) / (1 + b.pierce + b.chain + b.bounce + b.reflect);
  out[W] = { cards: ids.length, dmg: r(s.dmg / b.dmg), rate: r(s.rate / b.rate), count: r(s.count / b.count), reach: r(reach), P1: r(P1), P2: r(P1 * reach) };
}
Game.cardTotu = keepTotu;
out
