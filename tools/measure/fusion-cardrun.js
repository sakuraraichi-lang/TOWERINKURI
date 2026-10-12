// 合成武器の札の強さ（2026-10-12）：合成 C を、札なし／A の札（fp_*）1枚／fp＋元の武器 A の札4枚 で比べる。AB（A と B の混成）は参照。
//   置き換え：__CH__・__D__・__CAP__・__FIDS__・__SEEDS__・__CONDS__（C0・C1・C2・AB）
//   C0 札なし ／ C1 fp_* を1枚 ／ C2 fp_＋A の3択で取りうる札（コモン2・レア1・エピック1。上位札・レジェンド・コインは除く・各1枚）／ AB 混成（札なし）
//   ライフ 1e6・ウェーブ間の3択は止める（noDraft）・カードは preCards で戦闘開始時に掛ける。前回（fusion.js）と同じ ch・コスト上限・置き方
REAL_MS = 600000;
const CH = __CH__, D = __D__, CAP = __CAP__, FIDS = __FIDS__, SEEDS = __SEEDS__, CONDS = __CONDS__;
Game.costCap = function () { return CAP; };
AIM_SMART = true;
const med = (a) => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
function aCards(a) {
  const l = CARD_IDS.filter(id => { const c = CARDS[id]; return c.kind === 'mod' && c.weapon === a && !c.upper && !c.coin && c.rarity !== 'legendary'; });
  const pick = (r, n) => l.filter(id => CARDS[id].rarity === r).slice(0, n);
  return [].concat(pick('common', 2), pick('rare', 1), pick('epic', 1));
}
const out = [];
for (const fid of FIDS) {
  const f = FUSIONS[fid], rows = {}, ac = aCards(f.a);
  for (const c of CONDS) rows[c] = [];
  for (const sd of SEEDS) {
    for (const c of CONDS) {
      Game.newSave(); ensureStages(CH + 1); seedRng(sd);
      const ws = c === 'AB' ? [f.a, f.b] : [f.a];
      const o = { coins: 1e12, deep: { prestiges: 2, deepest: D }, lives: 1e6 };
      if (c !== 'AB') { o.fusions = [fid]; o.noPlain = true; }
      if (c === 'C1') { o.preCards = { ['fp_' + fid]: 1 }; o.noDraft = true; }
      if (c === 'C2') { o.preCards = { ['fp_' + fid]: 1 }; for (const id of ac) o.preCards[id] = 1; o.noDraft = true; }
      const r = runStage('ch' + CH, ws, 60, o);
      let fc = null;
      if (c !== 'AB' && c !== 'C0' && Game.run) { const u = Game.run.units.find(x => x.fuse === fid); fc = u ? JSON.stringify(u.flags.fc || {}) : 'no-unit'; }
      rows[c].push({ leaked: r.leaked, kills: r.kills, units: r.units, cost: r.cost, res: r.res, fc });
    }
  }
  unseedRng();
  const row = { fid, cost: f.cost, ab: f.a + '+' + f.b, aCards: ac };
  for (const c of CONDS) row[c] = { median: med(rows[c].map(x => x.leaked)), leaked: rows[c].map(x => x.leaked), res: rows[c].map(x => x.res).join(','), units: rows[c].map(x => x.units), cost: rows[c].map(x => x.cost), fc: rows[c][0].fc };
  out.push(row);
}
out
