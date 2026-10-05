// 札の測定（単独・12本）の「着弾円を上手に置く」版（0929zt・ミサイルの作り直しで足した）。tools/measure/card.js と同じ出力
//   node tools/measure/run.js cardgood --WPN missile --MODE none --CH 25 --D 22 --GOOD 1 > out.json
//   置き換え：__WPN__（武器 id。カンマで編成）・__MODE__（none／all／札の id。`+` で複数）・__CH__・__D__・__GOOD__（1＝上手な円／0＝既定の円）
//   **上手な円**＝射程の中の点のうち、通路タイルが円（半径＝着弾円＋爆風の半分）にいちばん多く入る点。ほかの円と重なったタイルは数えない（人が通り道の上に重ならないよう置く置き方の代用）。
//   指定攻撃（ミサイル・迫撃砲・泡）にだけ効く。**D26 以上は床で札の差が見えない。比べるなら D22**（第25章）。
//   測定ごとに Game.newSave()。札は戦闘の最初に掛ける（3択は止める）
REAL_MS = 600000;
const GOOD_AIM = __GOOD__;
// 上手な着弾円：射程内の点のうち、通路タイルが円（半径 R）に多く入る点。ほかの円と重なったタイルは数えない
if (!Game._origDAP) Game._origDAP = Game.defaultAimPoint;
if (GOOD_AIM) Game.defaultAimPoint = function (u) {
  const run = this.run, st = run && run.stage; if (!st) return this._origDAP(u);
  const R = this.spotR(u) + Math.max(18, u.s.splash || 0) * 0.5; // 円＋爆風の半分
  const taken = [];
  for (const o of run.units) if (o !== u && o.ax != null && o.def.aimPoint) taken.push([o.ax, o.ay, this.spotR(o) + Math.max(18, o.s.splash || 0) * 0.5]);
  let best = null, bs = -1;
  const rng = u.s.range;
  for (let y = u.y - rng; y <= u.y + rng; y += 16) for (let x = u.x - rng; x <= u.x + rng; x += 16) {
    if (Math.hypot(x - u.x, y - u.y) > rng) continue;
    if (x < 4 || y < 4 || x > st.w - 4 || y > st.h - 4) continue;
    let sc = 0;
    const c0 = Math.floor((x - R) / TILE), c1 = Math.floor((x + R) / TILE), r0 = Math.floor((y - R) / TILE), r1 = Math.floor((y + R) / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!st.walkable(c, r)) continue;
      const tx = (c + .5) * TILE, ty = (r + .5) * TILE;
      if (Math.hypot(tx - x, ty - y) > R) continue;
      let dup = false; for (const t of taken) if (Math.hypot(tx - t[0], ty - t[1]) <= t[2]) { dup = true; break; }
      if (!dup) sc++;
    }
    if (sc > bs) { bs = sc; best = { x, y }; }
  }
  return best || this._origDAP(u);
};
const WL = '__WPN__'.split(','), W = WL[0], MODE = '__MODE__';
const pre = {};
if (MODE === 'all') { for (const id of CARD_IDS) { const c = CARDS[id]; if (c.kind === 'mod' && c.weapon === W && !c.upper) pre[id] = c.maxStack; } }
else if (MODE !== 'none') for (const m of MODE.split('+')) pre[m] = CARDS[m].maxStack;
const out = [];
for (let sd = 1; sd <= 12; sd++) {
  Game.newSave(); seedRng(sd);
  const r = runStage('ch__CH__', WL, 60, { coins: 1e12, deep: { prestiges: 2, deepest: __D__ }, lives: 1e6, noDraft: true, preCards: pre });
  out.push({ sd, leaked: r.leaked, kills: r.kills, res: r.res });
}
unseedRng();
const L = out.map(o => o.leaked).sort((x, y) => x - y);
({ wpn: WL.join(','), mode: MODE, good: GOOD_AIM, pre, median: (L[5] + L[6]) / 2, leaked: out.map(o => o.leaked), kills: out.map(o => o.kills) })
