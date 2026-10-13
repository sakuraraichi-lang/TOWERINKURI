// 改造ラン（MOD・src/modrun.js）を最後まで1本通す（上手な置き方＝autoPlaceRange・2026-10-13）
//   node tools/simnode.js --file tools/measure/modrun.js
//   先頭に MR_SEEDS=[1,2]; MR_ASC=1; MR_TOTU=8; MR_PICK=['glass', ...]; を付けると変えられる
//   セーブ：第30章を突破してアセンションを解放した直後（Lv MR_ASC）・武器12種を MR_TOTU 枚ずつ（凸）・スキルツリーは買えるだけ・常駐なし
//   置き方：章の始めに autoPlace（合成武器は MR_FUSE 種を 'F:' として混ぜる・合成の札は持たせない）。ウェーブの合間は置き直さない
//   改造の選び方：MR_PICK の順で、候補にあるいちばん前のもの（無ければ引き直し → それでも無ければ先頭）
REAL_MS = 600000;
const SEEDS = (typeof MR_SEEDS !== 'undefined') ? MR_SEEDS : [1];
const ASCLV = (typeof MR_ASC !== 'undefined') ? MR_ASC : 1;
const TOTU = (typeof MR_TOTU !== 'undefined') ? MR_TOTU : 8;
const NFUSE = (typeof MR_FUSE !== 'undefined') ? MR_FUSE : 3;
const PICK = (typeof MR_PICK !== 'undefined') ? MR_PICK : ['corridor', 'cascade', 'kamikaze', 'overclock', 'nova', 'hive', 'glass', 'family', 'backtoback', 'premonition', 'zero', 'shatter', 'breakparty', 'inherit', 'backwater', 'gacha', 'passer', 'blockade', 'debt', 'solo', 'free'];
const COND = (typeof MR_COND !== 'undefined') ? MR_COND : null;

function ascSave() {
  Game.newSave(); ensureStages(32);
  for (let i = 1; i <= MAIN_CHAPTERS; i++) Game.stageRec('ch' + i).cleared = true;
  Game.perm.deepest = MAIN_CHAPTERS; Game.perm.legacyDeep = MAIN_CHAPTERS; Game.perm.prestiges = 6;
  Game.perm.asc = { lv: ASCLV, exp: 0, total: 0 };
  for (const w of WEAPON_IDS) Game.grant('wc_' + w, TOTU);
  Game.meta.coins = 1e60;
  for (let i = 0; i < 2000; i++) { const ids = Skill.buyOrder(Game.meta, Game.perm); if (!ids.length) break; if (!Skill.buy(Game.meta, Game.perm, ids[0])) break; }
  Relic.invalidate();
}

function fusesFor(mr) {
  const ok = FUSION_IDS.filter(f => mr.weapons.indexOf(FUSIONS[f].a) >= 0 && mr.weapons.indexOf(FUSIONS[f].b) >= 0);
  const r = ModRun.rng(mr, 4242);
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

function playChapter(mr) {
  const run = Game.startPrep(mr.boards[mr.ch], mr);
  FUSE_LIST = ModRun.has(mr, 'solo') ? [] : fusesFor(mr); NO_PLAIN = false;
  autoPlace(run); autoPlace(run);       // 2回目は余ったコストを安い武器で埋める（合の予感で合成が安くなった分）
  const placed = { cap: Game.costCap(), used: Game.costUsed(), n: run.units.length, fused: run.units.filter(u => u.fuse).map(u => u.fuse) };
  Game.applyMods(); Game.beginBattle();
  let t = 0, sig = null;
  const CAPT = 60 * 60 * TIME_MIN;
  while (t < CAPT) {
    sig = Combat.update(run, 1 / 60); t++;
    if (sig === 'dead' || sig === 'stageclear') break;
    if (sig === 'waveclear') Game.startNextWave();
  }
  const ok = sig === 'stageclear';
  const row = { ch: mr.ch + 1, board: run.stageId, diff: 'ch' + (run.stageIdx + 1), boss: ModRun.isBossCh(mr), res: sig || 'timeout', sec: Math.round(t / 60),
    kills: run.kills, leaked: run.leaked, lives: Math.max(0, Math.ceil(run.lives)) + '/' + run.livesMax, cost: placed.used + '/' + placed.cap, units: placed.n, fused: placed.fused.length,
    bursts: run.mrBursts || 0, glass: run.mrGlassN || 0, by: JSON.stringify(run.leakBy), lost: run.livesLost, wave: run.wave };
  const res = Game.endRun(ok);
  return { row, res };
}

const out = [];
for (const sd of SEEDS) {
  seedRng(sd);
  ascSave();
  const mr = ModRun.start(Game.perm, sd * 7919);
  if (COND) mr.cond = COND;
  const rows = [];
  let end = null;
  for (let g = 0; g < 20 && Game.perm.modrun; g++) {
    const { row, res } = playChapter(mr);
    if (res.offer) {
      const offer = res.offer.ids.slice();
      const id = chooseMod(mr);
      const tk = ModRun.take(mr, id);
      if (!tk) throw new Error("take " + id + " offer " + JSON.stringify(mr.offer) + " mods " + mr.mods);
      row.offer = offer.join(','); row.took = id + (tk.evo.length ? '（進化 ' + tk.evo.join(',') + '）' : '');
    }
    rows.push(row);
    if (res.end) { end = res.end; break; }
  }
  out.push({ seed: sd, cond: mr.cond, weapons: mr.weapons.length, rows, end: end && { won: end.won, cleared: end.cleared, packs: end.packs, mods: end.mods.join(',') }, min: Math.round(rows.reduce((a, r) => a + r.sec, 0) / 6) / 10 });
}
unseedRng();
out
