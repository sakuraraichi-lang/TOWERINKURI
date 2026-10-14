// MOD モードの通し（2026-10-14）：まっさらな MOD セーブから、ポイントを貯めて改造ツリーを育てながら何本も回す
//   node tools/simnode.js --file tools/measure/modrun.js
//   先頭に MR_RUNS=10; MR_SEED=1; MR_FUSE=3; MR_ORDER=[...]; を付けると変えられる
//   本編のセーブは newSave のまっさら（持ち札・ツリー・アセンションなし）。MOD モードはそれを読まない
//   置き方：章の始めに autoPlace（上手な置き方 'range'・コストは上限まで・合成武器は MR_FUSE 種を 'F:' として混ぜる）
//   改造の選び方：PICK の順で、候補にあるいちばん前のもの（無ければ引き直し → それでも無ければ先頭）
//   ツリーの買い方：ORDER の順に、次の節が買えるときだけ買う（買えなければ貯める）
REAL_MS = 600000;
const RUNS = (typeof MR_RUNS !== 'undefined') ? MR_RUNS : 10;
const SEED = (typeof MR_SEED !== 'undefined') ? MR_SEED : 1;
const NFUSE = (typeof MR_FUSE !== 'undefined') ? MR_FUSE : 3;
const ORDER = (typeof MR_ORDER !== 'undefined') ? MR_ORDER : ['cost1', 'life1', 'w_katana', 'cost2', 'm_bet', 'w_flame', 'life2', 'reroll1', 'cost3', 'w_mortar', 'heal1',
  'm_link', 'w_tentacle', 'life3', 'cost4', 'w_missile', 'm_price', 'w_cryo', 'w_shuriken', 'w_bubble', 'm_greed', 'm_solo', 'c_pick', 'reroll2'];
const PICK = (typeof MR_PICK !== 'undefined') ? MR_PICK : ['corridor', 'cascade', 'kamikaze', 'overclock', 'nova', 'hive', 'glass', 'family', 'backtoback', 'premonition', 'zero', 'shatter', 'breakparty', 'inherit', 'backwater', 'gacha', 'passer', 'blockade', 'debt', 'solo', 'free'];

function fusesFor(mr) {
  const ws = mr.simUse || mr.weapons;
  const ok = FUSION_IDS.filter(f => ws.indexOf(FUSIONS[f].a) >= 0 && ws.indexOf(FUSIONS[f].b) >= 0);
  const r = ModRun.rng(mr, 4242 + mr.ch);
  const out = [];
  while (out.length < NFUSE && ok.length) out.push(ok.splice((r() * ok.length) | 0, 1)[0]);
  return out;
}
function chooseMod(mr) {
  for (let t = 0; t < 3; t++) {
    const ids = mr.offer.ids;
    for (const id of PICK) if (ids.indexOf(id) >= 0) return id;
    if (!ModRun.reroll(mr)) break;
  }
  return mr.offer.ids[0];
}
// 置く武器の種類は、使える中から好みの順に NTYPE 種まで（プレイヤーは全種を均等には置かない。均等に割ると、開けるほど弱くなった）
const NTYPE = (typeof MR_NTYPE !== 'undefined') ? MR_NTYPE : 5;
const PREF = ['katana', 'flame', 'sniper', 'mortar', 'gatling', 'tesla', 'missile', 'tentacle', 'shuriken', 'gas', 'cryo', 'bubble'];
function playChapter(mr) {
  const run = Game.startPrep(mr.boards[mr.ch], mr);
  const lw = Game.loadoutWeapons;
  const use = PREF.filter(w => mr.weapons.indexOf(w) >= 0).slice(0, NTYPE);
  mr.simUse = use;
  FUSE_LIST = ModRun.has(mr, 'solo') ? [] : fusesFor(mr); NO_PLAIN = false;
  Game.loadoutWeapons = function () { return lw.call(this).filter(w => use.indexOf(w) >= 0); };
  try { autoPlace(run); autoPlace(run); } finally { Game.loadoutWeapons = lw; }
  const placed = { cap: Game.costCap(), used: Game.costUsed(), n: run.units.length };
  Game.applyMods(); Game.beginBattle();
  let t = 0, sig = null;
  const CAPT = 60 * 60 * TIME_MIN;
  while (t < CAPT) {
    sig = Combat.update(run, 1 / 60); t++;
    if (sig === 'dead' || sig === 'stageclear') break;
    if (sig === 'waveclear') Game.startNextWave();
  }
  const ok = sig === 'stageclear';
  const res = Game.endRun(ok);
  return { ok, sec: Math.round(t / 60), wave: run.wave, cost: placed.used + '/' + placed.cap, lives: Math.max(0, Math.ceil(run.lives)) + '/' + run.livesMax, leaked: run.leaked, res };
}
function buyTree(perm) {
  const got = [];
  for (const id of ORDER) {
    if (ModRun.owns(perm, id)) continue;
    if (ModRun.buy(perm, id)) { got.push(id); continue; }
    break;      // 次の節が買えなければ貯める
  }
  return got;
}

seedRng(SEED);
Game.newSave();
const main0 = JSON.stringify({ c: Game.perm.collection, m: Game.meta, a: Game.perm.asc || null });
const out = [];
for (let n = 1; n <= RUNS; n++) {
  const perm = Game.perm;
  const mr = ModRun.start(perm, SEED * 1000 + n);
  const b = { cost: mr.cap, lives: mr.livesMax, rr: mr.rerolls, w: mr.weapons.length, cond: mr.cond };
  const chs = [];
  let end = null, minCost = 1e9;
  for (let g = 0; g < 12 && ModRun.state(perm); g++) {
    const r = playChapter(mr);
    const [u, c] = r.cost.split('/').map(Number);
    minCost = Math.min(minCost, c - u);
    chs.push((r.ok ? '○' : '×') + (mr.ch + (r.ok ? 0 : 1)) + (r.ok ? '' : 'W' + r.wave) + '漏' + r.leaked + '残' + r.lives.split('/')[0]);
    if (r.res.offer) ModRun.take(mr, chooseMod(mr));
    if (r.res.end) { end = r.res.end; break; }
  }
  const bought = buyTree(perm);
  out.push({ run: n, start: b, reached: end.won ? '踏破' : '第' + (end.cleared + 1) + '章で負け', cleared: end.cleared, pts: end.pts, mpLeft: ModRun.P(perm).pts, capSlackMax: minCost, chs: chs.join(' '), mods: end.mods.join(','), bought: bought.join(',') });
}
unseedRng();
({ mainUntouched: main0 === JSON.stringify({ c: Game.perm.collection, m: Game.meta, a: Game.perm.asc || null }), runs: out.map(o => o.run + '本目 ' + o.reached + '　始め cost' + o.start.cost + ' life' + o.start.lives + ' 武器' + o.start.w + ' ' + o.start.cond + '　+' + o.pts + 'MP（残' + o.mpLeft + '）　余ったコスト最大' + o.capSlackMax + '　買った ' + o.bought + '　｜' + o.chs) })
