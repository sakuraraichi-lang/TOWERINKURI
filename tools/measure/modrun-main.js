// MOD モードが本編を変えていないか（2026-10-14）：本編の第3章と第31章を、同じ種で1章ずつ回した結果を出す。
//   変更の前後（git の前の版と今の版）で同じ値が出れば、本編の挙動は変わっていない
//   node tools/simnode.js --file tools/measure/modrun-main.js
REAL_MS = 600000;
function play(stageId, setup, seed) {
  Game.newSave(); seedRng(seed);
  setup();
  Relic.invalidate();
  const run = Game.startPrep(stageId);
  autoPlace(run);
  Game.beginBattle();
  let t = 0, sig = null;
  while (t < 60 * 60 * TIME_MIN) { sig = Combat.update(run, 1 / 60); t++; if (sig === 'dead' || sig === 'stageclear') break; if (sig === 'waveclear') Game.startNextWave(); }
  const r = { stage: stageId, seed, sig: sig || 'timeout', t, wave: run.wave, kills: run.kills, leaked: run.leaked, lives: Math.ceil(run.lives), dealt: Math.round(run.dealt), coins: Math.round(Game.meta.coins), cap: Game.costCap(), units: run.units.length };
  Game.endRun(sig === 'stageclear');
  return r;
}
const ch3 = () => { for (let i = 1; i < 3; i++) Game.stageRec('ch' + i).cleared = true; Game.perm.loadout = ['wc_gatling', 'wc_sniper', null, null, null, null]; Game.grant('wc_sniper', 1); };
const ch31 = () => {
  ensureStages(32);
  for (let i = 1; i <= MAIN_CHAPTERS; i++) Game.stageRec('ch' + i).cleared = true;
  Game.perm.deepest = MAIN_CHAPTERS; Game.perm.legacyDeep = MAIN_CHAPTERS; Game.perm.prestiges = 6;
  Game.perm.asc = { lv: 3, exp: 0, total: 0 };
  for (const w of WEAPON_IDS) Game.grant('wc_' + w, 8);
  Game.perm.loadout = ['wc_katana', 'wc_flame', 'wc_sniper', 'wc_mortar', 'wc_tesla', 'wc_gatling'];
  Game.meta.coins = 1e60;
  for (let i = 0; i < 2000; i++) { const ids = Skill.buyOrder(Game.meta, Game.perm); if (!ids.length) break; if (!Skill.buy(Game.meta, Game.perm, ids[0])) break; }
};
const out = [play('ch3', ch3, 1), play('ch3', ch3, 2), play('ch31', ch31, 1), play('ch31', ch31, 2)];
unseedRng();
out.map(r => JSON.stringify(r))
